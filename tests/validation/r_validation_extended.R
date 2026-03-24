# ==============================================================================
# Extended R Validation Script for Living Meta-Analysis Web App
# Comprehensive validation including real datasets, REML, edge cases, and more
# ==============================================================================

if (!require("metafor")) install.packages("metafor", repos = "https://cloud.r-project.org")
if (!require("jsonlite")) install.packages("jsonlite", repos = "https://cloud.r-project.org")

library(metafor)
library(jsonlite)

cat("\n================================================================\n")
cat("Extended Validation Suite - R metafor", as.character(packageVersion("metafor")), "\n")
cat("================================================================\n\n")

results <- list()

# ==============================================================================
# SECTION 1: REAL DATASETS FROM METAFOR
# ==============================================================================

cat("=== SECTION 1: Real Datasets ===\n\n")

# Dataset 1: BCG Vaccine (already validated, but include for completeness)
cat("--- Dataset: BCG Vaccine Trials ---\n")
data(dat.bcg)
bcg_es <- escalc(measure = "OR", ai = tpos, bi = tneg, ci = cpos, di = cneg, data = dat.bcg)
bcg_reml <- rma(yi, vi, data = bcg_es, method = "REML")
bcg_dl <- rma(yi, vi, data = bcg_es, method = "DL")

results$bcg <- list(
  k = bcg_reml$k,
  reml = list(
    estimate = as.numeric(bcg_reml$beta),
    se = as.numeric(bcg_reml$se),
    tau2 = as.numeric(bcg_reml$tau2),
    I2 = as.numeric(bcg_reml$I2)
  ),
  dl = list(
    estimate = as.numeric(bcg_dl$beta),
    se = as.numeric(bcg_dl$se),
    tau2 = as.numeric(bcg_dl$tau2),
    I2 = as.numeric(bcg_dl$I2)
  )
)
cat("  k =", bcg_reml$k, ", REML tau2 =", round(bcg_reml$tau2, 4),
    ", DL tau2 =", round(bcg_dl$tau2, 4), "\n")

# Dataset 2: Aspirin for MI Prevention
cat("\n--- Dataset: Aspirin for MI Prevention ---\n")
data(dat.hart1999)
hart_es <- escalc(measure = "OR", ai = x1i, bi = n1i - x1i,
                  ci = x2i, di = n2i - x2i, data = dat.hart1999)
hart_reml <- rma(yi, vi, data = hart_es, method = "REML")
hart_dl <- rma(yi, vi, data = hart_es, method = "DL")

results$hart1999 <- list(
  k = hart_reml$k,
  name = "Aspirin for MI Prevention",
  reml = list(
    estimate = as.numeric(hart_reml$beta),
    se = as.numeric(hart_reml$se),
    tau2 = as.numeric(hart_reml$tau2),
    I2 = as.numeric(hart_reml$I2)
  ),
  dl = list(
    estimate = as.numeric(hart_dl$beta),
    se = as.numeric(hart_dl$se),
    tau2 = as.numeric(hart_dl$tau2),
    I2 = as.numeric(hart_dl$I2)
  )
)
cat("  k =", hart_reml$k, ", REML tau2 =", round(hart_reml$tau2, 4),
    ", DL tau2 =", round(hart_dl$tau2, 4), "\n")

# Dataset 3: Effectiveness of School-Based Writing Interventions
cat("\n--- Dataset: Writing Interventions (SMD) ---\n")
data(dat.bangertdrowns2004)
bd <- dat.bangertdrowns2004
bd_reml <- rma(yi, vi, data = bd, method = "REML")
bd_dl <- rma(yi, vi, data = bd, method = "DL")

results$bangertdrowns <- list(
  k = bd_reml$k,
  name = "School Writing Interventions (SMD)",
  reml = list(
    estimate = as.numeric(bd_reml$beta),
    se = as.numeric(bd_reml$se),
    tau2 = as.numeric(bd_reml$tau2),
    I2 = as.numeric(bd_reml$I2)
  ),
  dl = list(
    estimate = as.numeric(bd_dl$beta),
    se = as.numeric(bd_dl$se),
    tau2 = as.numeric(bd_dl$tau2),
    I2 = as.numeric(bd_dl$I2)
  )
)
cat("  k =", bd_reml$k, ", REML tau2 =", round(bd_reml$tau2, 4),
    ", DL tau2 =", round(bd_dl$tau2, 4), "\n")

# Dataset 4: Magnesium for MI (famous dataset with publication bias)
cat("\n--- Dataset: Magnesium for MI ---\n")
data(dat.egger2001)
mag_es <- escalc(measure = "OR", ai = ai, bi = n1i - ai,
                 ci = ci, di = n2i - ci, data = dat.egger2001)
mag_reml <- rma(yi, vi, data = mag_es, method = "REML")
mag_dl <- rma(yi, vi, data = mag_es, method = "DL")
mag_egger <- regtest(mag_reml, model = "lm")

results$magnesium <- list(
  k = mag_reml$k,
  name = "Magnesium for MI (Egger 2001)",
  reml = list(
    estimate = as.numeric(mag_reml$beta),
    se = as.numeric(mag_reml$se),
    tau2 = as.numeric(mag_reml$tau2),
    I2 = as.numeric(mag_reml$I2)
  ),
  dl = list(
    estimate = as.numeric(mag_dl$beta),
    se = as.numeric(mag_dl$se),
    tau2 = as.numeric(mag_dl$tau2),
    I2 = as.numeric(mag_dl$I2)
  ),
  egger_p = as.numeric(mag_egger$pval)
)
cat("  k =", mag_reml$k, ", Egger p =", round(mag_egger$pval, 4), "\n")

# Dataset 5: Homogeneous dataset (low heterogeneity)
cat("\n--- Dataset: Homogeneous Example ---\n")
# Create synthetic homogeneous data
set.seed(42)
homo_yi <- rnorm(10, mean = -0.5, sd = 0.1)
homo_vi <- rep(0.04, 10)
homo_reml <- rma(homo_yi, homo_vi, method = "REML")
homo_dl <- rma(homo_yi, homo_vi, method = "DL")

results$homogeneous <- list(
  k = 10,
  name = "Synthetic Homogeneous",
  yi = homo_yi,
  vi = homo_vi,
  reml = list(
    estimate = as.numeric(homo_reml$beta),
    se = as.numeric(homo_reml$se),
    tau2 = as.numeric(homo_reml$tau2),
    I2 = as.numeric(homo_reml$I2),
    Q = as.numeric(homo_reml$QE),
    Q_p = as.numeric(homo_reml$QEp)
  ),
  dl = list(
    estimate = as.numeric(homo_dl$beta),
    tau2 = as.numeric(homo_dl$tau2),
    I2 = as.numeric(homo_dl$I2)
  )
)
cat("  k = 10, REML tau2 =", round(homo_reml$tau2, 4),
    ", I2 =", round(homo_reml$I2, 1), "%\n")

# ==============================================================================
# SECTION 2: REML VS DL COMPARISON
# ==============================================================================

cat("\n=== SECTION 2: REML vs DL Comparison ===\n\n")

# Use BCG data for detailed comparison
bcg_pm <- rma(yi, vi, data = bcg_es, method = "PM")  # Paule-Mandel
bcg_sj <- rma(yi, vi, data = bcg_es, method = "SJ")  # Sidik-Jonkman

results$tau2_comparison <- list(
  dataset = "BCG",
  DL = as.numeric(bcg_dl$tau2),
  REML = as.numeric(bcg_reml$tau2),
  PM = as.numeric(bcg_pm$tau2),
  SJ = as.numeric(bcg_sj$tau2)
)

cat("BCG tau2 estimates:\n")
cat("  DL:   ", round(bcg_dl$tau2, 4), "\n")
cat("  REML: ", round(bcg_reml$tau2, 4), "\n")
cat("  PM:   ", round(bcg_pm$tau2, 4), "\n")
cat("  SJ:   ", round(bcg_sj$tau2, 4), "\n")

# ==============================================================================
# SECTION 3: EDGE CASES
# ==============================================================================

cat("\n=== SECTION 3: Edge Cases ===\n\n")

# Edge case 1: k = 2 (minimum for RE)
cat("--- Edge Case: k = 2 ---\n")
k2_yi <- c(-0.5, -0.8)
k2_vi <- c(0.1, 0.15)
k2_dl <- rma(k2_yi, k2_vi, method = "DL")

results$edge_k2 <- list(
  k = 2,
  yi = k2_yi,
  vi = k2_vi,
  estimate = as.numeric(k2_dl$beta),
  se = as.numeric(k2_dl$se),
  tau2 = as.numeric(k2_dl$tau2),
  Q = as.numeric(k2_dl$QE)
)
cat("  estimate =", round(k2_dl$beta, 4), ", tau2 =", round(k2_dl$tau2, 4), "\n")

# Edge case 2: k = 3 (minimum for prediction interval)
cat("\n--- Edge Case: k = 3 ---\n")
k3_yi <- c(-0.5, -0.8, -0.3)
k3_vi <- c(0.1, 0.15, 0.12)
k3_reml <- rma(k3_yi, k3_vi, method = "REML")
k3_pi <- predict(k3_reml, level = 0.95)

results$edge_k3 <- list(
  k = 3,
  yi = k3_yi,
  vi = k3_vi,
  estimate = as.numeric(k3_reml$beta),
  tau2 = as.numeric(k3_reml$tau2),
  pi_lower = as.numeric(k3_pi$pi.lb),
  pi_upper = as.numeric(k3_pi$pi.ub)
)
cat("  PI = [", round(k3_pi$pi.lb, 4), ",", round(k3_pi$pi.ub, 4), "]\n")

# Edge case 3: Zero cells (requiring continuity correction)
cat("\n--- Edge Case: Zero Cells ---\n")
zero_data <- data.frame(
  ai = c(0, 5, 3),
  bi = c(50, 45, 47),
  ci = c(3, 8, 5),
  di = c(47, 42, 45)
)
# Add 0.5 continuity correction
zero_es <- escalc(measure = "OR", ai = ai, bi = bi, ci = ci, di = di,
                  data = zero_data, add = 0.5, to = "only0")
zero_dl <- rma(yi, vi, data = zero_es, method = "DL")

results$edge_zero_cells <- list(
  data = zero_data,
  yi = as.numeric(zero_es$yi),
  vi = as.numeric(zero_es$vi),
  estimate = as.numeric(zero_dl$beta),
  se = as.numeric(zero_dl$se)
)
cat("  Study 1 (zero events) yi =", round(zero_es$yi[1], 4), "\n")
cat("  Pooled estimate =", round(zero_dl$beta, 4), "\n")

# Edge case 4: Very large heterogeneity
cat("\n--- Edge Case: High Heterogeneity (I2 > 95%) ---\n")
set.seed(123)
high_het_yi <- c(-2.0, 0.5, -0.3, 1.2, -1.5, 0.8, -0.1, 1.5)
high_het_vi <- rep(0.1, 8)
high_het_dl <- rma(high_het_yi, high_het_vi, method = "DL")

results$edge_high_het <- list(
  k = 8,
  yi = high_het_yi,
  vi = high_het_vi,
  estimate = as.numeric(high_het_dl$beta),
  tau2 = as.numeric(high_het_dl$tau2),
  I2 = as.numeric(high_het_dl$I2)
)
cat("  I2 =", round(high_het_dl$I2, 1), "%, tau2 =", round(high_het_dl$tau2, 4), "\n")

# Edge case 5: All positive / all negative effects
cat("\n--- Edge Case: All Effects Same Direction ---\n")
same_dir_yi <- c(-0.3, -0.5, -0.4, -0.6, -0.35)
same_dir_vi <- c(0.05, 0.08, 0.06, 0.07, 0.05)
same_dir_dl <- rma(same_dir_yi, same_dir_vi, method = "DL")

results$edge_same_direction <- list(
  k = 5,
  yi = same_dir_yi,
  vi = same_dir_vi,
  estimate = as.numeric(same_dir_dl$beta),
  tau2 = as.numeric(same_dir_dl$tau2),
  ci_lower = as.numeric(same_dir_dl$ci.lb),
  ci_upper = as.numeric(same_dir_dl$ci.ub)
)
cat("  All negative, CI = [", round(same_dir_dl$ci.lb, 4), ",",
    round(same_dir_dl$ci.ub, 4), "]\n")

# ==============================================================================
# SECTION 4: LEAVE-ONE-OUT ANALYSIS
# ==============================================================================

cat("\n=== SECTION 4: Leave-One-Out Analysis ===\n\n")

loo <- leave1out(bcg_reml)
results$leave_one_out <- list(
  dataset = "BCG",
  studies = as.character(dat.bcg$author),
  estimates = as.numeric(loo$estimate),
  se = as.numeric(loo$se),
  tau2 = as.numeric(loo$tau2),
  I2 = as.numeric(loo$I2)
)

cat("BCG Leave-One-Out (first 3 studies):\n")
for (i in 1:3) {
  cat("  Omit", dat.bcg$author[i], ": estimate =", round(loo$estimate[i], 4),
      ", I2 =", round(loo$I2[i], 1), "%\n")
}

# ==============================================================================
# SECTION 5: TRIM AND FILL
# ==============================================================================

cat("\n=== SECTION 5: Trim and Fill ===\n\n")

# Use magnesium data (known publication bias)
tf <- trimfill(mag_reml)
results$trim_fill <- list(
  dataset = "Magnesium",
  original_k = mag_reml$k,
  original_estimate = as.numeric(mag_reml$beta),
  filled_k = tf$k,
  filled_estimate = as.numeric(tf$beta),
  k0 = tf$k0,
  side = tf$side
)

cat("Magnesium Trim and Fill:\n")
cat("  Original: k =", mag_reml$k, ", estimate =", round(mag_reml$beta, 4), "\n")
cat("  Filled:   k =", tf$k, ", estimate =", round(tf$beta, 4), "\n")
cat("  Imputed studies:", tf$k0, "on", tf$side, "side\n")

# Also for BCG
tf_bcg <- trimfill(bcg_reml)
results$trim_fill_bcg <- list(
  dataset = "BCG",
  original_k = bcg_reml$k,
  original_estimate = as.numeric(bcg_reml$beta),
  filled_k = tf_bcg$k,
  filled_estimate = as.numeric(tf_bcg$beta),
  k0 = tf_bcg$k0
)
cat("\nBCG Trim and Fill:\n")
cat("  Original: k =", bcg_reml$k, ", estimate =", round(bcg_reml$beta, 4), "\n")
cat("  Filled:   k =", tf_bcg$k, ", estimate =", round(tf_bcg$beta, 4), "\n")

# ==============================================================================
# SECTION 6: CUMULATIVE META-ANALYSIS
# ==============================================================================

cat("\n=== SECTION 6: Cumulative Meta-Analysis ===\n\n")

cum <- cumul(bcg_reml, order = dat.bcg$year)
results$cumulative <- list(
  dataset = "BCG",
  order_by = "year",
  years = dat.bcg$year[order(dat.bcg$year)],
  estimates = as.numeric(cum$estimate),
  se = as.numeric(cum$se),
  ci_lower = as.numeric(cum$ci.lb),
  ci_upper = as.numeric(cum$ci.ub)
)

cat("BCG Cumulative Analysis (by year):\n")
ordered_years <- dat.bcg$year[order(dat.bcg$year)]
for (i in c(1, 5, 10, 13)) {
  cat("  After", i, "studies (", ordered_years[i], "): estimate =",
      round(cum$estimate[i], 4), "\n")
}

# ==============================================================================
# SECTION 7: INFLUENCE DIAGNOSTICS
# ==============================================================================

cat("\n=== SECTION 7: Influence Diagnostics ===\n\n")

inf <- influence(bcg_reml)
results$influence <- list(
  dataset = "BCG",
  studies = as.character(dat.bcg$author),
  rstudent = as.numeric(inf$inf$rstudent),
  dffits = as.numeric(inf$inf$dffits),
  cooks_d = as.numeric(inf$inf$cook.d),
  hat = as.numeric(inf$inf$hat),
  weight = as.numeric(inf$inf$weight),
  dfbetas = as.numeric(inf$inf$dfbs.intrcpt)
)

# Find influential studies
influential <- which(abs(inf$inf$rstudent) > 2 | abs(inf$inf$dffits) > 1)
cat("Potentially influential studies (|rstudent| > 2 or |dffits| > 1):\n")
if (length(influential) > 0) {
  for (i in influential) {
    cat("  ", dat.bcg$author[i], ": rstudent =", round(inf$inf$rstudent[i], 2),
        ", dffits =", round(inf$inf$dffits[i], 2), "\n")
  }
} else {
  cat("  None identified\n")
}

# ==============================================================================
# SECTION 8: I² CONFIDENCE INTERVALS
# ==============================================================================

cat("\n=== SECTION 8: I² Confidence Intervals ===\n\n")

# Q-profile method for tau2/I2 CI
het_ci <- confint(bcg_reml)

results$heterogeneity_ci <- list(
  dataset = "BCG",
  I2 = list(
    point = as.numeric(bcg_reml$I2),
    ci_lower = as.numeric(het_ci$random["I^2(%)", "ci.lb"]),
    ci_upper = as.numeric(het_ci$random["I^2(%)", "ci.ub"])
  ),
  tau2 = list(
    point = as.numeric(bcg_reml$tau2),
    ci_lower = as.numeric(het_ci$random["tau^2", "ci.lb"]),
    ci_upper = as.numeric(het_ci$random["tau^2", "ci.ub"])
  )
)

cat("BCG I² = ", round(bcg_reml$I2, 1), "% [",
    round(het_ci$random["I^2(%)", "ci.lb"], 1), "%, ",
    round(het_ci$random["I^2(%)", "ci.ub"], 1), "%]\n")
cat("BCG τ² = ", round(bcg_reml$tau2, 4), " [",
    round(het_ci$random["tau^2", "ci.lb"], 4), ", ",
    round(het_ci$random["tau^2", "ci.ub"], 4), "]\n")

# ==============================================================================
# SAVE RESULTS
# ==============================================================================

cat("\n=== Saving Results ===\n")
output_file <- "C:/Users/user/living-meta/tests/validation/validation_results_extended.json"
write_json(results, output_file, pretty = TRUE, auto_unbox = TRUE)
cat("Results saved to:", output_file, "\n")

cat("\n================================================================\n")
cat("Extended Validation Complete\n")
cat("================================================================\n")
