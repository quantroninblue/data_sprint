# Mobility & COVID-19 dashboard (mock-up)

React + TypeScript + Vite. Editorial layout with a transit-map motif: the six Google mobility categories are the six "lines", and the sections are stops along them.

```bash
cd dashboard
npm install
npm run dev        # http://localhost:5173
```

## Data

The app only reads the JSON files in `public/data/`. `scripts/build_data.py` makes preliminary versions from `data/processed/2026-10-24-panel-clean.csv` (run it from the repo root with `python3 -I dashboard/scripts/build_data.py`; needs numpy and scipy). The R analysis should write the same files in the same shapes, and the dashboard will pick them up unchanged. The types are in `src/lib/data.ts`.

| File | Contents |
|---|---|
| `meta.json` | countries (ISO2, name, continent, numeric ISO for the map, population), date range, lags, rolling-window starts, clusters |
| `panel.json` | per country: 7-day new cases per 100k and the six mobility series, daily from `meta.start`; plus world aggregates |
| `ccf.json` | per country and category: Kendall's τ at each lag in `meta.lags` (−28…+28), 15 Feb – 19 Jun 2020 |
| `summary.json` | per country: strongest τ and its lag for each category, cluster id |
| `continent_tests.json` | per category and metric: Kruskal–Wallis, Dunn pairs (Holm), continent medians and IQRs |
| `models.json` | BIC, RMSE and coefficients (currently the paper's values) and per-country forecasts for the validation period (currently simulated) |
| `rolling.json` | per country and category: strongest τ and lag in each 90-day window |

Lag sign follows the paper: τ(lag) correlates mobility on day t with cases on day t − lag, so a negative lag means movement changed before cases.

## What is real and what is a placeholder

- **Real data, paper's method:** panel, cross-correlations, continent tests and rolling windows. Continent medians come out within about 0.02 of the paper's Table 1.
- **Stand-in:** clusters use k-means, where the paper used mclust.
- **Placeholder:** the per-country model forecasts are simulated. BIC, RMSE and coefficients are copied from the paper.
