# =============================================================================
# Data Sprint: Replication of Sulyok & Walker (2020)
# "Community movement and COVID-19: a global study using Google's Community
#  Mobility Reports", Epidemiology & Infection 148, e284.
#
# Script 02: Replicate every published result, two ways
#   AS PUBLISHED : the paper's sample and settings, reproduced as closely as the
#                  authors' public code allows
#   CORRECTED    : the same analysis with the coding problems fixed
#
# Paper window: 15 Feb to 19 Jun 2020 (training), 20 Jun to 8 Sep 2020 (validation)
#
# INPUT   data/processed/2026-10-24-panel-clean.csv   (from script 01)
# OUTPUTS outputs/01_replication/tables/2026-10-24-02-*.csv
#         outputs/01_replication/figures/2026-10-24-02-*.png
#         outputs/01_replication/2026-10-24-02-replication-log.txt
#
# RUN TIME: about 5 to 15 minutes (the mixed-effects GAMs are the slow part)
#
# SOURCES / HELP USED
#   - Method and published numbers: Sulyok M, Walker M (2020). Epidemiol Infect
#     148:e284. https://doi.org/10.1017/S0950268820002757
#   - Original authors' R code, read to reproduce their exact settings:
#     https://github.com/msulyok/GoogleMobilityDataCOVID
#     (files COVIDmobilityfinal1309withvalidationtweedie.Rmd and
#      CMRfinalcorrectedjustmodelling0611.Rmd). Model formulas, crossbasis
#     settings, Tweedie power estimation and validation steps follow these files.
#   - Diebold-Mariano test written from Diebold & Mariano (1995) with the
#     Harvey, Leybourne & Newbold (1997) small-sample correction, matching the
#     defaults of forecast::dm.test (Hyndman et al.).
#   - Map shapes: Natural Earth via the rnaturalearth package.
# =============================================================================

suppressPackageStartupMessages({
  library(data.table)
  library(ggplot2)
  library(mgcv)
  library(dlnm)
  library(mclust)
  library(dunn.test)
  library(sf)
  library(rnaturalearth)
})
set.seed(2020)  # same seed as the authors

# ---- 0. Paths and log -------------------------------------------------------
# Run from the repo root, or set DS_ROOT to the repo folder.
root <- Sys.getenv("DS_ROOT", ".")
dir_out <- file.path(root, "outputs", "01_replication")
dir_tab <- file.path(dir_out, "tables");  dir.create(dir_tab, showWarnings = FALSE)
dir_fig <- file.path(dir_out, "figures"); dir.create(dir_fig, showWarnings = FALSE)
tab <- function(name) file.path(dir_tab, paste0("2026-10-24-02-", name, ".csv"))
fig <- function(name) file.path(dir_fig, paste0("2026-10-24-02-", name, ".png"))

log_file <- file.path(dir_out, "2026-10-24-02-replication-log.txt")
cat("REPLICATION LOG  |  run:", format(Sys.time()), "\n\n", file = log_file)
logit <- function(...) {
  msg <- paste0(...)
  cat(msg, "\n"); cat(msg, "\n", file = log_file, append = TRUE)
}
t0 <- Sys.time()

# ---- 1. Data and the two samples --------------------------------------------
panel <- fread(file.path(root, "data", "processed", "2026-10-24-panel-clean.csv"), na.strings = "")
panel[, date := as.IDate(date)]

TRAIN_END <- as.IDate("2020-06-19")
VALID_END <- as.IDate("2020-09-08")
mob   <- c("retail", "grocery", "parks", "transit", "workplaces", "residential")
mob_label <- c(retail = "Retail & recreation", grocery = "Grocery & pharmacy",
               parks = "Parks", transit = "Transit stations",
               workplaces = "Workplaces", residential = "Residential")

# Countries the paper lost because it joined datasets on country NAME:
# Google and JHU spell these differently (fixed in script 01 by joining on ISO code)
name_mismatch <- c("HK", "AW", "RE", "CV", "CI", "MM", "KR", "TW", "BS")
# The paper's continent tables also have no North America: the geonames
# continent code for North America is the text "NA", which R reads as missing.
countries <- unique(panel[, .(iso2, country, continent)])
countries[, in_paper_models := !(iso2 %in% name_mismatch)]
countries[, in_paper_tables := in_paper_models & continent != "North America"]

logit("1. SAMPLES")
logit("   Corrected sample              : ", nrow(countries), " countries (all continents)")
logit("   As-published, models          : ", countries[in_paper_models == TRUE, .N],
      " countries (name-mismatch countries removed). Paper: not reported")
logit("   As-published, continent tables: ", countries[in_paper_tables == TRUE, .N],
      " countries (also no North America). Paper: 106")
logit("   The remaining gap of 3 is not explained by the public code; most likely")
logit("   countries lost inside the authors' tryCatch loop.")

# =============================================================================
# PART A. CROSS-CORRELATIONS (paper Figures 1-2, Tables 1-2)
# =============================================================================
# For each country and mobility category: Kendall's tau between mobility on
# day t and daily cases on day t - lag, for lag = -28..+28.
# Lag convention (same as the paper's Hmisc::Lag): NEGATIVE lag = mobility
# today is compared with cases |lag| days LATER, i.e. mobility leads cases.
# Kept per country: the lag with the largest |tau|, and the signed tau there.
LAGS <- -28:28
lag_vec <- function(y, l) {
  n <- length(y)
  if (l >= 0) c(rep(NA, l), y[seq_len(n - l)]) else c(y[(1 - l):n], rep(NA, -l))
}
xcorr_one <- function(x, y) {
  taus <- vapply(LAGS, function(l) {
    yl <- lag_vec(y, l); ok <- !is.na(x) & !is.na(yl)
    if (sum(ok) < 10 || sd(x[ok]) == 0 || sd(yl[ok]) == 0) return(NA_real_)
    cor(x[ok], yl[ok], method = "kendall")
  }, numeric(1))
  if (all(is.na(taus))) return(list(tau = NA_real_, lag = NA_integer_))
  i <- which.max(abs(taus))
  list(tau = taus[i], lag = LAGS[i])
}

cc_data <- panel[date <= TRAIN_END][order(iso2, date)]
logit("\nA. CROSS-CORRELATIONS")
logit("   Window ", min(cc_data$date), " to ", max(cc_data$date),
      ". Outcome: daily cases, negatives set to 0 (paper's rule). Lags -28..+28.")

xc <- cc_data[, {
  out <- lapply(mob, function(v) xcorr_one(get(v), new_paper))
  c(setNames(lapply(out, `[[`, "tau"), paste0("tau_", mob)),
    setNames(lapply(out, `[[`, "lag"), paste0("lag_", mob)))
}, by = iso2]
xc <- merge(countries, xc, by = "iso2")
n_drop <- xc[!complete.cases(xc[, c(paste0("tau_", mob), paste0("lag_", mob)), with = FALSE]), .N]
logit("   Computed for ", nrow(xc), " countries; ", n_drop,
      " have at least one category with too little variation (kept, NA for that category).")
fwrite(xc, tab("xcorr-by-country"))

# Edge solutions: lag at the very edge of the search window (|lag| >= 27)
edge <- xc[, lapply(.SD, function(l) mean(abs(l) >= 27, na.rm = TRUE)),
           .SDcols = paste0("lag_", mob)]
logit("   Share of countries whose best lag sits at the search-window edge (|lag| >= 27 days):")
for (v in mob) logit(sprintf("     %-12s %4.0f%%", v, 100 * edge[[paste0("lag_", v)]]))
logit("   If the best lag were spread evenly, only 4 of 57 lags (7%) would be edge lags.")
logit("   A large share at the edge suggests the 'best' lag is picked up by the")
logit("   common trend in both series, not by a real delayed effect.")

# ---- A2. Continent tables (Tables 1-2) --------------------------------------
med_iqr <- function(x) {
  q <- quantile(x, c(.25, .5, .75), na.rm = TRUE)
  sprintf("%.2f (%.2f to %.2f)", q[2], q[1], q[3])
}
continent_table <- function(d, prefix) {
  conts <- sort(unique(d$continent))
  rows <- lapply(mob, function(v) {
    col <- paste0(prefix, v)
    x <- d[[col]]; g <- d$continent
    kw <- kruskal.test(x ~ factor(g))
    c(list(variable = mob_label[[v]]),
      setNames(lapply(conts, function(k) med_iqr(x[g == k])), conts),
      list(kruskal_wallis_p = signif(kw$p.value, 3)))
  })
  n_row <- c(list(variable = "Number of countries"),
             setNames(lapply(conts, function(k) as.character(sum(d$continent == k))), conts),
             list(kruskal_wallis_p = NA))
  rbindlist(c(list(n_row), rows), fill = TRUE)
}

for (s in c("as_published", "corrected")) {
  d <- if (s == "as_published") xc[in_paper_tables == TRUE] else xc
  fwrite(continent_table(d, "tau_"), tab(paste0("table1-tau-by-continent-", s)))
  fwrite(continent_table(d, "lag_"), tab(paste0("table2-lag-by-continent-", s)))
}

# Dunn post-hoc tests, Holm correction (corrected sample)
dunn_all <- rbindlist(lapply(c(paste0("tau_", mob), paste0("lag_", mob)), function(col) {
  ok <- !is.na(xc[[col]])
  invisible(capture.output(suppressMessages(
    r <- dunn.test(xc[[col]][ok], xc$continent[ok], method = "holm", kw = FALSE,
                   table = FALSE, list = FALSE, altp = TRUE))))
  data.table(variable = col, comparison = r$comparisons, z = round(r$Z, 3),
             p_adjusted = signif(r$altP.adjusted, 3))
}))
dunn_all[, significant_5pct := p_adjusted < 0.05]
fwrite(dunn_all, tab("dunn-pairwise-corrected"))

logit("\n   Continent medians of tau, corrected sample (paper Table 1):")
t1 <- continent_table(xc, "tau_")
for (i in seq_len(nrow(t1))) logit("     ", paste(unlist(t1[i]), collapse = " | "))
logit("   Kruskal-Wallis significant (p < 0.05) for ",
      sum(t1$kruskal_wallis_p < 0.05, na.rm = TRUE), " of 6 tau variables and ",
      sum(continent_table(xc, "lag_")$kruskal_wallis_p < 0.05, na.rm = TRUE),
      " of 6 lag variables. Paper: 'significant differences for all six parameters'.")
logit("   Dunn pairs significant after Holm correction: ",
      dunn_all[significant_5pct == TRUE, .N], " of ", nrow(dunn_all))

# ---- A3. Model-based clustering ---------------------------------------------
# Paper: mclust Gaussian mixtures on scaled tau + lag values, BIC picks the model.
clus_vars <- c(paste0("tau_", mob), paste0("lag_", mob))
run_clusters <- function(d, label) {
  d <- d[complete.cases(d[, ..clus_vars])]
  m <- Mclust(scale(d[, ..clus_vars]), G = 1:9, verbose = FALSE)
  d[, cluster := m$classification]
  logit("   ", label, ": ", nrow(d), " countries -> ", m$G, " clusters (model ",
        m$modelName, "). Paper: 4 clusters.")
  prof <- d[, c(list(n_countries = .N,
                     examples = paste(head(country[order(-abs(tau_retail))], 6), collapse = ", ")),
                lapply(.SD, function(x) round(median(x), 2))),
            by = cluster, .SDcols = clus_vars][order(cluster)]
  list(members = d[, .(iso2, country, continent, cluster)], profile = prof)
}
logit("\n   Model-based clustering (mclust):")
cl_pub <- run_clusters(xc[in_paper_tables == TRUE], "As published")
cl_cor <- run_clusters(xc, "Corrected   ")
fwrite(cl_cor$members, tab("clusters-members-corrected"))
fwrite(cl_cor$profile, tab("clusters-profile-corrected"))
fwrite(cl_pub$profile, tab("clusters-profile-as-published"))

# ---- A4. Maps (paper Figures 1-2) -------------------------------------------
world <- ne_countries(scale = "medium", returnclass = "sf")
world <- world[world$admin != "Antarctica", c("iso_a2_eh", "geometry")]
names(world)[1] <- "iso2"   # iso_a2_eh fixes France/Norway, which iso_a2 codes as -99

long <- melt(xc, id.vars = c("iso2", "country", "continent"),
             measure.vars = patterns(tau = "^tau_", lag = "^lag_"),
             variable.name = "category")
long[, category := factor(mob_label[as.integer(category)], levels = mob_label)]

map_plot <- function(value, title, legend, limits) {
  grid <- CJ(iso2 = world$iso2, category = factor(mob_label, levels = mob_label))
  g <- merge(grid, long[, c("iso2", "category", value), with = FALSE],
             by = c("iso2", "category"), all.x = TRUE)
  g <- merge(world, g, by = "iso2")
  ggplot(g) +
    geom_sf(aes(fill = .data[[value]]), colour = "white", linewidth = 0.05) +
    facet_wrap(~category, ncol = 2) +
    scale_fill_distiller(palette = "RdBu", direction = 1, limits = limits,
                         na.value = "grey88", name = legend) +
    coord_sf(expand = FALSE) +
    labs(title = title,
         caption = "Grey: no Google mobility data. Data: Google CMR, JHU CSSE via datasets/covid-19.") +
    theme_void(base_size = 11) +
    theme(legend.position = "bottom", legend.key.width = unit(1.6, "cm"),
          plot.title = element_text(face = "bold", margin = margin(b = 12)),
          plot.margin = margin(10, 10, 10, 10),
          strip.text = element_text(face = "bold", margin = margin(b = 3)),
          plot.background = element_rect(fill = "white", colour = NA))
}
ggsave(fig("fig1-max-tau-map"),
       map_plot("tau", "Strongest Kendall's tau between mobility and daily cases, 15 Feb to 19 Jun 2020",
                "Kendall's tau", c(-1, 1)), width = 11, height = 9, dpi = 200)
ggsave(fig("fig2-best-lag-map"),
       map_plot("lag", "Lag (days) at the strongest correlation. Negative = mobility moves first",
                "Lag in days", c(-28, 28)), width = 11, height = 9, dpi = 200)

# Box plots by continent (the paper mentions these as supplementary)
ggsave(fig("boxplot-tau-by-continent"),
  ggplot(long, aes(continent, tau)) +
    geom_hline(yintercept = 0, colour = "grey60") +
    geom_boxplot(outlier.shape = NA, fill = "grey92") +
    geom_jitter(width = 0.15, size = 0.8, alpha = 0.6) +
    facet_wrap(~category, ncol = 3) +
    labs(x = NULL, y = "Kendall's tau at best lag",
         title = "Strongest correlation by continent (corrected sample, 134 countries)") +
    theme_minimal(base_size = 11) +
    theme(axis.text.x = element_text(angle = 35, hjust = 1),
          plot.background = element_rect(fill = "white", colour = NA)),
  width = 11, height = 7, dpi = 200)
logit("\n   Figures saved: fig1-max-tau-map, fig2-best-lag-map, boxplot-tau-by-continent")

# =============================================================================
# PART B. MODELS (paper Table 3, BIC comparison, validation)
# =============================================================================
# Paper data step: national rows, negatives set to 0, rows with ANY missing
# mobility value dropped (na.omit over all six categories, parks included).
md <- panel[date <= VALID_END,
            .(iso2, date, num_date, new = new_paper, retail, grocery, parks,
              transit, workplaces, residential)]
md <- na.omit(md)[order(iso2, date)]
md[, iso2 := factor(iso2)]

RMSE <- function(pred, obs) sqrt(mean((pred - obs)^2))

# Diebold-Mariano test, squared-error loss, horizon 1, two-sided, with the
# Harvey-Leybourne-Newbold correction (same as forecast::dm.test defaults)
dm_test <- function(e1, e2, h = 1, power = 2) {
  d <- abs(e1)^power - abs(e2)^power
  n <- length(d)
  gam0 <- acf(d, lag.max = h - 1, type = "covariance", plot = FALSE)$acf[, , 1]
  stat <- mean(d) / sqrt(sum(c(gam0[1], 2 * gam0[-1])) / n)
  stat <- stat * sqrt((n + 1 - 2 * h + h * (h - 1) / n) / n)
  c(statistic = stat, p_value = 2 * pt(-abs(stat), df = n - 1))
}

# Extracts the rows the paper reports in Table 3: the fixed-effect (linear)
# part of each smooth from the lme fit, plus the random-intercept SD.
table3_rows <- function(fit) {
  tt <- summary(fit$lme)$tTable
  tt <- tt[grepl("Fx1$", rownames(tt)), , drop = FALSE]
  out <- data.table(term = sub("^Xs\\((.*)\\)Fx1$", "\\1", rownames(tt)),
                    estimate = round(tt[, "Value"], 2),
                    std_error = round(tt[, "Std.Error"], 2),
                    p_value = signif(tt[, "p-value"], 3))
  re_sd <- as.numeric(VarCorr(fit$lme)["(Intercept)", "StdDev"])
  rbind(out, data.table(term = "SD of random intercept", estimate = round(re_sd, 3),
                        std_error = NA, p_value = NA))
}

cb_args <- list(lag = 14, argvar = list(fun = "bs"), arglag = list(df = 5))
make_cb <- function(d) {
  lapply(setNames(c("grocery", "retail", "transit", "workplaces", "residential"),
                  c("cb1", "cb2", "cb4", "cb5", "cb6")),
         function(v) do.call(crossbasis, c(list(d[[v]], group = d$iso2), cb_args)))
}

# ---- B1. AS PUBLISHED --------------------------------------------------------
# Reproduces CMRfinalcorrectedjustmodelling0611.Rmd step by step, including:
#   (a) s(workplaces + residential): mgcv keeps only the first variable, so this
#       is s(workplaces) and residential is silently dropped (expect a warning)
#   (b) BIC taken from the PQL fit (gamm()$lme)
#   (c) validation lag terms rebuilt on the validation data alone, so the first
#       14 validation days per country are lost; predictions ignore country effects
logit("\nB. MODELS")
logit("   B1. AS PUBLISHED (authors' code reproduced)")
dp <- md[!(iso2 %in% name_mismatch)]; dp[, iso2 := droplevels(iso2)]
datat <- dp[date <= TRAIN_END]; datav <- dp[date > TRAIN_END]
logit("   Training rows ", nrow(datat), " (", uniqueN(datat$iso2), " countries); validation rows ",
      nrow(datav))

cbs <- make_cb(datat); invisible(list2env(cbs, environment()))
datam <- datat[, .SD[-(1:14)], by = iso2]

p_fit <- gam(new ~ s(num_date) + s(iso2, bs = "re"), data = datam, family = tw())
tw_p <- round(p_fit$family$getTheta(TRUE), 3)
logit("   Tweedie power estimated: ", tw_p, "  (paper's code: 1.656)")

fit1 <- gamm(new ~ s(num_date), random = list(iso2 = ~1), data = datam,
             family = Tweedie(p = tw_p), verbosePQL = FALSE)
fit2 <- gamm(new ~ s(num_date) + s(retail) + s(grocery) + s(transit) +
               s(workplaces + residential),
             random = list(iso2 = ~1), data = datam,
             family = Tweedie(p = tw_p), verbosePQL = FALSE)
fitcb <- gamm(new ~ s(num_date) + cb1 + cb2 + cb4 + cb5 + cb6,
              random = list(iso2 = ~1), data = datat,
              family = Tweedie(p = tw_p), verbosePQL = FALSE)
logit("   Models fitted (", round(difftime(Sys.time(), t0, units = "mins"), 1), " min so far)")

bic_pub <- data.table(model = c("Date only", "Date + contemporaneous mobility",
                                "Date + distributed-lag mobility"),
                      bic_paper = c(79802.47, 79096.29, 80286.14),
                      bic_replication = round(c(BIC(fit1$lme), BIC(fit2$lme), BIC(fitcb$lme)), 2))

t3_pub <- table3_rows(fit2)

# Validation exactly as in the authors' code
cbs_v <- make_cb(datav); invisible(list2env(cbs_v, environment()))
dataval <- datav[, .SD[-(1:14)], by = iso2]
pred1  <- predict.gam(fit1$gam, dataval, type = "response")
pred2  <- predict.gam(fit2$gam, dataval, type = "response")
predcb <- predict.gam(fitcb$gam, datav, type = "response")
predcb <- predcb[!is.na(predcb)]
stopifnot(length(predcb) == nrow(dataval))
e1 <- pred1 - dataval$new; e2 <- pred2 - dataval$new; ecb <- predcb - dataval$new

val_pub <- data.table(model = bic_pub$model,
                      rmse_paper = c(6840.16, 6794.99, 6690.44),
                      rmse_replication = round(c(RMSE(pred1, dataval$new), RMSE(pred2, dataval$new),
                                                 RMSE(predcb, dataval$new)), 2))
dm_pub <- rbind(
  data.table(comparison = "Date only vs contemporaneous", t(dm_test(e1, e2))),
  data.table(comparison = "Distributed lag vs contemporaneous", t(dm_test(ecb, e2))),
  data.table(comparison = "Distributed lag vs date only", t(dm_test(ecb, e1))))

# ---- B2. CORRECTED -----------------------------------------------------------
# Changes, one per problem found:
#   (1) all 134 countries (ISO join)
#   (2) residential gets its own smooth. In the paper's code
#       s(workplaces + residential) is read by mgcv as s(workplaces) only
#       (mgcv warns "number of items to replace..."), so residential mobility
#       was silently dropped from the model
#   (3) models fitted by maximum likelihood with gam() and a random-effect
#       smooth for country, so BIC is a real likelihood-based comparison
#   (4) lag terms built on the full, continuous series, so validation days
#       keep their 14 days of lag history; same rows for all three models
#   (5) predictions include each country's random intercept
#   (6) besides pooled RMSE (dominated by the US, Brazil, India), report the
#       median per-country RMSE per million people
logit("\n   B2. CORRECTED")
dc <- copy(md)
dc <- merge(dc, unique(panel[, .(iso2, population)]), by = "iso2")[order(iso2, date)]
cbs_all <- make_cb(dc)            # lag terms on the whole continuous series
keep <- complete.cases(sapply(cbs_all, function(m) m[, 1]))  # drops first 14 days per country
# mgcv accepts matrix columns in a data.frame, so the lag bases travel with the rows
dc <- as.data.frame(dc)
dc$iso2 <- factor(dc$iso2)  # s(iso2, bs = "re") needs a factor
for (nm in names(cbs_all)) dc[[nm]] <- unclass(cbs_all[[nm]])[, , drop = FALSE]
dc <- dc[keep, ]
ct <- dc[dc$date <= TRAIN_END, ]; cv <- dc[dc$date > TRAIN_END, ]
logit("   Training rows ", nrow(ct), " (", length(unique(ct$iso2)), " countries); validation rows ",
      nrow(cv), " (same rows for all three models)")

tw_fix <- Tweedie(p = tw_p)       # one power for all models so BICs are comparable
g1 <- gam(new ~ s(num_date) + s(iso2, bs = "re"), data = ct, family = tw_fix, method = "ML")
g2 <- gam(new ~ s(num_date) + s(retail) + s(grocery) + s(transit) + s(workplaces) +
            s(residential) + s(iso2, bs = "re"), data = ct, family = tw_fix, method = "ML")
g3 <- gam(new ~ s(num_date) + cb1 + cb2 + cb4 + cb5 + cb6 + s(iso2, bs = "re"),
          data = ct, family = tw_fix, method = "ML")

bic_cor <- data.table(model = bic_pub$model, bic_corrected = round(sapply(list(g1, g2, g3), BIC), 2))

pc <- lapply(list(g1, g2, g3), function(m) predict(m, cv, type = "response"))
ec <- lapply(pc, function(p) p - cv$new)
val_cor <- data.table(model = bic_pub$model,
                      rmse_corrected = round(sapply(pc, RMSE, obs = cv$new), 2),
                      median_country_rmse_per_million = round(sapply(pc, function(p) {
                        tmp <- data.table(iso2 = cv$iso2, new = cv$new, population = cv$population, p = p)
                        median(tmp[, 1e6 * sqrt(mean((p - new)^2)) / population[1], by = iso2]$V1)
                      }), 2))
dm_cor <- rbind(
  data.table(comparison = "Date only vs contemporaneous", t(dm_test(ec[[1]], ec[[2]]))),
  data.table(comparison = "Distributed lag vs contemporaneous", t(dm_test(ec[[3]], ec[[2]]))),
  data.table(comparison = "Distributed lag vs date only", t(dm_test(ec[[3]], ec[[1]]))))

# Corrected Table 3: the honest summary of a smooth is its effective degrees of
# freedom and overall significance, not the linear part of its basis
st <- summary(g2)$s.table
t3_cor <- data.table(term = rownames(st), edf = round(st[, "edf"], 2),
                     F = round(st[, "F"], 2), p_value = signif(st[, "p-value"], 3))

# ---- B3. Save and log --------------------------------------------------------
fwrite(merge(bic_pub, bic_cor, by = "model", sort = FALSE), tab("model-bic"))
fwrite(t3_pub, tab("table3-as-published"))
fwrite(t3_cor, tab("table3-corrected"))
fwrite(merge(val_pub, val_cor, by = "model", sort = FALSE), tab("validation-rmse"))
fwrite(rbind(cbind(version = "as_published", dm_pub), cbind(version = "corrected", dm_cor)),
       tab("diebold-mariano"))

logit("   BIC (lower is better):")
bb <- merge(bic_pub, bic_cor, by = "model", sort = FALSE)
for (i in 1:3) logit(sprintf("     %-34s paper %9.2f | replication %9.2f | corrected %9.2f",
                             bb$model[i], bb$bic_paper[i], bb$bic_replication[i], bb$bic_corrected[i]))
logit("   Validation RMSE, cases per day (lower is better):")
vv <- merge(val_pub, val_cor, by = "model", sort = FALSE)
for (i in 1:3) logit(sprintf("     %-34s paper %8.2f | replication %8.2f | corrected %8.2f | per-million median %6.2f",
                             vv$model[i], vv$rmse_paper[i], vv$rmse_replication[i],
                             vv$rmse_corrected[i], vv$median_country_rmse_per_million[i]))
logit("   Table 3 as published (replication):")
for (i in seq_len(nrow(t3_pub))) logit(sprintf("     %-28s %8.2f  SE %6.2f  p %s",
                                               t3_pub$term[i], t3_pub$estimate[i],
                                               t3_pub$std_error[i], t3_pub$p_value[i]))
logit("   Diebold-Mariano p-values, as published: ", paste(signif(dm_pub$p_value, 3), collapse = ", "),
      " | corrected: ", paste(signif(dm_cor$p_value, 3), collapse = ", "))

# ---- C. Headline comparison table for the deck ------------------------------

headline <- rbind(
  data.table(item = "Countries in continent tables", paper = "106",
             replication = as.character(countries[in_paper_tables == TRUE, .N]),
             corrected = as.character(nrow(countries))),
  data.table(item = "North America included", paper = "No", replication = "No", corrected = "Yes"),
  data.table(item = "Clusters found", paper = "4",
             replication = as.character(max(cl_pub$profile$cluster)),
             corrected = as.character(max(cl_cor$profile$cluster))),
  data.table(item = paste("Best model by BIC"),
             paper = "Contemporaneous",
             replication = bb$model[which.min(bb$bic_replication)],
             corrected = bb$model[which.min(bb$bic_corrected)]),
  data.table(item = "Best model by validation RMSE",
             paper = "Distributed lag",
             replication = vv$model[which.min(vv$rmse_replication)],
             corrected = vv$model[which.min(vv$rmse_corrected)]),
  data.table(item = "Residential mobility in contemporaneous model",
             paper = "Absent (dropped by s(workplaces + residential))",
             replication = "Absent (same code)", corrected = "Own smooth term"))
fwrite(headline, tab("paper-vs-replication"))

logit("\nC. HEADLINE: paper vs replication vs corrected")
for (i in seq_len(nrow(headline)))
  logit(sprintf("   %-32s | %-24s | %-32s | %s", headline$item[i], headline$paper[i],
                headline$replication[i], headline$corrected[i]))
logit("\nDone in ", round(difftime(Sys.time(), t0, units = "mins"), 1), " minutes.")
