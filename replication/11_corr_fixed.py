"""
03 - The fixed correlation analysis.  Run from the repo root:  python replication/03_corr_fixed.py [--full]
Data: the team's cleaned panel (data/processed).

What changes versus the paper, and why
--------------------------------------
1. Smooth & scale   7-day averages (removes weekday reporting cycles); cases per million.
2. Growth, not level  Mobility should change how fast cases GROW (transmission), so we use the
                      weekly growth rate of cases (team panel's growth_7d: log(7-day avg + 1), week on week).
3. Active epidemics   Each country enters once it has 100 cumulative cases (growth rates from
                      1 -> 2 cases are noise).
4. Remove shared timing  Every day, subtract the cross-country average from each country's
                      mobility and growth. The question becomes: "when a country moved MORE than
                      the world did that day, did its cases grow FASTER than the world's later?"
                      This is the step that makes the placebo test come out flat (see figures).
5. One mobility index  First principal component of the five categories (explains ~92% of
                      their variance). Per-category results are kept for comparison.
6. Fixed lag windows, both directions, tested
     - Transmission channel: mobility today vs case growth 7-21 days later.
     - Behaviour channel:    case growth today vs mobility 0-14 days later.
     Windows are set from epidemiology (incubation + reporting delay), not picked by searching 57
     lags, and each country gets a p-value from 499 circular-shift surrogates (which keep each
     series' own smoothness), with Benjamini-Hochberg control of the false discovery rate.

Sign convention in all outputs: lag > 0 means CASES are measured AFTER mobility.
(The paper's lag has the opposite sign: paper lag = -our lag.)
"""
import sys
import numpy as np
import pandas as pd
from common import OUT, CAT6, load_panel, kendall, shift, add_mobility_index, TRAIN_END, TEST_END

END = TEST_END if "--full" in sys.argv else TRAIN_END
TAG = "full" if "--full" in sys.argv else "main"
LAGS = np.arange(-28, 29)
TRANS = np.arange(7, 22)        # mobility -> growth 7..21 days later
BEHAV = np.arange(-14, 1)       # growth -> mobility 0..14 days later (growth earlier = negative lag)
N_SURR, N_PLAC, N_BOOT = 499, 20, 1000
rng = np.random.default_rng(42)

# ------------------------------------------------------------------ data
df = load_panel()
df = df[df.date <= END].copy()
df, loadings, share = add_mobility_index(df, fit_mask=df.date <= TRAIN_END)
df = df[df.cum >= 100].copy()
VARS = ["mob"] + [c + "7" for c in CAT6]
for v in VARS + ["growth"]:
    df[v + "_dm"] = df[v] - df.groupby("date")[v].transform("mean")
# need >= 50 days where both mobility and case growth are observed
keep = [c for c, x in df.groupby("country_region") if (x.growth.notna() & x.mob.notna()).sum() >= 50]
S = {c: df[df.country_region == c].set_index("date") for c in keep}
cont = df.groupby("country_region").Continent.first()
print(f"[{TAG}] {len(keep)} countries, through {END.date()}; PCA share {share:.1%}; loadings {loadings.round(2).to_dict()}")


def tau_profile(x, y, lags):
    """tau(l) = Kendall(x_t, y_{t+l})."""
    return np.array([kendall(x, shift(y, -l)) for l in lags])


def profiles(xcol, ycol, placebo):
    rows = []
    for c in keep:
        x = S[c][xcol]
        partners = rng.choice([k for k in keep if k != c], N_PLAC, replace=False) if placebo else [c]
        for p in partners:
            y = S[p][ycol].reindex(x.index).values.astype(float)
            rows.append(tau_profile(x.values.astype(float), y, LAGS))
    return np.array(rows, float)


def summarise(P, label, var):
    m = np.nanmean(P, axis=0)
    boots = np.array([np.nanmean(P[rng.integers(0, len(P), len(P))], axis=0) for _ in range(N_BOOT)])
    lo, hi = np.nanpercentile(boots, [2.5, 97.5], axis=0)
    return pd.DataFrame({"var": var, "kind": label, "lag": LAGS, "tau": m, "lo": lo, "hi": hi})


# ------------------------------------------------------------------ 1. pooled lag profiles
out = []
for v in VARS:
    real = profiles(v + "_dm", "growth_dm", False)
    plac = profiles(v + "_dm", "growth_dm", True)
    out += [summarise(real, "fixed_real", v), summarise(plac, "fixed_placebo", v)]
# the paper's method on the same countries, for the side-by-side figure (retail, raw daily data)
real = profiles("retail", "cases", False)
plac = profiles("retail", "cases", True)
out += [summarise(real, "paper_real", "retail"), summarise(plac, "paper_placebo", "retail")]
prof = pd.concat(out)
prof.to_csv(OUT / f"corr_profiles_{TAG}.csv", index=False)

# ------------------------------------------------------------------ 2. per-country tests (mobility index)
def window_stats(x, y):
    t = tau_profile(x, y, np.r_[BEHAV, TRANS])
    return np.nanmean(t[len(BEHAV):]), np.nanmean(t[:len(BEHAV)])


rows = []
for c in keep:
    s = S[c]
    x = s["mob_dm"].values.astype(float)
    y = s["growth_dm"].values.astype(float)
    obs_t, obs_b = window_stats(x, y)
    n = len(y)
    null_t, null_b = [], []
    for _ in range(N_SURR):
        k = rng.integers(21, n - 21)
        a, b = window_stats(x, np.roll(y, k))
        null_t.append(a); null_b.append(b)
    null_t, null_b = np.array(null_t), np.array(null_b)
    # one-sided in the direction theory predicts: transmission > 0, behaviour < 0
    p_t = (1 + np.sum(null_t >= obs_t)) / (N_SURR + 1)
    p_b = (1 + np.sum(null_b <= obs_b)) / (N_SURR + 1)
    rows.append({"country": c, "continent": cont[c], "n_days": int(np.isfinite(y).sum()),
                 "tau_transmission": obs_t, "p_transmission": p_t,
                 "tau_behaviour": obs_b, "p_behaviour": p_b})
res = pd.DataFrame(rows)


def bh(p):
    p = np.asarray(p); o = np.argsort(p); r = np.empty_like(o); r[o] = np.arange(1, len(p) + 1)
    q = p * len(p) / r
    q_sorted = np.minimum.accumulate(q[o][::-1])[::-1]
    out = np.empty_like(q); out[o] = np.minimum(q_sorted, 1)
    return out


res["q_transmission"] = bh(res.p_transmission)
res["q_behaviour"] = bh(res.p_behaviour)
res.to_csv(OUT / f"corr_country_{TAG}.csv", index=False)

# ------------------------------------------------------------------ 3. headline numbers
pk = prof[(prof["var"] == "mob") & (prof.kind == "fixed_real")]
peak = pk.loc[pk.tau.idxmax()]
trough = pk.loc[pk.tau.idxmin()]
pl = prof[(prof["var"] == "mob") & (prof.kind == "fixed_placebo")]
pp = prof[(prof["var"] == "retail") & (prof.kind == "paper_placebo")]
pr = prof[(prof["var"] == "retail") & (prof.kind == "paper_real")]
print(f"Fixed method, mobility index: peak tau {peak.tau:+.3f} at lag {peak.lag:+d} "
      f"(95% CI {peak.lo:+.3f} to {peak.hi:+.3f}); trough {trough.tau:+.3f} at lag {trough.lag:+d}")
print(f"  placebo |tau| max over lags: {pl.tau.abs().max():.3f}")
print(f"Paper method, retail: mean tau real {pr.tau.mean():+.3f} vs placebo {pp.tau.mean():+.3f}; "
      f"corr of profiles {np.corrcoef(pr.tau, pp.tau)[0,1]:.2f}")
for ch in ["transmission", "behaviour"]:
    print(f"{ch:13s}: median country tau {res['tau_' + ch].median():+.3f}; "
          f"right sign {np.mean(np.sign(res['tau_' + ch]) == (1 if ch == 'transmission' else -1)):.0%}; "
          f"p<0.05 {np.mean(res['p_' + ch] < .05):.0%}; survive FDR q<0.10 {np.mean(res['q_' + ch] < .10):.0%} "
          f"({int((res['q_' + ch] < .10).sum())}/{len(res)})")
print(res.groupby("continent")[["tau_transmission", "tau_behaviour"]].median().round(3))
