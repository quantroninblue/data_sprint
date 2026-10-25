# Community movement and COVID-19: a replication

Data Sprint, Round 1, Problem 3, Group 5.

We replicate Sulyok & Walker (2020), "Community movement and COVID-19: a global study using Google's Community Mobility Reports" (*Epidemiology and Infection* 148, e284), and then test whether its conclusions hold with better methods. The brief allows us to change the visualisation, model, presentation and analysis; the data sources (Google Community Mobility Reports and JHU CSSE case counts) and the main theme stay the same.

**Dashboard:** https://quantroninblue.github.io/data_sprint/ shows the paper's published findings side by side with ours.

## Key findings

- **The correlations replicate.** Our continent medians match the paper's Table 1 to within about 0.02, and with the authors' own 2020 data snapshots we reproduce their Table S1 exactly for all 122 countries.
- **Most of that correlation is shared timing.** Pairing one country's mobility with another country's cases gives correlations as strong as the real pairs (median |τ| about 0.51 against 0.48).
- **The "best lag" is often an artefact.** About 25% of best lags sit at the ±27–28 day edge of the search window (7% expected by chance), and picking the best lag inflates mean |τ| by about 45%.
- **A fair measure still finds a link.** Using case growth with the shared daily trend removed, mobility leads case growth by about 16 days (τ ≈ +0.13), while wrong-country pairs score 0. Panel local projections put the effect at about +29% weekly growth roughly 17 days after a 1 SD rise in mobility in 2020, and about half that from Sep 2020 to Apr 2022.
- **Mobility does not improve forecasts.** With the coding errors in the authors' model fixed, adding mobility makes out-of-sample forecasts worse (RMSE 7,689 / 22,676 / 49,202 cases a day for date only / + same-day mobility / + lagged mobility). A real-time forecasting test finds no gain over case momentum alone (DM p = 0.20).
- **Coverage.** We analyse 134 countries. The authors' shared code drops North America and keeps 106 countries; the published tables list 122.

## Repository layout

```
data_sprint/
├── README.md
├── requirements.txt              Python packages
├── docs/
│   ├── problem-brief.docx        the task brief
│   └── contributions.md          what each teammate built and found
├── data/
│   ├── raw/                      upstream material, never edited
│   │   ├── full-mobility-report.zip   the organisers' Google mobility file (1.1 GB unzipped)
│   │   ├── jhu-covid-19/              JHU case data (copy of github.com/datasets/covid-19)
│   │   └── sulyok-repo/               the original authors' code and data
│   ├── interim/
│   │   └── 2026-10-24-gmr-national.csv   Google mobility, national rows only
│   └── processed/
│       └── 2026-10-24-panel-clean.csv    cleaned country-day panel (134 countries)
├── analysis/
│   ├── 01_replication/           R: the paper as published and corrected
│   ├── 02_eda/                   R: exploratory analysis, Kendall cross-correlations, maps, continent tests
│   ├── 03_reanalysis/            Python: placebo test, fixed correlation, local projections, forecasting
│   └── 04_notebook/              R Markdown: replicate / reanalyse / extend in one notebook
├── outputs/                      everything the analysis writes, one folder per analysis step
│   ├── 01_replication/           tables/, figures/, cleaning and replication logs
│   ├── 02_eda/                   figures/, tables/, intermediate .rds files
│   ├── 03_reanalysis/            result CSVs and figures/
│   └── 04_notebook/              data behind notebook Figs 1, 9 and 12
└── dashboard/                    React app that presents the results (see dashboard/README.md)
```

## How to reproduce

Run everything from the repo root. Each step reads `data/` and writes only to its own folder in `outputs/`, so the steps are independent apart from the order inside each one. All outputs are committed, so you only need to rerun a step to check it.

**Requirements:** R 4.3 or newer, Python 3.11 or newer (`pip install -r requirements.txt`) and, for the dashboard, Node.js 20 or newer.

**1. Replication (R, about 10 minutes)**

```r
source("analysis/01_replication/00_install_packages.R")  # once; dlnm 2.4.7 from the CRAN archive
source("analysis/01_replication/01_clean_merge.R")       # writes data/processed/2026-10-24-panel-clean.csv
source("analysis/01_replication/02_replicate_paper.R")   # as published + corrected
```

**2. EDA (R)**: packages `tidyverse`, `janitor`, `scales`, `ggridges`, `ragg`, `sf`, `rnaturalearth`, `rnaturalearthdata` (optional: `pcaPP` for faster Kendall's τ, `ggrepel` for labels).

```r
source("analysis/02_eda/01_data_import.R")   # builds outputs/02_eda/panel.rds
# then 03 to 09 in order; each one sources 02_eda_setup.R itself
source("analysis/02_eda/03_eda_descriptives.R")
```

**3. Reanalysis (Python, about 15 minutes):** open `analysis/03_reanalysis/correlation_and_model.ipynb` and run all cells, or run the scripts directly:

```bash
python analysis/03_reanalysis/10_corr_replicate.py
python analysis/03_reanalysis/11_corr_fixed.py          # and again with --full
python analysis/03_reanalysis/12_model_lp.py            # and again with --full, --ext
python analysis/03_reanalysis/13_model_forecast.py
python analysis/03_reanalysis/14_figures.py
```

**4. Notebook (R Markdown):** knit `analysis/04_notebook/mobility_covid_replication.Rmd` in RStudio. On its first run it downloads about 28 MB of source data into `analysis/04_notebook/data/` (gitignored). Packages: `dplyr`, `tidyr`, `readr`, `ggplot2`, `patchwork`, `scales`, `zoo`, `maps`, `tseries`, `mclust`, `mgcv`, `dlnm`, `fixest`. `Rscript analysis/04_notebook/figs_1_9_12.R` reruns only the three figures the dashboard uses.

**5. Dashboard:** `python3 -I dashboard/scripts/build_data.py` rebuilds its data from `outputs/` (needs `Rscript` on PATH). Then `cd dashboard && npm install && npm run dev` serves it at http://localhost:5173.

## Data notes

- **Mobility** covers 135 countries, 15 Feb 2020 to 15 Oct 2022. `data/interim/2026-10-24-gmr-national.csv` keeps the rows of the full Google file with no `sub_region_1`, `sub_region_2` or `metro_area`.
- **Cases** run 22 Jan 2020 to 16 Apr 2022 and are cumulative; revisions cause small negative daily changes, which are clipped to 0.
- All dates are ISO (`YYYY-MM-DD`). Don't open the CSVs in Excel and save them: Excel rewrites the dates, and `01_clean_merge.R` stops if it finds non-ISO dates.
- Join mobility to cases on ISO2 through `data/raw/jhu-covid-19/data/reference.csv`, not on country names. Seven countries are named differently in the two sources, and Aruba, Hong Kong, Puerto Rico and Réunion have no country-level cases.
- Namibia's ISO2 code is the text `NA`. Read CSVs with `na = ""` (R) or `keep_default_na=False` (pandas) so it isn't turned into a missing value.
- **`data/processed/2026-10-24-panel-clean.csv`** has 105,741 rows for 134 countries, 15 Feb 2020 to 16 Apr 2022. Its `window` column splits it as in the paper: `paper_train` (to 19 Jun 2020), `paper_validation` (20 Jun to 8 Sep 2020) and `extension` (9 Sep 2020 onward).
- Lag sign follows the paper: τ(lag) compares mobility on day t with cases on day t − lag, so a negative lag means mobility moves first.
- The unzipped full mobility CSV is not tracked. To rebuild the national extract, unzip `data/raw/full-mobility-report.zip` inside `data/raw/`.

## Team

| Teammate | Contribution | Folder |
| --- | --- | --- |
| Devashish | Replication of the paper, as published and corrected | `analysis/01_replication/` |
| Teerth | Exploratory analysis, data importer, original repo structure | `analysis/02_eda/` |
| Sherin | Reanalysis: exact replication, placebo test, fixed correlation, new models | `analysis/03_reanalysis/` |
| Meetanshi | Analysis plan and R Markdown notebook | `analysis/04_notebook/` |
| Abhroneel | Dashboard and final repo clean-up | `dashboard/` |

Each person's work and findings are described in [`docs/contributions.md`](docs/contributions.md).

## Sources

- Sulyok M, Walker M (2020). Community movement and COVID-19: a global study using Google's Community Mobility Reports. *Epidemiology and Infection* 148, e284. https://doi.org/10.1017/S0950268820002757
- Authors' code and data: https://github.com/msulyok/GoogleMobilityDataCOVID
- Google COVID-19 Community Mobility Reports: https://www.google.com/covid19/mobility/
- JHU CSSE case data via https://github.com/datasets/covid-19
