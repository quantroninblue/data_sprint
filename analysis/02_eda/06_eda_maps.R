# 06_eda_maps.R
# World maps of the strongest Kendall tau and the lag at which it occurs, per mobility category
# (the paper's Figures 1 and 2), for the paper window and for the full period.
#
# Countries are joined to Natural Earth polygons on ISO2 code (not on names).
#
# Run from the repo root, after 04_eda_kendall_compute.R.
# Input : outputs/02_eda/kendall_best.rds
# Output: outputs/02_eda/figures/06*.png

source("analysis/02_eda/02_eda_setup.R")
if (!file.exists("outputs/02_eda/kendall_best.rds")) {
  stop("outputs/02_eda/kendall_best.rds not found. Run analysis/02_eda/04_eda_kendall_compute.R first.", call. = FALSE)
}
best  <- readRDS("outputs/02_eda/kendall_best.rds")
world <- get_world()

unmatched <- setdiff(unique(best$iso2), world$iso2)
if (length(unmatched) > 0) {
  message("No map polygon for: ", paste(unmatched, collapse = ", "), " (left off the maps)")
}

cat_levels <- levels(cat_label(mob_vars))

# One copy of the world per category, with that category's values attached.
world_values <- function(sp, value) {
  b <- best %>%
    filter(spec == sp) %>%
    transmute(iso2, category = cat_label(variable), value = .data[[value]])
  w <- do.call(rbind, lapply(cat_levels, function(cl) { x <- world; x$category <- cl; x }))
  w$category <- factor(w$category, levels = cat_levels)
  left_join(w, b, by = c("iso2", "category"))
}

map_fig <- function(sp, value, file_stub, title, subtitle, scale, caption) {
  d <- world_values(sp, value)
  p <- ggplot(d) +
    geom_sf(aes(fill = value), colour = "black", linewidth = 0.08) +
    facet_wrap(~category, ncol = 2) +
    scale +
    coord_sf(expand = FALSE, datum = NA) +
    labs(title = title, subtitle = subtitle, caption = caption) +
    theme_map_dark() +
    theme(strip.text = element_text(hjust = 0.5, size = rel(1.05)))
  save_fig(p, file_stub, 13, 10.5)
}

tau_scale <- scale_fill_div(name = "Strongest Kendall tau (blue = negative, red = positive)",
                            limits = c(-0.8, 0.8), breaks = c(-0.8, -0.4, 0, 0.4, 0.8))
lag_scale <- scale_fill_div(name = "Lag of the strongest correlation, days (blue = mobility leads cases, red = cases lead mobility)",
                            limits = c(-28, 28), breaks = c(-28, -14, 0, 14, 28))

sub_paper  <- "15 Feb - 19 Jun 2020, raw daily series. Dark grey = no data."
sub_full   <- "15 Feb 2020 - 16 Apr 2022, 7-day averages. Dark grey = no data."
cap_tau    <- "Strongest tau over lags -28 to +28 days. Expected: negative for the four movement categories, positive for parks and residential."
cap_lag    <- "A colour at the extreme (deep blue or red) means the winner sat at the +/-28-day limit, so the lag is not identified."

map_fig("paper",  "tau_best", "06a_map_tau_paper",
        "Strength of correlation between cases and mobility: paper window", sub_paper, tau_scale, cap_tau)
map_fig("paper",  "best_lag", "06b_map_lag_paper",
        "Lag of the strongest correlation: paper window", sub_paper, lag_scale, cap_lag)
map_fig("smooth", "tau_best", "06c_map_tau_full",
        "Strength of correlation between cases and mobility: full period", sub_full, tau_scale, cap_tau)
map_fig("smooth", "best_lag", "06d_map_lag_full",
        "Lag of the strongest correlation: full period", sub_full, lag_scale, cap_lag)

# ---- A closer look: workplaces, paper window against full period --------------------------
wp <- do.call(rbind, lapply(c("paper", "smooth"), function(sp) {
  b <- best %>% filter(spec == sp, variable == "workplaces") %>% select(iso2, tau_best)
  w <- left_join(world, b, by = "iso2")
  w$spec <- sp
  w
}))
wp$spec <- factor(wp$spec, levels = c("paper", "smooth"),
                  labels = c("Paper window (to 19 Jun 2020)", "Full period (to 16 Apr 2022)"))
p_wp <- ggplot(wp) +
  geom_sf(aes(fill = tau_best), colour = "black", linewidth = 0.1) +
  facet_wrap(~spec, ncol = 1) +
  tau_scale +
  coord_sf(expand = FALSE, datum = NA) +
  labs(title = "Workplace mobility and cases: the pattern changes with the window",
       subtitle = "Strongest Kendall tau between daily cases and workplace mobility, per country. Dark grey = no data.",
       caption = "Paper window uses raw daily series; full period uses 7-day averages. Lags -28 to +28 days.") +
  theme_map_dark() +
  theme(strip.text = element_text(hjust = 0, size = rel(1.05)))
save_fig(p_wp, "06e_map_workplaces_two_periods", 10, 8.5)

message("06 done")
