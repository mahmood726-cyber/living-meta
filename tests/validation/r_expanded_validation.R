# Expanded Validation Script for Living Meta-Analysis
# Generates reference values for: trim-fill, leave-one-out, Peters, rare events, large k

library(metafor)
library(jsonlite)

# ============================================================================
# BCG Dataset (already tested)
# ============================================================================
bcg <- escalc(measure="OR", ai=tpos, bi=tneg, ci=cpos, di=cneg,
              data=dat.bcg, append=TRUE)

# Trim and Fill
bcg_dl <- rma(yi, vi, data=bcg, method="DL")
bcg_trimfill <- trimfill(bcg_dl)

# Leave-one-out
bcg_loo <- leave1out(bcg_dl)

# Peters test (for OR)
bcg_peters <- regtest(bcg_dl, predictor="ni", model="lm")

# ============================================================================
# Rare Events Dataset (sparse data with zero cells)
# ============================================================================
# Create dataset with rare events
rare_data <- data.frame(
  study = 1:8,
  ai = c(0, 1, 0, 2, 1, 0, 3, 1),   # Treatment events
  bi = c(20, 25, 30, 28, 22, 35, 40, 18),  # Treatment non-events
  ci = c(2, 3, 1, 4, 2, 3, 5, 2),   # Control events
  di = c(18, 22, 29, 24, 20, 32, 35, 16)   # Control non-events
)

# Using 0.5 continuity correction (default)
rare_or <- escalc(measure="OR", ai=ai, bi=bi, ci=ci, di=di,
                  data=rare_data, add=0.5, to="only0")

rare_dl <- rma(yi, vi, data=rare_or, method="DL")
rare_pm <- rma(yi, vi, data=rare_or, method="PM")

# ============================================================================
# Continuous Outcomes (SMD)
# ============================================================================
# Create SMD dataset
smd_data <- data.frame(
  study = 1:10,
  m1i = c(12.5, 11.8, 13.2, 10.5, 14.1, 11.2, 12.8, 13.5, 10.8, 12.1),
  sd1i = c(3.2, 2.8, 3.5, 2.5, 4.0, 3.1, 2.9, 3.3, 2.7, 3.0),
  n1i = c(25, 30, 22, 35, 28, 40, 32, 26, 38, 33),
  m2i = c(10.2, 9.5, 11.0, 8.8, 12.0, 9.0, 10.5, 11.2, 8.5, 10.0),
  sd2i = c(3.0, 2.5, 3.2, 2.8, 3.8, 2.9, 3.0, 3.1, 2.5, 2.8),
  n2i = c(23, 28, 24, 32, 30, 38, 35, 28, 36, 30)
)

smd_es <- escalc(measure="SMD", m1i=m1i, sd1i=sd1i, n1i=n1i,
                 m2i=m2i, sd2i=sd2i, n2i=n2i, data=smd_data)

smd_dl <- rma(yi, vi, data=smd_es, method="DL")
smd_reml <- rma(yi, vi, data=smd_es, method="REML")
smd_hksj <- rma(yi, vi, data=smd_es, method="DL", test="knha")

# ============================================================================
# Large k Dataset (50 studies)
# ============================================================================
set.seed(42)
large_k <- data.frame(
  yi = rnorm(50, mean=-0.3, sd=0.5),
  vi = runif(50, 0.02, 0.15)
)

large_dl <- rma(yi, vi, data=large_k, method="DL")
large_reml <- rma(yi, vi, data=large_k, method="REML")
large_hksj <- rma(yi, vi, data=large_k, method="DL", test="knha")
large_egger <- regtest(large_dl)
large_trimfill <- trimfill(large_dl)

# ============================================================================
# Compile Results
# ============================================================================
results <- list(
  # Trim and Fill (BCG)
  bcg_trimfill = list(
    k0 = bcg_trimfill$k0,
    side = bcg_trimfill$side,
    original_estimate = as.numeric(bcg_dl$b),
    adjusted_estimate = as.numeric(bcg_trimfill$b),
    adjusted_se = as.numeric(bcg_trimfill$se)
  ),

  # Leave-one-out (BCG) - first 3 studies
  bcg_loo = list(
    estimates = as.numeric(bcg_loo$estimate[1:3]),
    tau2 = as.numeric(bcg_loo$tau2[1:3]),
    I2 = as.numeric(bcg_loo$I2[1:3])
  ),

  # Peters test (BCG)
  bcg_peters = list(
    intercept = as.numeric(bcg_peters$fit$b[1]),
    se = as.numeric(bcg_peters$fit$se[1]),
    p_value = as.numeric(bcg_peters$pval)
  ),

  # Rare events
  rare_events = list(
    k = nrow(rare_or[!is.na(rare_or$yi),]),
    dl_estimate = as.numeric(rare_dl$b),
    dl_tau2 = as.numeric(rare_dl$tau2),
    dl_I2 = as.numeric(rare_dl$I2),
    pm_tau2 = as.numeric(rare_pm$tau2)
  ),

  # Continuous (SMD)
  smd = list(
    dl_estimate = as.numeric(smd_dl$b),
    dl_tau2 = as.numeric(smd_dl$tau2),
    dl_I2 = as.numeric(smd_dl$I2),
    reml_tau2 = as.numeric(smd_reml$tau2),
    hksj_ci_lower = as.numeric(smd_hksj$ci.lb),
    hksj_ci_upper = as.numeric(smd_hksj$ci.ub)
  ),

  # Large k
  large_k = list(
    k = 50,
    dl_estimate = as.numeric(large_dl$b),
    dl_tau2 = as.numeric(large_dl$tau2),
    dl_I2 = as.numeric(large_dl$I2),
    reml_tau2 = as.numeric(large_reml$tau2),
    hksj_ci_lower = as.numeric(large_hksj$ci.lb),
    hksj_ci_upper = as.numeric(large_hksj$ci.ub),
    egger_intercept = as.numeric(large_egger$fit$b[1]),
    egger_p = as.numeric(large_egger$pval),
    trimfill_k0 = large_trimfill$k0,
    trimfill_estimate = as.numeric(large_trimfill$b)
  ),

  # Raw data for JavaScript testing
  smd_data = lapply(1:nrow(smd_es), function(i) {
    list(
      yi = as.numeric(smd_es$yi[i]),
      vi = as.numeric(smd_es$vi[i]),
      m1 = smd_data$m1i[i], sd1 = smd_data$sd1i[i], n1 = smd_data$n1i[i],
      m2 = smd_data$m2i[i], sd2 = smd_data$sd2i[i], n2 = smd_data$n2i[i]
    )
  }),

  rare_data = lapply(1:nrow(rare_or), function(i) {
    if (!is.na(rare_or$yi[i])) {
      list(
        yi = as.numeric(rare_or$yi[i]),
        vi = as.numeric(rare_or$vi[i]),
        a = rare_data$ai[i], b = rare_data$bi[i],
        c = rare_data$ci[i], d = rare_data$di[i]
      )
    }
  }),

  large_k_data = lapply(1:50, function(i) {
    list(yi = large_k$yi[i], vi = large_k$vi[i])
  })
)

# Filter out NULL entries
results$rare_data <- Filter(Negate(is.null), results$rare_data)

# Write JSON
json_output <- toJSON(results, auto_unbox = TRUE, digits = 6, pretty = TRUE)
writeLines(json_output, "C:/Users/user/living-meta/tests/validation/expanded_reference.json")

cat("Expanded reference data written to expanded_reference.json\n")
cat("\nSummary:\n")
cat("  Trim-fill k0:", results$bcg_trimfill$k0, "\n")
cat("  Rare events k:", results$rare_events$k, "\n")
cat("  SMD DL tau2:", results$smd$dl_tau2, "\n")
cat("  Large k REML tau2:", results$large_k$reml_tau2, "\n")
