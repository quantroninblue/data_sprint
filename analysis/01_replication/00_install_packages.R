# =============================================================================
# Data Sprint: Replication of Sulyok & Walker (2020)
# Script 00: one-time install of every R package the project uses.
# Run once in a FRESH R session (RStudio: Session > Restart R).
# Safe to re-run: it only installs what is missing.
#
# Written for R 4.3.x on Windows WITHOUT Rtools:
#   - every CRAN package is installed as a pre-built binary (no compiling)
#   - dlnm: the current CRAN release (2.4.10) needs R >= 4.4, so we install
#     2.4.7 (Oct 2021, needs R >= 3.2) from the CRAN archive. It is pure R,
#     so no compiler is needed. The paper itself used a 2020 dlnm release.
#
# SOURCES / HELP USED
#   - dlnm version requirements checked on CRAN and the CRAN GitHub mirror
#     https://github.com/cran/dlnm
# =============================================================================

repos <- "https://cloud.r-project.org"
options(install.packages.compile.from.source = "never")

cran_pkgs <- c(
  "data.table",        # fast data handling
  "zoo",               # rolling 7-day averages
  "countrycode",       # ISO codes -> continents
  "ggplot2",           # charts
  "sf", "rnaturalearth", "rnaturalearthdata",  # world maps
  "mgcv",              # GAMs (paper's model)
  "tsModel",           # dependency of dlnm
  "dreamerr",          # dependency of fixest (binary avoids the stringmagic clash)
  "fixest",            # panel fixed-effects models (improved model)
  "mclust",            # model-based clustering (paper's clusters)
  "dunn.test"          # Dunn post-hoc test (paper's continent comparison)
)
# Note: the Diebold-Mariano test (paper's validation) is coded directly in the
# modelling script, so the 'forecast' package is not needed.

missing <- cran_pkgs[!cran_pkgs %in% rownames(installed.packages())]
if (length(missing)) {
  message("Installing binaries: ", paste(missing, collapse = ", "))
  install.packages(missing, repos = repos, type = "binary")
}

if (!"dlnm" %in% rownames(installed.packages())) {
  message("Installing dlnm 2.4.7 from the CRAN archive")
  install.packages(
    "https://cloud.r-project.org/src/contrib/Archive/dlnm/dlnm_2.4.7.tar.gz",
    repos = NULL, type = "source")
}

# Check every package loads
pkgs <- c(cran_pkgs, "dlnm")
ok <- sapply(pkgs, requireNamespace, quietly = TRUE)
print(ok)
if (all(ok)) message("READY") else message("FAILED: ", paste(pkgs[!ok], collapse = ", "))
