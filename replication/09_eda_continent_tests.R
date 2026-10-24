# 09_eda_continent_tests.R
# The paper's continent comparison of the Kendall results: Shapiro-Wilk (is tau normal within a continent?),
# Kruskal-Wallis (do continents differ?), Dunn's post-hoc test with Holm adjustment (which pairs differ?),
# boxplots and a summary table. Done for tau and for the lag, in the paper window and the full period.
#
# Run from the repo root, after 04_eda_kendall_compute.R.
# Input : replication/out/kendall_best.rds
# Output: replication/out/tables/09_*.csv and replication/out/figures/09*.png
#
# Dunn's test is written out here in base R (no extra package). Sign convention: z > 0 means the FIRST
# continent has higher ranks (a larger value) than the second. Two-sided p-values, Holm-adjusted across all pairs
# within a test. (The dunn.test package used by the authors reports the opposite sign.)

source("replication/02_eda_setup.R")
if (!file.exists("replication/out/kendall_best.rds")) {
  stop("replication/out/kendall_best.rds not found. Run replication/04_eda_kendall_compute.R first.", call. = FALSE)
}
best <- readRDS("replication/out/kendall_best.rds") %>%
  mutate(continent = factor(continent, levels = continent_levels),
         category  = cat_label(variable)) %>%
  filter(!is.na(continent))
spec_lab <- c(paper = "Paper window\n(to 19 Jun 2020)", smooth = "Full period\n(to 16 Apr 2022)")
best <- best %>% mutate(spec_f = factor(spec, levels = names(spec_lab), labels = spec_lab))

# ---- 0. Helpers ----------------------------------------------------------------------
stars <- function(p) ifelse(is.na(p), "", as.character(cut(p, c(-Inf, 0.001, 0.01, 0.05, Inf), labels = c("***", "**", "*", ""), right = FALSE)))

dunn_holm <- function(x, g) {
  ok <- !is.na(x) & !is.na(g)
  x <- x[ok]; g <- droplevels(factor(g[ok]))
  lv <- levels(g)
  if (length(lv) < 2) return(tibble(group1 = character(), group2 = character(), z = numeric(), p = numeric(), p_holm = numeric()))
  N    <- length(x)
  r    <- rank(x)
  rbar <- tapply(r, g, mean)
  ni   <- tapply(r, g, length)
  tt   <- as.numeric(table(x))
  s2   <- N * (N + 1) / 12 - sum(tt^3 - tt) / (12 * (N - 1))     # variance of a rank, corrected for ties
  pr   <- combn(lv, 2)
  out  <- tibble(group1 = pr[1, ], group2 = pr[2, ])
  out$z      <- (as.numeric(rbar[out$group1]) - as.numeric(rbar[out$group2])) /
                sqrt(s2 * (1 / as.numeric(ni[out$group1]) + 1 / as.numeric(ni[out$group2])))
  out$p      <- 2 * pnorm(-abs(out$z))
  out$p_holm <- p.adjust(out$p, method = "holm")
  out
}

safe_shapiro <- function(x) {
  x <- x[!is.na(x)]
  if (length(x) < 3 || diff(range(x)) == 0) return(c(NA_real_, NA_real_))
  s <- shapiro.test(x)
  c(unname(s$statistic), s$p.value)
}

# One long table with both outcomes so every test runs the same way.
long <- best %>%
  select(spec, spec_f, variable, category, continent, iso2, country, tau = tau_best, lag = best_lag) %>%
  pivot_longer(c(tau, lag), names_to = "outcome", values_to = "value") %>%
  mutate(outcome = factor(outcome, levels = c("tau", "lag")))

# ---- 1. Shapiro-Wilk within each continent -----------------------------------------------
sw <- long %>%
  group_by(spec, variable, category, outcome, continent) %>%
  summarise(n = n(), sw = list(safe_shapiro(value)), .groups = "drop") %>%
  mutate(W = map_dbl(sw, 1), p = map_dbl(sw, 2)) %>% select(-sw) %>%
  group_by(spec, outcome) %>%
  mutate(p_holm = p.adjust(p, method = "holm")) %>% ungroup()
write_csv(sw %>% mutate(across(c(W, p, p_holm), ~ signif(.x, 4))) %>% select(-category),
          file.path(tab_dir, "09_shapiro_by_continent.csv"))

# ---- 2. Kruskal-Wallis across continents ----------------------------------------------------
kw <- long %>%
  group_by(spec, spec_f, variable, category, outcome) %>%
  group_modify(~ {
    d  <- droplevels(.x)
    ok <- nlevels(d$continent) >= 2 && diff(range(d$value, na.rm = TRUE)) > 0
    if (!ok) return(tibble(n = nrow(d), groups = nlevels(d$continent), chi_sq = NA_real_, df = NA_real_, p = NA_real_))
    k <- kruskal.test(value ~ continent, data = d)
    tibble(n = nrow(d), groups = nlevels(d$continent),
           chi_sq = unname(k$statistic), df = unname(k$parameter), p = k$p.value)
  }) %>% ungroup() %>%
  mutate(stars = stars(p))
write_csv(kw %>% select(-spec_f, -category) %>% mutate(across(c(chi_sq, p), ~ signif(.x, 4))),
          file.path(tab_dir, "09_kruskal_wallis.csv"))
cat("\nKruskal-Wallis across continents:\n")
print(kw %>% select(spec, variable, outcome, n, chi_sq, p) %>% mutate(across(c(chi_sq, p), ~ signif(.x, 3))), n = Inf)

# ---- 3. Dunn post-hoc, Holm adjusted -----------------------------------------------------------
dunn <- long %>%
  group_by(spec, spec_f, variable, category, outcome) %>%
  group_modify(~ dunn_holm(.x$value, .x$continent)) %>% ungroup() %>%
  mutate(stars = stars(p_holm))
write_csv(dunn %>% select(-spec_f, -category) %>% mutate(across(c(z, p, p_holm), ~ signif(.x, 4))),
          file.path(tab_dir, "09_dunn_holm_pairs.csv"))

# ---- 4. Summary table by continent (median and IQR) ---------------------------------------------
fmt <- function(x, d) sprintf(paste0("%.", d, "f"), x)
summ <- long %>%
  group_by(spec, variable, outcome, continent) %>%
  summarise(n = n(), median = median(value), q1 = quantile(value, 0.25), q3 = quantile(value, 0.75), .groups = "drop") %>%
  mutate(d = if_else(outcome == "tau", 2, 0),
         text = paste0(fmt(median, d), " [", fmt(q1, d), ", ", fmt(q3, d), "]")) %>%
  select(-d)
write_csv(summ %>% mutate(across(c(median, q1, q3), ~ round(.x, 3))),
          file.path(tab_dir, "09_continent_summary_long.csv"))
summ_wide <- summ %>% select(spec, outcome, continent, n, variable, text) %>%
  pivot_wider(names_from = variable, values_from = text) %>%
  arrange(spec, outcome, continent)
write_csv(summ_wide, file.path(tab_dir, "09_continent_summary_table.csv"))

# ---- 5. Figures: boxplots of tau and lag by continent -----------------------------------------------
box_fig <- function(oc, stub, title, subtitle, ylab, ylim = NULL, hline = 0) {
  d  <- long %>% filter(outcome == oc)
  kt <- kw %>% filter(outcome == oc) %>%
    mutate(txt = if_else(is.na(p), "", paste0("KW p ", if_else(p < 0.001, "< 0.001", sprintf("= %.3f", p)))))
  p <- ggplot(d, aes(continent, value, fill = continent)) +
    geom_hline(yintercept = hline, colour = sprint$faint, linewidth = 0.3) +
    geom_boxplot(alpha = 0.55, colour = "white", outlier.shape = NA, linewidth = 0.3, width = 0.65) +
    geom_jitter(width = 0.15, height = 0, size = 0.7, colour = "white", alpha = 0.55) +
    geom_text(data = kt, aes(x = 3.5, y = Inf, label = txt), inherit.aes = FALSE, vjust = 1.4, size = 3, colour = "white") +
    facet_grid(spec_f ~ category) +
    scale_fill_manual(values = continent_cols, guide = "none") +
    scale_y_continuous(expand = expansion(mult = c(0.04, 0.14))) +
    labs(title = title, subtitle = subtitle, x = NULL, y = ylab,
         caption = "One dot per country. Boxes: median and interquartile range. KW = Kruskal-Wallis test across the six continents.") +
    theme(axis.text.x = element_text(angle = 40, hjust = 1), panel.grid.major.x = element_blank(),
          strip.text.y = element_text(angle = 0, hjust = 0), panel.spacing.x = unit(1, "lines"))
  save_fig(p, stub, 17, 8)
}
box_fig("tau", "09a_boxplot_tau_by_continent",
        "Strongest Kendall tau by continent",
        "Each country contributes its largest |tau| over lags -28 to +28 days. Negative = more mobility goes with fewer cases.",
        "Strongest Kendall tau")
box_fig("lag", "09b_boxplot_lag_by_continent",
        "Lag of the strongest correlation, by continent",
        "Negative lag: mobility leads cases. Positive lag: cases lead mobility. Values at -28 or +28 sit on the search limit.",
        "Lag (days)")

# ---- 6. Figure: Shapiro-Wilk of tau within each continent ------------------------------------------------
sw_plot <- sw %>% filter(outcome == "tau") %>%
  mutate(spec_f = factor(spec, levels = names(spec_lab), labels = spec_lab),
         lab = if_else(is.na(p), "", if_else(p < 0.001, "<.001", sub("^0", "", sprintf("%.3f", p)))),
         normal = !is.na(p) & p >= 0.05)
p_sw <- ggplot(sw_plot, aes(category, fct_rev(continent), fill = W)) +
  geom_tile(colour = sprint$bg, linewidth = 0.8) +
  geom_text(aes(label = lab, fontface = if_else(normal, "plain", "bold")), size = 3.1, colour = "white") +
  facet_wrap(~spec_f, nrow = 1) +
  scale_fill_gradient(name = "Shapiro-Wilk W", low = sprint$red_dk, high = sprint$blue, limits = c(0.6, 1), oob = scales::squish, na.value = sprint$na,
                      guide = guide_colourbar(frame.colour = NA, ticks.colour = "white", title.position = "top")) +
  labs(title = "Is tau normal within each continent?",
       subtitle = "Shapiro-Wilk test of the strongest tau, per continent and category. Colour: W (1 = normal). Numbers: p-value; bold = normality rejected at 5%.",
       x = NULL, y = NULL,
       caption = "Small groups (Oceania has 4 countries) give the test little power, so a high p-value there says little.") +
  theme(panel.grid = element_blank(), axis.text.x = element_text(angle = 35, hjust = 1),
        legend.position = "bottom", legend.key.width = unit(3, "cm"), legend.key.height = unit(0.28, "cm"),
        panel.spacing.x = unit(1.5, "lines"))
save_fig(p_sw, "09c_shapiro_tau_by_continent", 15, 5.5)

# ---- 7. Figure: Dunn pairwise matrices ----------------------------------------------------------------------
dunn_fig <- function(oc, stub, title, subtitle, lim) {
  d <- dunn %>% filter(outcome == oc)
  both <- bind_rows(d, d %>% mutate(g1 = group1, group1 = group2, group2 = g1, z = -z) %>% select(-g1)) %>%
    mutate(group1 = factor(group1, levels = continent_levels), group2 = factor(group2, levels = continent_levels))
  p <- ggplot(both, aes(group2, fct_rev(group1), fill = z)) +
    geom_tile(colour = sprint$bg, linewidth = 0.6) +
    geom_text(aes(label = stars), size = 4, colour = "white", vjust = 0.75) +
    facet_grid(spec_f ~ category) +
    scale_fill_div(name = "Dunn z (red: row continent higher than column continent)", limits = c(-lim, lim)) +
    scale_x_discrete(drop = FALSE) + scale_y_discrete(drop = FALSE) +
    labs(title = title, subtitle = subtitle, x = NULL, y = NULL,
         caption = "Stars: Holm-adjusted p < 0.05 (*), < 0.01 (**), < 0.001 (***). The diagonal (a continent against itself) is not tested.") +
    theme(panel.grid = element_blank(), axis.text.x = element_text(angle = 45, hjust = 1, size = rel(0.75)),
          axis.text.y = element_text(size = rel(0.75)), legend.position = "bottom",
          legend.key.width = unit(3, "cm"), legend.key.height = unit(0.28, "cm"),
          strip.text.y = element_text(angle = 0, hjust = 0), panel.spacing = unit(0.8, "lines"))
  save_fig(p, stub, 17, 9)
}
dunn_fig("tau", "09d_dunn_matrix_tau", "Which continents differ in tau?",
         "Dunn's post-hoc test after Kruskal-Wallis, every pair of continents, Holm-adjusted.", 4)
dunn_fig("lag", "09e_dunn_matrix_lag", "Which continents differ in lag?",
         "Dunn's post-hoc test after Kruskal-Wallis, every pair of continents, Holm-adjusted.", 4)

message("09 done: tables in ", tab_dir, ", figures in ", fig_dir)
