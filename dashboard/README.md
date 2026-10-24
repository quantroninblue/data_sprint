# Mobility & COVID-19 dashboard (mock-up)

React + TypeScript + Vite. Editorial layout with a transit-map motif: the six Google mobility categories are the six "lines", and the sections are stops along them.

**Live:** https://quantroninblue.github.io/data_sprint/ (rebuilt by `.github/workflows/pages.yml` on every push to `main` that touches `dashboard/`).

```bash
cd dashboard
npm install
npm run dev        # http://localhost:5173
```

Needs Node.js 20 or newer. The data files in `public/data/` are committed, so the app runs without rebuilding them.

**On Windows** (PowerShell or Command Prompt, from the repo folder):

```powershell
cd dashboard
npm install
npm run dev
```

If PowerShell refuses to run `npm` ("running scripts is disabled"), use `npm.cmd install` and `npm.cmd run dev`, or run the commands in Command Prompt.

To make a production build: `npm run build`, then `npm run preview` (http://localhost:4173).

## Data

The app only reads the JSON files in `public/data/`. `scripts/build_data.py` builds them from the team's outputs (run it from the repo root with `python3 -I dashboard/scripts/build_data.py`, or `py -I dashboard\scripts\build_data.py` on Windows; needs Python 3 with numpy and scipy, and R with `Rscript` on PATH). The types are in `src/lib/data.ts`.

Every view compares the paper's published findings with ours:

| Version | What it is | Source |
|---|---|---|
| Paper · 2020 | The paper's own numbers | Supplementary S1 (extracted from `data/raw/sulyok-repo/`), Tables 1–3 (`src/lib/paper.ts`) |
| Ours · 2020 | Our replication, 15 Feb – 19 Jun 2020 | `Outputs/tables/` (best τ and lag, clusters, models); lag curves and continent tests from `replication/out/` |
| Ours · 2020–22 | The same method to 16 Apr 2022, 7-day averages | `replication/out/` (`smooth` spec) |

| File | Contents |
|---|---|
| `meta.json` | countries (ISO2, name, continent, map code, population, whether the paper included it), date range, lags, rolling-window starts, cluster profiles (paper / authors' code re-run / corrected) |
| `panel.json` | per country: 7-day new cases per 100k and the six mobility series, daily from `meta.start`; plus world aggregates |
| `ccf.json` | `ours` and `full`: Kendall's τ at each lag in `meta.lags` (−28…+28) per country and category |
| `summary.json` | per country: strongest τ and its lag per category for `published`, `ours` and `full`, plus cluster family |
| `continent_tests.json` | `ours` and `full`: Kruskal–Wallis, Dunn pairs (Holm), continent medians and IQRs |
| `models.json` | BIC, validation RMSE, Diebold–Mariano and Table 3 for the paper, the authors' code re-run and the corrected run |
| `fairtest.json` | the reanalysis: real vs wrong-country (placebo) pairs, the fixed correlation (case growth, shared daily trend removed) with lag profiles and per-country results, local projections for three samples, and real-time forecast scores. Lags are converted to the paper's sign convention. Source: `replication/out/` (scripts `10`–`14`) |
| `rolling.json` | per country and category: strongest τ and lag in each 90-day window (our preliminary extension) |

Lag sign follows the paper: τ(lag) correlates mobility on day t with cases on day t − lag, so a negative lag means movement changed before cases.

The "Why it changed" stop lists our hypotheses for why the link fades after 2020. They are labelled as speculation and have not been tested.
