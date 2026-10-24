"""06 - Figures. From the repo root: `python replication/06_figures.py` draws all; `... 06_figures.py 2 3` only those."""
import sys
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from common import OUT, FIG, CAT5, NICE

# ---- house style (light surface, recessive chrome, thin marks)
SURF, INK, INK2, MUTED, GRID = "#fcfcfb", "#0b0b0b", "#52514e", "#8a8984", "#e6e5e1"
BLUE, ORANGE, AQUA, PLAC = "#2a78d6", "#eb6834", "#1baf7a", "#a8a7a2"
plt.rcParams.update({
    "figure.facecolor": SURF, "axes.facecolor": SURF, "savefig.facecolor": SURF,
    "font.family": "DejaVu Sans", "font.size": 10, "text.color": INK,
    "axes.edgecolor": GRID, "axes.labelcolor": INK2, "axes.titlesize": 11.5, "axes.titleweight": "bold",
    "axes.titlelocation": "left", "axes.spines.top": False, "axes.spines.right": False,
    "axes.grid": True, "grid.color": GRID, "grid.linewidth": 0.8, "axes.axisbelow": True,
    "xtick.color": INK2, "ytick.color": INK2, "xtick.major.size": 0, "ytick.major.size": 0,
    "legend.frameon": False, "lines.linewidth": 2,
})


def note(fig, text):
    import textwrap
    fig.text(0.01, -0.03, "\n".join(textwrap.wrap(text, 190)), ha="left", va="top", fontsize=8, color=MUTED)


def save(fig, name):
    fig.savefig(FIG / name, dpi=200, bbox_inches="tight")
    plt.close(fig)
    print("saved", name)



# =============================================================== 1. what is wrong with the paper's correlation
def fig1():
    rep = pd.read_csv(OUT / "corr_replication.csv")
    plac = pd.read_csv(OUT / "corr_placebo.csv")
    fig, ax = plt.subplots(1, 2, figsize=(11, 4.2), gridspec_kw={"wspace": 0.28})
    bins = np.linspace(0, 0.9, 19)
    a = ax[0]
    a.hist(plac.tau_retail.abs(), bins=bins, density=True, color=PLAC, label="Placebo: another country's cases",
           rwidth=0.9)
    a.hist(rep.tau_retail.abs(), bins=bins, density=True, histtype="step", color=BLUE, linewidth=2.2,
           label="Real: the country's own cases")
    a.set_title("Real and fake pairs look equally 'correlated'")
    a.set_xlabel("Strongest |Kendall's τ| found (retail & recreation, paper's method)")
    a.set_ylabel("Share of country pairs (density)")
    a.set_ylim(0, 3.9)
    a.legend(loc="upper left", fontsize=8.5)
    a.text(0.98, 0.97, f"median |τ|\nreal {rep.tau_retail.abs().median():.2f}\nplacebo {plac.tau_retail.abs().median():.2f}",
           transform=a.transAxes, ha="right", va="top", fontsize=9, color=INK2)

    a = ax[1]
    lags = pd.concat([rep["lag_" + c] for c in ["retail", "grocery", "parks", "transit", "work", "resid"]])
    counts = lags.value_counts().reindex(range(-28, 29), fill_value=0)
    cols = [ORANGE if abs(l) >= 26 else BLUE for l in counts.index]
    a.bar(counts.index, counts.values, color=cols, width=0.8)
    a.axhline(len(lags) / 57, color=INK2, linewidth=1)
    a.text(19, len(lags) / 57 + 2, "expected if no lag\nwere special", fontsize=8, color=INK2, ha="center", va="bottom")
    a.set_title("A third of the 'best lags' sit on the window's edge")
    a.set_xlabel("Best lag chosen by the paper's method (days, paper's sign)")
    a.set_ylabel("Country × category results")
    edge = (lags.abs() >= 26).mean()
    a.text(0.5, 0.95, f"{edge:.0%} at |lag| ≥ 26 days (vs 11% by chance)", transform=a.transAxes,
           ha="center", va="top", fontsize=9, color=ORANGE, fontweight="bold")
    note(fig, "Paper's method replicated exactly (identical τ and lag for all 122 countries in its Table S1). "
              "Placebo: each country's mobility vs 10 randomly chosen other countries' cases, 15 Feb – 19 Jun 2020.")
    save(fig, "fig1_paper_correlation_problems.png")

# =============================================================== 2. lag profiles: paper method vs fixed method
def fig2():
    pr = pd.read_csv(OUT / "corr_profiles_main.csv")
    fig, ax = plt.subplots(1, 2, figsize=(11, 4.2), gridspec_kw={"wspace": 0.25})
    ab = pd.read_csv(OUT / "corr_paper_absprofile.csv")
    a = ax[0]
    for kind, col, lab in [("placebo", PLAC, "Placebo (other country's cases)"), ("real", BLUE, "Real (own cases)")]:
        d = ab[ab.kind == kind]
        a.fill_between(d.lag, d.lo, d.hi, color=col, alpha=0.25, linewidth=0)
        a.plot(d.lag, d.abs_tau, color=col, label=lab)
    a.set_ylim(0, 0.45)
    a.axvline(0, color=GRID, linewidth=1)
    a.set_title("Paper's method: fake pairs look nearly as strong")
    a.set_xlabel("Lag (days)  ←  cases first   |   mobility first  →")
    a.set_ylabel("Average |Kendall's τ| across countries")
    a.legend(loc="lower center", fontsize=8.5)
    a = ax[1]
    for kind, col, lab in [("fixed_placebo", PLAC, "Placebo (other country's cases)"), ("fixed_real", BLUE, "Real (own cases)")]:
        d = pr[(pr["var"] == "mob") & (pr.kind == kind)]
        a.fill_between(d.lag, d.lo, d.hi, color=col, alpha=0.25, linewidth=0)
        a.plot(d.lag, d.tau, color=col, label=lab)
    a.axhline(0, color=INK2, linewidth=0.8)
    a.axvline(0, color=GRID, linewidth=1)
    a.set_title("Fixed method: placebo flat, real signal stands out")
    a.set_xlabel("Lag (days)  ←  cases first   |   mobility first  →")
    a.set_ylabel("Average Kendall's τ across countries")
    a.legend(loc="lower right", fontsize=8.5)

    d = pr[(pr["var"] == "mob") & (pr.kind == "fixed_real")]
    pk, tr = d.loc[d.tau.idxmax()], d.loc[d.tau.idxmin()]
    ax[1].annotate(f"Transmission: mobility leads\ncase growth by ~{int(pk.lag)} days (τ = {pk.tau:+.2f})",
                   (pk.lag, pk.tau), (-24, 0.16), fontsize=8.5, color=INK, arrowprops=dict(arrowstyle="-", color=INK2))
    ax[1].annotate(f"Behaviour: faster case growth,\nless mobility ~{abs(int(tr.lag))} days later",
                   (tr.lag, tr.tau), (-27, 0.04), fontsize=8.5, color=INK, arrowprops=dict(arrowstyle="-", color=INK2))
    ax[1].set_ylim(-0.2, 0.2)
    note(fig, "Left: raw daily retail mobility vs raw daily cases, as in the paper; the paper keeps whichever lag has the largest |τ|. Right: 7-day averages, case GROWTH per million, "
              "both demeaned by the cross-country average each day, mobility index (PC1 of 5 categories, 92% of variance). "
              "Bands: 95% bootstrap CI over countries. Positive lag = cases measured after mobility (paper's lag sign is reversed).")
    save(fig, "fig2_lag_profiles_paper_vs_fixed.png")

# =============================================================== 3. per-country results by continent
def fig3():
    cc = pd.read_csv(OUT / "corr_country_main.csv", keep_default_na=False, na_values=[""])
    order = ["EU", "NorthAm", "SA", "AS", "AF", "OC"]
    names = {"EU": "Europe", "NorthAm": "N. America", "SA": "S. America", "AS": "Asia", "AF": "Africa", "OC": "Oceania"}
    rng = np.random.default_rng(3)
    fig, ax = plt.subplots(1, 2, figsize=(13, 4.6), gridspec_kw={"wspace": 0.18})
    for a, ch, sign, title in [(ax[0], "transmission", 1, "Transmission: mobility → case growth (7–21 d later)"),
                               (ax[1], "behaviour", -1, "Behaviour: case growth → mobility (0–14 d later)")]:
        for i, ct in enumerate(order):
            d = cc[cc.continent == ct]
            x = i + rng.uniform(-0.18, 0.18, len(d))
            sig = d["q_" + ch] < 0.10
            a.scatter(x[~sig], d["tau_" + ch][~sig], s=26, facecolors="none", edgecolors=PLAC, linewidths=1.2)
            a.scatter(x[sig], d["tau_" + ch][sig], s=30, color=BLUE, edgecolors=SURF, linewidths=0.8)
            a.hlines(d["tau_" + ch].median(), i - 0.3, i + 0.3, color=INK, linewidth=2)
        a.axhline(0, color=INK2, linewidth=0.8)
        a.set_xticks(range(len(order)), [f"{names[o]}\n(n={int((cc.continent == o).sum())})" for o in order], fontsize=8.5)
        a.set_title(title)
        n_sig = int((cc["q_" + ch] < .10).sum())
        a.text(0.99, 0.97 if sign > 0 else 0.03, f"{n_sig}/{len(cc)} countries significant (FDR q < 0.10)",
               transform=a.transAxes, ha="right", va="top" if sign > 0 else "bottom", fontsize=8.5, color=BLUE)
    ax[0].set_ylabel("Country's average Kendall's τ in the window")
    ax[0].scatter([], [], s=30, color=BLUE, label="Significant after FDR correction")
    ax[0].scatter([], [], s=26, facecolors="none", edgecolors=PLAC, label="Not significant")
    ax[0].plot([], [], color=INK, label="Continent median")
    ax[0].legend(loc="lower right", fontsize=8)
    note(fig, "Fixed method, 15 Feb – 19 Jun 2020. p-values from 499 circular-shift surrogates per country (keeps each series' "
              "own smoothness), Benjamini–Hochberg FDR across countries. Expected sign: transmission > 0, behaviour < 0.")
    save(fig, "fig3_country_results_by_continent.png")

# =============================================================== 4. the new model: local projections
def fig4():
    lp = pd.read_csv(OUT / "lp_main.csv")
    lpf = pd.read_csv(OUT / "lp_full.csv")
    lpe = pd.read_csv(OUT / "lp_ext.csv")
    nc = {k: int(v[(v.x == "mob") & (v.spec == "main")].countries.max()) for k, v in [("main", lp), ("full", lpf), ("ext", lpe)]}
    fig, ax = plt.subplots(1, 2, figsize=(11, 4.3), gridspec_kw={"wspace": 0.25})
    a = ax[0]
    for d, col, lab in [(lpe[(lpe.x == "mob") & (lpe.spec == "main")], ORANGE, "Sep 2020 – Apr 2022 (extension)"),
                        (lpf[(lpf.x == "mob") & (lpf.spec == "main")], AQUA, "Through 8 Sep 2020 (robustness)"),
                        (lp[(lp.x == "mob") & (lp.spec == "main")], BLUE, "Through 19 Jun 2020 (paper's window)")]:
        a.fill_between(d.h, d.lo, d.hi, color=col, alpha=0.18, linewidth=0)
        a.plot(d.h, d.beta, color=col, label=lab, marker="o", markersize=3.5)
    a.axhline(0, color=INK2, linewidth=0.8)
    a.axvspan(0, 6, color=GRID, alpha=0.6, linewidth=0)
    a.text(3, a.get_ylim()[1] * 0.92, "too soon for\ninfection + reporting", ha="center", fontsize=8, color=INK2)
    d = lp[(lp.x == "mob") & (lp.spec == "main")]
    pk = d.loc[d.beta.idxmax()]
    a.annotate(f"peak at {int(pk.h)} days:\nβ = {pk.beta:.2f} (SE {pk.se:.2f})", (pk.h, pk.beta), (19, pk.beta + 0.07),
               fontsize=8.5, arrowprops=dict(arrowstyle="-", color=INK2))
    a.set_title("Mobility today → case growth h days later")
    a.set_xlabel("Horizon h (days ahead)")
    a.set_ylabel("Effect of +1 SD mobility on weekly\ncase growth (log points)")
    a.legend(loc="lower right", fontsize=8.5)
    a = ax[1]
    for d, col, lab in [(lpe[lpe.channel == "behaviour"], ORANGE, "Sep 2020 – Apr 2022"),
                        (lpf[lpf.channel == "behaviour"], AQUA, "Through 8 Sep 2020"),
                        (lp[lp.channel == "behaviour"], BLUE, "Through 19 Jun 2020")]:
        a.fill_between(d.h, d.lo, d.hi, color=col, alpha=0.18, linewidth=0)
        a.plot(d.h, d.beta, color=col, label=lab, marker="o", markersize=3.5)
    a.axhline(0, color=INK2, linewidth=0.8)
    a.set_title("Case growth today → change in mobility h days later")
    a.set_xlabel("Horizon h (days ahead)")
    a.set_ylabel("Mobility change (SD) per unit\nof weekly case growth")
    a.legend(loc="lower left", fontsize=8.5)
    note(fig, "Panel local projections, one regression per horizon, with country and day fixed effects and 1–2 week history of "
              f"mobility and case growth as controls; 95% CIs clustered by country. Countries: {nc['main']} (paper window), "
              f"{nc['full']} (to Sep 2020), {nc['ext']} (extension).")
    save(fig, "fig4_local_projections.png")

# =============================================================== 5. categories (small multiples)
def fig5():
    lp = pd.read_csv(OUT / "lp_main.csv")
    fig, ax = plt.subplots(1, 5, figsize=(13, 3.3), sharey=True, gridspec_kw={"wspace": 0.08})
    for a, c in zip(ax, CAT5):
        d = lp[(lp.x == c)]
        a.fill_between(d.h, d.lo, d.hi, color=BLUE, alpha=0.18, linewidth=0)
        a.plot(d.h, d.beta, color=BLUE)
        a.axhline(0, color=INK2, linewidth=0.8)
        p = d.loc[d.beta.abs().idxmax()]
        a.text(0.5, 0.97, f"{p.beta:+.2f} at {int(p.h)} d", transform=a.transAxes, ha="center", va="top", fontsize=8.5, color=INK2)
        a.set_title(NICE[c], fontsize=10)
        a.set_xlabel("days ahead")
    ax[0].set_ylabel("Effect of +1 SD\non case growth")
    note(fig, "Same model as Fig. 4, one category at a time (standardised). Residential has the opposite sign, as expected: "
              "more time at home, slower growth. Paper's window, 15 Feb – 19 Jun 2020.")
    save(fig, "fig5_categories.png")

# =============================================================== 6. forecasting
def fig6():
    hz = pd.read_csv(OUT / "forecast_horizons.csv")
    dm = pd.read_csv(OUT / "forecast_dm.csv")
    fig, ax = plt.subplots(1, 2, figsize=(11, 4.0), gridspec_kw={"wspace": 0.3, "width_ratios": [1.1, 1]})
    a = ax[0]
    models = [("M1 momentum", INK2, "Case momentum only"), ("M2b mobility change", BLUE, "+ mobility (chosen on validation)"),
              ("M2a mobility level", ORANGE, "+ mobility levels")]
    w = 0.26
    for j, (m, col, lab) in enumerate(models):
        red = 100 * (hz["M0 naive"] - hz[m]) / hz["M0 naive"]
        a.bar(np.arange(len(hz)) + (j - 1) * w, red, width=w * 0.9, color=col, label=lab)
    a.axhline(0, color=INK2, linewidth=0.8)
    a.set_xticks(range(len(hz)), [f"{h} days ahead" for h in hz.h])
    a.set_ylabel("Error reduction vs naive 'no change' (%)")
    a.set_title("Mobility adds no forecasting power beyond cases")
    a.set_ylim(-1.2, 5.6)
    a.legend(fontsize=8.5, loc="upper left", ncol=1)
    a = ax[1]
    P = pd.read_csv(OUT / "forecast_predictions.csv", parse_dates=["date"])
    pc = P.groupby("country_region")[["ae_M1 momentum", "ae_M2b mobility change"]].mean()
    diff = 100 * (pc["ae_M1 momentum"] - pc["ae_M2b mobility change"])
    a.hist(diff.clip(-8, 8), bins=np.arange(-8, 8.5, 0.5), color=BLUE, rwidth=0.9)
    a.axvline(0, color=INK2, linewidth=1)
    a.set_title("Per country: some gain, some lose")
    a.set_xlabel("Gain from adding mobility (pp of log error, 14-day)")
    a.set_ylabel("Countries")
    r = dm[(dm.model == "M2b mobility change") & (dm.vs == "M1 momentum")].iloc[0]
    a.text(0.98, 0.95, f"better in {r.share_countries_better:.0%} of countries\nDiebold–Mariano p = {r.p:.2f}",
           transform=a.transAxes, ha="right", va="top", fontsize=9, color=INK2)
    note(fig, "Real-time forecasts of log cases per million, origins 20 Jun – 25 Aug 2020, weekly expanding-window refits, "
              "every country weighted equally. Mobility spec chosen on a May–June validation window before looking at the test period.")
    save(fig, "fig6_forecasting.png")


if __name__ == "__main__":
    which = sys.argv[1:] or ["1", "2", "3", "4", "5", "6"]
    for w in which:
        globals()["fig" + w]()
