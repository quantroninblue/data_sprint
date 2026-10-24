"""Build the dashboard's JSON files from the team's cleaned panel.

Preliminary numbers for the mock-up: the cross-correlations follow the paper's
method (Kendall's tau-b, cases lagged -28..+28 days, 15 Feb - 19 Jun 2020), but
clusters are k-means instead of mclust and the model forecasts are simulated.
The real R analysis should overwrite these files in the same format.

Run from the repo root:  python3 -I dashboard/scripts/build_data.py
"""

import csv
import json
import math
import os
from datetime import date, timedelta

import numpy as np
from scipy import stats

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PANEL_CSV = os.path.join(ROOT, "data", "processed", "2026-10-24-panel-clean.csv")
REFERENCE_CSV = os.path.join(ROOT, "data", "interim", "2026-10-24-reference.csv")
OUT = os.path.join(ROOT, "dashboard", "public", "data")

CATS = ["retail", "grocery", "parks", "transit", "workplaces", "residential"]
START = date(2020, 2, 15)
END = date(2022, 4, 16)  # last day of the JHU case data
PAPER_END = date(2020, 6, 19)
VALID_END = date(2020, 9, 8)
LAGS = np.arange(-28, 29)
CONTINENTS = {"AF": "Africa", "AS": "Asia", "EU": "Europe", "OC": "Oceania", "SA": "South America", "NA": "North America"}
CONTINENT_CODE = {v: k for k, v in CONTINENTS.items()}

N_DAYS = (END - START).days + 1


def day_index(s):
    y, m, d = map(int, s.split("-"))
    return (date(y, m, d) - START).days


def numeric_codes():
    """ISO2 -> zero-padded numeric ISO code, which the world-atlas map uses as feature ids."""
    out = {}
    with open(REFERENCE_CSV, newline="") as f:
        for row in csv.DictReader(f):
            if row["Province_State"] == "" and row["Admin2"] == "" and row["iso2"] and row["code3"]:
                out.setdefault(row["iso2"], f"{int(float(row['code3'])):03d}")
    return out


def load_panel():
    """Daily arrays per country from the cleaned panel (cases: new_paper = negatives clipped, as in the paper)."""
    info, mob, cases, per100k = {}, {}, {}, {}
    with open(PANEL_CSV, newline="") as f:
        for row in csv.DictReader(f):
            i = day_index(row["date"])
            if i < 0 or i >= N_DAYS:
                continue
            iso = row["iso2"]
            if iso not in info:
                info[iso] = {"name": row["country"], "continent": CONTINENT_CODE[row["continent"]], "pop": int(float(row["population"]))}
                mob[iso] = np.full((len(CATS), N_DAYS), np.nan)
                cases[iso] = np.full(N_DAYS, np.nan)
                per100k[iso] = np.full(N_DAYS, np.nan)
            for k, cat in enumerate(CATS):
                if row[cat] != "":
                    mob[iso][k, i] = float(row[cat])
            if row["new_paper"] != "":
                cases[iso][i] = float(row["new_paper"])
            if row["new_7d_pm"] != "":
                per100k[iso][i] = float(row["new_7d_pm"]) / 10
    return info, mob, cases, per100k


def kendall_ccf(mob, cases, lags=LAGS):
    """Kendall tau-b of mob[t] vs cases[t - lag] for each lag, pairwise-complete."""
    n = len(mob)
    iu, ju = np.triu_indices(n, 1)
    sx = np.sign(mob[ju] - mob[iu])
    vx = ~np.isnan(sx)
    taus = np.full(len(lags), np.nan)
    for k, lag in enumerate(lags):
        shifted = np.full(n, np.nan)
        if lag >= 0:
            shifted[lag:] = cases[: n - lag]
        else:
            shifted[:lag] = cases[-lag:]
        sy = np.sign(shifted[ju] - shifted[iu])
        ok = vx & ~np.isnan(sy)
        if ok.sum() < 300:  # roughly 25+ complete days
            continue
        a, b = sx[ok], sy[ok]
        den = math.sqrt((a * a).sum() * (b * b).sum())
        if den > 0:
            taus[k] = (a * b).sum() / den
    return taus


def strongest(taus, lags=LAGS):
    if np.isnan(taus).all():
        return None, None
    k = int(np.nanargmax(np.abs(taus)))
    return float(taus[k]), int(lags[k])


def dunn(groups):
    """Dunn's test with Holm correction (no tie correction)."""
    vals = np.concatenate([g for g in groups.values()])
    ranks = stats.rankdata(vals)
    n_total = len(vals)
    mean_rank, sizes, pos = {}, {}, 0
    for key, g in groups.items():
        mean_rank[key] = ranks[pos : pos + len(g)].mean()
        sizes[key] = len(g)
        pos += len(g)
    keys = list(groups)
    pairs = []
    for i in range(len(keys)):
        for j in range(i + 1, len(keys)):
            a, b = keys[i], keys[j]
            se = math.sqrt(n_total * (n_total + 1) / 12 * (1 / sizes[a] + 1 / sizes[b]))
            z = (mean_rank[a] - mean_rank[b]) / se
            pairs.append([a, b, z, 2 * stats.norm.sf(abs(z))])
    order = sorted(range(len(pairs)), key=lambda i: pairs[i][3])
    m, running = len(pairs), 0.0
    for rank, i in enumerate(order):
        running = max(running, min(1.0, (m - rank) * pairs[i][3]))
        pairs[i].append(running)
    return [{"a": a, "b": b, "z": round(z, 3), "p_adj": round(p, 4)} for a, b, z, _, p in pairs]


def kmeans(X, k=4, restarts=50, seed=2020):
    rng = np.random.default_rng(seed)
    best, best_inertia = None, np.inf
    for _ in range(restarts):
        centers = X[rng.choice(len(X), k, replace=False)]
        for _ in range(100):
            labels = ((X[:, None, :] - centers[None]) ** 2).sum(-1).argmin(1)
            new = np.array([X[labels == c].mean(0) if (labels == c).any() else centers[c] for c in range(k)])
            if np.allclose(new, centers):
                break
            centers = new
        inertia = ((X - centers[labels]) ** 2).sum()
        if inertia < best_inertia:
            best, best_inertia = labels, inertia
    return best


def r(x, nd=3):
    return None if x is None or (isinstance(x, float) and math.isnan(x)) else round(float(x), nd)


def series(a, nd=2):
    return [r(v, nd) for v in a]


def main():
    os.makedirs(OUT, exist_ok=True)
    info, mob, cases, per100k = load_panel()
    codes = numeric_codes()

    countries = [
        {"iso2": iso, "name": c["name"], "continent": c["continent"], "numeric": codes.get(iso, ""), "pop": c["pop"]}
        for iso, c in sorted(info.items())
    ]
    isos = [c["iso2"] for c in countries]
    print(f"{len(countries)} countries in the panel ({sum(1 for c in countries if not c['numeric'])} without a map code)")

    # Panel: 7-day cases per 100k and raw mobility, daily from START to END.
    panel = {}
    for c in countries:
        iso = c["iso2"]
        panel[iso] = {"cases": series(per100k[iso]), "mob": {cat: series(mob[iso][k], 0) for k, cat in enumerate(CATS)}}
    total_pop = sum(c["pop"] for c in countries)
    world_cases = np.nansum([per100k[i] * c["pop"] for i, c in zip(isos, countries)], axis=0) / total_pop
    world_mob = {cat: series(np.nanmedian(np.array([mob[i][k] for i in isos]), axis=0), 1) for k, cat in enumerate(CATS)}

    # Paper replication window: raw daily cases, as the authors used.
    p_end = (PAPER_END - START).days + 1
    ccf, summary = {}, []
    for c in countries:
        iso = c["iso2"]
        ccf[iso] = {}
        row = {"iso2": iso, "continent": c["continent"], "tau": {}, "lag": {}}
        for k, cat in enumerate(CATS):
            taus = kendall_ccf(mob[iso][k, :p_end], cases[iso][:p_end])
            ccf[iso][cat] = series(taus, 3)
            row["tau"][cat], row["lag"][cat] = strongest(taus)
            row["tau"][cat] = r(row["tau"][cat])
        summary.append(row)

    # Clusters on scaled tau + lag (k-means stand-in for mclust).
    complete = [s for s in summary if all(s["tau"][c] is not None for c in CATS)]
    X = np.array([[s["tau"][c] for c in CATS] + [s["lag"][c] for c in CATS] for s in complete])
    X = (X - X.mean(0)) / X.std(0)
    labels = kmeans(X)
    # Number clusters by median retail lag so the ordering is stable between runs.
    med_lag = {l: np.median([s["lag"]["retail"] for s, lab in zip(complete, labels) if lab == l]) for l in set(labels)}
    rename = {old: new + 1 for new, old in enumerate(sorted(med_lag, key=med_lag.get))}
    for s, lab in zip(complete, labels):
        s["cluster"] = rename[lab]
    clusters = []
    for cl in sorted(set(rename.values())):
        members = [s for s in complete if s.get("cluster") == cl]
        mob_cats = ["retail", "grocery", "transit", "workplaces"]
        clusters.append({
            "id": cl,
            "n": len(members),
            "median_tau": r(np.median([s["tau"][c] for s in members for c in mob_cats])),
            "median_lag": r(np.median([s["lag"][c] for s in members for c in mob_cats]), 1),
            "members": [s["iso2"] for s in members],
        })

    # Continent tests per category and metric.
    tests = {}
    for cat in CATS:
        tests[cat] = {}
        for metric in ("tau", "lag"):
            groups = {}
            for s in summary:
                if s[metric][cat] is not None:
                    groups.setdefault(s["continent"], []).append(s[metric][cat])
            groups = {k: np.array(v, dtype=float) for k, v in groups.items() if len(v) >= 3}
            h, p = stats.kruskal(*groups.values())
            tests[cat][metric] = {
                "kw_h": r(h), "kw_p": r(p, 4),
                "medians": {k: r(np.median(v)) for k, v in groups.items()},
                "iqr": {k: [r(np.percentile(v, 25)), r(np.percentile(v, 75))] for k, v in groups.items()},
                "dunn": dunn(groups),
            }

    # Rolling 90-day windows every 14 days over the whole period (the "better" extension).
    window, step = 90, 14
    starts = list(range(0, N_DAYS - window + 1, step))
    rolling = {}
    for c in countries:
        iso = c["iso2"]
        rolling[iso] = {}
        sm = per100k[iso]
        for k, cat in enumerate(CATS):
            taus_w, lags_w = [], []
            for s0 in starts:
                t, l = strongest(kendall_ccf(mob[iso][k, s0 : s0 + window], sm[s0 : s0 + window]))
                taus_w.append(r(t))
                lags_w.append(l)
            rolling[iso][cat] = {"tau": taus_w, "lag": lags_w}
    print("rolling windows:", len(starts))

    # Model section: BIC, RMSE and coefficients are the paper's published values;
    # per-country forecasts are SIMULATED until the R models are run.
    rng = np.random.default_rng(7)
    v0, v1 = (PAPER_END - START).days + 1, (VALID_END - START).days + 1
    preds = {}
    for c in countries:
        iso = c["iso2"]
        obs = per100k[iso][v0:v1]
        if np.isnan(obs).all():
            continue
        t = np.linspace(0, 1, len(obs))
        drift = {m: rng.normal(0, s) for m, s in (("date", 0.45), ("mobility", 0.35), ("lagged", 0.22))}
        preds[iso] = {"observed": series(obs)}
        for m, d in drift.items():
            wobble = 1 + d * t + rng.normal(0, 0.04, len(obs)).cumsum() * 0.3
            preds[iso][m] = series(np.clip(obs * wobble, 0, None))
    models = {
        "simulated_forecasts": True,
        "train_end": PAPER_END.isoformat(),
        "valid_start": (PAPER_END + timedelta(days=1)).isoformat(),
        "valid_end": VALID_END.isoformat(),
        "paper": {
            "bic": {"date": 79802.47, "mobility": 79096.29, "lagged": 80286.14},
            "rmse": {"date": 6840.16, "mobility": 6794.99, "lagged": 6690.44},
            "coefficients": [
                {"term": "Date (smooth)", "estimate": 14.88, "se": 0.67, "p": 0.001},
                {"term": "Retail & recreation", "estimate": -1.34, "se": 0.59, "p": 0.025},
                {"term": "Grocery & pharmacy", "estimate": 0.33, "se": 0.36, "p": 0.358},
                {"term": "Transit stations", "estimate": -0.33, "se": 0.36, "p": 0.368},
                {"term": "Workplaces", "estimate": -0.42, "se": 0.51, "p": 0.415},
            ],
        },
        "predictions": preds,
    }

    meta = {
        "generated": date.today().isoformat(),
        "preliminary": True,
        "notes": "Cross-correlations follow the paper's method; clusters are k-means (not mclust); model forecasts are simulated.",
        "start": START.isoformat(), "end": END.isoformat(), "paper_end": PAPER_END.isoformat(),
        "categories": CATS, "lags": LAGS.tolist(), "continents": CONTINENTS,
        "countries": countries,
        "rolling": {"window_days": window, "step_days": step, "starts": [(START + timedelta(days=s)).isoformat() for s in starts]},
        "clusters": clusters,
    }

    def dump(name, obj):
        with open(os.path.join(OUT, name), "w") as f:
            json.dump(obj, f, separators=(",", ":"), allow_nan=False)
        print(f"{name}: {os.path.getsize(os.path.join(OUT, name)) / 1e6:.2f} MB")

    dump("meta.json", meta)
    dump("panel.json", {"countries": panel, "world": {"cases": series(world_cases), "mob": world_mob}})
    dump("ccf.json", ccf)
    dump("summary.json", summary)
    dump("continent_tests.json", tests)
    dump("rolling.json", rolling)
    dump("models.json", models)


if __name__ == "__main__":
    main()
