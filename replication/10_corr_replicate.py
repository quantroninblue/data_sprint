"""
02 - Replicate the paper's cross-correlation exactly, then stress-test it.

Run from the repo root:  python replication/02_corr_replicate.py

Data: the authors' OWN 2020 snapshots in data/raw/sulyok-repo (Google CMR of 23 Jun 2020, JHU cases of
13 Jul 2020). The team's cleaned panel uses later, revised JHU data, so only these snapshots can reproduce
the paper's Table S1 number for number. Everything after this script uses the team's cleaned panel.

Paper's method (their R code): for each country and mobility category,
    tau(l) = Kendall( mobility_t , cases_{t-l} )   for l = -28 ... +28
keep the l with the largest |tau|. Raw daily values, no smoothing, no per-capita, no detrending.

Stress tests:
  1. Edge lags  - how often the "best" lag sits at the edge of the search window (+-26..28).
  2. Placebo    - pair each country's mobility with a DIFFERENT, randomly chosen country's cases.
                  If those fake pairs look just as "correlated", the method is measuring the
                  shared global timing of 2020, not a country's own mobility-case link.
"""
import numpy as np
import pandas as pd
import zipfile
from common import OUT, SUL, CAT6, kendall, shift

LAGS = np.arange(-28, 29)
rng = np.random.default_rng(2020)


PROFILES = {"real": [], "placebo": []}   # |tau| at every lag, retail, for the lag-profile figure


def best_lag(mob, cases, keep=None):
    taus = np.array([kendall(mob, shift(cases, l)) for l in LAGS])
    if keep is not None:
        PROFILES[keep].append(np.abs(taus))
    if np.all(np.isnan(taus)):
        return np.nan, np.nan
    i = np.nanargmax(np.abs(taus))
    return LAGS[i], taus[i]


# ---- the paper's own inputs: national mobility rows + the authors' case file, merged exactly as their R code does
CATS = {"retail_and_recreation_percent_change_from_baseline": "retail",
        "grocery_and_pharmacy_percent_change_from_baseline": "grocery",
        "parks_percent_change_from_baseline": "parks",
        "transit_stations_percent_change_from_baseline": "transit",
        "workplaces_percent_change_from_baseline": "work",
        "residential_percent_change_from_baseline": "resid"}
with zipfile.ZipFile(SUL / "Global_Mobility_Report(1)compressed.zip") as z:
    g = pd.read_csv(z.open("Global_Mobility_Report(1).csv"), low_memory=False, parse_dates=["date"])
nat = g.sub_region_1.isna() & g.sub_region_2.isna()
g = g.loc[nat, ["country_region", "date", *CATS]].rename(columns=CATS)
c = pd.read_csv(SUL / "CaseNumbers1407JHUreal.csv", parse_dates=["date"], keep_default_na=False, na_values=[""])
c.loc[c.country_region == "US", "country_region"] = "United States"
c = c[["country_region", "date", "IncCaseNumber", "Continent"]].rename(columns={"IncCaseNumber": "cases"})
paper = g.merge(c, on=["country_region", "date"]).sort_values(["country_region", "date"])
print(f"Paper inputs: {paper.country_region.nunique()} countries, {paper.date.min().date()} -> {paper.date.max().date()}")
series = {c: g for c, g in paper.groupby("country_region")}
countries = sorted(series)

# ---- 1. faithful replication
rows = []
for c in countries:
    g = series[c]
    r = {"country": c, "continent": g.Continent.iloc[0]}
    for cat in CAT6:
        r["lag_" + cat], r["tau_" + cat] = best_lag(g[cat].values.astype(float), g.cases.values.astype(float),
                                                    "real" if cat == "retail" else None)
    rows.append(r)
rep = pd.DataFrame(rows)
rep.to_csv(OUT / "corr_replication.csv", index=False)

# ---- check against the paper's published table S1 (read straight from the authors' supplementary .docx)
def read_s1():
    import re, html
    x = zipfile.ZipFile(SUL / "SupplemengtarymaterialsulyokGMDfinal2309corrected.docx").read("word/document.xml").decode()
    tbl = re.findall(r"<w:tbl>.*?</w:tbl>", x, flags=re.S)[0]
    rows = []
    for tr in re.findall(r"<w:tr[ >].*?</w:tr>", tbl, flags=re.S):
        cells = [html.unescape(re.sub(r"<[^>]+>", "", c)).strip() for c in re.findall(r"<w:tc>.*?</w:tc>", tr, flags=re.S)]
        if len(cells) == 16 and cells[0].isdigit():
            rows.append(cells)
    cats = ["retail", "grocery", "parks", "transit", "work", "resid"]
    cols = ["n", "country", "continent"] + [f"lag_{c}" for c in cats] + [f"tau_{c}" for c in cats] + ["cluster"]
    d = pd.DataFrame(rows, columns=cols)
    for c in cols[3:]:
        d[c] = pd.to_numeric(d[c])
    d.to_csv(OUT / "paper_S1.csv", index=False)
    return d


s1 = read_s1()
m = rep.merge(s1, on="country", suffixes=("", "_paper"))
print(f"Replication vs paper S1 ({len(m)} countries matched):")
for cat in CAT6:
    t_r = np.corrcoef(m["tau_" + cat], m["tau_" + cat + "_paper"])[0, 1]
    lag_eq = (m["lag_" + cat] == m["lag_" + cat + "_paper"]).mean()
    print(f"  {cat:8s} corr(tau ours, tau paper) = {t_r:.3f} | identical best lag in {lag_eq:.0%} of countries")

# ---- 2. edge-lag diagnostic
edge = {cat: (rep["lag_" + cat].abs() >= 26).mean() for cat in CAT6}
print("\nShare of countries whose 'best' lag is at the edge (|lag| >= 26):",
      {k: f"{v:.0%}" for k, v in edge.items()},
      "| expected if lags were uniform:", f"{6/57:.0%}")

# ---- 3. placebo pairs: mobility of country i vs cases of a random other country j
N_PARTNERS = 10
prow = []
for c in countries:
    g = series[c]
    partners = rng.choice([x for x in countries if x != c], N_PARTNERS, replace=False)
    for p in partners:
        h = series[p].set_index("date").cases.reindex(g.date).values.astype(float)
        r = {"country": c, "partner": p}
        for cat in ["retail", "transit", "work", "resid"]:
            r["lag_" + cat], r["tau_" + cat] = best_lag(g[cat].values.astype(float), h,
                                                        "placebo" if cat == "retail" else None)
        prow.append(r)
plac = pd.DataFrame(prow)
plac.to_csv(OUT / "corr_placebo.csv", index=False)

print("\nMedian |tau|  real pairs vs placebo (wrong-country) pairs:")
for cat in ["retail", "transit", "work", "resid"]:
    real = rep["tau_" + cat].abs()
    fake = plac["tau_" + cat].abs()
    print(f"  {cat:8s} real {real.median():.2f}   placebo {fake.median():.2f}   "
          f"| share |tau|>0.4: real {(real > .4).mean():.0%}, placebo {(fake > .4).mean():.0%}")

# ---- 4. |tau| by lag, real vs placebo (retail) - what the paper's lag search is "seeing"
prof = []
for kind, arr in PROFILES.items():
    A = np.array(arr, float)
    boots = np.array([np.nanmean(A[rng.integers(0, len(A), len(A))], axis=0) for _ in range(1000)])
    lo, hi = np.nanpercentile(boots, [2.5, 97.5], axis=0)
    # our sign convention: positive lag = cases measured after mobility (= minus the paper's lag)
    prof.append(pd.DataFrame({"kind": kind, "lag": -LAGS, "abs_tau": np.nanmean(A, axis=0), "lo": lo, "hi": hi}))
pd.concat(prof).sort_values(["kind", "lag"]).to_csv(OUT / "corr_paper_absprofile.csv", index=False)
