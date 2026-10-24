# 05_eda_kendall_plots.R
# Visuals for the Kendall cross-correlation results from 04_eda_kendall_compute.R.
#
# Run from the repo root, after 04_eda_kendall_compute.R.
# Input : replication/out/kendall_ccf.rds, replication/out/kendall_best.rds
# Output: replication/out/figures/05*.png, replication/out/tables/05_*.csv
#
# Lag convention (as in the paper): negative lag = mobility on day t is compared with LATER cases,
# i.e. mobility leads cases; positive lag = cases lead mobility.

source("replication/02_eda_setup.R")
for (f in c("replication/out/kendall_ccf.rds", "replication/out/kendall_best.rds")) {
  if (!file.exists(f)) stop(f, " not found. Run replication/04_eda_kendall_compute.R first.", call. = FALSE)
}
ccf  <- readRDS("replication/out/kendall_ccf.rds")  %>% mutate(category = cat_label(variable))
best <- readRDS("replication/out/kendall_best.rds") %>% mutate(category = cat_label(variable))

spec_lab <- c(paper = "Paper window\n(to 19 Jun 2020)", smooth = "Full period\n(to 16 Apr 2022)")
ccf  <- ccf  %>% mutate(spec_f = factor(spec, levels = names(spec_lab), labels = spec_lab),
                        continent = factor(continent, levels = continent_levels))
best <- best %>% mutate(spec_f = factor(spec, levels = names(spec_lab), labels = spec_lab),
                        continent = factor(continent, levels = continent_levels))

# ---- 1. Where do the best lags land? (the +/-28 boundary problem) ---------------
bnd <- best %>% group_by(spec_f, category) %>%
  summarise(pct = round(100 * mean(at_boundary)), n = n(), .groups = "drop")
write_csv(best %>% group_by(spec, variable) %>%
            summarise(n_countries = n(), pct_at_boundary = round(100 * mean(at_boundary), 1),
                      median_lag = median(best_lag), median_tau = round(median(tau_best), 3), .groups = "drop"),
          file.path(tab_dir, "05_best_lag_summary.csv"))

hist_df <- best %>% count(spec_f, category, best_lag, at_boundary)
p_lag <- ggplot(hist_df, aes(best_lag, n, fill = at_boundary)) +
  geom_col(width = 0.85) +
  geom_text(data = bnd, aes(x = 0, y = Inf, label = paste0(pct, "% at the limit")),
            inherit.aes = FALSE, vjust = 1.6, size = 3.1, colour = "white") +
  facet_grid(spec_f ~ category, scales = "free_y") +
  scale_fill_manual(values = c(`FALSE` = sprint$blue, `TRUE` = sprint$red), guide = "none") +
  scale_x_continuous(breaks = c(-28, -14, 0, 14, 28)) +
  scale_y_continuous(expand = expansion(mult = c(0, 0.22))) +
  labs(title = "The best lag often sits at the edge of the search window",
       subtitle = str_wrap("Each bar counts countries whose strongest |tau| was found at that lag. Red bars are the +/-28-day limits: when the winner is at the limit, the true best lag is not identified. Negative lag = mobility leads cases.", 150),
       x = "Lag with the largest |tau| (days)", y = "Countries",
       caption = "Kendall tau-b, lags -28 to +28. Paper window: raw daily series. Full period: 7-day averages.") +
  theme(panel.spacing.x = unit(1.2, "lines"), strip.text.y = element_text(angle = 0, hjust = 0))
save_fig(p_lag, "05a_best_lag_distribution", 16, 6.5)

# ---- 2. Median cross-correlation curve by continent -----------------------------
curve <- ccf %>% filter(!is.na(tau)) %>%
  group_by(spec_f, category, continent, lag) %>%
  summarise(med = median(tau), n = n(), .groups = "drop") %>%
  filter(n >= 3)
p_curve <- ggplot(curve, aes(lag, med, colour = continent)) +
  geom_hline(yintercept = 0, colour = sprint$faint, linewidth = 0.3) +
  geom_vline(xintercept = 0, colour = sprint$faint, linewidth = 0.3, linetype = "dashed") +
  geom_line(linewidth = 0.7) +
  facet_grid(spec_f ~ category) +
  scale_colour_manual(values = continent_cols, name = NULL) +
  scale_x_continuous(breaks = c(-28, 0, 28)) +
  labs(title = "Cross-correlation curves by continent",
       subtitle = "Median Kendall tau across countries at each lag. Negative lag = mobility leads cases; positive lag = cases lead mobility.",
       x = "Lag (days)", y = "Median Kendall tau",
       caption = "Continent-lag cells with fewer than 3 countries are dropped.") +
  theme(legend.position = "bottom", panel.spacing.x = unit(1.2, "lines"),
        strip.text.y = element_text(angle = 0, hjust = 0)) +
  guides(colour = guide_legend(nrow = 1, override.aes = list(linewidth = 1.6)))
save_fig(p_curve, "05b_ccf_curves_by_continent", 16, 7.5)

# ---- 3. Every country, every lag: tau heatmaps -----------------------------------
make_ccf_heat <- function(sp, file_stub, title, subtitle) {
  d <- ccf %>% filter(spec == sp)
  b <- best %>% filter(spec == sp)
  ord <- b %>% filter(variable == "workplaces") %>%
    arrange(continent, desc(best_lag), country)   # most negative lag (mobility leads) at the bottom after rev
  lv <- rev(ord$country)
  lv <- c(setdiff(unique(d$country), lv), lv)    # countries without a workplaces result, if any
  d <- d %>% mutate(country = factor(country, levels = lv))
  b <- b %>% mutate(country = factor(country, levels = lv))
  p <- ggplot(d, aes(lag, country, fill = tau)) +
    geom_tile() +
    geom_point(data = b, aes(best_lag, country), inherit.aes = FALSE,
               colour = "white", size = 0.5, shape = 16) +
    facet_grid(continent ~ category, scales = "free_y", space = "free_y", switch = "y") +
    scale_fill_div(name = "Kendall tau", limits = c(-0.8, 0.8), breaks = c(-0.8, -0.4, 0, 0.4, 0.8)) +
    scale_x_continuous(breaks = c(-28, 0, 28), expand = c(0, 0)) +
    scale_y_discrete(expand = c(0, 0)) +
    labs(title = title, subtitle = subtitle, x = "Lag (days): negative = mobility leads cases", y = NULL,
         caption = "White dots mark each country's strongest |tau|. Rows ordered within continent by the workplaces best lag. Grey = too few days to compute.") +
    theme(axis.text.y = element_blank(), axis.ticks.y = element_blank(), panel.grid = element_blank(),
          legend.position = "bottom", legend.key.width = unit(3, "cm"), legend.key.height = unit(0.28, "cm"),
          strip.text.y.left = element_text(angle = 0, hjust = 1), strip.text.x = element_text(hjust = 0.5),
          panel.spacing.x = unit(1.4, "lines"), panel.spacing.y = unit(0.5, "lines"))
  save_fig(p, file_stub, 18, 11.5)
}
make_ccf_heat("paper", "05c_ccf_heatmap_paper",
              "Every country, every lag: the paper window",
              "Rows are countries, columns are lags, colour is Kendall tau between daily cases and mobility (15 Feb - 19 Jun 2020).")
make_ccf_heat("smooth", "05d_ccf_heatmap_full",
              "Every country, every lag: the full period",
              "Same method on 7-day averages over the whole overlap (15 Feb 2020 - 16 Apr 2022).")

# ---- 4. Does picking the best of 57 lags inflate tau? ---------------------------------
infl <- best %>% filter(!is.na(tau_lag0))
infl_txt <- infl %>% group_by(spec_f, category) %>%
  summarise(gain = mean(abs(tau_best) - abs(tau_lag0)), .groups = "drop") %>%
  mutate(label = paste0("mean |tau| gain: +", sprintf("%.2f", gain)))
write_csv(infl %>% group_by(spec, variable) %>%
            summarise(mean_abs_tau_lag0 = round(mean(abs(tau_lag0)), 3), mean_abs_tau_best = round(mean(abs(tau_best)), 3),
                      .groups = "drop"),
          file.path(tab_dir, "05_tau_inflation.csv"))
p_infl <- ggplot(infl, aes(tau_lag0, tau_best)) +
  geom_abline(slope = 1, intercept = 0, colour = "white", linetype = "dashed", linewidth = 0.3) +
  geom_hline(yintercept = 0, colour = sprint$faint, linewidth = 0.25) +
  geom_vline(xintercept = 0, colour = sprint$faint, linewidth = 0.25) +
  geom_point(aes(colour = at_boundary), size = 1.2, alpha = 0.8) +
  geom_text(data = infl_txt, aes(x = -0.95, y = 0.95, label = label), inherit.aes = FALSE,
            hjust = 0, vjust = 1, size = 3, colour = "white") +
  facet_grid(spec_f ~ category) +
  scale_colour_manual(values = c(`FALSE` = sprint$blue, `TRUE` = sprint$red),
                      labels = c("Best lag inside the window", "Best lag at +/-28 limit"), name = NULL) +
  coord_equal(xlim = c(-1, 1), ylim = c(-1, 1)) +
  labs(title = "Choosing the best of 57 lags inflates the correlation",
       subtitle = str_wrap("Each dot is a country. Dashed line: tau at the best lag equals tau at lag 0. Dots in the opposite-sign quadrants changed the sign of the correlation by moving to the best lag.", 150),
       x = "Kendall tau at lag 0", y = "Kendall tau at the best lag",
       caption = "By construction |tau| at the best lag is never smaller than at lag 0, so the maximum over 57 lags is biased upward.") +
  theme(legend.position = "bottom", strip.text.y = element_text(angle = 0, hjust = 0),
        panel.spacing.x = unit(0.8, "lines")) +
  guides(colour = guide_legend(override.aes = list(size = 3, alpha = 1)))
save_fig(p_infl, "05e_tau_inflation", 16, 7.5)

# ---- 5. Does the early-pandemic pattern survive the full period? ---------------------
cmp <- best %>% select(spec, iso2, country, continent, category, tau_best) %>%
  pivot_wider(names_from = spec, values_from = tau_best) %>%
  filter(!is.na(paper), !is.na(smooth))
cmp_txt <- cmp %>% group_by(category) %>%
  summarise(flip = sum(sign(paper) != sign(smooth)), n = n(), .groups = "drop") %>%
  mutate(label = paste0(flip, " of ", n, " change sign"))
write_csv(cmp %>% group_by(category) %>%
            summarise(n = n(), sign_flips = sum(sign(paper) != sign(smooth)),
                      corr_paper_vs_full = round(cor(paper, smooth, method = "spearman"), 3), .groups = "drop"),
          file.path(tab_dir, "05_paper_vs_full_period.csv"))
p_cmp <- ggplot(cmp, aes(paper, smooth, colour = continent)) +
  geom_abline(slope = 1, intercept = 0, colour = "white", linetype = "dashed", linewidth = 0.3) +
  geom_hline(yintercept = 0, colour = sprint$faint, linewidth = 0.25) +
  geom_vline(xintercept = 0, colour = sprint$faint, linewidth = 0.25) +
  geom_point(size = 1.5, alpha = 0.85) +
  geom_text(data = cmp_txt, aes(x = -0.95, y = 0.95, label = label), inherit.aes = FALSE,
            hjust = 0, vjust = 1, size = 3, colour = "white") +
  facet_wrap(~category, ncol = 3) +
  scale_colour_manual(values = continent_cols, name = NULL) +
  coord_equal(xlim = c(-1, 1), ylim = c(-1, 1)) +
  labs(title = "Do the paper-window correlations survive the full period?",
       subtitle = "Each dot is a country: strongest tau in the paper window (x) against the strongest tau over the whole period (y). Off the dashed line = a different answer.",
       x = "Strongest Kendall tau, paper window", y = "Strongest Kendall tau, full period",
       caption = "Full period uses 7-day averages to 16 Apr 2022. Both series trend over two years, which can produce correlation on its own.") +
  theme(legend.position = "bottom", panel.spacing.x = unit(1.2, "lines")) +
  guides(colour = guide_legend(nrow = 1, override.aes = list(size = 3, alpha = 1)))
save_fig(p_cmp, "05f_paper_vs_full_period", 14, 8.5)

# ---- 6. Share of countries with the sign the paper expected ----------------------------
sign_df <- best %>%
  mutate(expected = sign(tau_best) == expected_sign[variable]) %>%
  group_by(spec_f, category) %>%
  summarise(pct = 100 * mean(expected), .groups = "drop")
p_sign <- ggplot(sign_df, aes(category)) +
  geom_col(aes(y = 100), fill = sprint$red, width = 0.7) +
  geom_col(aes(y = pct), fill = sprint$blue, width = 0.7) +
  geom_text(aes(y = 0, label = paste0(round(pct), "%")), vjust = -0.7, size = 3.6, colour = "black", fontface = "bold") +
  geom_hline(yintercept = 50, colour = "white", linetype = "dashed", linewidth = 0.3) +
  facet_wrap(~spec_f, nrow = 1) +
  scale_y_continuous(expand = c(0, 0), breaks = c(0, 50, 100)) +
  labs(title = "How many countries show the expected sign?",
       subtitle = "Blue: strongest tau has the sign the paper expected (negative for movement categories, positive for parks and residential). Red: the opposite sign.",
       x = NULL, y = "% of countries",
       caption = "Dashed line: 50%.") +
  theme(axis.text.x = element_text(angle = 25, hjust = 1), panel.grid.major.x = element_blank(),
        panel.spacing.x = unit(1.5, "lines"))
save_fig(p_sign, "05g_expected_sign_share", 12, 5.5)

message("05 done")
