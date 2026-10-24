# EDA guide: what each figure and table shows, how it was calculated, and how to justify it

Scope: everything written by `replication/02_eda_setup.R` to `09_eda_continent_tests.R`.
Figures are in `replication/out/figures/`, tables in `replication/out/tables/`.
Numbers quoted below come from the tables committed in the repo (run of 24 Oct 2026). Re-run before quoting them in the final report, and check them against the CSV, not against this file.

Contents: [1. Data preparation](#1-data-preparation-shared-by-every-script) · [2. Script 03](#2-script-03-descriptives) · [3. Scripts 04-05](#3-scripts-04-05-kendall-cross-correlation) · [4. Script 06](#4-script-06-world-maps) · [5. Script 07](#5-script-07-normality-and-autocorrelation) · [6. Script 08](#6-script-08-country--population--infections) · [7. Script 09](#7-script-09-continent-tests) · [8. What to put in the report](#8-what-to-put-in-the-report) · [9. Limitations to state](#9-limitations-we-must-state)

---

## 1. Data preparation (shared by every script)

| Item | How it is built | Why |
|---|---|---|
| Mobility | Google Community Mobility Reports, national rows, daily % change from the pre-pandemic baseline, six categories, 15 Feb 2020 - 15 Oct 2022. | The brief fixes the data source. |
| Daily cases | JHU cumulative confirmed cases, differenced by day and clipped at 0 (`pmax(diff, 0)`). Called `inc_cases`. | Cumulative counts are revised downwards occasionally (about 100 negative days); the paper also clipped them to 0. |
| 7-day cases | Trailing 7-day mean of `inc_cases` (`inc_cases_7d`). | Reported cases follow a weekly reporting cycle (weekends are low, Mondays catch up). A 7-day mean removes it. |
| Cases per 100k | `inc_cases_7d / population x 100,000`. | Countries differ by a factor of thousands in size, so raw counts compare population, not epidemic size. |
| 7-day mobility (`*_7d`) | Trailing 7-day mean that needs at least 4 non-missing days of the last 7 (`roll7_na`). | Google suppresses low-volume days, so a plain mean would turn small gaps into long gaps. |
| Windows | `paper` = to 19 Jun 2020; `validation` = 20 Jun - 8 Sep 2020; `extension` = from 9 Sep 2020. | The same split the authors used, so our results are comparable. |
| Country set | 135 countries in the mobility data; 131 also have case data and population. Aruba, Hong Kong, Puerto Rico and Reunion have no country-level cases in the JHU file. | Joins are on ISO2 code, not on names (seven names differ between sources). Namibia's code is the text "NA", so CSVs are read with `na = ""`. |
| Colour language | Black background and white text to match the team dashboard. Blue = movement categories and negative correlation; red = stay-home categories, positive correlation and cases. Diverging scales are centred on zero. | One visual rule across all figures: the reader never has to re-learn what blue and red mean. |

**Justifying the preparation in the report.** We kept the paper's cleaning rule (clip negative revisions) so that differences from the paper come from the analysis and not from the data. We added per-100k scaling and 7-day smoothing because they are standard in the epidemiological literature and do not need outside data.

---

## 2. Script 03: descriptives

### Tables

| File | Contents and calculation | Use in report |
|---|---|---|
| `03_coverage_by_country.csv` | One row per country: population, mobility start, end and number of days, number of days with cases, % of days missing per mobility category, total cases and total cases per 100k. Total cases here is the **sum of the clipped daily counts**. | Data appendix: which countries enter which analysis. Note: this total can be slightly larger than the final cumulative count used in `08_*` because clipping drops negative revisions. |
| `03_descriptives_by_window.csv` | For the six mobility categories, daily cases and cases per 100k (7-day): n, % missing, mean, sd, min, quartiles, max, for each window and for all days. Cases use only countries with case data and days up to 16 Apr 2022. | The paper's "Table 1"-style summary. State the pooled country-days, not country averages. |
| `03_mobility_by_continent_window.csv` | Pooled median and quartiles of daily mobility by continent, category and window, with number of countries. | Behind figure 03i. |

### Figures

**03a `mobility_timelines`.** *Shows:* the global path of each mobility category. *Built:* for each day, the median (line) and interquartile range (band) of the 7-day mobility across all countries with data that day; shaded block = the paper's window. *Justify:* a median and IQR, not a mean, because the cross-country distribution is not symmetric and a few countries have extreme values. It establishes the basic story (sharp fall in spring 2020, slow recovery) before any statistics. *Caveat:* a global median hides large differences between countries (see 03c).

**03b `cases_timelines_by_continent`.** *Shows:* every country's case curve, by continent. *Built:* thin line = one country's `cases_per_100k_7d`; bold line = the continent median each day; y axis uses a log-like (pseudo-log, sigma = 1) scale so that zero is kept. *Justify:* thin lines show the spread and the waves without hiding countries; a log-like scale is needed because incidence ranges over several orders of magnitude. *Caveat:* reported cases depend on testing and reporting; the Omicron wave of 2022 is partly a testing and variant effect.

**03c `mobility_fingerprints`.** *Shows:* all countries x all weeks x six categories in one picture. *Built:* weekly mean (weeks start on Monday) of daily mobility; colour = value divided by that category's 98th percentile of |value|, clipped to [-1, 1] so every category uses the full colour range. Rows are grouped by continent and ordered by when the country's first wave arrived (first day the 7-day incidence reached 5 per 100k per day); countries that never did, or have no cases, sit at the bottom. *Justify:* a heatmap shows every country, which is more honest than selecting examples; scaling within category makes the six panels comparable in pattern, not in absolute size. *Caveat:* because of the scaling, colour intensity is not directly in percentage points.

**03d `case_wave_heatmap`.** *Shows:* the same country ordering as 03c, with cases. *Built:* weekly mean of `cases_per_100k_7d`, colour = log10(x + 1), to 16 Apr 2022. *Justify:* placing it next to 03c lets the reader see by eye whether mobility dips follow case waves. *Caveat:* log colour exaggerates low values.

**03e `mobility_distributions`.** *Shows:* how the daily mobility distribution shifts between the three windows. *Built:* ridgeline density of every country-day in a window, one panel per category; display trimmed to the 0.5th-99.5th percentile; white line = median. *Justify:* motivates why a single full-period correlation can differ from a spring 2020 one: the distribution itself moves. *Caveat:* pooled across countries, so between-country and over-time variation are mixed.

**03f `case_distributions`.** *Shows:* distribution of log10(1 + cases per 100k, 7-day) by continent and window. *Justify:* strong right skew is why we log-transform cases for plotting and why we do not rely on normal-theory tests for cases (see script 07).

**03g `missingness`.** *Shows:* countries where any mobility category is missing on at least 5% of days. *Built:* % of days missing per country and category over the whole mobility period. *Justify:* missing data come from Google's privacy threshold, mostly in small or low-connectivity countries; showing them is part of reporting data quality. Country-level correlations in these places rest on fewer days.

**03h `example_countries`.** *Shows:* workplace mobility against case waves for US, GB, DE, IN, BR, ZA, AU, JP. *Built:* blue line = 7-day workplace mobility; red area = `cases_per_100k_7d` divided by that country's own peak, drawn on the same y range, anchored at the panel floor; dashed line = end of the paper window. *Justify:* a concrete, readable example for the reader before the statistics; the countries cover six continents and different epidemic shapes. *Caveat:* each case series is rescaled to its own peak, so heights are not comparable between countries. Examples were chosen by us, not at random.

**03i `median_mobility_tiles`.** *Shows:* table 03_mobility_by_continent_window as a picture. *Built:* pooled median daily value per continent x category x window, number printed in the tile. *Justify:* a compact version of the paper's continent summary.

---

## 3. Scripts 04-05: Kendall cross-correlation

### Method (script 04)

For each country and each of the six categories we compute **Kendall's tau-b** between mobility on day *t* and cases on day *t - l*, for every lag *l* from -28 to +28 days (57 lags). Pairs with a missing value are dropped, and a lag is only reported when at least 30 complete pairs exist. The **best lag** is the lag with the largest |tau| (the first one on ties), and we also store tau at lag 0. A best lag at -28 or +28 is flagged `at_boundary`.

Sign convention (the authors' `Hmisc::Lag`, and the paper): **negative lag = mobility leads cases; positive lag = cases lead mobility.**

Two specifications:

| Spec | Data | Purpose |
|---|---|---|
| `paper` | Raw daily mobility vs raw daily clipped cases, 15 Feb - 19 Jun 2020 | Replicates the paper's setup. |
| `smooth` (called "full period" in plots) | 7-day averages of both series, 15 Feb 2020 - 16 Apr 2022 | Tests whether the early-pandemic result holds over the whole overlap. |

Cases are shifted inside the window, as in the authors' code, so nothing outside the window is borrowed. Per-100k scaling is not needed here: Kendall's tau depends only on ranks and population is constant within a country.

**Why Kendall.** It is rank-based, so it does not need normality (script 07 shows we would not have it), and it is the paper's method, so we can compare directly. **Why also criticise it.** The series are strongly autocorrelated (figure 07h), p-values are not reported by the authors, and taking the maximum over 57 lags inflates |tau| (figure 05e). We say this explicitly instead of hiding it.

### Tables

| File | Contents | Headline from the committed run |
|---|---|---|
| `04_kendall_best_by_country.csv` | Per country, category and spec: best lag, tau at the best lag, tau at lag 0, number of pairs, boundary flag. The equivalent of the paper's supplementary table. | - |
| `05_best_lag_summary.csv` | Per spec and category: countries, % of best lags on the +/-28 limit, median lag, median tau. | Paper window: 21-27% of best lags are on the limit; full period: 44-79%. |
| `05_tau_inflation.csv` | Mean |tau| at lag 0 vs at the best lag. | Paper window: about 0.27-0.36 at lag 0 against 0.43-0.50 at the best lag. |
| `05_paper_vs_full_period.csv` | Per category: countries, how many change sign between the two specs, Spearman correlation between the two taus. | 54-77 of about 130 countries change sign; correlations range from -0.12 to 0.27. |

### Figures (script 05)

**05a `best_lag_distribution`.** *Shows:* how many countries have their best lag at each lag, per category and spec. *Built:* count of countries per best lag; red bars = the +/-28 limits; label = % at the limit. *Justify:* when the winner sits on the edge of the search range, the true lag is not identified; this is our problem 4 and it is quantified here. *Say in the report:* the paper's lag maps cannot be read as "the" lag where the winner is at the limit.

**05b `ccf_curves_by_continent`.** *Shows:* the whole cross-correlation curve, not just its peak. *Built:* median tau across countries at each lag, by continent; continent-lag cells with fewer than 3 countries are dropped. *Justify:* a flat or shapeless curve means that "the best lag" is picking noise; a curve with a clear peak supports a lag.

**05c / 05d `ccf_heatmap_paper`, `ccf_heatmap_full`.** *Shows:* every country at every lag. *Built:* tile colour = tau; white dot = the country's best lag; rows are ordered within continent by the workplaces best lag. *Justify:* shows the raw material behind the paper's single-number summary. *Caveat:* 131 rows are too dense to read country names; use for pattern, not lookup (the CSV has names).

**05e `tau_inflation`.** *Shows:* tau at lag 0 (x) against tau at the best lag (y), per country. *Built:* scatter with a 45-degree line; label = mean gain in |tau|. *Justify:* by construction |tau| at the best lag is at least |tau| at lag 0, and the maximum of 57 noisy values is biased upwards. This is the evidence for our problem 5 and supports our proposal to report tau with a significance test (block bootstrap or differencing) and to prefer pre-chosen lags or a distributed-lag model.

**05f `paper_vs_full_period`.** *Shows:* does the early-pandemic result survive? *Built:* each country's strongest tau in the paper window (x) against the full period (y); label = number of sign changes. *Justify:* a replication that works only in the first four months is a weaker claim than the paper's title suggests. *Caveat:* both periods are non-stationary: 7-day averages over two years share trends that can create correlation on their own.

**05g `expected_sign_share`.** *Shows:* the share of countries whose strongest tau has the sign the paper expects (negative for retail, grocery, transit, workplaces; positive for parks and residential). *Built:* % of countries per category and spec. *Justify:* a direct, simple test of whether the paper's qualitative claim holds. **Open issue:** `02_eda_setup.R` sets the expected sign for parks to positive (like residential), but in the committed run the median parks tau in the paper window is -0.385, the same sign as the movement categories, which is why only about a quarter of countries show the 'expected' sign for parks. Check the paper's Table 1 and, if parks is negative there, change `expected_sign["parks"]` to -1 (and the captions that say 'positive for parks and residential') before using this figure or the parks colouring in 05 and 06.

---

## 4. Script 06: world maps

Countries are joined to Natural Earth polygons on **ISO2 code** (using the cleaned `iso_a2_eh` code so Taiwan, France, Norway and Kosovo match; Somaliland is folded into Somalia; Antarctica dropped), projected with Robinson.

| Figure | Shows | Built | Justify |
|---|---|---|---|
| `06a_map_tau_paper`, `06c_map_tau_full` | Strongest tau per country and category. | Fill = tau at the best lag, scale -0.8 to +0.8, blue negative, red positive, dark grey = no data. | Reproduces the paper's Figure 1 for comparison (06a) and shows what changes in the full period (06c). |
| `06b_map_lag_paper`, `06d_map_lag_full` | The best lag per country and category. | Fill = best lag, scale -28 to +28, blue = mobility leads, red = cases lead. | Reproduces the paper's Figure 2. Extreme colours are boundary lags, so read with figure 05a. |
| `06e_map_workplaces_two_periods` | Workplaces tau in the two periods side by side. | Same scale as 06a. | One category, two periods: the clearest single picture of the change. |

*Caveat for all maps:* small countries are hard to see; the maps show geography, not statistical weight.

---

## 5. Script 07: normality and autocorrelation

Why this script exists: the paper's own tests (Shapiro-Wilk, Kruskal-Wallis) and any Gaussian-based model assume things about shape and independence. We test those assumptions instead of taking them for granted.

### Definitions

- **Skewness** = mean of (x - mean)^3 divided by sd^3. **Excess kurtosis** = mean of (x - mean)^4 / var^2 minus 3. Both are 0 for a normal distribution.
- **Shapiro-Wilk** (`shapiro.test`) is defined for 3 to 5000 values; we require at least 20 and some variation. For pooled data it runs on a random sample of 5000 (seed 2026).
- **Jarque-Bera** = n/6 x (skewness^2 + excess kurtosis^2 / 4), compared with a chi-squared distribution with 2 degrees of freedom; it uses all values.
- Per-country p-values are **Holm-adjusted** across countries within each variable and period.
- Transformed variables: `log10(1 + daily cases)` and `log10(1 + cases per 100k)`.
- All of script 07 uses the 131 countries with case data and days up to 16 Apr 2022, so that mobility and cases are tested on the same days.

### Tables

| File | Contents |
|---|---|
| `07_pooled_normality_tests.csv` | Per variable and period, all country-days pooled: n, mean, sd, skewness, excess kurtosis, Shapiro W and p (sample of 5000), Jarque-Bera p. |
| `07_country_normality_tests.csv` | Per variable, period and country: n, skewness, excess kurtosis, W, p, Holm-adjusted p, rejection flags. |
| `07_normality_rejection_summary.csv` | Per variable and period: % of countries rejecting at 5% (raw and Holm), median W, median skewness. |
| `07_acf_summary.csv` | Median and quartiles across countries of the autocorrelation at lags 1-28, in levels and in first differences. |

### Figures

**07a / 07b `histograms_paper`, `histograms_full`.** *Shows:* the shape of each variable. *Built:* histogram of pooled country-days (display trimmed to the 0.5th-99.5th percentile) with a red normal curve of the same mean and sd; text = skewness and excess kurtosis. *Justify:* the plain way to show non-normality before any test.

**07c / 07d `qq_paper`, `qq_full`.** *Shows:* where the data leave the normal line. *Built:* 5000 random country-days per panel against normal quantiles; line through the first and third quartiles. *Justify:* QQ plots show how the data differ (heavy tails, skew), which a p-value cannot.

**07e `normality_rejection_share`.** *Shows:* the share of countries where Shapiro-Wilk rejects normality. *Built:* per-country test, bar = % rejected at 5%. *Committed results:* cases per 100k (7-day) and daily cases are rejected in **100%** of countries in both periods; in the paper window the mobility categories are rejected in 89-100% of countries (parks 89%, grocery 92%, others 98-100%), and in the full period in 98-100%. After log transformation cases are still rejected everywhere (100%), although median W rises from 0.63 to 0.93 over the full period for cases per 100k. *Justify:* supports using rank-based methods (Kendall, Kruskal-Wallis, Dunn) rather than Pearson correlation or parametric tests.

**07f `shapiro_W_by_country`.** *Shows:* how far from normal, not just whether. *Built:* one dot per country of Shapiro-Wilk W (1 = normal), with boxplot, red = rejected after Holm adjustment. *Justify:* with 100-800 days per country almost any series fails the test; W shows the size of the departure. Mobility has median W of 0.90-0.97, while raw cases have 0.56-0.79.

**07g `skewness_kurtosis`.** *Shows:* skewness and kurtosis per country. *Built:* scatter on pseudo-log axes; diamond = normal; shaded box = loose "close to normal" zone (|skew| < 0.5, |excess kurtosis| < 1, our own rule of thumb). *Justify:* explains why cases fail (extreme skew and heavy tails: pooled excess kurtosis is 69-513 for cases per 100k and daily cases) while mobility fails mildly (pooled |skew| is below 1 for most categories; parks, at 1.6-2.3, and grocery in the full period, at 1.35, are the exceptions, and parks has the heaviest tails).

**07h `autocorrelation`.** *Shows:* that neighbouring days are not independent. *Built:* `stats::acf` per country (lags 1-28, missing values passed through), median and IQR across countries, for the raw series (blue) and for first differences (red); dashed lines = +/-1.96/sqrt(n) with n the median country length. *Committed results:* median lag-1 autocorrelation of the levels is 0.99 for cases per 100k and 0.76-0.93 for mobility; after differencing lag 1 falls to between -0.41 and +0.26 but a weekly pattern remains (autocorrelation at lag 7 is 0.24-0.40 for every series except the 7-day cases, where it is about 0). *Justify:* with autocorrelation this high, the effective sample size is far below the number of days, so naive p-values for Kendall tau or regressions are too small. This supports our plan to use block bootstrap or differencing, and models with explicit dynamics. The weekly peak at lag 7 in first differences shows why 7-day averages are used.

### How to word the conclusion

*"Neither mobility nor case series are normally distributed, cases extremely so, and consecutive days are strongly autocorrelated. We therefore use rank-based statistics, log or per-capita scaling where levels are plotted, and we do not interpret p-values from tests that assume independent days."* (Check the numbers against the CSV before publishing.)

---

## 6. Script 08: country : population : infections

### Table calculation (`08_country_population_infections.csv`)

One row per country (135 rows, 131 with cases and population), sorted by total cases.

| Column | Calculation |
|---|---|
| `population` | JHU reference file (national row), matched on ISO2. |
| `cases_total`, `deaths_total` | **Final cumulative** confirmed cases and deaths up to 16 Apr 2022 (maximum of the cumulative series). |
| `cases_per_100k`, `deaths_per_100k` | Total divided by population, times 100,000. |
| `cfr_pct` | 100 x deaths / cases (crude; reported deaths over reported cases). |
| `first_case_date` | First date with cumulative cases above 0. |
| `peak_7d_per100k`, `peak_date` | Maximum of the 7-day mean of daily cases per 100k and the date it occurred. |
| `workplaces_trough_7d` | Lowest 7-day workplace mobility up to 16 Apr 2022. |
| `workplaces_median_paper` | Median daily workplace mobility in the paper window. |
| `pop_share_pct`, `pop_rank`, `cases_rank`, `per100k_rank` | Share of the 131-country population and ranks (1 = largest). |

`08_continent_summary.csv` gives, per continent and for all countries: number of countries, total population, cases and deaths, **pooled** rates (sum of cases / sum of population x 100,000, so large countries weigh more) and the median and IQR of the country rates (each country counts once). Committed run: 131 countries, 5.67 billion people, 487 million reported cases, 5.9 million reported deaths; pooled incidence 8,597 per 100k, with Europe highest (25,167) and Africa lowest (1,034) among the six continents. The median country rate (10,152) is higher than the pooled rate because populous countries with low reported incidence (for example India) pull the pooled figure down, so we always say which one we are quoting.

**Justification.** The country : population : infections table is the basic descriptive result: it shows what the data contain before any model. Rates per 100k are the only fair comparison between countries; cumulative cases include early and late waves and are driven by testing, so we describe them as *reported* cases throughout.

### Figures

**08a / 08b `table_top_total_cases`, `table_top_incidence`.** *Shows:* the top 30 countries by total cases and by cases per 100k, with population, cases, rates, deaths and the peak. *Built:* ggplot text table, red shading follows cases per 100k. *Justify:* a picture-table keeps the dark style and fits a slide; the full table is the CSV. *Caveat:* small countries lead the per-100k ranking, so read the two tables together.

**08c `population_vs_cases`.** *Shows:* population (x) against total cases (y), log-log, colour = continent, with dashed lines for constant rates of 1,000, 10,000 and 30,000 cases per 100k. The subtitle gives the Spearman rank correlation between population and total cases (about 0.49 in a check on the interim files). *Built:* log10 axes; the dashed lines are y = rate/100,000 x x, which are straight lines of slope 1 on log axes; labels: the 12 countries with most cases, 8 with the highest rate and 6 largest populations. *Justify:* on log axes the distance from a dashed line is the incidence, so the plot shows size and rate in one view. *Caveat:* labelled countries are selected by us by rule, not at random.

**08d `population_incidence_bubbles`.** *Shows:* all three quantities: x = population (log), y = cases per 100k, bubble area = total cases, colour = continent. *Justify:* the single most direct picture of "country : population : infections".

**08e / 08f `ranking_cases_per_100k`, `ranking_deaths_per_100k`.** *Shows:* top 30 countries. *Built:* lollipop chart, dot colour = continent. *Justify:* ordered charts answer "who is highest" faster than a map. *Caveat:* deaths per 100k depend strongly on reporting definitions and age structure.

**08g `incidence_by_continent`.** *Shows:* spread of country incidence by continent. *Built:* boxplot with every country as a dot, log y axis; subtitle gives the Kruskal-Wallis test across continents. *Justify:* a rank-based test is used because the log-scale spread is still skewed (script 07). *Caveat:* a significant difference in *reported* incidence is not evidence of a difference in true infection rates.

**08h / 08i `map_cases_per_100k`, `map_population`.** *Shows:* geography of reported incidence and of population size. *Built:* fill = log10 of the value with labelled breaks; dark grey = no data. *Justify:* the two maps next to each other show that high incidence is not simply large population.

**08j `mobility_trough_vs_incidence`.** *Shows:* does a deeper workplace mobility drop go with fewer total reported cases per head? *Built:* one dot per country, x = lowest 7-day workplace mobility, y = cases per 100k (log), Spearman rho in the subtitle, red line = ordinary least squares on the log scale. *Justify:* a cross-country counterpart to the within-country time-series analysis. *Caveat (must be stated):* this is a between-country comparison, so wealth, testing, age and policy all confound it; it says nothing about causes.

**08k `cumulative_cases_by_continent`.** *Shows:* cumulative reported cases per 100k over time. *Built:* thin lines by country, bold continent median, pseudo-log y axis (sigma = 10). *Justify:* shows when incidence accumulated, which complements the final totals in the table.

---

## 7. Script 09: continent tests

The paper compared the strongest tau and the best lag across continents with Shapiro-Wilk, Kruskal-Wallis and Dunn's test with Holm adjustment. We repeat this for both specs.

### Definitions

- **Shapiro-Wilk by continent:** tested on the vector of tau (or lag) values of the countries in a continent (at least 3 values). p-values are Holm-adjusted across the tests of a spec and outcome in the CSV; the figure shows the raw p.
- **Kruskal-Wallis:** `kruskal.test(value ~ continent)`, one test per spec, category and outcome (tau, lag).
- **Dunn's post-hoc test:** ranks all values, takes the difference of mean ranks between two continents and divides by its standard error with a correction for ties (`sqrt((N(N+1)/12 - sum(t^3 - t)/(12(N-1))) x (1/n_i + 1/n_j))`); two-sided p from the normal distribution, **Holm-adjusted across the pairs** within each test. Sign: **z > 0 means the first continent has higher values**. The `dunn.test` package used by the authors reports the opposite sign; we checked our implementation against `scikit-posthocs` in Python (identical p-values on a test data set).
- **Summary table:** median [Q1, Q3] of tau (2 decimals) and lag (whole days) per continent, spec and category.

### Tables

| File | Contents |
|---|---|
| `09_shapiro_by_continent.csv` | W, p and Holm-adjusted p per spec, category, outcome and continent. |
| `09_kruskal_wallis.csv` | chi-squared, df, p per spec, category and outcome. |
| `09_dunn_holm_pairs.csv` | z, p and Holm-adjusted p for every pair of continents. |
| `09_continent_summary_long.csv`, `09_continent_summary_table.csv` | The tableone-style summary in long form and as a wide table (one column per category). |

Committed Kruskal-Wallis results: in the paper window the continents differ in tau for five of six categories (retail p < 0.001, transit p < 0.001, workplaces p < 0.001, residential p about 0.001, grocery p about 0.008), but not for parks (p about 0.42). In the full period tau differs for five of six categories at 5% (grocery p about 0.07 is the exception), and lag differs for grocery, retail and transit only.

### Figures

**09a `boxplot_tau_by_continent` and 09b `boxplot_lag_by_continent`.** *Show:* the paper's continent boxplots, for both specs. *Built:* boxes = median and IQR, dots = countries, label = Kruskal-Wallis p; row = spec, column = category. *Justify:* the closest visual match to the paper, so differences in the picture can be traced to the analysis. *Caveat:* Oceania has four countries and North America about 17 (per the importer's continent map), so their boxes are weak evidence. Lag boxes pile up at +/-28 (figure 05a).

**09c `shapiro_tau_by_continent`.** *Shows:* whether tau is normal within continents. *Built:* tile colour = W, number = p, bold = rejected at 5%. *Justify:* the paper used Shapiro-Wilk to justify non-parametric tests; we show the same step. *Caveat:* with 4 countries the test has almost no power, so a pass proves nothing.

**09d `dunn_matrix_tau` and 09e `dunn_matrix_lag`.** *Show:* which pairs of continents differ. *Built:* a 6 x 6 matrix per category and spec; fill = Dunn z (red: row continent higher than column continent); stars = Holm-adjusted p (* < 0.05, ** < 0.01, *** < 0.001). *Justify:* Kruskal-Wallis only says that at least one continent differs; Dunn's test says which, and Holm adjustment controls the error rate across the 15 pairs. *Caveat:* many Holm-adjusted p-values are large because of small groups.

---

## 8. What to put in the report

Our suggestion; the EDA scripts make far more than a report can hold. The choice is the team's.

**Main text (about 10 figures and 2 tables)**

| Purpose | Use |
|---|---|
| Data and scale | `08a` table (top 30) or `08_continent_summary.csv`; `08d` bubbles (country : population : infections); `08h` map |
| The two series | `03a` mobility timelines; `03b` case timelines; `03h` example countries |
| Replicating the paper | `06a`, `06b` (paper window maps); `09a` boxplots of tau |
| Where we depart from the paper | `05a` (boundary lags), `05e` (inflation), `05f` (paper window vs full period), `07h` (autocorrelation) |
| Assumptions | `07c` QQ plots, `07e` rejection share |

**Appendix:** everything else, in particular `03c`/`03d`/`05c`/`05d` heatmaps (dense, good as a full-data appendix), `06c`-`06e`, `07a`/`07b`/`07f`/`07g`, `08b`-`08g`, `08i`-`08k`, `09b`-`09e`, and all CSV tables.

**Suggested wording for the methods section**

- *Cases and mobility.* "Daily cases were obtained by differencing cumulative JHU counts and setting negative revisions to zero, as in Sulyok and Walker. For descriptive plots we use 7-day averages and rates per 100,000 population; mobility is the national daily percentage change from baseline."
- *Cross-correlation.* "As in the original study we computed Kendall's tau-b between daily cases and each mobility category at lags from -28 to +28 days for each country, recording the lag with the largest absolute tau. We additionally report the share of best lags on the search boundary, the gain in |tau| from selecting the best of 57 lags, and results over the full period with 7-day averages."
- *Distributional checks.* "We tested normality with Shapiro-Wilk (per country, Holm-adjusted) and Jarque-Bera, inspected QQ plots and measured autocorrelation. Because the series are non-normal and autocorrelated, we use rank-based tests and do not interpret naive p-values."
- *Continent comparison.* "Differences between continents were assessed with the Kruskal-Wallis test, followed by Dunn's test with Holm adjustment."

References for the tests: Kendall (1938), Shapiro and Wilk (1965), Kruskal and Wallis (1952), Dunn (1964), Holm (1979), Jarque and Bera (1980).

---

## 9. Limitations we must state

1. **Boundary lags.** In the full period 44-79% of best lags are at the +/-28 limit (paper window: 21-27%), so the lag is not identified (05a, `05_best_lag_summary.csv`).
2. **Selection bias in tau.** mean |tau| rises by about 0.13-0.17 in the paper window (0.07-0.09 in the full period) when the best of 57 lags is chosen (05e). Reported taus are upper bounds on what a pre-specified lag would give.
3. **No significance, autocorrelated data.** The authors report no p-values for tau; with lag-1 autocorrelation of 0.76-0.99 in the levels (07h), naive p-values would be wrong. We report descriptive tau only until we add a block bootstrap or differencing.
4. **The result is not stable over time.** Between the paper window and the full period 54-77 countries per category change sign (05f).
5. **Reported cases are not infections.** Counts depend on testing, reporting rules and variants; cross-country comparisons of incidence (08) are comparisons of reporting.
6. **Between-country plots are not causal** (08j).
7. **Country set differs a little from the paper.** We use 131 countries with cases (from the repo's importer, joined on ISO2); the paper's continent counts differ by one to four countries, probably because of its name-based merge. Aruba, Hong Kong, Puerto Rico and Reunion have no country-level cases.
8. **Small groups.** Oceania (4 countries) and parts of the continent tests have little power.
9. **Several plots use rules we chose** (trimming at the 0.5th-99.5th percentile in the density plots, 98th-percentile colour scaling in 03c, the "close to normal" box in 07g, the list of labelled countries). These are for display and do not change any table.
10. **The code was written and checked partly without a running R session**; the results quoted here are from your runs. A second person should re-run scripts 01-09 from a clean clone before the report is finalised.
