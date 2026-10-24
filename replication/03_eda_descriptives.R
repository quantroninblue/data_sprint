# 03_eda_descriptives.R
# Descriptive tables and exploratory visuals for the country-day panel.
#
# Run from the repo root, after 01_data_import.R.
# Input : replication/out/panel.rds (via 02_eda_setup.R)
# Output: replication/out/tables/03_*.csv and replication/out/figures/03*.png

source("replication/02_eda_setup.R")
suppressPackageStartupMessages(library(ggridges))

window_labels <- c(paper_train      = "Paper window (to 19 Jun 2020)",
                   paper_validation = "Paper validation (20 Jun - 8 Sep 2020)",
                   extension        = "Extension (from 9 Sep 2020)")

# Order of countries on heatmaps: by continent, then by when the first wave arrived (first day with
# >= 5 cases per 100k per day, 7-day average). Earliest at the top; countries that never reached that
# level, or have no case data, sit at the bottom of their continent.
ctry_order <- panel_eda %>%
  group_by(iso2, country, continent) %>%
  summarise(arrival = suppressWarnings(min(date[!is.na(cases_per_100k_7d) & cases_per_100k_7d >= 5])),
            .groups = "drop") %>%
  mutate(arrival = if_else(is.infinite(arrival), as.Date(NA), arrival)) %>%
  arrange(continent, arrival, country) %>%
  mutate(country_f = factor(country, levels = rev(unique(country))))   # rev: first level plots at the bottom

# ---- 1. Tables ---------------------------------------------------------------
# 1a. Coverage by country (what data each country actually has)
coverage <- panel_eda %>%
  group_by(iso2, country, continent) %>%
  summarise(population     = first(population),
            mobility_start = min(date),
            mobility_end   = max(date),
            mobility_days  = n(),
            case_days      = sum(!is.na(inc_cases)),
            across(all_of(mob_vars), ~ round(100 * mean(is.na(.x)), 1), .names = "pct_missing_{.col}"),
            total_cases    = if (any(!is.na(inc_cases))) sum(inc_cases, na.rm = TRUE) else NA_real_,
            .groups = "drop") %>%
  mutate(total_cases_per_100k = round(total_cases / population * 1e5, 1))
write_csv(coverage, file.path(tab_dir, "03_coverage_by_country.csv"))

# 1b. Summary statistics by variable and window
summ <- function(d) {
  d %>% group_by(variable, window) %>%
    summarise(n_obs       = sum(!is.na(value)),
              pct_missing = round(100 * mean(is.na(value)), 2),
              mean   = mean(value, na.rm = TRUE), sd = sd(value, na.rm = TRUE),
              min    = min(value, na.rm = TRUE),  q1 = quantile(value, 0.25, na.rm = TRUE),
              median = median(value, na.rm = TRUE), q3 = quantile(value, 0.75, na.rm = TRUE),
              max    = max(value, na.rm = TRUE), .groups = "drop")
}
long_mob   <- panel_eda %>% select(iso2, window, all_of(mob_vars)) %>%
  pivot_longer(all_of(mob_vars), names_to = "variable", values_to = "value")
# Cases: only countries with case data and only up to the last case date (otherwise "missing" is meaningless)
long_cases <- panel_eda %>% filter(has_cases, date <= cases_end) %>%
  select(iso2, window, inc_cases, cases_per_100k_7d) %>%
  pivot_longer(c(inc_cases, cases_per_100k_7d), names_to = "variable", values_to = "value")
long_all <- bind_rows(long_mob, long_cases) %>% mutate(window = as.character(window))
desc_tbl <- bind_rows(summ(long_all), summ(mutate(long_all, window = "all"))) %>%
  mutate(across(where(is.numeric), ~ round(.x, 2)))
write_csv(desc_tbl, file.path(tab_dir, "03_descriptives_by_window.csv"))

# 1c. Median mobility by continent, category and window (the pooled daily values)
cont_tbl <- long_mob %>%
  left_join(distinct(panel_eda, iso2, continent), by = "iso2") %>%
  group_by(continent, variable, window) %>%
  summarise(n_countries = n_distinct(iso2), median = median(value, na.rm = TRUE),
            q1 = quantile(value, 0.25, na.rm = TRUE), q3 = quantile(value, 0.75, na.rm = TRUE),
            .groups = "drop")
write_csv(cont_tbl, file.path(tab_dir, "03_mobility_by_continent_window.csv"))

cat("\nCountries with data in each panel subset:\n")
print(coverage %>% count(continent, name = "countries"))
cat("\nWorst missingness (% of days) by category:\n")
print(coverage %>% summarise(across(starts_with("pct_missing_"), max)))

# ---- 2. Mobility timelines (global median and IQR) ---------------------------
n_ctry <- n_distinct(panel_eda$iso2)
tl <- panel_eda %>%
  select(date, all_of(paste0(mob_vars, "_7d"))) %>%
  pivot_longer(-date, names_to = "variable", values_to = "value") %>%
  mutate(variable = sub("_7d$", "", variable)) %>%
  group_by(variable, date) %>%
  summarise(med = median(value, na.rm = TRUE), q1 = quantile(value, 0.25, na.rm = TRUE),
            q3 = quantile(value, 0.75, na.rm = TRUE), .groups = "drop") %>%
  mutate(category = cat_label(variable),
         grp = if_else(expected_sign[variable] < 0, "movement", "home"))

p_tl <- ggplot(tl, aes(date)) +
  annotate("rect", xmin = as.Date("2020-02-15"), xmax = paper_end, ymin = -Inf, ymax = Inf,
           fill = "white", alpha = 0.07) +
  geom_hline(yintercept = 0, colour = sprint$faint, linewidth = 0.3) +
  geom_ribbon(aes(ymin = q1, ymax = q3, fill = grp), alpha = 0.28) +
  geom_line(aes(y = med, colour = grp), linewidth = 0.7) +
  facet_wrap(~category, ncol = 3, scales = "free_y") +
  scale_colour_manual(values = c(movement = sprint$blue, home = sprint$red), guide = "none") +
  scale_fill_manual(values = c(movement = sprint$blue, home = sprint$red), guide = "none") +
  scale_x_months() +
  labs(title = "Community mobility, Feb 2020 - Oct 2022",
       subtitle = str_wrap(paste0("Median (line) and interquartile range (band) across ", n_ctry,
                         " countries, 7-day average. Blue = movement categories, red = stay-home categories. ",
                         "Shaded: the paper's analysis window."), 115),
       x = NULL, y = "% change from pre-pandemic baseline",
       caption = "Source: Google Community Mobility Reports")
save_fig(p_tl, "03a_mobility_timelines", 13, 7)

# ---- 3. Cases timelines by continent -------------------------------------------
cs <- panel_eda %>% filter(has_cases, date <= cases_end, !is.na(cases_per_100k_7d))
cs_med <- cs %>% group_by(continent, date) %>%
  summarise(med = median(cases_per_100k_7d), .groups = "drop")
n_cases_ctry <- n_distinct(cs$iso2)

p_cs <- ggplot() +
  geom_line(data = cs, aes(date, cases_per_100k_7d, group = iso2),
            colour = sprint$red_lt, alpha = 0.30, linewidth = 0.3) +
  geom_line(data = cs_med, aes(date, med), colour = sprint$red, linewidth = 1) +
  facet_wrap(~continent, ncol = 3) +
  scale_y_continuous(trans = pseudo_log_trans(sigma = 1, base = 10),
                     breaks = c(0, 1, 10, 100, 1000), labels = c("0", "1", "10", "100", "1,000")) +
  scale_x_months() +
  labs(title = "Reported COVID-19 cases per 100,000 people",
       subtitle = paste0("Each thin line is one of ", n_cases_ctry,
                         " countries (7-day average); the bold line is the continent median. Log-like scale."),
       x = NULL, y = "New cases per 100,000 per day",
       caption = "Source: JHU CSSE via the repo's interim data. Cases end 16 Apr 2022; negative revisions clipped to 0.")
save_fig(p_cs, "03b_cases_timelines_by_continent", 13, 7)

# ---- 4. Heatmaps: one row per country, one column per week --------------------
weekly <- panel_eda %>%
  mutate(week = floor_date(date, "week", week_start = 1)) %>%
  group_by(iso2, country, continent, week) %>%
  summarise(across(c(all_of(mob_vars), cases_per_100k_7d), ~ if (all(is.na(.x))) NA_real_ else mean(.x, na.rm = TRUE)),
            .groups = "drop") %>%
  left_join(select(ctry_order, iso2, country_f), by = "iso2")

# 4a. Mobility "fingerprints". Colour is scaled within each category (value / its 98th percentile |value|)
mob_heat <- weekly %>%
  select(iso2, country_f, continent, week, all_of(mob_vars)) %>%
  pivot_longer(all_of(mob_vars), names_to = "variable", values_to = "value") %>%
  group_by(variable) %>%
  mutate(scaled = value / quantile(abs(value), 0.98, na.rm = TRUE)) %>%
  ungroup() %>%
  mutate(category = cat_label(variable))

p_heat_mob <- ggplot(mob_heat, aes(week, country_f, fill = scaled)) +
  geom_tile() +
  facet_grid(continent ~ category, scales = "free_y", space = "free_y", switch = "y") +
  scale_fill_div(name = "Weekly mobility, scaled within each category (negative = below baseline)",
                 limits = c(-1, 1), breaks = c(-1, 0, 1), labels = c("-1", "0", "+1")) +
  scale_x_date(breaks = as.Date(c("2020-04-01", "2021-01-01", "2022-01-01")), date_labels = "%b %Y", expand = c(0, 0)) +
  scale_y_discrete(expand = c(0, 0)) +
  labs(title = "Mobility fingerprints, every country",
       subtitle = "Rows are countries (grouped by continent; earliest first case wave at the top); columns are weeks. Black = no data.",
       x = NULL, y = NULL, caption = "Source: Google Community Mobility Reports. Countries that never reached 5 cases per 100k per day, or have no case data, sit at the bottom.") +
  theme(axis.text.y = element_blank(), axis.ticks.y = element_blank(),
        panel.grid = element_blank(), legend.position = "bottom",
        legend.key.width = unit(3, "cm"), legend.key.height = unit(0.28, "cm"),
        strip.text.y.left = element_text(angle = 0, hjust = 1),
        strip.text.x = element_text(hjust = 0.5), panel.spacing = unit(0.5, "lines"))
save_fig(p_heat_mob, "03c_mobility_fingerprints", 20, 11)

# 4b. Case-wave heatmap
case_heat <- weekly %>% filter(week <= cases_end) %>%
  mutate(lg = log10(cases_per_100k_7d + 1))
p_heat_cases <- ggplot(case_heat, aes(week, country_f, fill = lg)) +
  geom_tile() +
  facet_grid(continent ~ ., scales = "free_y", space = "free_y", switch = "y") +
  scale_fill_gradientn(name = "Cases per 100,000 per day (weekly average)",
                       colours = c("#050505", "#3B0A17", sprint$red_dk, sprint$red, "#FFD6DE"),
                       breaks = log10(c(0, 1, 10, 100, 1000) + 1), labels = c("0", "1", "10", "100", "1,000"),
                       na.value = sprint$na,
                       guide = guide_colourbar(frame.colour = NA, ticks.colour = "white", title.position = "top")) +
  scale_x_date(date_breaks = "3 months", date_labels = "%b\n%Y", expand = c(0, 0)) +
  scale_y_discrete(expand = c(0, 0)) +
  labs(title = "Waves of reported cases, every country",
       subtitle = "Rows are countries in the same order as the mobility heatmap (earliest wave at the top); brighter red = more cases per 100,000.",
       x = NULL, y = NULL, caption = "Source: JHU CSSE. Bottom rows of each continent include countries with no case data (Aruba, Hong Kong, Puerto Rico, Reunion).") +
  theme(axis.text.y = element_blank(), axis.ticks.y = element_blank(), panel.grid = element_blank(),
        legend.position = "bottom", legend.key.width = unit(3, "cm"), legend.key.height = unit(0.28, "cm"),
        strip.text.y.left = element_text(angle = 0, hjust = 1), panel.spacing = unit(0.5, "lines"))
save_fig(p_heat_cases, "03d_case_wave_heatmap", 13, 10)

# ---- 5. Distributions ----------------------------------------------------------
dist_mob <- long_mob %>%
  filter(!is.na(value)) %>%
  group_by(variable) %>%
  filter(value >= quantile(value, 0.005), value <= quantile(value, 0.995)) %>%   # trim extreme tails for display
  ungroup() %>%
  mutate(category = cat_label(variable),
         grp = if_else(expected_sign[variable] < 0, "movement", "home"),
         win = factor(window, levels = rev(levels(panel_eda$window)), labels = rev(c("Paper window", "Validation", "Extension"))))

p_dist <- ggplot(dist_mob, aes(value, win, fill = grp)) +
  geom_vline(xintercept = 0, colour = sprint$faint, linewidth = 0.3) +
  geom_density_ridges(scale = 1.15, rel_min_height = 0.005, colour = "white", linewidth = 0.3, alpha = 0.78,
                      quantile_lines = TRUE, quantiles = 2, vline_colour = "white", vline_width = 0.4) +
  facet_wrap(~category, ncol = 3, scales = "free_x") +
  scale_fill_manual(values = c(movement = sprint$blue, home = sprint$red), guide = "none") +
  labs(title = "Distribution of daily mobility, by period",
       subtitle = "Each ridge pools every country-day in that period; the white tick is the median. Tails trimmed to the 0.5-99.5th percentile.",
       x = "% change from pre-pandemic baseline", y = NULL,
       caption = "Source: Google Community Mobility Reports") +
  theme(panel.spacing.x = unit(1.6, "lines"))
save_fig(p_dist, "03e_mobility_distributions", 13, 7)

dist_cases <- panel_eda %>%
  filter(has_cases, date <= cases_end, !is.na(cases_per_100k_7d)) %>%
  mutate(lg = log10(cases_per_100k_7d + 1),
         win = factor(window, levels = levels(panel_eda$window),
                      labels = c("Paper window", "Validation", "Extension")),
         continent = fct_rev(continent))
p_dist_cases <- ggplot(dist_cases, aes(lg, continent)) +
  geom_density_ridges(fill = sprint$red, colour = "white", linewidth = 0.3, alpha = 0.78,
                      scale = 1.1, rel_min_height = 0.005, quantile_lines = TRUE, quantiles = 2,
                      vline_colour = "white", vline_width = 0.4) +
  facet_wrap(~win, nrow = 1, scales = "free_x") +
  scale_x_continuous(breaks = log10(c(0, 1, 10, 100, 1000) + 1), labels = c("0", "1", "10", "100", "1,000")) +
  labs(title = "Distribution of daily cases per 100,000, by continent and period",
       subtitle = "Pools every country-day with case data (7-day average, log scale); white tick = median.",
       x = "New cases per 100,000 per day", y = NULL,
       caption = "Source: JHU CSSE. Reported cases depend on testing and reporting practices, which differ by country and period.") +
  theme(panel.spacing.x = unit(1.6, "lines"))
save_fig(p_dist_cases, "03f_case_distributions", 13, 5.5)

# ---- 6. Missingness -------------------------------------------------------------
miss <- coverage %>%
  select(country, continent, starts_with("pct_missing_")) %>%
  pivot_longer(starts_with("pct_missing_"), names_to = "variable", values_to = "pct") %>%
  mutate(variable = sub("pct_missing_", "", variable)) %>%
  group_by(country) %>% filter(max(pct) >= 5) %>% ungroup() %>%
  mutate(category = cat_label(variable))
if (nrow(miss) > 0) {
  miss <- miss %>% mutate(country = fct_reorder(country, pct, .fun = max))
  p_miss <- ggplot(miss, aes(category, country, fill = pct)) +
    geom_tile(colour = sprint$bg, linewidth = 0.6) +
    geom_text(aes(label = if_else(pct >= 5, round(pct), NA_real_)), size = 3, colour = "white", na.rm = TRUE) +
    scale_fill_gradient(name = "% of days missing", low = "#101010", high = sprint$red,
                        limits = c(0, 100), guide = guide_colourbar(frame.colour = NA, ticks.colour = "white")) +
    labs(title = "Where mobility data are missing",
         subtitle = "Countries where any category is missing on 5% or more of days (Google suppresses low-volume days).",
         x = NULL, y = NULL, caption = "Source: Google Community Mobility Reports, 15 Feb 2020 - 15 Oct 2022") +
    theme(panel.grid = element_blank(), axis.text.x = element_text(angle = 30, hjust = 1))
  save_fig(p_miss, "03g_missingness", 8, max(4, 0.26 * n_distinct(miss$country) + 2))
}

# ---- 7. Example countries: mobility vs cases ------------------------------------
ex_iso <- c("US", "GB", "DE", "IN", "BR", "ZA", "AU", "JP")
ex <- panel_eda %>%
  filter(iso2 %in% ex_iso, date <= cases_end) %>%
  group_by(iso2) %>%
  mutate(cases_scaled = cases_per_100k_7d / max(cases_per_100k_7d, na.rm = TRUE)) %>%
  ungroup() %>%
  mutate(country = factor(country, levels = unique(panel_eda$country[match(ex_iso, panel_eda$iso2)])))
y_rng <- range(ex$workplaces_7d, na.rm = TRUE)
p_ex <- ggplot(ex, aes(date)) +
  geom_hline(yintercept = 0, colour = sprint$faint, linewidth = 0.3) +
  geom_ribbon(aes(ymin = y_rng[1], ymax = y_rng[1] + cases_scaled * diff(y_rng)), fill = sprint$red, alpha = 0.45, na.rm = TRUE) +
  geom_line(aes(y = workplaces_7d), colour = sprint$blue, linewidth = 0.8, na.rm = TRUE) +
  geom_vline(xintercept = paper_end, colour = "white", linetype = "dashed", linewidth = 0.3) +
  facet_wrap(~country, ncol = 4) +
  scale_x_date(breaks = as.Date(c("2020-07-01", "2021-01-01", "2021-07-01", "2022-01-01")),
               date_labels = "%b\n%Y", expand = c(0.01, 0)) +
  labs(title = "Workplace mobility against case waves, eight countries",
       subtitle = str_wrap("Blue line: workplace mobility (% change from baseline, 7-day average). Red area: cases per 100,000, rescaled to each country's own peak. Dashed line: end of the paper window.", 120),
       x = NULL, y = "Workplaces, % change from baseline",
       caption = "Source: Google Community Mobility Reports; JHU CSSE")
save_fig(p_ex, "03h_example_countries", 13, 6.5)

# ---- 8. Table as a picture: median mobility by continent and period -------------
tile_df <- cont_tbl %>%
  mutate(category = cat_label(variable),
         win = factor(window, levels = levels(panel_eda$window),
                      labels = c("Paper window", "Validation", "Extension (to Oct 2022)")),
         continent = fct_rev(factor(continent, levels = continent_levels)))
p_tile <- ggplot(tile_df, aes(category, continent, fill = median)) +
  geom_tile(colour = sprint$bg, linewidth = 0.8) +
  geom_text(aes(label = round(median)), size = 3.3, colour = "white") +
  facet_wrap(~win, nrow = 1) +
  scale_fill_div(name = "Median % change from baseline", limits = c(-40, 40)) +
  labs(title = "Median mobility by continent, category and period",
       subtitle = "Pools every country-day. Numbers are the median % change from the pre-pandemic baseline.",
       x = NULL, y = NULL, caption = "Source: Google Community Mobility Reports") +
  theme(panel.grid = element_blank(), axis.text.x = element_text(angle = 35, hjust = 1),
        legend.position = "bottom", legend.key.width = unit(3, "cm"), legend.key.height = unit(0.28, "cm"))
save_fig(p_tile, "03i_median_mobility_tiles", 14, 5.5)

message("03 done: tables in ", tab_dir, ", figures in ", fig_dir)
