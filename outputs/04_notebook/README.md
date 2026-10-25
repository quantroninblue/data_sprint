# Exports from `analysis/04_notebook/mobility_covid_replication.Rmd`

Data behind three figures of the notebook, used by the dashboard (`dashboard/scripts/build_data.py`):

| File | Figure |
|---|---|
| `fig1_heat.csv` | Fig 1, lockdown wave: mobility index by country and day, 15 Feb – 19 Jun 2020 |
| `fig9_timing.csv` | Fig 9, who moved first: day the index first fell 20% below baseline vs day cumulative cases reached 1 per million |
| `fig12_curves.csv`, `fig12_style_names.csv` | Fig 12, lockdown styles: weekly index per country and its k-means style |
| `stationarity.csv` | Share of countries passing both ADF and KPSS, by series |

They are written by `analysis/04_notebook/figs_1_9_12.R`, the notebook's own code for the data set-up and these three figures (extracted with `knitr::purl`) plus the export lines at the end. Run it from the repo root: `Rscript analysis/04_notebook/figs_1_9_12.R`.

The mobility filter keeps national rows only: `filter(is.na(sub_region_1), is.na(sub_region_2), is.na(metro_area))`. Without the `metro_area` condition, rows such as "Kabul Metropolitan Area" are read as national rows, which duplicates 4,833 country-days with conflicting values.
