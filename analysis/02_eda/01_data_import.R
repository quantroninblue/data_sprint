# 01_data_import.R
# Builds the country-day analysis panel: mobility + cases + population + continent.
#
# Run from the repo root (the data_sprint folder), e.g. setwd("C:/data_sprint").
# Input : data/interim/ (national mobility), data/raw/jhu-covid-19/ (cases, population) and data/raw/sulyok-repo/ (continents)
# Output: outputs/02_eda/panel.rds

library(tidyverse)
library(janitor)

dir.create("outputs/02_eda", showWarnings = FALSE, recursive = TRUE)

# ---- 1. Mobility (national rows only) -------------------------------------
# na = "" matters: Namibia's ISO code is the text "NA" and must not become missing.
gmr <- read_csv("data/interim/2026-10-24-gmr-national.csv", na = "", show_col_types = FALSE) %>%
  clean_names() %>%
  mutate(date = as.Date(date)) %>%                  # file uses YYYY-MM-DD
  rename(iso2        = country_region_code,
         country     = country_region,
         retail      = retail_and_recreation_percent_change_from_baseline,
         grocery     = grocery_and_pharmacy_percent_change_from_baseline,
         parks       = parks_percent_change_from_baseline,
         transit     = transit_stations_percent_change_from_baseline,
         workplaces  = workplaces_percent_change_from_baseline,
         residential = residential_percent_change_from_baseline) %>%
  select(iso2, country, date, retail, grocery, parks, transit, workplaces, residential)

# ---- 2. Reference table: JHU country name + population, keyed by ISO2 -----
# Joining on ISO2 avoids the name mismatches (US, South Korea, Taiwan, Burma, ...).
# Keep national rows only (no province / county).
ref_nat <- read_csv("data/raw/jhu-covid-19/data/reference.csv", na = "", show_col_types = FALSE) %>%
  filter(is.na(Province_State), is.na(Admin2)) %>%
  distinct(iso2, .keep_all = TRUE) %>%
  select(iso2, jhu_country = Country_Region, population = Population)

# ---- 3. Cases (country level, cumulative -> daily) -------------------------
roll7 <- function(x) as.numeric(stats::filter(x, rep(1 / 7, 7), sides = 1))

cases <- read_csv("data/raw/jhu-covid-19/data/countries-aggregated.csv", show_col_types = FALSE) %>%
  clean_names() %>%
  mutate(date = as.Date(date)) %>%                  # file uses YYYY-MM-DD
  rename(jhu_country = country) %>%
  arrange(jhu_country, date) %>%
  group_by(jhu_country) %>%
  mutate(inc_cases    = pmax(confirmed - lag(confirmed, default = 0), 0),  # clip revisions, as the paper does
         inc_deaths   = pmax(deaths    - lag(deaths,    default = 0), 0),
         inc_cases_7d = roll7(inc_cases)) %>%
  ungroup() %>%
  select(jhu_country, date, confirmed, deaths, inc_cases, inc_deaths, inc_cases_7d)

# ---- 4. Continent ----------------------------------------------------------
# From the original authors' file; the 8 countries their merge missed are added by hand.
continent_names <- c(AF = "Africa", AS = "Asia", EU = "Europe",
                     "NA" = "North America", SA = "South America", OC = "Oceania")

continent_map <- read_csv("data/raw/sulyok-repo/CaseNumbers1407JHUreal.csv", na = "", show_col_types = FALSE) %>%
  distinct(iso2 = geo, continent = Continent) %>%
  bind_rows(tribble(~iso2, ~continent,
                    "AW", "NA", "CI", "AF", "HK", "AS", "KR", "AS",
                    "MM", "AS", "PR", "NA", "RE", "AF", "TW", "AS")) %>%
  distinct(iso2, .keep_all = TRUE) %>%
  mutate(continent = unname(continent_names[continent]))

# ---- 5. Merge --------------------------------------------------------------
panel <- gmr %>%
  left_join(ref_nat,       by = "iso2") %>%
  left_join(continent_map, by = "iso2") %>%
  left_join(cases,         by = c("jhu_country", "date")) %>%
  mutate(cases_per_100k_7d = inc_cases_7d / population * 1e5,
         in_overlap = date <= max(cases$date)) %>%   # cases stop 2022-04-16, mobility goes to 2022-10-15
  arrange(country, date)

# ---- 6. Sanity checks (read the output!) -----------------------------------
cat("Countries in mobility data:", n_distinct(panel$iso2), "\n")
cat("Mobility dates:", format(min(panel$date)), "to", format(max(panel$date)), "\n")
cat("Case dates    :", format(min(cases$date)), "to", format(max(cases$date)), "\n")

no_cases <- panel %>%
  group_by(country) %>%
  summarise(case_days = sum(!is.na(inc_cases)), .groups = "drop") %>%
  filter(case_days == 0)
cat("Countries with NO case data (mobility only):", paste(no_cases$country, collapse = ", "), "\n")
cat("Countries with no continent:", sum(is.na(distinct(panel, iso2, continent)$continent)), "\n")

saveRDS(panel, "outputs/02_eda/panel.rds")
cat("Saved outputs/02_eda/panel.rds with", nrow(panel), "rows\n")
