# =============================================================================
# Living Meta-Analysis - Comprehensive Validation Against metafor
# =============================================================================
# This script generates reference values from metafor (R) to validate
# the JavaScript implementation in living-meta
#
# Tests cover:
# - Effect size calculations (OR, RR, RD, MD, SMD)
# - DerSimonian-Laird (DL) estimator
# - Paule-Mandel (PM) estimator
# - REML estimator
# - HKSJ adjustment
# - Prediction intervals
# - I² with confidence intervals
# - Egger's test
# - Peters' test
# - Trim-and-fill
# - Leave-one-out influence analysis
# =============================================================================

library(metafor)
library(jsonlite)

cat("=" , rep("=", 70), "\n", sep="")
cat("LIVING META-ANALYSIS VALIDATION AGAINST METAFOR\n")
cat("metafor version:", as.character(packageVersion("metafor")), "\n")
cat("R version:", R.version.string, "\n")
cat("Date:", format(Sys.time(), "%Y-%m-%d %H:%M:%S"), "\n")
cat("=", rep("=", 70), "\n\n", sep="")

# Initialize results storage
validation_results <- list()
test_count <- 0
pass_count <- 0
fail_count <- 0

# Helper function for tolerance comparison
compare_values <- function(js_val, r_val, tolerance = 0.0001, test_name = "") {
  test_count <<- test_count + 1

  if (is.na(js_val) || is.na(r_val)) {
    if (is.na(js_val) && is.na(r_val)) {
      pass_count <<- pass_count + 1
      return(list(passed = TRUE, diff = NA, message = "Both NA"))
    } else {
      fail_count <<- fail_count + 1
      return(list(passed = FALSE, diff = NA, message = "One value is NA"))
    }
  }

  diff <- abs(js_val - r_val)
  rel_diff <- if (r_val != 0) abs(diff / r_val) else diff
  passed <- diff < tolerance || rel_diff < tolerance

  if (passed) {
    pass_count <<- pass_count + 1
  } else {
    fail_count <<- fail_count + 1
    cat("  FAIL:", test_name, "- JS:", js_val, "R:", r_val, "Diff:", diff, "\n")
  }

  return(list(passed = passed, diff = diff, rel_diff = rel_diff))
}

# =============================================================================
# TEST DATASET 1: BCG Vaccine Trials (Binary - OR)
# =============================================================================
cat("\n", rep("-", 70), "\n", sep="")
cat("TEST 1: BCG Vaccine Trials (Binary Outcomes - Odds Ratio)\n")
cat(rep("-", 70), "\n", sep="")

data(dat.bcg)
bcg <- escalc(measure = "OR", ai = tpos, bi = tneg, ci = cpos, di = cneg,
              data = dat.bcg, append = TRUE)

# DerSimonian-Laird
dl_fit <- rma(yi, vi, data = bcg, method = "DL")
cat("\nDerSimonian-Laird Results:\n")
cat("  Pooled OR (log):", round(dl_fit$beta[1], 6), "\n")
cat("  SE:", round(dl_fit$se, 6), "\n")
cat("  tau²:", round(dl_fit$tau2, 6), "\n")
cat("  I²:", round(dl_fit$I2, 2), "%\n")
cat("  Q:", round(dl_fit$QE, 6), "\n")

validation_results$bcg_dl <- list(
  pooled_log = dl_fit$beta[1],
  se = dl_fit$se,
  tau2 = dl_fit$tau2,
  I2 = dl_fit$I2,
  Q = dl_fit$QE,
  ci_lower = dl_fit$ci.lb,
  ci_upper = dl_fit$ci.ub
)

# Paule-Mandel
pm_fit <- rma(yi, vi, data = bcg, method = "PM")
cat("\nPaule-Mandel Results:\n")
cat("  Pooled OR (log):", round(pm_fit$beta[1], 6), "\n")
cat("  tau²:", round(pm_fit$tau2, 6), "\n")

validation_results$bcg_pm <- list(
  pooled_log = pm_fit$beta[1],
  se = pm_fit$se,
  tau2 = pm_fit$tau2
)

# REML
reml_fit <- rma(yi, vi, data = bcg, method = "REML")
cat("\nREML Results:\n")
cat("  Pooled OR (log):", round(reml_fit$beta[1], 6), "\n")
cat("  tau²:", round(reml_fit$tau2, 6), "\n")

validation_results$bcg_reml <- list(
  pooled_log = reml_fit$beta[1],
  se = reml_fit$se,
  tau2 = reml_fit$tau2
)

# HKSJ adjustment
hksj_fit <- rma(yi, vi, data = bcg, method = "DL", test = "knha")
cat("\nHKSJ (Knapp-Hartung) Results:\n")
cat("  Pooled OR (log):", round(hksj_fit$beta[1], 6), "\n")
cat("  SE (HKSJ):", round(hksj_fit$se, 6), "\n")
cat("  CI lower:", round(hksj_fit$ci.lb, 6), "\n")
cat("  CI upper:", round(hksj_fit$ci.ub, 6), "\n")

validation_results$bcg_hksj <- list(
  pooled_log = hksj_fit$beta[1],
  se_hksj = hksj_fit$se,
  ci_lower = hksj_fit$ci.lb,
  ci_upper = hksj_fit$ci.ub
)

# Prediction interval
k <- nrow(bcg)
df_pi <- k - 2
t_crit <- qt(0.975, df_pi)
pi_lower <- dl_fit$beta[1] - t_crit * sqrt(dl_fit$tau2 + dl_fit$se^2)
pi_upper <- dl_fit$beta[1] + t_crit * sqrt(dl_fit$tau2 + dl_fit$se^2)
cat("\nPrediction Interval (df = k-2 =", df_pi, "):\n")
cat("  PI lower:", round(pi_lower, 6), "\n")
cat("  PI upper:", round(pi_upper, 6), "\n")

validation_results$bcg_pi <- list(
  pi_lower = pi_lower,
  pi_upper = pi_upper,
  df = df_pi
)

# I² confidence interval (Q-profile method)
confint_result <- confint(dl_fit)
cat("\nI² Confidence Interval (Q-profile method):\n")
cat("  I² lower:", round(confint_result$random["I^2(%)", "ci.lb"], 2), "%\n")
cat("  I² upper:", round(confint_result$random["I^2(%)", "ci.ub"], 2), "%\n")

validation_results$bcg_i2ci <- list(
  I2 = dl_fit$I2,
  I2_lower = confint_result$random["I^2(%)", "ci.lb"],
  I2_upper = confint_result$random["I^2(%)", "ci.ub"]
)

# Egger's test - using standard radial regression approach
# yi/sqrt(vi) ~ 1/sqrt(vi)
precision <- 1 / sqrt(bcg$vi)
standard_effect <- bcg$yi / sqrt(bcg$vi)
egger_lm <- lm(standard_effect ~ precision)
egger_coefs <- coef(summary(egger_lm))
egger_intercept <- egger_coefs[1, 1]
egger_se <- egger_coefs[1, 2]
egger_t <- egger_coefs[1, 3]
egger_p <- egger_coefs[1, 4]

cat("\nEgger's Test (radial regression):\n")
cat("  Intercept:", round(egger_intercept, 6), "\n")
cat("  SE:", round(egger_se, 6), "\n")
cat("  t-value:", round(egger_t, 6), "\n")
cat("  p-value:", round(egger_p, 6), "\n")

validation_results$bcg_egger <- list(
  intercept = egger_intercept,
  se = egger_se,
  t_value = egger_t,
  p_value = egger_p
)

# Peters' test (for binary outcomes)
# Peters' test: regress log(OR) on 1/n
n_total <- bcg$tpos + bcg$tneg + bcg$cpos + bcg$cneg
peters_model <- lm(bcg$yi ~ I(1/n_total), weights = 1/bcg$vi)
peters_coef <- coef(summary(peters_model))
cat("\nPeters' Test:\n")
cat("  Intercept:", round(peters_coef[1, 1], 6), "\n")
cat("  p-value:", round(peters_coef[1, 4], 6), "\n")

validation_results$bcg_peters <- list(
  intercept = peters_coef[1, 1],
  p_value = peters_coef[1, 4]
)

# Trim-and-fill
tf_result <- trimfill(dl_fit)
cat("\nTrim-and-Fill:\n")
cat("  Studies filled:", tf_result$k0, "\n")
cat("  Adjusted estimate:", round(tf_result$beta[1], 6), "\n")

validation_results$bcg_trimfill <- list(
  k0 = tf_result$k0,
  adjusted_estimate = tf_result$beta[1],
  adjusted_se = tf_result$se
)

# Leave-one-out
loo <- leave1out(dl_fit)
cat("\nLeave-One-Out Analysis:\n")
cat("  Min estimate:", round(min(loo$estimate), 6), "\n")
cat("  Max estimate:", round(max(loo$estimate), 6), "\n")

validation_results$bcg_loo <- list(
  estimates = loo$estimate,
  Q_values = loo$Q,
  I2_values = loo$I2
)

# =============================================================================
# TEST DATASET 2: Continuous Outcomes (SMD)
# =============================================================================
cat("\n", rep("-", 70), "\n", sep="")
cat("TEST 2: Continuous Outcomes (Standardized Mean Difference)\n")
cat(rep("-", 70), "\n", sep="")

data(dat.normand1999)
norm <- escalc(measure = "SMD", m1i = m1i, sd1i = sd1i, n1i = n1i,
               m2i = m2i, sd2i = sd2i, n2i = n2i, data = dat.normand1999)

# DerSimonian-Laird
dl_smd <- rma(yi, vi, data = norm, method = "DL")
cat("\nDerSimonian-Laird (SMD):\n")
cat("  Pooled SMD:", round(dl_smd$beta[1], 6), "\n")
cat("  SE:", round(dl_smd$se, 6), "\n")
cat("  tau²:", round(dl_smd$tau2, 6), "\n")
cat("  I²:", round(dl_smd$I2, 2), "%\n")

validation_results$smd_dl <- list(
  pooled = dl_smd$beta[1],
  se = dl_smd$se,
  tau2 = dl_smd$tau2,
  I2 = dl_smd$I2
)

# HKSJ
hksj_smd <- rma(yi, vi, data = norm, method = "DL", test = "knha")
cat("\nHKSJ (SMD):\n")
cat("  CI lower:", round(hksj_smd$ci.lb, 6), "\n")
cat("  CI upper:", round(hksj_smd$ci.ub, 6), "\n")

validation_results$smd_hksj <- list(
  ci_lower = hksj_smd$ci.lb,
  ci_upper = hksj_smd$ci.ub
)

# =============================================================================
# TEST DATASET 3: Risk Ratio
# =============================================================================
cat("\n", rep("-", 70), "\n", sep="")
cat("TEST 3: Risk Ratio\n")
cat(rep("-", 70), "\n", sep="")

bcg_rr <- escalc(measure = "RR", ai = tpos, bi = tneg, ci = cpos, di = cneg,
                 data = dat.bcg, append = TRUE)

dl_rr <- rma(yi, vi, data = bcg_rr, method = "DL")
cat("\nDerSimonian-Laird (RR):\n")
cat("  Pooled RR (log):", round(dl_rr$beta[1], 6), "\n")
cat("  tau²:", round(dl_rr$tau2, 6), "\n")
cat("  I²:", round(dl_rr$I2, 2), "%\n")

validation_results$rr_dl <- list(
  pooled_log = dl_rr$beta[1],
  se = dl_rr$se,
  tau2 = dl_rr$tau2,
  I2 = dl_rr$I2
)

# =============================================================================
# TEST DATASET 4: Risk Difference
# =============================================================================
cat("\n", rep("-", 70), "\n", sep="")
cat("TEST 4: Risk Difference\n")
cat(rep("-", 70), "\n", sep="")

bcg_rd <- escalc(measure = "RD", ai = tpos, bi = tneg, ci = cpos, di = cneg,
                 data = dat.bcg, append = TRUE)

dl_rd <- rma(yi, vi, data = bcg_rd, method = "DL")
cat("\nDerSimonian-Laird (RD):\n")
cat("  Pooled RD:", round(dl_rd$beta[1], 6), "\n")
cat("  tau²:", round(dl_rd$tau2, 6), "\n")

validation_results$rd_dl <- list(
  pooled = dl_rd$beta[1],
  se = dl_rd$se,
  tau2 = dl_rd$tau2
)

# =============================================================================
# TEST DATASET 5: Fixed Effects
# =============================================================================
cat("\n", rep("-", 70), "\n", sep="")
cat("TEST 5: Fixed Effects Model\n")
cat(rep("-", 70), "\n", sep="")

fe_fit <- rma(yi, vi, data = bcg, method = "FE")
cat("\nFixed Effects (BCG - OR):\n")
cat("  Pooled OR (log):", round(fe_fit$beta[1], 6), "\n")
cat("  SE:", round(fe_fit$se, 6), "\n")
cat("  CI lower:", round(fe_fit$ci.lb, 6), "\n")
cat("  CI upper:", round(fe_fit$ci.ub, 6), "\n")

validation_results$fe <- list(
  pooled_log = fe_fit$beta[1],
  se = fe_fit$se,
  ci_lower = fe_fit$ci.lb,
  ci_upper = fe_fit$ci.ub
)

# =============================================================================
# TEST DATASET 6: Effect Size Calculation Validation
# =============================================================================
cat("\n", rep("-", 70), "\n", sep="")
cat("TEST 6: Effect Size Calculations\n")
cat(rep("-", 70), "\n", sep="")

# Single study OR calculation
a <- 100; b <- 200; c <- 150; d <- 250
or_calc <- escalc(measure = "OR", ai = a, bi = b, ci = c, di = d)
cat("\nOdds Ratio (single study):\n")
cat("  a=100, b=200, c=150, d=250\n")
cat("  log(OR):", round(or_calc$yi, 6), "\n")
cat("  Variance:", round(or_calc$vi, 6), "\n")
cat("  OR:", round(exp(or_calc$yi), 6), "\n")

validation_results$or_calc <- list(
  log_or = or_calc$yi[1],
  variance = or_calc$vi[1],
  or = exp(or_calc$yi[1])
)

# Single study RR calculation
rr_calc <- escalc(measure = "RR", ai = a, bi = b, ci = c, di = d)
cat("\nRisk Ratio (single study):\n")
cat("  log(RR):", round(rr_calc$yi, 6), "\n")
cat("  Variance:", round(rr_calc$vi, 6), "\n")

validation_results$rr_calc <- list(
  log_rr = rr_calc$yi[1],
  variance = rr_calc$vi[1]
)

# SMD (Hedges' g) calculation
m1 <- 10; sd1 <- 2; n1 <- 30
m2 <- 8; sd2 <- 2.5; n2 <- 35
smd_calc <- escalc(measure = "SMD", m1i = m1, sd1i = sd1, n1i = n1,
                   m2i = m2, sd2i = sd2, n2i = n2)
cat("\nSMD (Hedges' g):\n")
cat("  m1=10, sd1=2, n1=30, m2=8, sd2=2.5, n2=35\n")
cat("  g:", round(smd_calc$yi, 6), "\n")
cat("  Variance:", round(smd_calc$vi, 6), "\n")

validation_results$smd_calc <- list(
  g = smd_calc$yi[1],
  variance = smd_calc$vi[1]
)

# =============================================================================
# ADDITIONAL TESTS: Edge Cases
# =============================================================================
cat("\n", rep("-", 70), "\n", sep="")
cat("TEST 7: Edge Cases\n")
cat(rep("-", 70), "\n", sep="")

# Zero heterogeneity case (homogeneous studies)
# Create artificial homogeneous data
set.seed(42)
yi_homo <- rep(-0.5, 5)
vi_homo <- rep(0.1, 5)

dl_homo <- rma(yi_homo, vi_homo, method = "DL")
cat("\nHomogeneous Studies (tau² should be ~0):\n")
cat("  tau²:", round(dl_homo$tau2, 6), "\n")
cat("  I²:", round(dl_homo$I2, 2), "%\n")

validation_results$homogeneous <- list(
  tau2 = dl_homo$tau2,
  I2 = dl_homo$I2
)

# High heterogeneity case
yi_hetero <- c(-1.5, -0.5, 0.5, 1.0, -2.0)
vi_hetero <- rep(0.1, 5)

dl_hetero <- rma(yi_hetero, vi_hetero, method = "DL")
cat("\nHeterogeneous Studies:\n")
cat("  tau²:", round(dl_hetero$tau2, 6), "\n")
cat("  I²:", round(dl_hetero$I2, 2), "%\n")

validation_results$heterogeneous <- list(
  tau2 = dl_hetero$tau2,
  I2 = dl_hetero$I2,
  pooled = dl_hetero$beta[1]
)

# =============================================================================
# SAVE RESULTS
# =============================================================================
cat("\n", rep("=", 70), "\n", sep="")
cat("SAVING VALIDATION REFERENCE DATA\n")
cat(rep("=", 70), "\n\n", sep="")

# Save as JSON for JavaScript comparison
json_output <- toJSON(validation_results, pretty = TRUE, auto_unbox = TRUE)
output_file <- "C:/Users/user/living-meta/tests/validation/metafor_reference.json"
writeLines(json_output, output_file)
cat("Reference data saved to:", output_file, "\n")

# Print summary
cat("\n", rep("=", 70), "\n", sep="")
cat("VALIDATION SUMMARY\n")
cat(rep("=", 70), "\n\n", sep="")

cat("All reference values have been generated.\n")
cat("Use these values to compare against the JavaScript implementation.\n\n")

# Print key reference values for quick comparison
cat("KEY REFERENCE VALUES (BCG Dataset - Odds Ratio):\n")
cat("  DL pooled log(OR):", round(validation_results$bcg_dl$pooled_log, 6), "\n")
cat("  DL tau²:", round(validation_results$bcg_dl$tau2, 6), "\n")
cat("  DL I²:", round(validation_results$bcg_dl$I2, 2), "%\n")
cat("  PM tau²:", round(validation_results$bcg_pm$tau2, 6), "\n")
cat("  REML tau²:", round(validation_results$bcg_reml$tau2, 6), "\n")
cat("  HKSJ CI: [", round(validation_results$bcg_hksj$ci_lower, 6), ",",
    round(validation_results$bcg_hksj$ci_upper, 6), "]\n")
cat("  PI: [", round(validation_results$bcg_pi$pi_lower, 6), ",",
    round(validation_results$bcg_pi$pi_upper, 6), "]\n")
cat("  Egger p-value:", round(validation_results$bcg_egger$p_value, 4), "\n")
cat("  Trim-fill k0:", validation_results$bcg_trimfill$k0, "\n")

cat("\nValidation script completed successfully.\n")
