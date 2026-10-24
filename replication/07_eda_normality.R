# 07_eda_normality.R
# Normality plots and tests for the mobility and case series, plus autocorrelation checks.
#
# Why: the paper's tests (Shapiro-Wilk, Kruskal-Wallis, Dunn) and the Tweedie models all rest on
# assumptions about the shape and the dependence of these series. This script shows what they
# actually look like.
#
# Run from the repo root, after 01_data_import.R.
# Input : replication/out/panel.rds (via 02_eda_setup.R)
# Output: replication/out/tables/07_*.csv and replication/out/figures/07*.png
#
# Two periods are compared throughout:
#   paper = 15 Feb - 19 Jun 2020 (the paper's correlation window)
#   full  = 15 Feb 2020 - 16 Apr 2022 (every day with case data)
# Only countries with case data are used, so mobility and cases are tested on the same days.

source("replication/02_eda_setup.R")
suppressPackageStartupMessages(library(ggridges))
set.seed(2026)

# ---- 0. Variables, labels, helpers ----------------------------------------------
nv <- c(mob_vars, "inc_cases", "log_inc_cases", "cases_per_100k_7d", "log_cases_100k")
nv_lab <- c(unname(mob_labels[mob_vars]),
            "Daily new cases", "log10(1 + daily new cases)",
            "Cases per 100k (7-day mean)", "log10(1 + cases per 100k)")
names(nv_lab) <- nv
var_f    <- function(x) factor(x, levels = nv, labels = unname(nv_lab[nv]))
period_f <- function(x) factor(x, levels = c("paper", "full"),
                               labels = c("Paper window (to 19 Jun 2020)", "Full period (to 16 Apr 2022)"))

skew   <- function(x) { m <- mean(x); s <- sqrt(mean((x - m)^2)); mean((x - m)^3) / s^3 }
exkurt <- function(x) { m <- mean(x); s2 <- mean((x - m)^2); mean((x - m)^4) / s2^2 - 3 }
# Jarque-Bera: n/6 * (skew^2 + excess_kurtosis^2 / 4) ~ chi-square(2) under normality
jb_p <- function(x) { n <- length(x); pchisq(n / 6 * (skew(x)^2 + exkurt(x)^2 / 4), df = 2, lower.tail = FALSE) }
# Shapiro-Wilk is only defined for 3 to 5000 values; need some variation too.
safe_sw <- function(x) {
  x <- x[!is.na(x)]
  if (length(x) < 20 || length(x) > 5000 || diff(range(x)) == 0) return(c(NA_real_, NA_real_))
  s <- shapiro.test(x)
  c(unname(s$statistic), s$p.value)
}

# ---- 1. Long data: one row per country-day-variable -----------------------------
pn <- panel_eda %>%
  filter(has_cases, date <= cases_end) %>%
  mutate(log_inc_cases  = log10(1 + inc_cases),
         log_cases_100k = log10(1 + cases_per_100k_7d))

nl <- pn %>%
  select(iso2, country, continent, date, all_of(nv)) %>%
  pivot_longer(all_of(nv), names_to = "variable", values_to = "value") %>%
  filter(!is.na(value))
nl_all <- bind_rows(mutate(nl, period = "full"),
                    mutate(filter(nl, date <= paper_end), period = "paper"))
message("Normality: ", n_distinct(pn$iso2), " countries, ", nrow(nl), " country-day values (full period)")

# ---- 2. Pooled tests (every country-day together) -------------------------------
# Shapiro-Wilk is run on a random sample of 5000 (its upper limit); Jarque-Bera uses everything.
# With this many points almost any test rejects, so read these as descriptions of shape, not as verdicts.
pool_tests <- nl_all %>%
  group_by(variable, period) %>%
  group_modify(~ {
    x  <- .x$value
    xs <- if (length(x) > 5000) sample(x, 5000) else x
    sw <- shapiro.test(xs)
    tibble(n = length(x), mean = mean(x), sd = sd(x),
           skewness = skew(x), excess_kurtosis = exkurt(x),
           shapiro_W = unname(sw$statistic), shapiro_p = sw$p.value, jarque_bera_p = jb_p(x))
  }) %>%
  ungroup() %>%
  mutate(label = nv_lab[variable])
write_csv(pool_tests, file.path(tab_dir, "07_pooled_normality_tests.csv"))

# ---- 3. Country-by-country Shapiro-Wilk ------------------------------------------
# This is the fairer test: within one country the series is a single sample (although still autocorrelated,
# see section 7). p-values are Holm-adjusted across countries within each variable and period.
ctry_tests <- nl_all %>%
  group_by(variable, period, iso2, country, continent) %>%
  summarise(n = n(), skewness = skew(value), excess_kurtosis = exkurt(value),
            sw = list(safe_sw(value)), .groups = "drop") %>%
  mutate(W = map_dbl(sw, 1), p = map_dbl(sw, 2)) %>%
  select(-sw) %>%
  group_by(variable, period) %>%
  mutate(p_holm = p.adjust(p, method = "holm")) %>%
  ungroup() %>%
  mutate(reject_05 = p < 0.05, reject_holm = p_holm < 0.05)
write_csv(ctry_tests, file.path(tab_dir, "07_country_normality_tests.csv"))

rej <- ctry_tests %>%
  filter(!is.na(p)) %>%
  group_by(variable, period) %>%
  summarise(countries = n(),
            pct_reject_05   = 100 * mean(reject_05),
            pct_reject_holm = 100 * mean(reject_holm),
            median_W = median(W), median_skew = median(skewness), .groups = "drop") %>%
  mutate(across(where(is.numeric), ~ round(.x, 3)))
write_csv(rej, file.path(tab_dir, "07_normality_rejection_summary.csv"))
cat("\nShare of countries where Shapiro-Wilk rejects normality (p < 0.05):\n")
print(rej %>% select(variable, period, countries, pct_reject_05, pct_reject_holm, median_W), n = Inf)

# ---- 4. Histograms with the fitted normal curve ----------------------------------
hist_fig <- function(per, stub, title, subtitle) {
  d_all <- nl_all %>% filter(period == per)
  d <- d_all %>% group_by(variable) %>%
    filter(value >= quantile(value, 0.005), value <= quantile(value, 0.995)) %>%   # trim extreme tails for display
    ungroup() %>% mutate(vf = var_f(variable))
  grid <- d_all %>% group_by(variable) %>%
    summarise(m = mean(value), s = sd(value),
              lo = quantile(value, 0.005), hi = quantile(value, 0.995), .groups = "drop") %>%
    rowwise() %>% mutate(g = list(tibble(x = seq(lo, hi, length.out = 200)))) %>% ungroup() %>%
    unnest(g) %>% mutate(dens = dnorm(x, m, s), vf = var_f(variable))
  lab <- pool_tests %>% filter(period == per) %>%
    mutate(vf = var_f(variable),
           txt = sprintf("skew %.1f\nex. kurt %.1f", skewness, excess_kurtosis))
  p <- ggplot(d, aes(value)) +
    geom_histogram(aes(y = after_stat(density)), bins = 50, fill = sprint$blue, alpha = 0.85, colour = NA) +
    geom_line(data = grid, aes(x, dens), colour = sprint$red, linewidth = 0.8) +
    geom_text(data = lab, aes(x = Inf, y = Inf, label = txt), inherit.aes = FALSE,
              hjust = 1.08, vjust = 1.3, size = 2.9, colour = "white", lineheight = 0.95) +
    facet_wrap(~vf, ncol = 5, scales = "free") +
    scale_y_continuous(expand = expansion(mult = c(0, 0.25))) +
    labs(title = title, subtitle = subtitle, x = NULL, y = "Density",
         caption = "Blue: every country-day pooled (tails trimmed to the 0.5-99.5th percentile for display). Red: normal curve with the same mean and sd.") +
    theme(axis.text.y = element_blank(), panel.grid.major.y = element_blank(),
          panel.spacing = unit(1.1, "lines"))
  save_fig(p, stub, 17, 7.5)
}
hist_fig("paper", "07a_histograms_paper",
         "How far from a bell curve? The paper window",
         "Blue bars: the data. Red curve: the normal distribution with the same mean and sd. The log rows show whether a log transform of cases helps.")
hist_fig("full", "07b_histograms_full",
         "How far from a bell curve? The full period",
         "Same variables over 15 Feb 2020 - 16 Apr 2022 (every day with case data).")

# ---- 5. QQ plots ------------------------------------------------------------------
qq_fig <- function(per, stub, title, subtitle) {
  d <- nl_all %>% filter(period == per) %>%
    group_by(variable) %>%
    filter(row_number() %in% sample.int(n(), min(n(), 5000))) %>%   # 5000 random points per panel is plenty
    ungroup() %>% mutate(vf = var_f(variable))
  p <- ggplot(d, aes(sample = value)) +
    stat_qq(colour = sprint$blue, size = 0.5, alpha = 0.4) +
    stat_qq_line(colour = sprint$red, linewidth = 0.8) +
    facet_wrap(~vf, ncol = 5, scales = "free_y") +
    labs(title = title, subtitle = subtitle,
         x = "Theoretical normal quantiles", y = "Sample quantiles",
         caption = "5,000 random country-days per panel. Red line passes through the first and third quartiles; points off the line mean the tails are not normal.") +
    theme(panel.spacing = unit(1.1, "lines"))
  save_fig(p, stub, 17, 7.5)
}
qq_fig("paper", "07c_qq_paper", "QQ plots, the paper window",
       "Points on the red line would mean normal data. S-shapes and fans show heavy tails and skew.")
qq_fig("full", "07d_qq_full", "QQ plots, the full period",
       "Same check over the whole overlap with case data.")

# ---- 6. How many countries pass the test? ----------------------------------------
rej_plot <- rej %>% mutate(vf = var_f(variable), pf = period_f(period))
p_rej <- ggplot(rej_plot, aes(y = fct_rev(vf))) +
  geom_col(aes(x = 100), fill = sprint$blue, width = 0.7) +
  geom_col(aes(x = pct_reject_05), fill = sprint$red, width = 0.7) +
  geom_text(aes(x = 1.5, label = paste0(round(pct_reject_05), "%")), hjust = 0, size = 3.4,
            colour = "black", fontface = "bold") +
  facet_wrap(~pf, nrow = 1) +
  scale_x_continuous(expand = c(0, 0), breaks = c(0, 50, 100)) +
  labs(title = "In how many countries is normality rejected?",
       subtitle = "Shapiro-Wilk test run separately for each country. Red: normality rejected at the 5% level. Blue: not rejected.",
       x = "% of countries", y = NULL,
       caption = "A series can fail the test and still be usable; the point is that normal-theory methods need care. Holm-adjusted rates are in 07_normality_rejection_summary.csv.") +
  theme(panel.grid.major.y = element_blank(), panel.spacing.x = unit(1.5, "lines"))
save_fig(p_rej, "07e_normality_rejection_share", 13, 5.5)

# ---- 7. Shapiro-Wilk W by country ---------------------------------------------------
w_df <- ctry_tests %>% filter(!is.na(W)) %>% mutate(vf = var_f(variable), pf = period_f(period))
p_w <- ggplot(w_df, aes(W, fct_rev(vf))) +
  geom_jitter(aes(colour = reject_holm), height = 0.22, size = 0.9, alpha = 0.8) +
  geom_boxplot(outlier.shape = NA, fill = NA, colour = "white", linewidth = 0.3, width = 0.55) +
  facet_wrap(~pf, nrow = 1) +
  scale_colour_manual(values = c(`FALSE` = sprint$blue, `TRUE` = sprint$red),
                      labels = c("Not rejected", "Rejected (Holm-adjusted, 5%)"), name = NULL) +
  labs(title = "Shapiro-Wilk W for every country",
       subtitle = "One dot per country. W = 1 is a perfect match to a normal distribution; lower W is further from normal.",
       x = "Shapiro-Wilk W", y = NULL,
       caption = "Boxes show the median and interquartile range across countries.") +
  theme(legend.position = "bottom", panel.grid.major.y = element_blank(), panel.spacing.x = unit(1.5, "lines")) +
  guides(colour = guide_legend(override.aes = list(size = 3, alpha = 1)))
save_fig(p_w, "07f_shapiro_W_by_country", 13, 6.5)

# ---- 8. Skewness against kurtosis --------------------------------------------------
sk <- ctry_tests %>% filter(is.finite(skewness), is.finite(excess_kurtosis)) %>%
  mutate(vf = var_f(variable), pf = period_f(period))
p_sk <- ggplot(sk, aes(skewness, excess_kurtosis, colour = pf)) +
  annotate("rect", xmin = -0.5, xmax = 0.5, ymin = -1, ymax = 1, fill = "white", alpha = 0.08) +
  geom_point(size = 1, alpha = 0.7) +
  annotate("point", x = 0, y = 0, shape = 18, size = 3, colour = "white") +
  facet_wrap(~vf, ncol = 5, scales = "free") +
  scale_colour_manual(values = c(sprint$blue, sprint$red), name = NULL) +
  scale_x_continuous(trans = pseudo_log_trans(sigma = 0.5, base = 10)) +
  scale_y_continuous(trans = pseudo_log_trans(sigma = 1, base = 10)) +
  labs(title = "Skewness and kurtosis, country by country",
       subtitle = "A normal distribution sits at the white diamond (skewness 0, excess kurtosis 0). The shaded box is a loose 'close to normal' zone.",
       x = "Skewness (log-like scale)", y = "Excess kurtosis (log-like scale)",
       caption = "One dot per country and period. Positive skew = long right tail; positive excess kurtosis = heavier tails than normal.") +
  theme(legend.position = "bottom", panel.spacing = unit(1.1, "lines")) +
  guides(colour = guide_legend(override.aes = list(size = 3, alpha = 1)))
save_fig(p_sk, "07g_skewness_kurtosis", 17, 7.5)

# ---- 9. Autocorrelation: why Kendall p-values and naive tests are not trustworthy ----
# Median autocorrelation (across countries) of each series, in levels and in first differences.
acf_vars <- c(mob_vars, "inc_cases", "cases_per_100k_7d")
acf_lab  <- nv_lab[acf_vars]
lag_max  <- 28
acf_one <- function(x) {
  x <- as.numeric(x)
  if (sum(!is.na(x)) < 60 || isTRUE(sd(x, na.rm = TRUE) == 0)) return(rep(NA_real_, lag_max))
  as.numeric(stats::acf(x, lag.max = lag_max, na.action = na.pass, plot = FALSE)$acf)[-1]
}
acf_long <- bind_rows(lapply(split(pn, pn$iso2), function(g) {
  bind_rows(lapply(acf_vars, function(v) {
    x <- g[[v]]
    bind_rows(
      tibble(iso2 = g$iso2[1], variable = v, transform = "Level",            lag = 1:lag_max, acf = acf_one(x)),
      tibble(iso2 = g$iso2[1], variable = v, transform = "First difference", lag = 1:lag_max, acf = acf_one(diff(x))))
  }))
}))
acf_sum <- acf_long %>% filter(!is.na(acf)) %>%
  group_by(variable, transform, lag) %>%
  summarise(med = median(acf), q1 = quantile(acf, 0.25), q3 = quantile(acf, 0.75), .groups = "drop") %>%
  mutate(vf = factor(variable, levels = acf_vars, labels = unname(acf_lab)))
write_csv(acf_sum %>% select(variable, transform, lag, median_acf = med, q1, q3) %>%
            mutate(across(where(is.numeric), ~ round(.x, 4))),
          file.path(tab_dir, "07_acf_summary.csv"))

n_typ <- median(count(pn, iso2)$n)
band  <- 1.96 / sqrt(n_typ)
p_acf <- ggplot(acf_sum, aes(lag, med, colour = transform, fill = transform)) +
  geom_hline(yintercept = 0, colour = sprint$faint, linewidth = 0.3) +
  geom_hline(yintercept = c(-band, band), colour = "white", linetype = "dashed", linewidth = 0.25) +
  geom_ribbon(aes(ymin = q1, ymax = q3), alpha = 0.2, colour = NA) +
  geom_line(linewidth = 0.8) +
  facet_wrap(~vf, ncol = 4) +
  scale_colour_manual(values = c(Level = sprint$blue, `First difference` = sprint$red), name = NULL) +
  scale_fill_manual(values = c(Level = sprint$blue, `First difference` = sprint$red), name = NULL) +
  scale_x_continuous(breaks = c(1, 7, 14, 21, 28)) +
  labs(title = "Autocorrelation of the daily series",
       subtitle = "Autocorrelation at lags 1-28 days: median across countries (line) and interquartile range (band), full period.",
       x = "Lag (days)", y = "Autocorrelation",
       caption = "Dashed lines: the +/-1.96/sqrt(n) band expected for white noise. Bars outside the band mean that neighbouring days are not independent, which matters for tests and p-values that assume they are. Compare the level and first-difference lines.") +
  theme(legend.position = "bottom", panel.spacing = unit(1.1, "lines")) +
  guides(colour = guide_legend(override.aes = list(linewidth = 1.6)))
save_fig(p_acf, "07h_autocorrelation", 15, 7.5)

message("07 done: tables in ", tab_dir, ", figures in ", fig_dir)
