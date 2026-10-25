# 02_eda_setup.R
# Shared setup for the EDA scripts (03-07): packages, the dark theme, palettes, helper
# functions, and the analysis panel derived from outputs/02_eda/panel.rds.
#
# The other EDA scripts start with  source("analysis/02_eda/02_eda_setup.R").
# Run on its own it only checks that everything loads and writes outputs/02_eda/panel_eda.rds.
#
# Run from the repo root (the data_sprint folder), e.g. setwd("C:/data_sprint").
# Needs: outputs/02_eda/panel.rds (built by 01_data_import.R)

# ---- 0. Packages ------------------------------------------------------------
needed <- c("tidyverse", "scales", "ggridges", "ragg", "sf", "rnaturalearth", "rnaturalearthdata")
# Optional: pcaPP makes the Kendall step much faster (04 falls back to stats::cor without it).
missing_pkgs <- needed[!vapply(needed, requireNamespace, logical(1), quietly = TRUE)]
if (length(missing_pkgs) > 0) {
  stop("Install these packages first:\n  install.packages(c(",
       paste0('"', missing_pkgs, '"', collapse = ", "), "))", call. = FALSE)
}
suppressPackageStartupMessages({
  library(tidyverse)
  library(scales)
})

fig_dir <- "outputs/02_eda/figures"
tab_dir <- "outputs/02_eda/tables"
dir.create(fig_dir, showWarnings = FALSE, recursive = TRUE)
dir.create(tab_dir, showWarnings = FALSE, recursive = TRUE)

# ---- 1. Constants -----------------------------------------------------------
paper_end <- as.Date("2020-06-19")   # end of the paper's correlation / training window
val_end   <- as.Date("2020-09-08")   # end of the paper's validation window

mob_vars   <- c("retail", "grocery", "parks", "transit", "workplaces", "residential")
mob_labels <- c(retail      = "Retail & recreation",
                grocery     = "Grocery & pharmacy",
                parks       = "Parks",
                transit     = "Transit stations",
                workplaces  = "Workplaces",
                residential = "Residential")
# The paper expects a NEGATIVE correlation with cases for the first four (movement) categories
# and a POSITIVE one for parks and residential (time spent near home).
expected_sign <- c(retail = -1, grocery = -1, parks = 1, transit = -1, workplaces = -1, residential = 1)

cat_label <- function(x) factor(x, levels = mob_vars, labels = unname(mob_labels[mob_vars]))

continent_levels <- c("Africa", "Asia", "Europe", "North America", "Oceania", "South America")

# ---- 2. Palette and theme (black background, white text, blue and red) -----
sprint <- list(
  bg = "#000000", grid = "#1F1F1F", axis = "#3A3A3A",
  text = "#FFFFFF", muted = "#A6A6A6", faint = "#6B6B6B",
  blue = "#4DA3FF", blue_lt = "#9CCBFF", blue_dk = "#1E5BB8",
  red  = "#FF4D6D", red_lt  = "#FF9AAE", red_dk  = "#B02244",
  mid  = "#3A3A42", na = "#171717"
)
# Only used where six things must be told apart on one panel; most plots stay blue/red.
cat_cols <- c(retail = "#4DA3FF", grocery = "#38D6C4", parks = "#FFC857",
              transit = "#8C7BFF", workplaces = "#C8E1FF", residential = "#FF4D6D")
continent_cols <- c("Africa" = "#FF4D6D", "Asia" = "#FFC857", "Europe" = "#4DA3FF",
                    "North America" = "#8C7BFF", "Oceania" = "#38D6C4", "South America" = "#EDEDED")
cluster_cols <- c("#4DA3FF", "#FF4D6D", "#38D6C4", "#FFC857", "#8C7BFF", "#FF9AAE", "#C8E1FF", "#A6A6A6", "#FFFFFF")

theme_sprint <- function(base_size = 12) {
  theme_minimal(base_size = base_size) %+replace%
    theme(
      text             = element_text(colour = sprint[["text"]]),
      plot.background  = element_rect(fill = sprint[["bg"]], colour = NA),
      panel.background = element_rect(fill = sprint[["bg"]], colour = NA),
      panel.grid.major = element_line(colour = sprint[["grid"]], linewidth = 0.3),
      panel.grid.minor = element_blank(),
      axis.text        = element_text(colour = sprint[["muted"]], size = rel(0.85)),
      axis.title       = element_text(colour = "#D9D9D9", size = rel(0.9)),
      axis.ticks       = element_line(colour = sprint[["axis"]], linewidth = 0.3),
      strip.background = element_blank(),
      strip.text       = element_text(colour = sprint[["text"]], face = "bold", size = rel(0.95),
                                      hjust = 0, margin = margin(t = 4, b = 6)),
      legend.background = element_rect(fill = sprint[["bg"]], colour = NA),
      legend.key        = element_rect(fill = sprint[["bg"]], colour = NA),
      legend.text       = element_text(colour = sprint[["muted"]]),
      legend.title      = element_text(colour = "#D9D9D9", face = "bold", size = rel(0.85)),
      plot.title        = element_text(face = "bold", size = rel(1.5), hjust = 0, margin = margin(b = 4)),
      plot.subtitle     = element_text(colour = sprint[["muted"]], size = rel(0.95), hjust = 0,
                                       margin = margin(b = 12)),
      plot.caption      = element_text(colour = sprint[["faint"]], size = rel(0.75), hjust = 0,
                                       margin = margin(t = 12)),
      plot.title.position   = "plot",
      plot.caption.position = "plot",
      plot.margin = margin(16, 18, 12, 16)
    )
}
theme_set(theme_sprint())
update_geom_defaults("text",  list(colour = sprint[["text"]]))
update_geom_defaults("label", list(colour = sprint[["text"]]))

theme_map_dark <- function(base_size = 12) {
  theme_sprint(base_size) +
    theme(axis.text = element_blank(), axis.title = element_blank(),
          axis.ticks = element_blank(), panel.grid = element_blank(),
          legend.position = "bottom",
          legend.key.width = unit(2.4, "cm"), legend.key.height = unit(0.28, "cm"),
          legend.title = element_text(colour = "#D9D9D9", face = "bold", size = rel(0.85), vjust = 1),
          panel.spacing = unit(0.4, "lines"))
}

# Blue (negative) - grey - red (positive) scales, centred on zero.
scale_fill_div <- function(name = NULL, limits = c(-1, 1), ...) {
  scale_fill_gradient2(name = name, low = sprint[["blue"]], mid = sprint[["mid"]],
                       high = sprint[["red"]], midpoint = 0, limits = limits,
                       oob = scales::squish, na.value = sprint[["na"]],
                       guide = guide_colourbar(frame.colour = NA, ticks.colour = "white",
                                               title.position = "top"), ...)
}
scale_colour_div <- function(name = NULL, limits = c(-1, 1), ...) {
  scale_colour_gradient2(name = name, low = sprint[["blue"]], mid = sprint[["mid"]],
                         high = sprint[["red"]], midpoint = 0, limits = limits,
                         oob = scales::squish, na.value = sprint[["na"]], ...)
}

# Date axis with Jan/Jul ticks, used by the time-series plots.
scale_x_months <- function(...) {
  scale_x_date(breaks = seq(as.Date("2020-01-01"), as.Date("2022-10-01"), by = "6 months"),
               labels = scales::label_date("%b\n%Y"), expand = c(0.01, 0), ...)
}

# Save a figure on a black background. Uses ragg when available (cleaner text and Unicode).
save_fig <- function(p, name, width = 12, height = 7, dpi = 200) {
  f <- file.path(fig_dir, paste0(name, ".png"))
  if (requireNamespace("ragg", quietly = TRUE)) {
    ggsave(f, p, width = width, height = height, dpi = dpi, bg = sprint[["bg"]], device = ragg::agg_png)
  } else {
    ggsave(f, p, width = width, height = height, dpi = dpi, bg = sprint[["bg"]])
  }
  message("saved ", f)
  invisible(f)
}

# ---- 3. Helpers --------------------------------------------------------------
# Trailing 7-day mean that tolerates a few missing days (needs >= min_obs of the last 7).
roll7_na <- function(x, min_obs = 4) {
  ok <- !is.na(x)
  s  <- as.numeric(stats::filter(ifelse(ok, x, 0), rep(1, 7), sides = 1))
  n  <- as.numeric(stats::filter(as.numeric(ok), rep(1, 7), sides = 1))
  ifelse(!is.na(n) & n >= min_obs, s / n, NA_real_)
}

# Shift a series so out[t] = x[t - l]. l > 0: the value from l days EARLIER (same as Hmisc::Lag(x, l),
# which the authors used). l < 0: the value from |l| days LATER. Padded with NA.
shift_vec <- function(x, l) {
  n <- length(x)
  if (l == 0) return(x)
  if (abs(l) >= n) return(rep(NA_real_, n))
  if (l > 0) c(rep(NA_real_, l), x[seq_len(n - l)]) else c(x[(-l + 1):n], rep(NA_real_, -l))
}

# Natural Earth country polygons keyed by ISO2 (joins on code, not on names), Robinson projection.
get_world <- function() {
  w <- rnaturalearth::ne_countries(scale = "medium", returnclass = "sf")
  # iso_a2_eh is the cleaned code (gives TW, FR, NO, XK); iso_a2 has "CN-TW" and "-99" placeholders.
  w$iso2 <- ifelse(w$iso_a2_eh %in% c(NA, "-99"), w$iso_a2, w$iso_a2_eh)
  w$iso2 <- ifelse(w$iso2 %in% c(NA, "-99") | grepl("-", w$iso2, fixed = TRUE), NA_character_, w$iso2)
  w <- w[w$iso2 != "AQ" | is.na(w$iso2), ]            # drop Antarctica
  # Natural Earth gives Somaliland no code of its own; fold it into Somalia for the map.
  w$iso2[w$name == "Somaliland"] <- "SO"
  sf::st_transform(w[, c("iso2", "name", "continent")], crs = "+proj=robin")
}

# ---- 4. Analysis panel --------------------------------------------------------
if (!file.exists("outputs/02_eda/panel.rds")) {
  stop("outputs/02_eda/panel.rds not found. Run analysis/02_eda/01_data_import.R first, from the repo root.",
       call. = FALSE)
}
panel_raw <- readRDS("outputs/02_eda/panel.rds")
cases_end <- max(panel_raw$date[!is.na(panel_raw$inc_cases)])   # last date with case data

panel_eda <- panel_raw %>%
  arrange(iso2, date) %>%
  group_by(iso2) %>%
  mutate(across(all_of(mob_vars), roll7_na, .names = "{.col}_7d"),
         has_cases = any(!is.na(inc_cases))) %>%
  ungroup() %>%
  mutate(window = factor(case_when(date <= paper_end ~ "paper_train",
                                   date <= val_end   ~ "paper_validation",
                                   TRUE              ~ "extension"),
                         levels = c("paper_train", "paper_validation", "extension")),
         continent = factor(continent, levels = continent_levels))

saveRDS(panel_eda, "outputs/02_eda/panel_eda.rds")
message("EDA setup ready: ", n_distinct(panel_eda$iso2), " countries, ",
        sum(distinct(panel_eda, iso2, has_cases)$has_cases), " with case data, cases end ", cases_end)
