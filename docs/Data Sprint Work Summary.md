# Data Sprint: Work Summary

Oct 24, 2026 · @Devashish

## Where we stand

The replication is finished and runs end to end on Devashish's laptop. What remains is the deck, the visuals (in progress with a teammate) and a short README.

- **Done:** data cleaning, a faithful replication of the paper, and a corrected version that fixes the coding errors in the authors' code.
- **Our angle for "replicate it in a better way":** we cover more countries (134 against the paper's 106), use cleaner data handling, and fix the models. Once fixed, the paper's main forecasting claim does not hold.
- **Dropped by decision:** a further improved model (growth rates, panel regression, 2021 to 2022 extension). Its main points can go in the deck as limitations and future work.
- **Left to do:** deck (5 required sections), visuals, README.

## The task and the rules

The task is to replicate Sulyok & Walker (2020), "Community movement and COVID-19: a global study using Google's Community Mobility Reports", in a better way. The data sources and main theme must stay the same; the visuals, model, presentation and analysis may change. The brief (`Global_Mobility_Report.docx`) says success depends on visualisation and analysis.

| Rule | How we followed it |
| --- | --- |
| R or Python | All analysis in R 4.3.2; one Python snippet used only to filter the 1.1 GB mobility file |
| No Excel for analysis | None used. The cleaning script stops if a CSV has been re-saved by Excel |
| Everything through code, no online tools | Scripts 00 to 02 produce every table and figure |
| Flag every blog, GitHub or AI source | Each script header lists the paper, the authors' code repo, the data repo, the R packages and help from Claude |
| Data is the organisers' IP | Shared with the team through a GitHub repo, which must stay private |
| Deck: problem statement, data description, model, analysis and visualisation, conclusion | Mapping below; deck not built yet |

## What we did, step by step

1. **Read the brief, the paper and the authors' code.** The paper links its R code on GitHub (msulyok/GoogleMobilityDataCOVID). Reading it showed exactly how each result was produced, and where it went wrong.
2. **Filtered the mobility file.** The organisers' Google file is 1.14 GB of country, state and city rows. A Python snippet kept only country-level rows: 130,824 rows, 135 countries, 15 Feb 2020 to 15 Oct 2022.
3. **Added the case data.** From the datasets/covid-19 GitHub repo (the source the brief names): province-level confirmed cases, plus a lookup table of ISO country codes and population.
4. **Installed the R packages** (script 00). The current version of `dlnm` needs R 4.4 or newer, so we installed the 2021 version 2.4.7 instead; all other packages install as pre-built binaries.
5. **Cleaned and merged** (script 01) into one panel: one row per country per day, 134 countries, 105,741 rows, 26 columns. Each decision is recorded in the cleaning log.
6. **Replicated the paper two ways** (script 02), on 15 Feb to 19 Jun 2020:
   - *As published:* the paper's sample rules and the authors' exact model code.
   - *Corrected:* all 134 countries, with each coding error fixed. It covers the correlations, continent tables, clusters, world maps, the three models, BIC and forecast validation.
7. **Wrote up the findings** in the improvements note (a separate doc), including two of our own earlier claims that turned out wrong and were corrected.

## Key findings

The paper's correlation results replicate; its forecasting conclusion does not survive the corrections.

| # | Finding | Paper | Ours |
| --- | --- | --- | --- |
| 1 | Correlations replicate closely (median Kendall's tau, Europe, retail) | −0.63 | −0.62 |
| 2 | Same 4 country clusters (strong short-lag, weak, −28 days, +28 days) | 4 | 4 |
| 3 | Countries analysed | 106 | 134 |
| 4 | North America in continent tables | Missing | 18 countries |
| 5 | Residential mobility in the same-day model | Silently dropped by the code | Own term |
| 6 | Best model by forecast error | Lagged mobility | Date only |
| 7 | Forecast error, RMSE in cases per day (date only / + same-day mobility / + lagged mobility) | 6,840 / 6,795 / 6,690 | 7,689 / 22,676 / 49,202 |
| 8 | Countries whose best lag sits at the 27 to 28 day edge | Not reported | 25% to 30% (7% expected) |

**What the findings mean:**

- **Rows 1 and 2:** mobility and cases are clearly linked, most strongly in Europe (median tau around −0.6 for retail, transit and workplaces).
- **Rows 3 and 4:** the paper lost 28 countries to joining on country names and to North America's code "NA" being read as missing. We joined on ISO codes.
- **Row 5:** the formula `s(workplaces + residential)` is read by R as `s(workplaces)`, so residential mobility was never in the model.
- **Rows 6 and 7:** with the fixes, adding mobility makes forecasts worse. Mobility was standing in for time: when mobility recovered in summer 2020, the models predicted runaway growth (US about 625,000 cases a day against a real peak of 75,147).
- **Row 8:** many "best" lags are picked up by the shared trend, not a real delay.

One caution for the deck: the cause of the missing North America is "most likely" the "NA" code, not proven.

## Repository structure

The GitHub repo has three folders: `code1`, `Datasets` and `Outputs`. Run the scripts in `code1` in order (00, 01, 02); each reads only what the previous one wrote.

| Folder | File | What it is |
| --- | --- | --- |
| `code1` | `2026-10-24-00-install-packages.R` | One-time install of the R packages |
| `code1` | `2026-10-24-01-clean-merge.R` | Cleans and merges the datasets into one panel (under 1 minute) |
| `code1` | `2026-10-24-02-replicate-paper.R` | Replication, as published and corrected (about 8 minutes) |
| `Datasets` | `2026-10-24-gmr-national.csv` | Google mobility, country-level rows only, filtered from the organisers' 1.14 GB file |
| `Datasets` | `2026-10-24-time-series-covid-combined.csv` | Confirmed COVID-19 cases by country and province (datasets/covid-19) |
| `Datasets` | `2026-10-24-reference.csv` | ISO country codes and population (datasets/covid-19) |
| `Datasets` | `2026-10-24-countries-aggregated.csv` | Country case totals; not used by the scripts |
| `Outputs` | `2026-10-24-panel-clean.csv` | The merged panel: one row per country per day |
| `Outputs` | `2026-10-24-country-coverage.csv` | One row per country with data-quality flags |
| `Outputs` | `2026-10-24-cleaning-log.txt` | Every cleaning decision with counts |
| `Outputs` | `2026-10-24-02-replication-log.txt` | Every replication number in plain text |
| `Outputs/tables` | `2026-10-24-02-*.csv` | 15 result tables |
| `Outputs/figures` | `2026-10-24-02-*.png` | 2 world maps and 1 box plot |

**To run the code from the repo:** the scripts point to Devashish's laptop folder by default. After cloning, run `Sys.setenv(DS_ROOT = "<path to the cloned repo>")` in R, then source the scripts in order.

Do not open the CSVs in Excel; it rewrites the dates on save. View them in RStudio with `View(data.table::fread("<path>"))`.

## Handoff for the visuals

All the data each chart needs is already in `Outputs`. Chart 4 is dropped for time; chart 5 carries the same message. Charts must be made in R or Python code, not Excel.

| # | Chart idea | Data file | Columns to use | Message it carries |
| --- | --- | --- | --- | --- |
| 1 | Mobility and cases over time for 3 to 4 example countries (e.g. Italy, India, Brazil, US) | `panel-clean.csv` | `date`, `country`, `retail_7d`, `workplaces_7d`, `new_7d_pm` | What the data looks like; why both series trend together |
| 2 | Paper vs ours: continent median tau, side by side | `tables\...table1-tau-by-continent-as_published.csv` + paper Table 1 values | One row per category, one column per continent | The correlations replicate |
| 3 | Histogram of best lags, all countries and categories | `tables\...xcorr-by-country.csv` | `lag_retail` to `lag_residential` | Spikes at −28 and +28 days: trend artefact |
| 4 | Forecast vs actual, 20 Jun to 8 Sep 2020, for the US | **Dropped (data not exported)** |  | Mobility models blow up out of sample |
| 5 | Forecast error by model (paper vs corrected) | `tables\...validation-rmse.csv` | `rmse_paper`, `rmse_corrected` | The ranking reverses |
| 6 | Map of countries covered: paper vs ours | `country-coverage.csv`, `tables\...xcorr-by-country.csv` | `iso2`, `in_paper_tables` | 106 to 134 countries; North America back |
| 7 | Cluster profiles | `tables\...clusters-profile-corrected.csv`, `clusters-members-corrected.csv` | median tau and lag per cluster | The 4 country types |

The existing maps (`fig1-max-tau-map.png`, `fig2-best-lag-map.png`) and box plot can be restyled or used as they are.

**Column notes:** tau runs from −1 to +1. Lag is in days, and negative means mobility moves first. `new_7d_pm` is new cases per million people (7-day average). Mobility columns are % change from the pre-COVID baseline.

## Deck outline

The five required sections, with the content for each already in hand.

| Section | Content | Source |
| --- | --- | --- |
| 1. Problem statement | Does community mobility track COVID-19 cases across countries, and does it improve forecasts? Our job: replicate the 2020 paper and test whether its conclusions hold | Brief; paper |
| 2. Data description | Google mobility (6 categories, % change from baseline) and Johns Hopkins confirmed cases; 134 countries, 15 Feb 2020 to 16 Apr 2022; cleaning steps and their counts (ISO join, territories, 109 negative days in 62 countries, 14 weekly-reporting countries) | Cleaning log; work summary sections above |
| 3. Model | Kendall cross-correlation at lags −28 to +28 days; Kruskal-Wallis and Dunn tests; mclust clustering; three Tweedie GAMs with a country random intercept; BIC; RMSE and Diebold-Mariano validation. Then the 6 corrections | Replication log; improvements note |
| 4. Analysis and visualisation | Maps, replication match table, lag histogram, cluster profiles, forecast-vs-actual, RMSE comparison | Visuals handoff above |
| 5. Conclusion | Mobility and cases are linked; the paper's correlations replicate. Its forecasting claim does not survive the corrections. Limitations and future work: growth-rate models, panel fixed effects, rolling validation, 2021 to 2022 extension | Key findings above |

## Before submitting

- [x] Scripts 00 to 02 run end to end on a clean R session
- [x] Sources flagged in every script header
- [ ] Visuals made in code, with their script saved in `code1` and its sources flagged
- [ ] US forecast example (about 625,000 predicted vs 75,147 actual) quoted as text on the forecast-error slide
- [ ] Deck built with all five sections
- [ ] README in the folder: script order, run times, R version, sources
- [ ] "Residential lag bug" kept out of the deck (it is in the public code but not in the paper)
- [ ] "North America missing" stated as "most likely" caused by the "NA" code
- [ ] GitHub repo set to private (the data is the organisers' IP)

Sources: [Sulyok & Walker (2020)](https://www.cambridge.org/core/services/aop-cambridge-core/content/view/C1EF917377F6013D5E1ECC44E03A3E6E/S0950268820002757a.pdf/div-class-title-community-movement-and-covid-19-a-global-study-using-google-s-community-mobility-reports-div.pdf) · [Authors' code](https://github.com/msulyok/GoogleMobilityDataCOVID) · [Case data](https://github.com/datasets/covid-19)
