# 08_eda_country_table.R
# Country : population : infections. One row per country with its population, reported cases and deaths,
# incidence per 100,000, peak wave and mobility trough, then tables, rankings, scatter plots and maps.
#
# Run from the repo root, after 01_data_import.R.
# Input : outputs/02_eda/panel.rds (via 02_eda_setup.R)
# Output: outputs/02_eda/tables/08_*.csv and outputs/02_eda/figures/08*.png
#
# Totals are the last cumulative JHU count (up to 16 Apr 2022). Countries with no case data
# (or no population in the reference file) keep their row but have missing values.

source("analysis/02_eda/02_eda_setup.R")
set.seed(2026)

# ---- 1. The table -----------------------------------------------------------------
last_or_na <- function(x, f) if (any(!is.na(x))) f(x, na.rm = TRUE) else NA_real_

cty <- panel_eda %>%
  group_by(iso2, country, continent) %>%
  summarise(
    population      = first(population),
    cases_total     = last_or_na(confirmed, max),
    deaths_total    = last_or_na(deaths, max),
    first_case_date = if (any(!is.na(confirmed) & confirmed > 0)) min(date[!is.na(confirmed) & confirmed > 0]) else as.Date(NA),
    peak_7d_per100k = last_or_na(cases_per_100k_7d, max),
    peak_date       = if (any(!is.na(cases_per_100k_7d))) date[which.max(cases_per_100k_7d)] else as.Date(NA),
    workplaces_trough_7d = last_or_na(workplaces_7d[date <= cases_end], min),
    workplaces_median_paper = if (any(!is.na(workplaces[date <= paper_end]))) median(workplaces[date <= paper_end], na.rm = TRUE) else NA_real_,
    .groups = "drop") %>%
  mutate(cases_per_100k  = cases_total  / population * 1e5,
         deaths_per_100k = deaths_total / population * 1e5,
         cfr_pct         = if_else(cases_total > 0, 100 * deaths_total / cases_total, NA_real_),
         pop_share_pct   = 100 * population / sum(population, na.rm = TRUE),
         pop_rank        = rank(-population, ties.method = "min", na.last = "keep"),
         cases_rank      = rank(-cases_total, ties.method = "min", na.last = "keep"),
         per100k_rank    = rank(-cases_per_100k, ties.method = "min", na.last = "keep")) %>%
  arrange(desc(cases_total))

write_csv(cty %>% mutate(across(where(is.numeric), ~ round(.x, 3))),
          file.path(tab_dir, "08_country_population_infections.csv"))

# Continent summary. Incidence is pooled (total cases / total population), so large countries weigh more.
cont <- cty %>% filter(!is.na(cases_total), !is.na(population)) %>%
  group_by(continent) %>%
  summarise(countries = n(), population = sum(population), cases_total = sum(cases_total),
            deaths_total = sum(deaths_total),
            cases_per_100k_pooled = cases_total / population * 1e5,
            deaths_per_100k_pooled = deaths_total / population * 1e5,
            median_country_per_100k = median(cases_per_100k),
            iqr_country_per_100k = IQR(cases_per_100k), .groups = "drop")
world_row <- cty %>% filter(!is.na(cases_total), !is.na(population)) %>%
  summarise(continent = "All countries", countries = n(), population = sum(population),
            cases_total = sum(cases_total), deaths_total = sum(deaths_total),
            cases_per_100k_pooled = cases_total / population * 1e5,
            deaths_per_100k_pooled = deaths_total / population * 1e5,
            median_country_per_100k = median(cases_per_100k), iqr_country_per_100k = IQR(cases_per_100k))
cont_tbl <- bind_rows(mutate(cont, continent = as.character(continent)), world_row) %>%
  mutate(across(where(is.numeric), ~ round(.x, 1)))
write_csv(cont_tbl, file.path(tab_dir, "08_continent_summary.csv"))

cat("\nCountries in the table:", nrow(cty), "| with cases and population:",
    sum(!is.na(cty$cases_total) & !is.na(cty$population)), "\n")
cat("Without case data or population:",
    paste(cty$country[is.na(cty$cases_total) | is.na(cty$population)], collapse = ", "), "\n\n")
print(cont_tbl, width = Inf)
cat("\nTop 10 by total cases:\n")
print(cty %>% slice_head(n = 10) %>%
        select(country, population, cases_total, cases_per_100k, deaths_per_100k), width = Inf)

cty_ok <- cty %>% filter(!is.na(cases_total), !is.na(population), population > 0, cases_total > 0)
sp_pop <- suppressWarnings(cor.test(log10(cty_ok$population), log10(cty_ok$cases_total), method = "spearman", exact = FALSE))
cat("\nSpearman, population vs total cases: rho =", round(unname(sp_pop$estimate), 3), "\n")

# ---- 2. The table as a picture (two rankings) -----------------------------------------
# Columns: key, header, x position, alignment (0 = left, 1 = right).
spec <- tibble(key    = c("Country", "Continent", "pop", "cases", "inc", "dth", "peak"),
               header = c("Country", "Continent", "Population\n(millions)", "Total cases\n(millions)",
                          "Cases\nper 100k", "Deaths\nper 100k", "Peak 7-day avg\nper 100k per day"),
               x      = c(0, 4.6, 10.4, 12.7, 15.0, 17.1, 20.0),
               hjust  = c(0, 0, 1, 1, 1, 1, 1))

table_fig <- function(d, title, subtitle, stub, n_rows = 30) {
  d <- d %>% filter(!is.na(cases_total), !is.na(population)) %>% slice_head(n = n_rows) %>%
    mutate(row = n():1)
  txt <- d %>% transmute(row,
                         Country   = country,
                         Continent = as.character(continent),
                         pop       = sprintf("%.1f", population / 1e6),
                         cases     = sprintf("%.2f", cases_total / 1e6),
                         inc       = scales::comma(round(cases_per_100k)),
                         dth       = scales::comma(round(deaths_per_100k)),
                         peak      = sprintf("%.0f", peak_7d_per100k)) %>%
    pivot_longer(-row, names_to = "key", values_to = "txt") %>%
    left_join(spec, by = "key")
  heat <- d %>% transmute(row, v = cases_per_100k, xmin = spec$x[spec$key == "inc"] - 1.9,
                          xmax = spec$x[spec$key == "inc"] + 0.25)
  zebra <- tibble(row = seq(1, n_rows, by = 2)[seq(1, n_rows, by = 2) <= nrow(d)])
  p <- ggplot() +
    geom_rect(data = zebra, aes(xmin = -0.4, xmax = 20.4, ymin = row - 0.5, ymax = row + 0.5), fill = "#0F0F0F") +
    geom_rect(data = heat, aes(xmin = xmin, xmax = xmax, ymin = row - 0.45, ymax = row + 0.45, fill = v)) +
    geom_text(data = txt, aes(x, row, label = txt, hjust = hjust), size = 3.4, colour = "white") +
    geom_text(data = spec, aes(x, nrow(d) + 1.2, label = header, hjust = hjust), vjust = 0, size = 3.3,
              colour = sprint$muted, fontface = "bold", lineheight = 0.9) +
    scale_fill_gradient(low = "#2A0A12", high = sprint$red, guide = "none") +
    scale_x_continuous(limits = c(-0.4, 20.4), expand = c(0, 0)) +
    scale_y_continuous(limits = c(0.3, nrow(d) + 2.6), expand = c(0, 0)) +
    labs(title = title, subtitle = subtitle,
         caption = "Source: JHU CSSE (cumulative reported cases and deaths to 16 Apr 2022); population from the JHU reference file. Reported counts depend on testing and reporting practices.") +
    theme(axis.text = element_blank(), axis.title = element_blank(), panel.grid = element_blank(),
          axis.ticks = element_blank())
  save_fig(p, stub, 11, 0.3 * nrow(d) + 2.4)
}
table_fig(cty, "The 30 countries with the most reported cases",
          "Population, total cases, and cases and deaths per 100,000 people. Red shading follows cases per 100k.",
          "08a_table_top_total_cases")
table_fig(cty %>% arrange(desc(cases_per_100k)),
          "The 30 countries with the most reported cases per 100,000 people",
          "Same columns, ranked by cases per 100k. Small populations can reach very high rates.",
          "08b_table_top_incidence")

# ---- 3. Population against infections ---------------------------------------------------
# Labels: biggest case totals, highest rates, biggest populations.
lab_ids <- unique(c(head(cty_ok$iso2, 12),
                    head(cty_ok$iso2[order(-cty_ok$cases_per_100k)], 8),
                    head(cty_ok$iso2[order(-cty_ok$population)], 6)))
cty_lab <- cty_ok %>% filter(iso2 %in% lab_ids)
label_layer <- function() {
  if (requireNamespace("ggrepel", quietly = TRUE)) {
    ggrepel::geom_text_repel(data = cty_lab, aes(label = country), colour = "white", size = 3,
                             segment.colour = sprint$faint, segment.size = 0.2,
                             min.segment.length = 0, max.overlaps = Inf, seed = 1, box.padding = 0.35)
  } else {
    geom_text(data = cty_lab, aes(label = country), colour = "white", size = 3, vjust = -0.9, check_overlap = TRUE)
  }
}

rates   <- c(1000, 10000, 30000)
x_max   <- max(cty_ok$population)
y_top   <- max(cty_ok$cases_total)
x_lab   <- pmin(x_max, y_top / (rates / 1e5))        # keep each label inside the plotting area
rate_df <- tibble(rate = rates, x = x_lab, y = x_lab * rates / 1e5,
                  label = paste0(scales::comma(rates), " per 100k"))
p_pc <- ggplot(cty_ok, aes(population, cases_total)) +
  geom_abline(slope = 1, intercept = log10(rates / 1e5), colour = sprint$faint, linetype = "dashed", linewidth = 0.3) +
  geom_text(data = rate_df, aes(x, y, label = label), inherit.aes = FALSE, hjust = 1, vjust = -0.5,
            size = 2.9, colour = sprint$muted) +
  geom_point(aes(colour = continent), size = 2.2, alpha = 0.9) +
  label_layer() +
  scale_x_log10(labels = scales::label_number(scale_cut = scales::cut_short_scale()), expand = expansion(mult = c(0.03, 0.08))) +
  scale_y_log10(labels = scales::label_number(scale_cut = scales::cut_short_scale())) +
  scale_colour_manual(values = continent_cols, name = NULL) +
  labs(title = "Population against reported infections",
       subtitle = paste0("One dot per country, both axes on log scales. Dashed lines: constant rates of reported cases per 100,000 people (Spearman rho = ",
                         sprintf("%.2f", unname(sp_pop$estimate)), ")."),
       x = "Population", y = "Total reported cases",
       caption = "Source: JHU CSSE to 16 Apr 2022. Countries above a dashed line reported more cases per head.") +
  theme(legend.position = "bottom") +
  guides(colour = guide_legend(nrow = 1, override.aes = list(size = 3.5)))
save_fig(p_pc, "08c_population_vs_cases", 11, 7.5)

p_bub <- ggplot(cty_ok, aes(population, cases_per_100k)) +
  geom_point(aes(size = cases_total, colour = continent), alpha = 0.75) +
  label_layer() +
  scale_x_log10(labels = scales::label_number(scale_cut = scales::cut_short_scale()), expand = expansion(mult = c(0.03, 0.08))) +
  scale_y_continuous(labels = scales::comma) +
  scale_size_area(max_size = 16, labels = scales::label_number(scale_cut = scales::cut_short_scale()),
                  breaks = c(1e5, 1e6, 1e7, 3e7), name = "Total cases") +
  scale_colour_manual(values = continent_cols, name = NULL) +
  labs(title = "Country, population and infections in one picture",
       subtitle = "Position: population (log scale) and cases per 100,000. Bubble area: total reported cases. Colour: continent.",
       x = "Population", y = "Reported cases per 100,000",
       caption = "Source: JHU CSSE to 16 Apr 2022.") +
  theme(legend.position = "bottom", legend.box = "vertical") +
  guides(colour = guide_legend(nrow = 1, order = 1, override.aes = list(size = 3.5)),
         size = guide_legend(order = 2, nrow = 1, override.aes = list(colour = "white")))
save_fig(p_bub, "08d_population_incidence_bubbles", 11, 8)

# ---- 4. Rankings --------------------------------------------------------------------------
lolli <- function(d, value, title, subtitle, xlab, stub, n_rows = 30, lab_fun = scales::comma) {
  d <- d %>% filter(!is.na(.data[[value]])) %>% arrange(desc(.data[[value]])) %>% slice_head(n = n_rows) %>%
    mutate(country = fct_rev(fct_inorder(country)), v = .data[[value]])
  p <- ggplot(d, aes(v, country)) +
    geom_segment(aes(x = 0, xend = v, yend = country), colour = sprint$faint, linewidth = 0.4) +
    geom_point(aes(colour = continent), size = 3) +
    geom_text(aes(label = lab_fun(v)), hjust = -0.35, size = 3, colour = "white") +
    scale_x_continuous(expand = expansion(mult = c(0, 0.14)), labels = lab_fun) +
    scale_colour_manual(values = continent_cols, name = NULL, drop = FALSE) +
    labs(title = title, subtitle = subtitle, x = xlab, y = NULL,
         caption = "Source: JHU CSSE to 16 Apr 2022; population from the JHU reference file.") +
    theme(legend.position = "bottom", panel.grid.major.y = element_blank()) +
    guides(colour = guide_legend(nrow = 1, override.aes = list(size = 3.5)))
  save_fig(p, stub, 9, 0.24 * nrow(d) + 2.6)
}
lolli(cty_ok, "cases_per_100k", "Reported cases per 100,000 people: the top 30",
      "Cumulative reported cases divided by population, up to 16 Apr 2022.",
      "Reported cases per 100,000", "08e_ranking_cases_per_100k", lab_fun = scales::comma)
lolli(cty_ok, "deaths_per_100k", "Reported deaths per 100,000 people: the top 30",
      "Cumulative reported deaths divided by population, up to 16 Apr 2022.",
      "Reported deaths per 100,000", "08f_ranking_deaths_per_100k", lab_fun = scales::comma)

# ---- 5. Spread across continents ------------------------------------------------------------
kw <- kruskal.test(cases_per_100k ~ continent, data = droplevels(cty_ok))
p_box <- ggplot(cty_ok, aes(continent, cases_per_100k, fill = continent)) +
  geom_boxplot(alpha = 0.55, colour = "white", outlier.shape = NA, linewidth = 0.3, width = 0.6) +
  geom_jitter(width = 0.14, size = 1.3, colour = "white", alpha = 0.7) +
  scale_fill_manual(values = continent_cols, guide = "none") +
  scale_y_log10(labels = scales::comma) +
  labs(title = "Reported cases per 100,000, by continent",
       subtitle = sprintf("One dot per country, log scale. Kruskal-Wallis test across continents: chi-squared = %.1f, df = %d, p = %s.",
                          unname(kw$statistic), unname(kw$parameter),
                          format.pval(kw$p.value, digits = 2, eps = 1e-4)),
       x = NULL, y = "Reported cases per 100,000 (log scale)",
       caption = "Source: JHU CSSE to 16 Apr 2022. Boxes: median and interquartile range.") +
  theme(panel.grid.major.x = element_blank())
save_fig(p_box, "08g_incidence_by_continent", 10, 6)

# ---- 6. Maps ----------------------------------------------------------------------------------
world <- get_world()
unmatched <- setdiff(cty_ok$iso2, world$iso2)
if (length(unmatched) > 0) message("No map polygon for: ", paste(unmatched, collapse = ", "))
wd <- left_join(world, cty %>% select(iso2, cases_per_100k, population), by = "iso2")

p_map_inc <- ggplot(wd) +
  geom_sf(aes(fill = log10(cases_per_100k)), colour = "black", linewidth = 0.1) +
  scale_fill_gradientn(name = "Reported cases per 100,000 (log scale)",
                       colours = c("#2A0A12", sprint$red_dk, sprint$red, "#FFD6DE"),
                       breaks = log10(c(1000, 10000, 50000)), labels = c("1,000", "10,000", "50,000"),
                       na.value = sprint$na,
                       guide = guide_colourbar(frame.colour = NA, ticks.colour = "white", title.position = "top")) +
  coord_sf(expand = FALSE, datum = NA) +
  labs(title = "Reported COVID-19 cases per 100,000 people",
       subtitle = "Cumulative reported cases to 16 Apr 2022 divided by population. Dark grey = no data.",
       caption = "Source: JHU CSSE. Reported cases depend on testing and reporting practices.") +
  theme_map_dark()
save_fig(p_map_inc, "08h_map_cases_per_100k", 12, 6.8)

p_map_pop <- ggplot(wd) +
  geom_sf(aes(fill = log10(population)), colour = "black", linewidth = 0.1) +
  scale_fill_gradientn(name = "Population (log scale)",
                       colours = c("#07162B", sprint$blue_dk, sprint$blue, "#DDEEFF"),
                       breaks = log10(c(1e6, 1e7, 1e8, 1e9)), labels = c("1 million", "10 million", "100 million", "1 billion"),
                       na.value = sprint$na,
                       guide = guide_colourbar(frame.colour = NA, ticks.colour = "white", title.position = "top")) +
  coord_sf(expand = FALSE, datum = NA) +
  labs(title = "Population",
       subtitle = "Countries with data in the panel. Dark grey = not in the panel or no population in the reference file.",
       caption = "Source: JHU reference file.") +
  theme_map_dark()
save_fig(p_map_pop, "08i_map_population", 12, 6.8)

# ---- 7. Mobility and infections ------------------------------------------------------------------
mc <- cty_ok %>% filter(!is.na(workplaces_trough_7d))
sp_mob <- suppressWarnings(cor.test(mc$workplaces_trough_7d, mc$cases_per_100k, method = "spearman", exact = FALSE))
p_mob <- ggplot(mc, aes(workplaces_trough_7d, cases_per_100k)) +
  geom_smooth(method = "lm", formula = y ~ x, se = FALSE, colour = sprint$red, linewidth = 0.7) +
  geom_point(aes(colour = continent), size = 2.2, alpha = 0.9) +
  label_layer() +
  scale_y_log10(labels = scales::comma) +
  scale_colour_manual(values = continent_cols, name = NULL) +
  labs(title = "Deepest workplace mobility drop against total reported infections",
       subtitle = sprintf("One dot per country. Spearman rho = %.2f (p = %s). Red line: straight-line fit on the log scale, only to guide the eye.",
                          unname(sp_mob$estimate), format.pval(sp_mob$p.value, digits = 2, eps = 1e-4)),
       x = "Lowest 7-day average of workplace mobility, % change from baseline",
       y = "Reported cases per 100,000 (log scale)",
       caption = "Between-country comparison only: it does not say that mobility caused or prevented cases. Sources: Google Community Mobility Reports; JHU CSSE.") +
  theme(legend.position = "bottom") +
  guides(colour = guide_legend(nrow = 1, override.aes = list(size = 3.5)))
save_fig(p_mob, "08j_mobility_trough_vs_incidence", 11, 7)

# ---- 8. Cumulative infections over time -------------------------------------------------------------
cum <- panel_eda %>%
  filter(has_cases, date <= cases_end, !is.na(confirmed), !is.na(population)) %>%
  mutate(cum_per_100k = confirmed / population * 1e5)
cum_med <- cum %>% group_by(continent, date) %>% summarise(med = median(cum_per_100k), .groups = "drop")
p_cum <- ggplot() +
  geom_line(data = cum, aes(date, cum_per_100k, group = iso2), colour = sprint$red_lt, alpha = 0.3, linewidth = 0.3) +
  geom_line(data = cum_med, aes(date, med), colour = sprint$red, linewidth = 1) +
  facet_wrap(~continent, ncol = 3) +
  scale_y_continuous(trans = pseudo_log_trans(sigma = 10, base = 10),
                     breaks = c(0, 100, 1000, 10000, 50000), labels = scales::comma) +
  scale_x_months() +
  labs(title = "Cumulative reported cases per 100,000 over time",
       subtitle = "Each thin line is a country; the bold line is the continent median. Log-like scale.",
       x = NULL, y = "Cumulative cases per 100,000",
       caption = "Source: JHU CSSE.")
save_fig(p_cum, "08k_cumulative_cases_by_continent", 13, 7)

message("08 done: tables in ", tab_dir, ", figures in ", fig_dir)
