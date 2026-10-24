"""
05 - Does mobility actually help PREDICT cases? An honest forecasting test.

Problems with the paper's validation
  * Its models predict 20 Jun - 8 Sep using the ACTUAL mobility of those days, which nobody
    would know in advance, and a smooth date trend extrapolated 80 days past the data.
  * Errors are pooled raw counts, so the US, Brazil and India decide the result.
  * The Diebold-Mariano test is run on all countries stacked into one long series, which the
    test is not designed for.

Our design
  * Real-time forecasts: at each origin date t (20 Jun -> 25 Aug) predict log cases per million
    14 days ahead, using ONLY what is known at t. Models are re-estimated every week on all
    data available up to t (expanding window) - no peeking at the future.
  * Three nested models:
        M0 naive      cases stay where they are
        M1 momentum   + recent case growth (this week, last week)
        M2 mobility   + mobility index (today, 1 week ago, 2 weeks ago)
    M2 vs M1 isolates what mobility adds beyond the case data themselves.
  * Scoring: absolute error in log cases (0.10 ~ 10% off), averaged so every country counts
    equally. DM test on the daily cross-country average loss difference, with HAC errors.

The paper's three GAMMs are refitted separately in R (mgcv + dlnm), as in the team plan.

Run from the repo root:  python replication/05_model_forecast.py
"""
import numpy as np
import pandas as pd
import statsmodels.api as sm
import statsmodels.formula.api as smf
from common import OUT, load_panel, add_mobility_index, TRAIN_END, TEST_END

HS = (7, 14, 21)
H = 14
df = load_panel()
df = df[df.date <= TEST_END].copy()
df, loadings, share = add_mobility_index(df, fit_mask=df.date <= TRAIN_END)
g = df.groupby("country_region")
df["growth_l7"] = g.growth.shift(7)
for k in (7, 14):
    df[f"mob_l{k}"] = g.mob.shift(k)
# mobility CHANGES (within-country) and RELATIVE mobility (vs other countries the same day).
# Both are known in real time at the forecast origin.
df["dmob7"] = df.mob - df.mob_l7
df["dmob14"] = df.mob_l7 - df.mob_l14
df["mob_rel"] = df.mob - df.groupby("date").mob.transform("mean")
df["mob_rel_l7"] = df.groupby("country_region").mob_rel.shift(7)
for h in HS:
    df[f"y{h}"] = g.logc.shift(-h) - df.logc              # change in log cases over the next h days
FEAT = ["growth", "growth_l7", "mob", "mob_l7", "mob_l14", "dmob7", "dmob14", "mob_rel", "mob_rel_l7"]
base = df[df.cum >= 100].dropna(subset=FEAT).copy()

F = {"M1 momentum": "growth + growth_l7",
     "M2a mobility level": "growth + growth_l7 + mob + mob_l7 + mob_l14",
     "M2b mobility change": "growth + growth_l7 + dmob7 + dmob14",
     "M2c relative mobility": "growth + growth_l7 + mob_rel + mob_rel_l7"}


def run(first, last, h):
    """Real-time forecasts for origins first..last, horizon h, weekly expanding-window refits."""
    act = base.dropna(subset=[f"y{h}"]).copy()
    act["y"] = act[f"y{h}"]
    act["target_date"] = act.date + pd.Timedelta(days=h)
    preds, fits = [], {}
    origins = pd.date_range(first, last)
    for i, o in enumerate(origins):
        if i % 7 == 0:
            train = act[act.target_date <= o]              # only outcomes already observed at o
            fits = {k: smf.ols("y ~ " + f, train).fit() for k, f in F.items()}
        test = act[act.date == o]
        out = test[["country_region", "date", "target_date", "y", "logc"]].copy()
        out["M0 naive"] = 0.0
        for k, f in fits.items():
            out[k] = f.predict(test)
        preds.append(out)
    P = pd.concat(preds)
    for m in MODELS:
        P["ae_" + m] = (P[m] - P.y).abs()
    return P


MODELS = ["M0 naive", *F]


def scores(P):
    per_c = P.groupby("country_region")[["ae_" + m for m in MODELS]].mean()
    return per_c.mean().rename(lambda s: s[3:]), per_c


def dm(P, a, b, h):
    """Diebold-Mariano on the daily cross-country mean loss difference (HAC, h-1 lags)."""
    d = (P.groupby("date")["ae_" + a].mean() - P.groupby("date")["ae_" + b].mean()).values
    r = sm.OLS(d, np.ones(len(d))).fit(cov_type="HAC", cov_kwds={"maxlags": h - 1})
    return r.params[0], r.tvalues[0], r.pvalues[0]


# ---- 1. choose the mobility specification on a VALIDATION window inside the training period
VAL = (pd.Timestamp("2020-05-01"), TRAIN_END - pd.Timedelta(days=H))
Pv = run(*VAL, H)
sv, _ = scores(Pv)
mob_models = [m for m in F if m.startswith("M2")]
chosen = sv[mob_models].idxmin()
print(f"Validation (origins {VAL[0].date()} -> {VAL[1].date()}), mean abs log error:")
print(sv.round(4).to_string())
print(f"-> chosen mobility model: {chosen}\n")

# ---- 2. score ONCE on the paper's test window
TEST = (TRAIN_END + pd.Timedelta(days=1), TEST_END - pd.Timedelta(days=H))
P = run(*TEST, H)
P.to_csv(OUT / "forecast_predictions.csv", index=False)
st, per_c = scores(P)
print(f"Test: real-time {H}-day forecasts, {P.country_region.nunique()} countries, {P.date.nunique()} origins, {len(P)} forecasts")
for m in MODELS:
    print(f"  {m:24s} mean abs error {st[m]:.3f} (~{100*(np.exp(st[m])-1):.0f}% off)"
          f"{'   <- chosen on validation' if m == chosen else ''}")
dmres = []
for a in ["M1 momentum"] + mob_models:
    for b in ["M0 naive", "M1 momentum"]:
        if a == b:
            continue
        d, t, p = dm(P, b, a, H)
        dmres.append({"model": a, "vs": b, "loss_reduction": d, "t": t, "p": p,
                      "share_countries_better": float((per_c["ae_" + a] < per_c["ae_" + b]).mean())})
dmres = pd.DataFrame(dmres)
print(dmres.round(3).to_string(index=False))
dmres.to_csv(OUT / "forecast_dm.csv", index=False)
sc = pd.DataFrame({"validation": sv, "test": st})
sc.to_csv(OUT / "forecast_scores.csv")

# ---- 3. robustness: other horizons, test window
rob = []
for h in HS:
    Ph = P if h == H else run(TRAIN_END + pd.Timedelta(days=1), TEST_END - pd.Timedelta(days=h), h)
    s, pc = scores(Ph)
    d, t, p = dm(Ph, "M1 momentum", chosen, h)
    rob.append({"h": h, **s.to_dict(), "dm_t_chosen_vs_M1": t, "dm_p": p})
rob = pd.DataFrame(rob)
print(rob.round(3).to_string(index=False))
rob.to_csv(OUT / "forecast_horizons.csv", index=False)
act = base.dropna(subset=[f"y{H}"]).copy(); act["y"] = act[f"y{H}"]
act["target_date"] = act.date + pd.Timedelta(days=H)

# coefficient table of the final M2 fit (all data through the last origin)
fin = act[act.target_date <= TEST_END]
last = smf.ols("y ~ " + F[chosen], fin).fit(cov_type="cluster",
                                          cov_kwds={"groups": fin.country_region.astype("category").cat.codes})
print(last.summary().tables[1])
pd.DataFrame({"coef": last.params, "se": last.bse, "p": last.pvalues}).to_csv(OUT / "forecast_M2_coefs.csv")
