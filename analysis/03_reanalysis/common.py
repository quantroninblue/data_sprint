"""
Shared helpers for the Python part of the replication (correlation fix + new model).

Run every script from the repo root, e.g.  python analysis/03_reanalysis/11_corr_fixed.py
Input : data/processed/2026-10-24-panel-clean.csv  (the team's cleaned country-day panel)
Output: outputs/03_reanalysis/  and  outputs/03_reanalysis/figures/
"""
import numpy as np
import pandas as pd
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PANEL = ROOT / "data" / "processed" / "2026-10-24-panel-clean.csv"
SUL = ROOT / "data" / "raw" / "sulyok-repo"
OUT = ROOT / "outputs" / "03_reanalysis"
FIG = OUT / "figures"
OUT.mkdir(parents=True, exist_ok=True)
FIG.mkdir(parents=True, exist_ok=True)

CAT6 = ["retail", "grocery", "parks", "transit", "work", "resid"]
CAT5 = ["retail", "grocery", "transit", "work", "resid"]          # parks left out, as in the paper
NICE = {"retail": "Retail & recreation", "grocery": "Grocery & pharmacy", "parks": "Parks",
        "transit": "Transit stations", "work": "Workplaces", "resid": "Residential",
        "mob": "Mobility index"}
CONT = {"Africa": "AF", "Asia": "AS", "Europe": "EU", "North America": "NorthAm",
        "Oceania": "OC", "South America": "SA"}
TRAIN_END = pd.Timestamp("2020-06-19")       # end of the paper's estimation window ("paper_train")
TEST_END = pd.Timestamp("2020-09-08")        # end of the paper's validation window ("paper_validation")
DATA_END = pd.Timestamp("2022-04-16")        # last day with JHU cases ("extension" runs 9 Sep 2020 -> here)


def load_panel():
    """The team's cleaned panel, with the short column names the scripts use.

    Variables used (all built by the team's cleaning, see README):
      cases  = new_paper  daily new cases, revisions clipped at 0 (paper's rule) - only for the paper's raw-data method
      cum    = cum_cases  cumulative confirmed cases (to start each country at its 100th case)
      growth = growth_7d  weekly growth: log(7-day avg + 1) - log(7-day avg one week earlier + 1)
      logc   = log(new_7d + 1), the level whose 14-day change the forecasts predict
      <cat>7 = 7-day average of each mobility category; <cat> = raw daily value
    """
    p = pd.read_csv(PANEL, keep_default_na=False, na_values=[""], parse_dates=["date"])  # Namibia is "NA"
    p = p.rename(columns={
        "country": "country_region", "population": "pop", "new_paper": "cases", "cum_cases": "cum",
        "growth_7d": "growth", "num_date": "t", "workplaces": "work", "residential": "resid",
        "retail_7d": "retail7", "grocery_7d": "grocery7", "parks_7d": "parks7", "transit_7d": "transit7",
        "workplaces_7d": "work7", "residential_7d": "resid7"})
    p["Continent"] = p["continent"].map(CONT)
    p["logc"] = np.log(p["new_7d"] + 1)
    return p.sort_values(["country_region", "date"]).reset_index(drop=True)


def kendall(x, y):
    """Kendall tau-b on pairwise-complete data (same statistic as R's cor.test(method='kendall'))."""
    m = ~(np.isnan(x) | np.isnan(y))
    x, y = x[m], y[m]
    if len(x) < 10:
        return np.nan
    dx = np.sign(x[:, None] - x[None, :])
    dy = np.sign(y[:, None] - y[None, :])
    tx, ty = (dx != 0).sum(), (dy != 0).sum()
    if tx == 0 or ty == 0:
        return np.nan
    return (dx * dy).sum() / np.sqrt(tx * ty)


def shift(a, l):
    """Value of `a` l days earlier (l>0) or later (l<0); NaN where unavailable. Mirrors Hmisc::Lag."""
    out = np.full(len(a), np.nan)
    if l > 0:
        out[l:] = a[:-l]
    elif l < 0:
        out[:l] = a[-l:]
    else:
        out[:] = a
    return out


def add_mobility_index(df, fit_mask=None):
    """First principal component of the five 7-day-averaged mobility categories.

    The five categories move together (correlations ~0.8-0.9), which is why the paper's model could only
    find one of them significant. One index carries almost all the signal.
    Positive index = more time out of the home than the Jan-Feb 2020 baseline; 1 unit = 1 SD.
    """
    cols = [c + "7" for c in CAT5]
    X = df[cols]
    fit = (X[fit_mask] if fit_mask is not None else X).dropna()
    mu, sd = fit.mean(), fit.std()
    Z = ((fit - mu) / sd).values
    vals, vecs = np.linalg.eigh(np.cov(Z.T))
    w = vecs[:, -1]
    if w[0] < 0:                                   # orient: retail loads positively
        w = -w
    df["mob"] = (((X - mu) / sd).values @ w) / (Z @ w).std()
    return df, pd.Series(w, index=CAT5), vals[-1] / vals.sum()
