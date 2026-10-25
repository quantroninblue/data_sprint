# =============================================================================
# Data Sprint: Replication of Sulyok & Walker (2020)
# "Community movement and COVID-19: a global study using Google's Community
#  Mobility Reports", Epidemiology & Infection 148, e284.
#
# Script 01: Clean and merge mobility + case data into one country-day panel
#
# INPUTS
#   data/interim/2026-10-24-gmr-national.csv  Google CMR, national rows only
#                                             (rows of Global_Mobility_Report.csv with no
#                                              sub_region_1, sub_region_2 or metro_area)
#   data/raw/jhu-covid-19/data/time-series-19-covid-combined.csv
#                                             JHU CSSE confirmed cases by country AND
#                                             province (datasets/covid-19)
#   data/raw/jhu-covid-19/data/reference.csv  JHU lookup: ISO codes + population
#
# OUTPUTS
#   data/processed/2026-10-24-panel-clean.csv               one row per country per day
#   outputs/01_replication/2026-10-24-country-coverage.csv  one row per country: match status, data quality
#   outputs/01_replication/2026-10-24-cleaning-log.txt      every cleaning decision, with counts
#
# SOURCES / HELP USED
#   - Case data: https://github.com/datasets/covid-19 (data/ folder,
#     commit bdd76cf, 24 Mar 2026), a repackaging of JHU CSSE COVID-19 data.
#   - Mobility data: Google COVID-19 Community Mobility Reports
#     https://www.google.com/covid19/mobility/
#   - Original authors' code, read for reference only (not copied):
#     https://github.com/msulyok/GoogleMobilityDataCOVID
#   - Continent coding: countrycode R package (Arel-Bundock et al., 2018),
#     https://github.com/vincentarelbundock/countrycode
# =============================================================================

suppressPackageStartupMessages({
  library(data.table)
  library(countrycode)
  library(zoo)
})

# ---- 0. Paths ---------------------------------------------------------------
# Run from the repo root, or set DS_ROOT to the repo folder.
root <- Sys.getenv("DS_ROOT", ".")
dir_gmr <- file.path(root, "data", "interim")
dir_jhu <- file.path(root, "data", "raw", "jhu-covid-19", "data")
dir_panel <- file.path(root, "data", "processed")
dir_out <- file.path(root, "outputs", "01_replication")
dir.create(dir_out, showWarnings = FALSE, recursive = TRUE)

log_file <- file.path(dir_out, "2026-10-24-cleaning-log.txt")
cat("CLEANING LOG  |  run:", format(Sys.time()), "\n\n", file = log_file)
logit <- function(...) {
  msg <- paste0(...)
  cat(msg, "\n")
  cat(msg, "\n", file = log_file, append = TRUE)
}

# Key windows taken from the paper
PAPER_START <- as.IDate("2020-02-15")  # first day of Google CMR
PAPER_END   <- as.IDate("2020-06-19")  # end of paper's training window
VALID_END   <- as.IDate("2020-09-08")  # end of paper's validation window

# ---- 1. Load ----------------------------------------------------------------
# na.strings = "" is essential: the default treats the string "NA" as missing,
# which would wipe out Namibia's ISO code ("NA").
# Dates are read as text first and checked: if a CSV is opened and saved in
# Excel, the dates are rewritten in the Windows regional format (15-02-2020)
# and would be mis-read silently.
gmr <- fread(file.path(dir_gmr, "2026-10-24-gmr-national.csv"),
             na.strings = "", encoding = "UTF-8", colClasses = list(character = "date"))
cases_raw <- fread(file.path(dir_jhu, "time-series-19-covid-combined.csv"),
                   na.strings = "", colClasses = list(character = "Date"))
ref <- fread(file.path(dir_jhu, "reference.csv"), na.strings = "")

check_iso_dates <- function(x, file) {
  if (!all(grepl("^\\d{4}-\\d{2}-\\d{2}$", x)))
    stop("Dates in ", file, " are not YYYY-MM-DD (example: '", x[1], "'). ",
         "The file was probably opened and re-saved in Excel. ",
         "Restore the original file before running this script.", call. = FALSE)
}
check_iso_dates(gmr$date, "2026-10-24-gmr-national.csv")
check_iso_dates(cases_raw$Date, "time-series-19-covid-combined.csv")

setnames(cases_raw, c("Country/Region", "Province/State"), c("jhu_country", "province"))
gmr[, date := as.IDate(date)]
cases_raw[, Date := as.IDate(Date)]

logit("1. LOADED")
logit("   Mobility : ", nrow(gmr), " rows, ", uniqueN(gmr$country_region_code),
      " countries, ", min(gmr$date), " to ", max(gmr$date))
logit("   Cases    : ", nrow(cases_raw), " rows, ", uniqueN(cases_raw$jhu_country),
      " JHU countries, ", min(cases_raw$Date), " to ", max(cases_raw$Date))

# ---- 2. Mobility: keep the analysis columns, short names --------------------
mob_cols <- c(retail      = "retail_and_recreation_percent_change_from_baseline",
              grocery     = "grocery_and_pharmacy_percent_change_from_baseline",
              parks       = "parks_percent_change_from_baseline",
              transit     = "transit_stations_percent_change_from_baseline",
              workplaces  = "workplaces_percent_change_from_baseline",
              residential = "residential_percent_change_from_baseline")
gmr <- gmr[, c("country_region_code", "country_region", "date", mob_cols), with = FALSE]
setnames(gmr, c("country_region_code", "country_region", mob_cols),
         c("iso2", "country", names(mob_cols)))

stopifnot(!anyDuplicated(gmr, by = c("iso2", "date")))
stopifnot("NA" %in% gmr$iso2)  # Namibia survived
logit("\n2. MOBILITY")
logit("   No duplicate country-days. Namibia (ISO 'NA') retained.")
logit("   Share missing by category (Google suppresses low-activity days):")
for (v in names(mob_cols))
  logit(sprintf("     %-12s %5.2f%%", v, 100 * mean(is.na(gmr[[v]]))))

# ---- 3. Cases: build one series per Google country --------------------------
# Problem: Google treats Hong Kong, Aruba, Reunion and Puerto Rico as separate
# countries; JHU files them as provinces of China, Netherlands, France and the US.
# The paper joined on country NAME and silently lost these (plus 6 spelling
# mismatches). Here we (a) split the territories out of their JHU parent and
# (b) join on ISO code via the JHU reference table.
territories <- data.table(
  province = c("Hong Kong", "Aruba", "Reunion"),
  iso2     = c("HK", "AW", "RE"))

# Rule for each JHU country:
#   - if it has a national row (province blank), use that row only
#     (France, Netherlands, UK, Denmark, US: mainland, overseas territories excluded)
#   - otherwise sum its provinces (China, Canada, Australia), excluding any
#     province that Google reports as its own country
has_national <- cases_raw[is.na(province), unique(jhu_country)]
nat  <- cases_raw[is.na(province)]
prov <- cases_raw[!is.na(province) & !(jhu_country %in% has_national) &
                    !(province %in% territories$province)]
prov <- prov[, .(Confirmed = sum(Confirmed)), by = .(jhu_country, Date)]
terr <- merge(cases_raw[province %in% territories$province], territories, by = "province")

ref_c <- ref[is.na(Province_State) & is.na(Admin2) & !is.na(iso2),
             .(iso2, jhu_country = Country_Region, population = Population)]

cases <- rbind(
  merge(rbind(nat[, .(jhu_country, Date, Confirmed)], prov), ref_c, by = "jhu_country"),
  merge(terr[, .(iso2, jhu_country = province, Date, Confirmed)],
        ref[Province_State %in% territories$province & is.na(Admin2),
            .(jhu_country = Province_State, population = Population)],
        by = "jhu_country"))
setnames(cases, c("Date", "Confirmed"), c("date", "cum_cases"))
setorder(cases, iso2, date)

logit("\n3. CASES")
logit("   Countries with a national row used as-is: ",
      paste(intersect(has_national, c("France", "Netherlands", "United Kingdom", "Denmark", "US")),
            collapse = ", "), " (overseas territories excluded)")
logit("   Countries built by summing provinces: ",
      paste(sort(unique(prov$jhu_country)), collapse = ", "))
logit("   Territories split out as own series: ",
      paste(territories$province, collapse = ", "))

# ---- 4. Daily cases from cumulative counts ----------------------------------
cases[, new_raw := cum_cases - shift(cum_cases), by = iso2]
n_neg <- cases[new_raw < 0, .N]
c_neg <- cases[new_raw < 0, uniqueN(iso2)]

# Two versions, kept side by side:
#   new_paper : negatives set to 0 (what the authors did), used for the faithful replication
#   new_clean : negatives set to NA (a downward revision is not a day with zero cases),
#               used for the improved analysis via the 7-day average
cases[, new_paper := pmax(new_raw, 0)]
cases[, new_clean := fifelse(new_raw < 0, NA_real_, new_raw)]

logit("\n4. DAILY CASES")
logit("   Daily new = cumulative(t) - cumulative(t-1).")
logit("   Negative values (data revisions): ", n_neg, " country-days in ", c_neg, " countries.")
logit("   Largest: ", paste(cases[order(new_raw)][1:3,
                       sprintf("%s %s (%s)", jhu_country, date, format(new_raw, big.mark = ","))],
                       collapse = "; "))
logit("   new_paper = negatives set to 0 (paper's rule). new_clean = negatives set to NA.")

# ---- 5. Merge ---------------------------------------------------------------
panel <- merge(gmr, cases[, .(iso2, jhu_country, population, date, cum_cases,
                              new_raw, new_paper, new_clean)],
               by = c("iso2", "date"), all.x = TRUE)

unmatched <- panel[, .(any_cases = any(!is.na(cum_cases))), by = .(iso2, country)][any_cases == FALSE]
logit("\n5. MERGE (on ISO2 code + date)")
logit("   Google countries matched to case data: ",
      uniqueN(gmr$iso2) - nrow(unmatched), " of ", uniqueN(gmr$iso2))
if (nrow(unmatched))
  logit("   Unmatched: ", paste(unmatched$country, collapse = ", "),
        "  (JHU files Puerto Rico only in its US county-level file; dropped)")
logit("   Paper for comparison: 135 downloaded, 106 in its tables.")

panel <- panel[iso2 %in% setdiff(gmr$iso2, unmatched$iso2)]
# The case data ends before the mobility data: keep the overlap only
case_end <- max(cases$date)
n_before <- nrow(panel)
panel <- panel[date <= case_end]
logit("   Trimmed mobility days after case data ends (", case_end, "): ",
      n_before - nrow(panel), " rows dropped.")

# ---- 6. Continent (paper convention) ----------------------------------------
# The paper used geonames continents, where Central America and the Caribbean
# count as North America. countrycode gives "Americas", so split it with the
# UN intermediate region. Coded with full names, never "NA", which is the bug
# that removed North America from the paper's tables.
iso_tbl <- unique(panel[, .(iso2)])
iso_tbl[, continent := countrycode(iso2, "iso2c", "continent", warn = FALSE)]
iso_tbl[, un_inter  := countrycode(iso2, "iso2c", "un.regionintermediate.name", warn = FALSE)]
iso_tbl[continent == "Americas",
        continent := fifelse(un_inter %in% "South America", "South America", "North America")]
# Territories not in countrycode's continent table
iso_tbl[iso2 == "HK", continent := "Asia"]
iso_tbl[iso2 == "RE", continent := "Africa"]
iso_tbl[iso2 == "AW", continent := "North America"]
stopifnot(!anyNA(iso_tbl$continent))
panel <- merge(panel, iso_tbl[, .(iso2, continent)], by = "iso2")

logit("\n6. CONTINENTS")
cont_n <- iso_tbl[, .N, by = continent][order(-N)]
for (i in seq_len(nrow(cont_n)))
  logit(sprintf("   %-14s %3d countries", cont_n$continent[i], cont_n$N[i]))

# ---- 7. Derived variables ---------------------------------------------------
setorder(panel, iso2, date)
roll7 <- function(x) rollapply(x, 7, function(z) if (sum(!is.na(z)) >= 4) mean(z, na.rm = TRUE) else NA_real_,
                               align = "center", fill = NA)

panel[, new_7d := roll7(new_clean), by = iso2]                    # centred 7-day mean
panel[, new_7d_pm := 1e6 * new_7d / population]                   # per million people
# Weekly growth rate of cases: log change in 7-day average vs 7 days earlier.
# +1 inside the log avoids log(0) for countries with zero cases.
panel[, growth_7d := log(new_7d + 1) - log(shift(new_7d, 7) + 1), by = iso2]
for (v in names(mob_cols))
  panel[, paste0(v, "_7d") := roll7(get(v)), by = iso2]

# Analysis windows
panel[, window := fcase(date <= PAPER_END, "paper_train",
                        date <= VALID_END, "paper_validation",
                        default = "extension")]
panel[, num_date := as.integer(date - PAPER_START)]

logit("\n7. DERIVED VARIABLES")
logit("   new_7d       centred 7-day mean of new_clean (needs >= 4 of 7 days)")
logit("   new_7d_pm    new_7d per million population")
logit("   growth_7d    log(new_7d + 1) - log(new_7d 7 days earlier + 1)")
logit("   *_7d         centred 7-day mean of each mobility category")
logit("   window       paper_train (to ", PAPER_END, "), paper_validation (to ", VALID_END,
      "), extension (after)")

# ---- 8. Data-quality flags per country --------------------------------------
# From 2021 many countries report weekly, so most days show 0 and one day a spike.
coverage <- panel[, .(
  country       = country[1],
  jhu_name      = jhu_country[1],
  continent     = continent[1],
  population    = population[1],
  days          = .N,
  first_date    = min(date),
  last_date     = max(date),
  total_cases   = max(cum_cases, na.rm = TRUE),
  pct_zero_days = round(100 * mean(new_raw == 0, na.rm = TRUE), 1),
  n_negative    = sum(new_raw < 0, na.rm = TRUE),
  pct_mob_missing = round(100 * mean(is.na(retail) | is.na(workplaces) | is.na(transit)), 1)
), by = iso2]
coverage[, name_mismatch := country != jhu_name]
setorder(coverage, continent, country)

logit("\n8. DATA QUALITY")
logit("   Name differences fixed by the ISO join: ",
      paste(coverage[name_mismatch == TRUE, sprintf("%s = %s", country, jhu_name)], collapse = "; "))
logit("   Countries with > 50% zero-case days (sparse or weekly reporting): ",
      coverage[pct_zero_days > 50, .N], "  ->  ",
      paste(coverage[pct_zero_days > 50, country], collapse = ", "))

# ---- 9. Save ----------------------------------------------------------------
setcolorder(panel, c("iso2", "country", "continent", "population", "date", "window",
                     "num_date", "cum_cases", "new_raw", "new_paper", "new_clean",
                     "new_7d", "new_7d_pm", "growth_7d"))
panel[, jhu_country := NULL]
fwrite(panel,    file.path(dir_panel, "2026-10-24-panel-clean.csv"))
fwrite(coverage, file.path(dir_out, "2026-10-24-country-coverage.csv"))

logit("\n9. SAVED")
logit("   Panel: ", nrow(panel), " rows x ", ncol(panel), " columns, ",
      uniqueN(panel$iso2), " countries, ", min(panel$date), " to ", max(panel$date))
logit("   Rows per window: ",
      paste(panel[, .N, by = window][, sprintf("%s %d", window, N)], collapse = ", "))
