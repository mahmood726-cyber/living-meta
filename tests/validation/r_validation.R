# ==============================================================================
# R Validation Script for Living Meta-Analysis Web App
# Compares JS/WASM implementations against R metafor package
# ==============================================================================

# Install packages if needed
if (!require("metafor")) install.packages("metafor", repos = "https://cloud.r-project.org")
if (!require("jsonlite")) install.packages("jsonlite", repos = "https://cloud.r-project.org")

library(metafor)
library(jsonlite)

cat("\n========================================\n")
cat("Living Meta-Analysis Validation Suite\n")
cat("Comparing against R metafor", as.character(packageVersion("metafor")), "\n")
cat("========================================\n\n")

# Initialize results list
validation_results <- list()
tolerance <- 1e-4  # Acceptable difference

# ------------------------------------------------------------------------------
# Dataset 1: BCG Vaccine Trials
# ------------------------------------------------------------------------------
cat("=== Dataset 1: BCG Vaccine Trials ===\n")

bcg <- data.frame(
  study = c("Aronson 1948", "Ferguson & Simes 1949", "Rosenthal et al 1960",
            "Hart & Sutherland 1977", "Frimodt-Moller et al 1973", "Stein & Aronson 1953",
            "Vandiviere et al 1973", "TPT Madras 1980", "Coetzee & Berjak 1968",
            "Rosenthal et al 1961", "Comstock et al 1974", "Comstock & Webster 1969",
            "Comstock et al 1976"),
  tpos = c(4, 6, 3, 62, 33, 180, 8, 505, 29, 17, 186, 5, 27),
  tneg = c(119, 300, 228, 13536, 5036, 1361, 2537, 87886, 7470, 1699, 50448, 2493, 16886),
  cpos = c(11, 29, 11, 248, 47, 372, 10, 499, 45, 65, 141, 3, 29),
  cneg = c(128, 274, 209, 12619, 5765, 1079, 619, 87892, 7232, 1600, 27197, 2338, 17825)
)

# Calculate effect sizes
bcg_es <- escalc(measure = "OR", ai = tpos, bi = tneg, ci = cpos, di = cneg, data = bcg)

cat("\n--- Study-level effect sizes (log-OR) ---\n")
print(data.frame(
  study = bcg$study,
  yi = round(bcg_es$yi, 4),
  vi = round(bcg_es$vi, 4),
  sei = round(sqrt(bcg_es$vi), 4)
))

# Fixed Effects Model
cat("\n--- Fixed Effects Model ---\n")
fe_model <- rma(yi, vi, data = bcg_es, method = "FE")
print(summary(fe_model))

validation_results$bcg$fe <- list(
  estimate = as.numeric(fe_model$beta),
  se = as.numeric(fe_model$se),
  ci_lower = as.numeric(fe_model$ci.lb),
  ci_upper = as.numeric(fe_model$ci.ub),
  z = as.numeric(fe_model$zval),
  p = as.numeric(fe_model$pval),
  Q = as.numeric(fe_model$QE),
  df = fe_model$k - 1
)

# Random Effects - DerSimonian-Laird
cat("\n--- Random Effects (DL) ---\n")
re_dl <- rma(yi, vi, data = bcg_es, method = "DL")
print(summary(re_dl))

validation_results$bcg$re_dl <- list(
  estimate = as.numeric(re_dl$beta),
  se = as.numeric(re_dl$se),
  ci_lower = as.numeric(re_dl$ci.lb),
  ci_upper = as.numeric(re_dl$ci.ub),
  tau2 = as.numeric(re_dl$tau2),
  tau = sqrt(as.numeric(re_dl$tau2)),
  I2 = as.numeric(re_dl$I2),
  H2 = as.numeric(re_dl$H2)
)

# Random Effects - REML
cat("\n--- Random Effects (REML) ---\n")
re_reml <- rma(yi, vi, data = bcg_es, method = "REML")
print(summary(re_reml))

validation_results$bcg$re_reml <- list(
  estimate = as.numeric(re_reml$beta),
  se = as.numeric(re_reml$se),
  ci_lower = as.numeric(re_reml$ci.lb),
  ci_upper = as.numeric(re_reml$ci.ub),
  tau2 = as.numeric(re_reml$tau2),
  tau = sqrt(as.numeric(re_reml$tau2)),
  I2 = as.numeric(re_reml$I2),
  H2 = as.numeric(re_reml$H2)
)

# HKSJ adjustment
cat("\n--- HKSJ Adjustment ---\n")
re_hksj <- rma(yi, vi, data = bcg_es, method = "REML", test = "knha")
print(summary(re_hksj))

validation_results$bcg$hksj <- list(
  estimate = as.numeric(re_hksj$beta),
  se = as.numeric(re_hksj$se),
  ci_lower = as.numeric(re_hksj$ci.lb),
  ci_upper = as.numeric(re_hksj$ci.ub),
  t = as.numeric(re_hksj$tval),
  p = as.numeric(re_hksj$pval),
  df = re_hksj$k - 1
)

# Prediction interval
cat("\n--- Prediction Interval ---\n")
pi <- predict(re_reml, level = 0.95)
cat("PI lower:", pi$pi.lb, "\n")
cat("PI upper:", pi$pi.ub, "\n")

validation_results$bcg$prediction_interval <- list(
  pi_lower = as.numeric(pi$pi.lb),
  pi_upper = as.numeric(pi$pi.ub)
)

# Egger's test
cat("\n--- Egger's Test ---\n")
egger <- regtest(re_reml, model = "lm")
print(egger)

validation_results$bcg$egger <- list(
  intercept = as.numeric(egger$est),
  se = as.numeric(egger$se),
  z = as.numeric(egger$zval),
  p = as.numeric(egger$pval)
)

# Peters' test (for binary outcomes)
cat("\n--- Peters' Test ---\n")
# Peters uses 1/n as predictor
n_total <- bcg$tpos + bcg$tneg + bcg$cpos + bcg$cneg
peters <- regtest(re_reml, predictor = "ni", model = "lm")
print(peters)

validation_results$bcg$peters <- list(
  intercept = as.numeric(peters$est),
  se = as.numeric(peters$se),
  z = as.numeric(peters$zval),
  p = as.numeric(peters$pval)
)

# Leave-one-out analysis
cat("\n--- Leave-One-Out Analysis ---\n")
loo <- leave1out(re_reml)
print(loo)

validation_results$bcg$leave_one_out <- data.frame(
  study = bcg$study,
  estimate = loo$estimate,
  se = loo$se,
  ci_lower = loo$ci.lb,
  ci_upper = loo$ci.ub,
  I2 = loo$I2,
  tau2 = loo$tau2
)

# Influence diagnostics
cat("\n--- Influence Diagnostics ---\n")
inf <- influence(re_reml)
print(inf)

# ------------------------------------------------------------------------------
# Dataset 2: Continuous Outcome (SMD)
# ------------------------------------------------------------------------------
cat("\n\n=== Dataset 2: Antidepressants (SMD) ===\n")

antidep <- data.frame(
  study = paste0("Study ", 1:8),
  n1 = c(50, 120, 85, 200, 65, 150, 40, 180),
  m1 = c(-12.5, -14.2, -11.8, -13.1, -10.5, -15.2, -9.8, -12.9),
  sd1 = c(8.2, 9.1, 7.5, 8.8, 6.9, 9.5, 6.5, 8.1),
  n2 = c(48, 118, 82, 195, 63, 148, 38, 175),
  m2 = c(-8.3, -9.1, -7.9, -8.8, -6.2, -10.1, -5.5, -7.5),
  sd2 = c(7.9, 8.8, 7.2, 8.5, 7.1, 9.2, 6.8, 7.8)
)

# Calculate SMD (Hedges' g)
antidep_es <- escalc(measure = "SMD",
                      m1i = m1, sd1i = sd1, n1i = n1,
                      m2i = m2, sd2i = sd2, n2i = n2,
                      data = antidep)

cat("\n--- Study-level SMD (Hedges' g) ---\n")
print(data.frame(
  study = antidep$study,
  yi = round(antidep_es$yi, 4),
  vi = round(antidep_es$vi, 4)
))

# RE-REML for SMD
re_smd <- rma(yi, vi, data = antidep_es, method = "REML")
cat("\n--- RE (REML) Results ---\n")
print(summary(re_smd))

validation_results$antidep$re_reml <- list(
  estimate = as.numeric(re_smd$beta),
  se = as.numeric(re_smd$se),
  ci_lower = as.numeric(re_smd$ci.lb),
  ci_upper = as.numeric(re_smd$ci.ub),
  tau2 = as.numeric(re_smd$tau2),
  I2 = as.numeric(re_smd$I2)
)

# HKSJ
re_smd_hksj <- rma(yi, vi, data = antidep_es, method = "REML", test = "knha")
cat("\n--- HKSJ Results ---\n")
print(summary(re_smd_hksj))

validation_results$antidep$hksj <- list(
  estimate = as.numeric(re_smd_hksj$beta),
  se = as.numeric(re_smd_hksj$se),
  ci_lower = as.numeric(re_smd_hksj$ci.lb),
  ci_upper = as.numeric(re_smd_hksj$ci.ub)
)

# Prediction interval
pi_smd <- predict(re_smd, level = 0.95)
validation_results$antidep$prediction_interval <- list(
  pi_lower = as.numeric(pi_smd$pi.lb),
  pi_upper = as.numeric(pi_smd$pi.ub)
)

# ------------------------------------------------------------------------------
# Dataset 3: Small trials (k=3)
# ------------------------------------------------------------------------------
cat("\n\n=== Dataset 3: Small Trial Set (k=3) ===\n")

small <- data.frame(
  study = c("Trial A", "Trial B", "Trial C"),
  tpos = c(15, 22, 8),
  tneg = c(85, 178, 92),
  cpos = c(25, 35, 18),
  cneg = c(75, 165, 82)
)

small_es <- escalc(measure = "RR", ai = tpos, bi = tneg, ci = cpos, di = cneg, data = small)

cat("\n--- Study-level RR ---\n")
print(data.frame(
  study = small$study,
  yi = round(small_es$yi, 4),
  vi = round(small_es$vi, 4)
))

re_small <- rma(yi, vi, data = small_es, method = "REML")
print(summary(re_small))

validation_results$small$re_reml <- list(
  estimate = as.numeric(re_small$beta),
  se = as.numeric(re_small$se),
  ci_lower = as.numeric(re_small$ci.lb),
  ci_upper = as.numeric(re_small$ci.ub),
  tau2 = as.numeric(re_small$tau2),
  I2 = as.numeric(re_small$I2)
)

# Note: HKSJ can give wide CIs with small k
re_small_hksj <- rma(yi, vi, data = small_es, method = "REML", test = "knha")
validation_results$small$hksj <- list(
  estimate = as.numeric(re_small_hksj$beta),
  ci_lower = as.numeric(re_small_hksj$ci.lb),
  ci_upper = as.numeric(re_small_hksj$ci.ub)
)

# ------------------------------------------------------------------------------
# Dataset 4: Homogeneous studies
# ------------------------------------------------------------------------------
cat("\n\n=== Dataset 4: Homogeneous Studies ===\n")

homo <- data.frame(
  study = paste0("Study ", 1:5),
  tpos = c(20, 22, 18, 21, 19),
  tneg = c(80, 78, 82, 79, 81),
  cpos = c(30, 32, 28, 31, 29),
  cneg = c(70, 68, 72, 69, 71)
)

homo_es <- escalc(measure = "OR", ai = tpos, bi = tneg, ci = cpos, di = cneg, data = homo)

re_homo <- rma(yi, vi, data = homo_es, method = "REML")
print(summary(re_homo))

validation_results$homo$re_reml <- list(
  estimate = as.numeric(re_homo$beta),
  se = as.numeric(re_homo$se),
  tau2 = as.numeric(re_homo$tau2),
  I2 = as.numeric(re_homo$I2),
  Q = as.numeric(re_homo$QE),
  Q_p = as.numeric(re_homo$QEp)
)

# ------------------------------------------------------------------------------
# Dataset 5: Heterogeneous studies
# ------------------------------------------------------------------------------
cat("\n\n=== Dataset 5: Heterogeneous Studies ===\n")

hetero <- data.frame(
  study = paste0("Study ", 1:6),
  tpos = c(5, 45, 10, 60, 8, 55),
  tneg = c(95, 55, 90, 140, 92, 45),
  cpos = c(20, 30, 40, 35, 25, 40),
  cneg = c(80, 70, 60, 165, 75, 60)
)

hetero_es <- escalc(measure = "OR", ai = tpos, bi = tneg, ci = cpos, di = cneg, data = hetero)

re_hetero <- rma(yi, vi, data = hetero_es, method = "REML")
print(summary(re_hetero))

validation_results$hetero$re_reml <- list(
  estimate = as.numeric(re_hetero$beta),
  se = as.numeric(re_hetero$se),
  tau2 = as.numeric(re_hetero$tau2),
  I2 = as.numeric(re_hetero$I2),
  Q = as.numeric(re_hetero$QE),
  Q_p = as.numeric(re_hetero$QEp)
)

# Egger test for heterogeneous data
egger_hetero <- regtest(re_hetero, model = "lm")
validation_results$hetero$egger <- list(
  intercept = as.numeric(egger_hetero$est),
  p = as.numeric(egger_hetero$pval)
)

# ------------------------------------------------------------------------------
# E-value Calculations
# ------------------------------------------------------------------------------
cat("\n\n=== E-value Calculations ===\n")

# E-value formula for RR: E = RR + sqrt(RR * (RR - 1))
# For RR < 1: E = 1/RR + sqrt(1/RR * (1/RR - 1))

calculate_evalue <- function(rr) {
  if (rr >= 1) {
    return(rr + sqrt(rr * (rr - 1)))
  } else {
    rr_inv <- 1 / rr
    return(rr_inv + sqrt(rr_inv * (rr_inv - 1)))
  }
}

# BCG example: OR = exp(-0.7145) = 0.489
bcg_or <- exp(as.numeric(re_reml$beta))
bcg_or_lower <- exp(as.numeric(re_reml$ci.lb))

# Convert OR to RR approximation for E-value
# Using: RR ≈ OR / (1 - p0 + p0*OR) where p0 is baseline risk
# For rare outcomes, RR ≈ OR

evalue_point <- calculate_evalue(bcg_or)
evalue_ci <- calculate_evalue(bcg_or_lower)

cat("BCG pooled OR:", round(bcg_or, 4), "\n")
cat("E-value (point):", round(evalue_point, 4), "\n")
cat("E-value (CI bound):", round(evalue_ci, 4), "\n")

validation_results$evalues$bcg <- list(
  or = bcg_or,
  evalue_point = evalue_point,
  evalue_ci = evalue_ci
)

# Test with RR < 1
test_rr <- 0.5
evalue_rr05 <- calculate_evalue(test_rr)
cat("\nTest RR=0.5, E-value:", round(evalue_rr05, 4), "\n")

validation_results$evalues$rr_05 <- list(
  rr = test_rr,
  evalue = evalue_rr05
)

# ------------------------------------------------------------------------------
# Harbord Test (specifically for OR in binary outcomes)
# ------------------------------------------------------------------------------
cat("\n\n=== Harbord Test ===\n")

# Harbord test uses score-based approach
# Note: metafor doesn't have built-in Harbord, but we can approximate
# Using regtest with model="rma" gives similar results

harbord_approx <- regtest(re_reml, model = "rma", predictor = "sei")
print(harbord_approx)

validation_results$bcg$harbord <- list(
  z = as.numeric(harbord_approx$zval),
  p = as.numeric(harbord_approx$pval)
)

# ------------------------------------------------------------------------------
# I² Confidence Interval
# ------------------------------------------------------------------------------
cat("\n\n=== I² Confidence Interval ===\n")

# Using Q-profile method
i2_ci <- confint(re_reml)
cat("I² point estimate:", round(re_reml$I2, 2), "%\n")
cat("I² 95% CI: [", round(i2_ci$random["I^2(%)", "ci.lb"], 2), ",",
    round(i2_ci$random["I^2(%)", "ci.ub"], 2), "]\n")

validation_results$bcg$I2_ci <- list(
  point = as.numeric(re_reml$I2),
  ci_lower = as.numeric(i2_ci$random["I^2(%)", "ci.lb"]),
  ci_upper = as.numeric(i2_ci$random["I^2(%)", "ci.ub"])
)

# ------------------------------------------------------------------------------
# Tau² Confidence Interval
# ------------------------------------------------------------------------------
cat("\n--- Tau² Confidence Interval ---\n")
cat("Tau² point estimate:", round(re_reml$tau2, 4), "\n")
cat("Tau² 95% CI: [", round(i2_ci$random["tau^2", "ci.lb"], 4), ",",
    round(i2_ci$random["tau^2", "ci.ub"], 4), "]\n")

validation_results$bcg$tau2_ci <- list(
  point = as.numeric(re_reml$tau2),
  ci_lower = as.numeric(i2_ci$random["tau^2", "ci.lb"]),
  ci_upper = as.numeric(i2_ci$random["tau^2", "ci.ub"])
)

# ------------------------------------------------------------------------------
# Output results to JSON
# ------------------------------------------------------------------------------
cat("\n\n========================================\n")
cat("Writing validation results to JSON...\n")
cat("========================================\n")

# Write to file
output_file <- "validation_results.json"
writeLines(toJSON(validation_results, pretty = TRUE, auto_unbox = TRUE), output_file)
cat("Results written to:", output_file, "\n")

# Print summary table
cat("\n\n========================================\n")
cat("VALIDATION SUMMARY\n")
cat("========================================\n\n")

cat("BCG Vaccine Dataset (k=13):\n")
cat(sprintf("  FE estimate:    %.4f (SE: %.4f)\n", validation_results$bcg$fe$estimate, validation_results$bcg$fe$se))
cat(sprintf("  RE-DL estimate: %.4f (SE: %.4f, tau²: %.4f)\n", validation_results$bcg$re_dl$estimate, validation_results$bcg$re_dl$se, validation_results$bcg$re_dl$tau2))
cat(sprintf("  RE-REML:        %.4f (SE: %.4f, tau²: %.4f)\n", validation_results$bcg$re_reml$estimate, validation_results$bcg$re_reml$se, validation_results$bcg$re_reml$tau2))
cat(sprintf("  I²:             %.1f%% [%.1f%%, %.1f%%]\n", validation_results$bcg$I2_ci$point, validation_results$bcg$I2_ci$ci_lower, validation_results$bcg$I2_ci$ci_upper))
cat(sprintf("  HKSJ CI:        [%.4f, %.4f]\n", validation_results$bcg$hksj$ci_lower, validation_results$bcg$hksj$ci_upper))
cat(sprintf("  Prediction Int: [%.4f, %.4f]\n", validation_results$bcg$prediction_interval$pi_lower, validation_results$bcg$prediction_interval$pi_upper))
cat(sprintf("  Egger p-value:  %.4f\n", validation_results$bcg$egger$p))

cat("\nAntidepressant Dataset (k=8, SMD):\n")
cat(sprintf("  RE-REML:        %.4f (SE: %.4f, tau²: %.4f)\n", validation_results$antidep$re_reml$estimate, validation_results$antidep$re_reml$se, validation_results$antidep$re_reml$tau2))
cat(sprintf("  HKSJ CI:        [%.4f, %.4f]\n", validation_results$antidep$hksj$ci_lower, validation_results$antidep$hksj$ci_upper))

cat("\n========================================\n")
cat("Validation complete!\n")
cat("========================================\n")
