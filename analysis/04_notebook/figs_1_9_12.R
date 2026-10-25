# Data set-up and Figs 1, 9 and 12 of mobility_covid_replication.Rmd (extracted with knitr::purl),
# plus export lines at the end that save the data behind those figures for the dashboard.
# Run from the repo root:  Rscript analysis/04_notebook/figs_1_9_12.R
# Downloads go to analysis/04_notebook/data/ (shared with the notebook); exports go to outputs/04_notebook/.

## ----setup, include = FALSE---------------------------------------------------
# Global chunk options: show code, hide package start-up messages,
# and make every figure the same default size.
knitr::opts_chunk$set(echo = TRUE, message = FALSE, warning = FALSE,
                      fig.width = 10, fig.height = 6, dpi = 110)


## ----packages-----------------------------------------------------------------
# Packages. All are on CRAN; install any you are missing with install.packages().
library(dplyr)      # data wrangling
library(tidyr)      # reshaping (long <-> wide)
library(readr)      # fast CSV reading
library(ggplot2)    # plots
library(patchwork)  # putting several ggplots side by side
library(scales)     # nicer axis labels
library(zoo)        # rollmeanr() for 7-day rolling averages
library(tseries)    # adf.test() and kpss.test() for stationarity
library(mgcv)       # the paper's GAMMs
library(dlnm)       # crossbasis() for the paper's distributed-lag model
library(mclust)     # the paper's model-based clustering
library(fixest)     # our panel regressions
library(maps)       # world map outlines

set.seed(2020)      # same seed as the authors, so random steps are reproducible

# One colour per continent, used in every chart (Okabe-Ito, colour-blind safe).
cont_cols <- c(AF = "#E69F00", AS = "#56B4E9", EU = "#009E73",
               NA_ = "#CC79A7", OC = "#D55E00", SA = "#0072B2")
cont_labs <- c(AF = "Africa", AS = "Asia", EU = "Europe",
               NA_ = "North America", OC = "Oceania", SA = "South America")

theme_set(theme_minimal(base_size = 12) +
            theme(plot.title = element_text(face = "bold"),
                  plot.caption = element_text(colour = "grey40", hjust = 0)))
src_cap <- "Source: Google CMR (authors' Sept 2020 copy); JHU CSSE via datasets/covid-19."


## ----download-----------------------------------------------------------------
# Download each file once into analysis/04_notebook/data/. Later runs reuse the local copy.
dir.create("analysis/04_notebook/data", showWarnings = FALSE)
get_file <- function(url, dest) {
  if (!file.exists(dest)) download.file(url, dest, mode = "wb")
  dest
}

# Google mobility, September 2020 version, saved by the authors.
# Source: https://github.com/msulyok/GoogleMobilityDataCOVID
gm_zip <- get_file(
  "https://raw.githubusercontent.com/msulyok/GoogleMobilityDataCOVID/master/Global_Mobility_Report%282%29compressed.zip",
  "analysis/04_notebook/data/gmr_sep2020.zip")

# Continent codes (from GeoNames) as used by the authors, same repo.
cont_file <- get_file(
  "https://raw.githubusercontent.com/msulyok/GoogleMobilityDataCOVID/master/CaseNumbers1407JHUreal.csv",
  "analysis/04_notebook/data/authors_casenumbers.csv")

# JHU confirmed cases and population. Source: https://github.com/datasets/covid-19
cases_file <- get_file(
  "https://raw.githubusercontent.com/datasets/covid-19/main/data/countries-aggregated.csv",
  "analysis/04_notebook/data/countries-aggregated.csv")
ref_file <- get_file(
  "https://raw.githubusercontent.com/datasets/covid-19/main/data/reference.csv",
  "analysis/04_notebook/data/reference.csv")


## ----read---------------------------------------------------------------------
# Mobility: keep national rows only (no sub-region or metro area).
# na = "" matters: Namibia's country code is "NA", which R would otherwise read as missing.
gmr_raw <- read_csv(unz(gm_zip, "Global_Mobility_Report(2).csv"),
                    na = "", guess_max = 100000, show_col_types = FALSE)
gmr <- gmr_raw %>%
  filter(is.na(sub_region_1), is.na(sub_region_2), is.na(metro_area)) %>%
  rename_with(~ sub("_percent_change_from_baseline", "", .x)) %>%
  select(iso2 = country_region_code, country = country_region, date,
         retail_and_recreation, grocery_and_pharmacy, parks,
         transit_stations, workplaces, residential)

# Cases: cumulative confirmed -> daily new cases.
# Like the authors, negative daily values (data corrections) are set to 0.
pop <- read_csv(ref_file, na = "", show_col_types = FALSE) %>%
  filter(is.na(Province_State)) %>%
  select(jhu_country = Country_Region, iso2, population = Population)

cases <- read_csv(cases_file, show_col_types = FALSE) %>%
  rename(jhu_country = Country, date = Date) %>%
  arrange(jhu_country, date) %>%
  group_by(jhu_country) %>%
  mutate(new_cases = pmax(Confirmed - lag(Confirmed), 0)) %>%
  ungroup() %>%
  inner_join(pop, by = "jhu_country")

# Continents from the authors' file. "NA" (North America) is renamed NA_
# so R doesn't treat it as missing.
continents <- read_csv(cont_file, na = "", show_col_types = FALSE) %>%
  distinct(iso2 = geo, continent = Continent) %>%
  mutate(continent = ifelse(continent == "NA", "NA_", continent))

panel <- gmr %>%
  inner_join(cases %>% select(iso2, date, new_cases, Confirmed, population),
             by = c("iso2", "date")) %>%
  inner_join(continents, by = "iso2") %>%     # same country set as the authors
  arrange(country, date)

cat("Countries:", n_distinct(panel$country),
    "| Dates:", format(min(panel$date)), "to", format(max(panel$date)), "\n")


## ----variables----------------------------------------------------------------
cats <- c("retail_and_recreation", "grocery_and_pharmacy", "parks",
          "transit_stations", "workplaces", "residential")

panel <- panel %>%
  group_by(country) %>%
  mutate(
    # 7-day average of new cases. WHY: removes the weekend reporting dip.
    cases7 = rollmeanr(new_cases, 7, fill = NA),
    # Same for mobility. WHY: Google values also have a weekday cycle.
    across(all_of(cats), ~ rollmeanr(.x, 7, fill = NA), .names = "{.col}_7"),
    # Mobility index = average of the four "out and about" categories.
    # WHY: they move almost identically, so one index gives a stable coefficient.
    # We use a simple average (not PCA) because it stays in % points and is easy to explain.
    mob = rowMeans(across(c(retail_and_recreation_7, grocery_and_pharmacy_7,
                            transit_stations_7, workplaces_7))),
    # Weekly growth of cases: log(this week's average) - log(last week's).
    # WHY: removes the trend and the size of the country. 0.10 = about 10% growth per week.
    # Growth is only defined once a country averages at least 10 cases a day,
    # because growth rates from tiny numbers are mostly noise.
    growth = ifelse(lag(cases7, 7) >= 10,
                    log(cases7 + 1) - log(lag(cases7, 7) + 1), NA),
    cases_per_m = Confirmed / population * 1e6
  ) %>%
  ungroup()

# Check: our simple index vs the first principal component of the same four categories.
pc_dat <- na.omit(panel[, c("retail_and_recreation_7", "grocery_and_pharmacy_7",
                            "transit_stations_7", "workplaces_7", "mob")])
pc1 <- prcomp(pc_dat[, 1:4], scale. = TRUE)$x[, 1]
cat("Correlation between simple index and PC1:", round(abs(cor(pc1, pc_dat$mob)), 3), "\n")


## ----stationarity-------------------------------------------------------------
# Run both tests on one series; return TRUE if it looks stationary.
is_stationary <- function(x) {
  x <- na.omit(x)
  if (length(x) < 40) return(NA)                # too short to test
  adf  <- suppressWarnings(adf.test(x)$p.value)
  kpss <- suppressWarnings(kpss.test(x)$p.value)
  adf < 0.05 & kpss > 0.05
}

stat_tab <- panel %>%
  filter(date <= as.Date("2020-06-19")) %>%   # the paper's window
  group_by(country) %>%
  summarise(`Daily new cases (paper)` = is_stationary(new_cases),
            `Retail mobility (paper)` = is_stationary(retail_and_recreation),
            `Case growth (ours)`      = is_stationary(growth),
            `Mobility index (ours)`   = is_stationary(mob)) %>%
  summarise(across(-country, ~ percent(mean(.x, na.rm = TRUE), accuracy = 1)))
knitr::kable(stat_tab, caption = "Share of countries where the series passes both tests")


## ----fig1, fig.height = 12----------------------------------------------------
# Countries sorted by continent, then by the date their mobility index first fell 20%.
drop_date <- panel %>% group_by(country) %>%
  summarise(first_drop = min(date[mob <= -20], na.rm = TRUE))

heat <- panel %>%
  filter(date <= as.Date("2020-06-19")) %>%
  left_join(drop_date, by = "country") %>%
  mutate(country = reorder(country, -as.numeric(first_drop)))

ggplot(heat, aes(date, country, fill = mob)) +
  geom_tile() +
  scale_fill_gradient2(low = "#B2182B", mid = "white", high = "#2166AC",
                       midpoint = 0, limits = c(-80, 20), oob = squish,
                       name = "Mobility index\n(% vs baseline)") +
  geom_vline(xintercept = as.Date("2020-03-11"), linetype = "dashed") +
  annotate("text", x = as.Date("2020-03-12"), y = 3, label = "WHO declares pandemic",
           hjust = 0, size = 3.5) +
  facet_grid(continent ~ ., scales = "free_y", space = "free_y",
             labeller = labeller(continent = cont_labs)) +
  labs(title = "Mobility collapsed almost everywhere within about two weeks of 11 March",
       x = NULL, y = NULL, caption = src_cap) +
  theme(axis.text.y = element_text(size = 6), strip.text.y = element_text(angle = 0))


## ----fig2, fig.height = 7-----------------------------------------------------
cat_long <- panel %>%
  filter(date <= as.Date("2020-06-19")) %>%
  select(country, continent, date, ends_with("_7")) %>%
  pivot_longer(ends_with("_7"), names_to = "category", values_to = "value") %>%
  mutate(category = gsub("_7$", "", category)) %>%
  group_by(continent, category, date) %>%
  summarise(med = median(value, na.rm = TRUE), .groups = "drop")

ggplot(cat_long, aes(date, med, colour = continent)) +
  geom_hline(yintercept = 0, colour = "grey60") +
  geom_line(linewidth = 0.8) +
  facet_wrap(~ category, labeller = as_labeller(function(x) gsub("_", " ", x))) +
  scale_colour_manual(values = cont_cols, labels = cont_labs) +
  labs(title = "Every category fell except residential, which rose: people stayed home",
       subtitle = "Median across countries, 7-day average, % change vs Jan-Feb baseline",
       x = NULL, y = "% change", colour = NULL, caption = src_cap)


## ----map-helper---------------------------------------------------------------
# World map, with country names recoded to match Google's.
# Recodes adapted from the authors' code (same repo), plus a few we needed.
world <- map_data("world") %>%
  mutate(country = recode(region, "USA" = "United States", "UK" = "United Kingdom",
                          "Trinidad" = "Trinidad and Tobago", "Macedonia" = "North Macedonia",
                          "Czech Republic" = "Czechia", "Antigua" = "Antigua and Barbuda",
                          "Ivory Coast" = "Côte d'Ivoire", "Myanmar" = "Myanmar (Burma)"))

# Draw a world map coloured by one value per country.
map_plot <- function(df, value, fill_scale, title) {
  ggplot(left_join(world, df, by = "country"), aes(long, lat, group = group)) +
    geom_polygon(aes(fill = .data[[value]]), colour = "white", linewidth = 0.1) +
    fill_scale + coord_quickmap(ylim = c(-55, 80)) +
    labs(title = title, x = NULL, y = NULL) + theme_void() +
    theme(plot.title = element_text(face = "bold"), legend.position = "bottom")
}


## ----fig9, fig.height = 13----------------------------------------------------
timing <- panel %>% group_by(country, continent) %>%
  summarise(mob_drop = suppressWarnings(min(date[mob <= -20], na.rm = TRUE)),
            case_1pm = suppressWarnings(min(date[cases_per_m >= 1], na.rm = TRUE)),
            .groups = "drop") %>%
  filter(is.finite(mob_drop), is.finite(case_1pm)) %>%
  mutate(gap = as.numeric(mob_drop - case_1pm),
         first = ifelse(gap < 0, "Mobility fell first", "Cases came first"),
         country = reorder(country, as.numeric(mob_drop)))

share_mob_first <- mean(timing$gap < 0)

ggplot(timing, aes(y = country)) +
  geom_vline(xintercept = as.Date("2020-03-11"), linetype = "dashed") +
  geom_segment(aes(x = case_1pm, xend = mob_drop, yend = country, colour = first)) +
  geom_point(aes(x = case_1pm), shape = 21, fill = "white", size = 1.6) +
  geom_point(aes(x = mob_drop), size = 1.6) +
  facet_grid(continent ~ ., scales = "free_y", space = "free_y",
             labeller = labeller(continent = cont_labs)) +
  scale_colour_manual(values = c("Mobility fell first" = "#0072B2", "Cases came first" = "#D55E00")) +
  labs(title = sprintf("Fig 9. Mobility fell before cases reached 1 per million in %s of countries",
                       percent(share_mob_first, 1)),
       subtitle = "White dot = cases reach 1 per million; black dot = mobility index 20% below baseline; dashed = WHO declaration",
       x = NULL, y = NULL, colour = NULL, caption = src_cap) +
  theme(axis.text.y = element_text(size = 6), legend.position = "top",
        strip.text.y = element_text(angle = 0))


## ----fig12, fig.height = 8----------------------------------------------------
curves <- panel %>%
  filter(date <= as.Date("2020-06-19"), !is.na(mob)) %>%
  mutate(week = as.numeric(date - min(date)) %/% 7) %>%
  group_by(country, week) %>% summarise(mob = mean(mob), .groups = "drop") %>%
  pivot_wider(names_from = week, values_from = mob) %>%
  na.omit()

km <- kmeans(select(curves, -country), centers = 4, nstart = 50)
curves$style <- factor(km$cluster)

# Name each style by its deepest weekly drop, so labels don't depend on random numbering.
style_names <- curves %>% pivot_longer(-c(country, style), names_to = "week", values_to = "mob") %>%
  group_by(style, week) %>% summarise(mob = mean(mob), .groups = "drop") %>%
  group_by(style) %>% summarise(deepest = min(mob)) %>%
  arrange(deepest) %>%
  mutate(name = c("Deep lockdown", "Strong drop", "Moderate drop", "Mild drop"))
curves <- left_join(curves, select(style_names, style, name), by = "style")

style_cols <- c("Deep lockdown" = "#B2182B", "Strong drop" = "#EF8A62",
                "Moderate drop" = "#67A9CF", "Mild drop" = "#2166AC")

f12a <- map_plot(select(curves, country, name), "name",
                 scale_fill_manual(values = style_cols, na.value = "grey85", name = NULL),
                 "Countries grouped by the shape of their mobility curve")

f12b <- curves %>% pivot_longer(-c(country, style, name), names_to = "week", values_to = "mob") %>%
  mutate(week = as.numeric(week)) %>%
  ggplot(aes(week, mob, group = country, colour = name)) +
  geom_line(alpha = 0.25) +
  stat_summary(aes(group = name), fun = mean, geom = "line", linewidth = 1.3) +
  geom_hline(yintercept = 0, colour = "grey50") +
  scale_colour_manual(values = style_cols, guide = "none") +
  facet_wrap(~ name, nrow = 1) +
  labs(x = "Weeks since 15 Feb 2020", y = "Mobility index (%)")

f12a / f12b + plot_layout(heights = c(1.4, 1)) +
  plot_annotation(title = "Fig 12. Four lockdown styles", caption = src_cap)


# ---- added for the dashboard: save the data behind the figures ----
dir.create("outputs/04_notebook", showWarnings = FALSE, recursive = TRUE)
write.csv(heat %>% select(country, continent, date, mob), "outputs/04_notebook/fig1_heat.csv", row.names = FALSE)
write.csv(timing, "outputs/04_notebook/fig9_timing.csv", row.names = FALSE)
write.csv(curves, "outputs/04_notebook/fig12_curves.csv", row.names = FALSE)
write.csv(style_names, "outputs/04_notebook/fig12_style_names.csv", row.names = FALSE)
write.csv(stat_tab, "outputs/04_notebook/stationarity.csv", row.names = FALSE)
cat("EXPORT DONE\n")
