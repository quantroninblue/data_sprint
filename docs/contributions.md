# Team contributions

Data Sprint, Round 1, Problem 3, Group 5: replicating Sulyok & Walker (2020), "Community movement and COVID-19: a global study using Google's Community Mobility Reports", and testing whether its conclusions hold.

## How we worked

We developed the questions, methods and interpretation together in joint sessions. Many of the ideas behind this project came out of those discussions, and everyone's input shaped the final analysis. We then split the implementation between us. The sections below describe the part of the work each person led, so they show how we divided the work, not the full extent of anyone's contribution.

Numbers are quoted from the committed outputs (runs of 24 Oct 2026).

---

## Devashish

**Main replication of the paper, as published and corrected.** Code in `analysis/01_replication/`, outputs in `outputs/01_replication/`, all in R.

- **Data cleaning and merge** (`01_clean_merge.R`). Built the shared country-day panel `data/processed/2026-10-24-panel-clean.csv`: 134 countries, 105,741 rows, 15 Feb 2020 to 16 Apr 2022. Mobility and cases are joined on ISO codes instead of country names, and every cleaning decision is recorded with counts in `2026-10-24-cleaning-log.txt`. These decisions cover territories, 109 negative daily counts in 62 countries, and 14 countries that report weekly. The script stops if a CSV has been re-saved by Excel.
- **Replication two ways** (`02_replicate_paper.R`), on the paper's window (training to 19 Jun 2020, validation to 8 Sep 2020):
  - *As published:* the paper's sample rules and the authors' exact model code.
  - *Corrected:* all 134 countries with each coding error fixed.

  Both cover the Kendall cross-correlations, continent tables, mclust clusters, world maps, the three Tweedie GAMMs, BIC, RMSE and Diebold–Mariano validation.
- **Exploring the paper's models.** Worked through the paper's GAMMs with Teerth, which fed into the corrected models.
- **Package setup** (`00_install_packages.R`). Installs every package as a pre-built binary. It pins `dlnm` 2.4.7 from the CRAN archive, because newer versions need R 4.4.

**Findings**

| Finding | Paper | Ours |
| --- | --- | --- |
| Median Kendall's τ, Europe, retail | −0.63 | −0.62 |
| Country clusters (strong short-lag, weak, −28 days, +28 days) | 4 | 4 |
| Countries analysed | 106 when the authors' shared code is re-run (122 in the published tables) | 134 |
| North America in the continent tables | Dropped by the authors' shared code | 18 countries |
| Residential mobility in the same-day model | Silently dropped (`s(workplaces + residential)` is one smooth of the sum) | Own term |
| Best model by forecast error | Lagged mobility | Date only |
| RMSE, cases per day (date only / + same-day mobility / + lagged mobility) | 6,840 / 6,795 / 6,690 | 7,689 / 22,676 / 49,202 |

- The correlations replicate closely.
- The forecasting claim does not hold up. Once the code is fixed, adding mobility makes forecasts worse, because mobility was standing in for time. When mobility recovered in summer 2020, the models predicted runaway growth: about 625,000 cases a day for the US, against a real peak of 75,147.
- The likely reason North America disappears is that its continent code `"NA"` is read as a missing value. This is the most likely cause, not a proven one.

---

## Teerth

**Exploratory data analysis, the data importer and the original repo structure.** Code in `analysis/02_eda/`, outputs in `outputs/02_eda/`, all in R. (Commits appear under the GitHub username "Satore".)

- **Data importer** (`01_data_import.R`). Builds the EDA panel from the national mobility extract, JHU cases and population, and the authors' continent codes. It parses the dates, joins on ISO2 and adds continents.
- **EDA scripts `02`–`09`**:
  - `02`: shared plotting theme and derived variables (7-day averages, cases per 100k, the paper's time windows).
  - `03`: descriptive tables, timelines, distributions, heatmaps and missingness.
  - `04`–`05`: Kendall's τ at lags −28 to +28 days for every country and category, in the paper window and over the full period 2020–22. They also cover lag distributions, cross-correlation curves, τ inflation and sign checks.
  - `06`: world maps of τ and lag.
  - `07`: normality and autocorrelation (histograms, QQ plots, per-country Shapiro–Wilk with Holm adjustment, Jarque–Bera, skewness and kurtosis, ACF).
  - `08`: the country : population : infections table, with rankings, scatter plots and maps.
  - `09`: continent comparisons with Shapiro–Wilk, Kruskal–Wallis and Dunn's test (Holm), plus box plots.
- **Exploring the paper's models.** Worked through the paper's GAMMs with Devashish.
- **EDA guide.** Wrote a guide covering every figure and table: what it shows, how it is calculated and how to justify it in the report, plus a suggested main-text/appendix split and draft methods wording.
- **Repo set-up.** Created the original `data/raw`, `data/interim`, `data/processed` structure, the README and the team's patch workflow.

**Findings**

- **The best lag is often an artefact.** In the paper window, 21–27% of best lags sit at the ±28-day limit of the search; over the full period it is 44–79%. Either way, the lag can't be pinned down.
- **Picking the best of 57 lags inflates τ.** Mean |τ| rises by about 0.13–0.17 in the paper window (roughly 0.31 to 0.46), so the reported τ values are upper bounds.
- **The result is not stable over time.** Between the paper window and the full period, 54–77 countries per category change sign.
- **The series break the assumptions of naive tests.** They are non-normal and strongly autocorrelated (lag-1 autocorrelation 0.76–0.99), so the analysis uses rank-based tests and does not interpret naive p-values.
- **Small groups.** Oceania has only 4 countries, so its continent tests have little power.

---

## Sherin

**Reanalysis in Python: the exact replication, the placebo test, a fixed correlation measure and new models.** Code in `analysis/03_reanalysis/` (scripts `10`–`14` and the notebook `correlation_and_model.ipynb`), outputs in `outputs/03_reanalysis/`.

- **Exact replication** (`10_corr_replicate.py`). Uses the authors' own 2020 data snapshots and reproduces the paper's Table S1 exactly: the same τ and the same best lag for all 122 published countries. So the problems below come from the *method*, not from a coding difference.
- **Placebo test.** Pairs each country's mobility with a different country's cases. These wrong-country pairs look as correlated as the real ones (median |τ| about 0.51 against 0.49). Most of the paper's correlation is shared global timing.
- **Fixed correlation** (`11_corr_fixed.py`). Uses case growth instead of levels, removes the shared daily trend, uses a combined mobility index and fixes the windows. With these changes the placebo profile goes flat (|τ| ≤ 0.01 at every lag), and a real signal remains:
  - Mobility leads case growth by about 16 days (τ = +0.13, 95% CI 0.09–0.18).
  - The link points the right way in 71% of countries and survives false-discovery correction in 44 of 110.
  - South America becomes one of the strongest links.
- **Panel local projections** (`12_model_lp.py`). A new explanatory model with country and day fixed effects and errors clustered by country.
  - The effect of mobility is indistinguishable from zero for the first 9 days, as biology requires, and peaks at 17 days.
  - At the peak, 1 SD more mobility means about 29% faster weekly case growth in 2020, and about half that from Sep 2020 to Apr 2022.
- **Real-time forecasting test** (`13_model_forecast.py`). Case momentum beats a naive forecast, but adding mobility does not significantly improve on momentum: the 14-day error is 0.464 against 0.466, Diebold–Mariano p = 0.20.
- **Figures** (`14_figures.py`). Six figures covering the paper's correlation problems, lag profiles, country results, local projections, categories and forecasting.
- **Code review of the authors' R code.** Found four things:
  - The residential lag is overwritten with the workplace lag. The published S1 table is unaffected.
  - Model 2 smooths the *sum* of workplaces and residential.
  - The distributed-lag crossbasis uses lags 0 to 14 days back, not ±14 as the paper says.
  - Country names are merged without harmonisation, which drops South Korea, Taiwan, Myanmar, Côte d'Ivoire, Cabo Verde and the Bahamas.

---

## Meetanshi

**The team's analysis plan and an end-to-end R Markdown notebook.** Notebook in `analysis/04_notebook/`, with exports for the dashboard in `outputs/04_notebook/`.

- **The feedback loop.** Pointed out that mobility and infections form a feedback loop: high mobility raises infections, rising infections then push mobility down, so mobility partly ends up affecting itself. This is why we treat the relationship as co-movement rather than a one-way effect, and why the reanalysis tests both directions (mobility → case growth and case growth → mobility).

- **Analysis plan.** Split the project into three layers:
  - **Replicate:** same data and method; do we get their numbers?
  - **Reanalyse:** the paper's two questions with better methods. Q1: is mobility linked to cases, and how does that vary by country? Q2: does mobility improve case modelling?
  - **Extend:** new questions, clearly labelled.

  The plan also catalogued eleven problems in the original. Among them: correlation on trending levels, the unstable "best lag", mixed signs and directions, raw counts, the date smooth in the models, RMSE on the count scale, same-day mobility as a predictor, BIC compared across different samples, and overstated significance. It traced the risk of spurious correlation to four sources: shared trends, autocorrelation, picking the best of 57 lags, and the common global shock. For each source it set out a fix: case growth, 7-day averages, ADF + KPSS stationarity checks, prewhitening, full lag profiles, placebo pairs, date fixed effects and Driscoll–Kraay errors. It also proposed a framing of "co-movement, not a one-way story", a model choice, the visuals and a presentation storyline.
- **Notebook** (`mobility_covid_replication.Rmd`). Puts the plan into one document:
  - stationarity checks
  - Fig 1, the lockdown wave
  - the paper's cross-correlations, Figs 1–2 and clustering, redone
  - the paper's three models scored two ways
  - a spurious-correlation ladder
  - full lag profiles with trends removed
  - Fig 9, "who moved first"
  - a growth model and fair validation
  - Fig 12, four lockdown styles from clustering mobility curves

**Findings**

- **Stationarity.** Raw daily cases pass both stationarity tests in only 4% of countries and retail mobility in 0%; case growth passes in 13%.
- **Who moved first.** Only 19 of 124 countries (15%) cut mobility by 20% before cases reached 1 per million; the median cut came 7 days after. This is from the run with metro-area rows correctly excluded.
- **Lockdown styles.** Countries fall into four distinct lockdown styles by the shape of their mobility curves.

---

## Abhroneel

**The results dashboard and the final repo clean-up.** Code in `dashboard/`. Live at https://quantroninblue.github.io/data_sprint/.

- **Dashboard.** An interactive React + TypeScript app that sets the paper's published findings ("Paper") side by side with the team's ("Ours"), never replacing one with the other. It shows where the results agree, differ or contradict each other, and describes each difference by method. It has ten sections:
  - overview
  - country card
  - lag explorer
  - maps
  - continents
  - fair test
  - clusters
  - models
  - change over time
  - why the results changed

  Features include presentation mode, shareable links (for example `?country=BR&line=transit`), table views of every chart and a dark theme. All charts are hand-drawn SVG.
- **Data build** (`dashboard/scripts/build_data.py`). Brings everyone's outputs into one consistent set of data files for the app. It extracts the paper's Table S1 from the authors' supplementary Word file and puts every lag on the paper's sign convention.
- **Under-reporting hypothesis.** Raised the idea that under-reporting and reporting delays can make mobility look like a leading signal when it isn't, in 2020 as well as later. It appears on the dashboard as one of the untested explanations.
- **Deployment.** GitHub Pages, rebuilt automatically by `.github/workflows/pages.yml` on every change to the dashboard.
- **Cross-checks.** Comparing results across the team surfaced three things:
  - The "106 countries, North America missing" figure comes from re-running the authors' code; the published tables list 122.
  - A metro-area filter bug in the notebook, now fixed.
  - The "where our own results disagree" comparison shown on the dashboard.
- **Final restructure.** Moved the repo into the `analysis/` and `outputs/` layout, removed duplicate data copies, made every script run from the repo root and wrote the current README.
