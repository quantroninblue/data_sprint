# 04_eda_kendall_compute.R
# Kendall tau cross-correlation between daily cases and each mobility category, per country,
# at lags -28..+28 days, keeping the lag with the largest |tau| (the paper's method).
#
# Two specifications:
#   paper  : the paper's setup. Raw daily mobility vs raw daily (clipped) cases, 15 Feb - 19 Jun 2020.
#   smooth : same method on the full overlap (to 16 Apr 2022) using 7-day averages of both series.
#            (Per-100k scaling is not needed: tau is rank-based and population is constant within a country.)
#
# LAG CONVENTION (same as the authors' Hmisc::Lag): lag l compares mobility on day t with cases on day t - l.
#   l < 0 : mobility on day t is compared with cases |l| days LATER  -> mobility leads cases
#   l > 0 : mobility on day t is compared with cases |l| days EARLIER -> cases lead mobility
# As in the authors' code, cases are shifted inside the window (nothing is borrowed from outside it).
#
# Run from the repo root, after 01_data_import.R.
# Output: replication/out/kendall_ccf.rds  (country x category x lag x spec, long)
#         replication/out/kendall_best.rds (one row per country x category x spec)
#         replication/out/tables/04_kendall_best_by_country.csv (the paper's Supplementary S1 equivalent)

source("replication/02_eda_setup.R")

lags  <- -28:28
min_n <- 30    # minimum complete day-pairs needed to report a tau at a given lag
has_fk <- requireNamespace("pcaPP", quietly = TRUE)   # fast Kendall tau-b (same values as stats::cor)
message("Kendall engine: ", if (has_fk) "pcaPP::cor.fk" else "stats::cor (slower on the full period)")

# Returns c(tau, n_pairs) after dropping incomplete pairs.
tau_n <- function(x, y) {
  ok <- !is.na(x) & !is.na(y)
  n  <- sum(ok)
  if (n < min_n) return(c(NA_real_, n))
  x <- x[ok]; y <- y[ok]
  if (length(unique(x)) < 2 || length(unique(y)) < 2) return(c(NA_real_, n))
  c(if (has_fk) pcaPP::cor.fk(x, y) else stats::cor(x, y, method = "kendall"), n)
}

specs <- list(
  paper  = list(mob = mob_vars,                  case = "inc_cases",    to = paper_end),
  smooth = list(mob = paste0(mob_vars, "_7d"),   case = "inc_cases_7d", to = cases_end)
)

run_ccf <- function(spec_name) {
  sp <- specs[[spec_name]]
  d  <- panel_eda %>% filter(has_cases, date <= sp$to) %>% arrange(iso2, date)
  groups <- split(d, d$iso2)
  out <- lapply(groups, function(g) {
    cs <- g[[sp$case]]
    bind_rows(lapply(seq_along(mob_vars), function(i) {
      x <- g[[sp$mob[i]]]
      m <- vapply(lags, function(l) tau_n(x, shift_vec(cs, l)), numeric(2))
      tibble(iso2 = g$iso2[1], variable = mob_vars[i], lag = lags, tau = m[1, ], n = m[2, ])
    }))
  })
  bind_rows(out) %>% mutate(spec = spec_name)
}

t0 <- Sys.time()
ccf <- bind_rows(lapply(names(specs), function(s) { message("running spec: ", s); run_ccf(s) }))
message("cross-correlations done in ", round(as.numeric(difftime(Sys.time(), t0, units = "secs"))), " s")

ctry <- panel_eda %>% distinct(iso2, country, continent)
ccf  <- ccf %>% left_join(ctry, by = "iso2")
saveRDS(ccf, "replication/out/kendall_ccf.rds")

# Best lag per country x category: the lag with the largest |tau| (first one on ties, like which.max)
best <- ccf %>%
  group_by(spec, iso2, country, continent, variable) %>%
  summarise(n_lags_ok = sum(!is.na(tau)),
            idx       = if (all(is.na(tau))) NA_integer_ else which.max(abs(tau)),
            best_lag  = lag[idx],
            tau_best  = tau[idx],
            n_pairs   = n[idx],
            tau_lag0  = tau[lag == 0],
            .groups = "drop") %>%
  filter(!is.na(best_lag)) %>%
  select(-idx) %>%
  mutate(at_boundary = abs(best_lag) == max(lags),
         category = cat_label(variable))
saveRDS(best, "replication/out/kendall_best.rds")

best %>%
  select(spec, iso2, country, continent, variable, best_lag, tau_best, tau_lag0, n_pairs, at_boundary) %>%
  mutate(tau_best = round(tau_best, 3), tau_lag0 = round(tau_lag0, 3)) %>%
  arrange(spec, continent, country, variable) %>%
  write_csv(file.path(tab_dir, "04_kendall_best_by_country.csv"))

cat("\nCountries with a best lag, by spec and category:\n")
print(best %>% count(spec, variable) %>% pivot_wider(names_from = variable, values_from = n))
cat("\nShare of best lags sitting at the +/-28 boundary:\n")
print(best %>% group_by(spec, variable) %>% summarise(pct_boundary = round(100 * mean(at_boundary), 1), .groups = "drop") %>%
        pivot_wider(names_from = variable, values_from = pct_boundary))
