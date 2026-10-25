"""
12 - The new explanatory model: panel local projections with two-way fixed effects.

For each horizon h = 0..28 days we run one regression:

    growth[i, t+h] = beta_h * mobility[i, t] + rho_h * growth[i, t] + country_i + day_t + error

  * growth           weekly growth rate of cases (log change in 7-day average, per million)
  * mobility         the mobility index (1 unit = 1 standard deviation)
  * growth[i,t]      today's momentum of the epidemic (so beta is not just "growth was already high")
  * country_i        each country's own typical growth (testing regime, climate, demography...)
  * day_t            anything that hit every country on the same day (the global timing that
                     fooled the paper's correlation)
  * SEs clustered by country (each country's days are not independent observations)

Plotting beta_h against h shows WHEN mobility feeds into case growth - the paper's distributed-lag
idea, done as a transparent sequence of regressions instead of a spline inside a GAMM.

The mirror-image regression asks the reverse question (behaviour channel):

    mobility[i, t+h] - mobility[i, t] = theta_h * growth[i, t] + phi_h * mobility[i, t] + country_i + day_t + error

Run from the repo root:  python analysis/03_reanalysis/12_model_lp.py [--full | --ext]
"""
import sys
import numpy as np
import pandas as pd
from linearmodels.panel import PanelOLS
from common import OUT, CAT5, load_panel, add_mobility_index, TRAIN_END, TEST_END, DATA_END

# samples:  main = paper's window (to 19 Jun 2020) | full = to 8 Sep 2020 | ext = 9 Sep 2020 -> 16 Apr 2022
TAG = "full" if "--full" in sys.argv else "ext" if "--ext" in sys.argv else "main"
END = {"main": TRAIN_END, "full": TEST_END, "ext": DATA_END}[TAG]
START = pd.Timestamp("2020-09-09") if TAG == "ext" else pd.Timestamp("2020-01-01")
H = np.arange(0, 29)

df = load_panel()
df = df[df.date <= END].copy()
df, loadings, share = add_mobility_index(df, fit_mask=df.date <= TRAIN_END)
df = df[df.cum >= 100].copy()
g = df.groupby("country_region")
for h in H:
    df[f"growth_f{h}"] = g.growth.shift(-h)
    df[f"dmob_f{h}"] = g.mob.shift(-h) - df.mob
# history controls: where mobility and growth were 1 and 2 weeks ago
for k in (7, 14):
    df[f"mob_l{k}"] = g.mob.shift(k)
    df[f"growth_l{k}"] = g.growth.shift(k)
HIST = ["growth", "growth_l7", "growth_l14", "mob_l7", "mob_l14"]
for c in CAT5:
    df[c + "_z"] = (df[c + "7"] - df[c + "7"].mean()) / df[c + "7"].std()
df = df[df.date >= START]                         # leads/lags were built on the whole series first
df = df.set_index(["country_region", "date"])


def lp(y, x, controls, data):
    d = data[[y, x, *controls]].dropna()
    m = PanelOLS(d[y], d[[x, *controls]], entity_effects=True, time_effects=True)
    r = m.fit(cov_type="clustered", cluster_entity=True)
    return r.params[x], r.std_errors[x], r.nobs, d.index.get_level_values(0).nunique(), r.rsquared_within


rows = []
for h in H:
    # main specification: with 1- and 2-week history of mobility and growth
    b, se, n, nc, r2 = lp(f"growth_f{h}", "mob", HIST, df)
    rows.append({"channel": "transmission", "x": "mob", "spec": "main", "h": h, "beta": b, "se": se, "n": n, "countries": nc})
    # simple specification (no history) - shown for comparison
    b, se, n, nc, r2 = lp(f"growth_f{h}", "mob", ["growth"], df)
    rows.append({"channel": "transmission", "x": "mob", "spec": "simple", "h": h, "beta": b, "se": se, "n": n, "countries": nc})
    if h > 0:
        b, se, n, nc, r2 = lp(f"dmob_f{h}", "growth", ["mob", "mob_l7", "mob_l14", "growth_l7", "growth_l14"], df)
        rows.append({"channel": "behaviour", "x": "growth", "spec": "main", "h": h, "beta": b, "se": se, "n": n, "countries": nc})
# category by category (one at a time, same specification) for comparison with the paper's six maps
for c in CAT5:
    for h in H:
        b, se, n, nc, r2 = lp(f"growth_f{h}", c + "_z", HIST, df)
        rows.append({"channel": "transmission", "x": c, "spec": "main", "h": h, "beta": b, "se": se, "n": n, "countries": nc})

res = pd.DataFrame(rows)
res["lo"] = res.beta - 1.96 * res.se
res["hi"] = res.beta + 1.96 * res.se
res.to_csv(OUT / f"lp_{TAG}.csv", index=False)

tr = res[(res.channel == "transmission") & (res.x == "mob") & (res.spec == "main")]
pk = tr.loc[tr.beta.idxmax()]
sig = tr[(tr.lo > 0)].h.tolist()
print(f"[{TAG}] countries {int(pk.countries)}, obs at peak {int(pk.n)}")
print(f"Transmission: peak beta {pk.beta:.3f} (SE {pk.se:.3f}) at h={int(pk.h)} days; "
      f"95% CI excludes 0 at h={sig}")
print(f"  -> 1 SD more mobility: weekly case growth {100*(np.exp(pk.beta)-1):+.1f}% faster ~{int(pk.h)} days later")
be = res[res.channel == "behaviour"]
pb = be.loc[be.beta.idxmin()]
print(f"Behaviour: most negative theta {pb.beta:.3f} (SE {pb.se:.3f}) at h={int(pb.h)}; "
      f"CI below 0 at h={be[be.hi < 0].h.tolist()}")
print("  -> cases doubling in a week (growth = ln2) lowers mobility by "
      f"{pb.beta*np.log(2):.2f} SD after {int(pb.h)} days")
for c in CAT5:
    t = res[(res.x == c)]
    p = t.loc[t.beta.abs().idxmax()]
    print(f"  {c:8s}: largest beta {p.beta:+.3f} at h={int(p.h)} (CI {p.lo:+.3f} to {p.hi:+.3f})")
