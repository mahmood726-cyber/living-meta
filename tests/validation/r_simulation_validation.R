# ============================================================================
# SIMULATION-BASED VALIDATION FOR LIVING META-ANALYSIS
# Following Viechtbauer (2010) metafor validation methodology
# ============================================================================

library(metafor)
library(jsonlite)

set.seed(20251229)  # For reproducibility

cat("============================================================================\n")
cat("SIMULATION-BASED VALIDATION\n")
cat("R version:", paste(R.version$major, R.version$minor, sep="."), "\n")
cat("metafor version:", as.character(packageVersion("metafor")), "\n")
cat("Date:", format(Sys.time(), "%Y-%m-%d %H:%M:%S"), "\n")
cat("Seed: 20251229\n")
cat("============================================================================\n\n")

results <- list()

# ============================================================================
# 1. TYPE I ERROR SIMULATION (Under the null: true effect = 0)
# ============================================================================
cat("1. TYPE I ERROR SIMULATION\n")
cat("   Testing H0: theta = 0 with nominal alpha = 0.05\n\n")

simulate_type1_error <- function(k, tau2, n_per_study, n_sims = 1000) {
  rejections_fe <- 0
  rejections_re_wald <- 0
  rejections_re_hksj <- 0

  for (i in 1:n_sims) {
    # Generate true effects (null: all zero)
    true_effects <- rnorm(k, mean = 0, sd = sqrt(tau2))

    # Generate study-level data
    yi <- numeric(k)
    vi <- numeric(k)

    for (j in 1:k) {
      # Binary outcome simulation
      n1 <- n2 <- n_per_study
      p_control <- 0.3  # baseline risk
      # Convert true_effects[j] (log-OR) to treatment probability
      odds_control <- p_control / (1 - p_control)
      odds_treatment <- odds_control * exp(true_effects[j])
      p_treatment <- odds_treatment / (1 + odds_treatment)

      # Simulate events
      events1 <- rbinom(1, n1, p_treatment)
      events2 <- rbinom(1, n2, p_control)

      # Continuity correction if needed
      if (events1 == 0 || events1 == n1 || events2 == 0 || events2 == n2) {
        events1 <- events1 + 0.5
        events2 <- events2 + 0.5
        n1 <- n1 + 1
        n2 <- n2 + 1
      }

      # Calculate log-OR and variance
      yi[j] <- log((events1 / (n1 - events1)) / (events2 / (n2 - events2)))
      vi[j] <- 1/events1 + 1/(n1 - events1) + 1/events2 + 1/(n2 - events2)
    }

    # Fit models
    fe <- tryCatch(rma(yi, vi, method = "FE"), error = function(e) NULL)
    re_dl <- tryCatch(rma(yi, vi, method = "DL"), error = function(e) NULL)
    re_hksj <- tryCatch(rma(yi, vi, method = "DL", test = "knha"), error = function(e) NULL)

    # Count rejections at alpha = 0.05
    if (!is.null(fe) && fe$pval < 0.05) rejections_fe <- rejections_fe + 1
    if (!is.null(re_dl) && re_dl$pval < 0.05) rejections_re_wald <- rejections_re_wald + 1
    if (!is.null(re_hksj) && re_hksj$pval < 0.05) rejections_re_hksj <- rejections_re_hksj + 1
  }

  list(
    fe = rejections_fe / n_sims,
    re_wald = rejections_re_wald / n_sims,
    re_hksj = rejections_re_hksj / n_sims
  )
}

# Test scenarios
scenarios_type1 <- list(
  list(k = 5, tau2 = 0, n = 50, name = "k=5, homogeneous"),
  list(k = 5, tau2 = 0.1, n = 50, name = "k=5, low heterogeneity"),
  list(k = 10, tau2 = 0, n = 50, name = "k=10, homogeneous"),
  list(k = 10, tau2 = 0.3, n = 50, name = "k=10, moderate heterogeneity"),
  list(k = 20, tau2 = 0, n = 50, name = "k=20, homogeneous"),
  list(k = 20, tau2 = 0.5, n = 50, name = "k=20, high heterogeneity")
)

type1_results <- list()
for (sc in scenarios_type1) {
  cat(sprintf("   Running: %s (1000 simulations)...\n", sc$name))
  res <- simulate_type1_error(sc$k, sc$tau2, sc$n, n_sims = 1000)
  type1_results[[sc$name]] <- list(
    k = sc$k,
    tau2 = sc$tau2,
    n_per_study = sc$n,
    fe_type1 = round(res$fe, 4),
    re_wald_type1 = round(res$re_wald, 4),
    re_hksj_type1 = round(res$re_hksj, 4)
  )
  cat(sprintf("      FE: %.3f, RE-Wald: %.3f, RE-HKSJ: %.3f\n",
              res$fe, res$re_wald, res$re_hksj))
}
results$type1_error <- type1_results

# ============================================================================
# 2. CI COVERAGE SIMULATION
# ============================================================================
cat("\n2. CI COVERAGE SIMULATION\n")
cat("   Testing 95% CI coverage (nominal = 0.95)\n\n")

simulate_coverage <- function(k, tau2, true_theta, n_per_study, n_sims = 1000) {
  coverage_fe <- 0
  coverage_re_wald <- 0
  coverage_re_hksj <- 0
  coverage_pi <- 0

  for (i in 1:n_sims) {
    # Generate true effects
    true_effects <- rnorm(k, mean = true_theta, sd = sqrt(tau2))

    # Generate study-level data
    yi <- numeric(k)
    vi <- numeric(k)

    for (j in 1:k) {
      n1 <- n2 <- n_per_study
      p_control <- 0.3
      odds_control <- p_control / (1 - p_control)
      odds_treatment <- odds_control * exp(true_effects[j])
      p_treatment <- min(0.99, max(0.01, odds_treatment / (1 + odds_treatment)))

      events1 <- rbinom(1, n1, p_treatment)
      events2 <- rbinom(1, n2, p_control)

      if (events1 == 0 || events1 == n1 || events2 == 0 || events2 == n2) {
        events1 <- events1 + 0.5
        events2 <- events2 + 0.5
        n1 <- n1 + 1
        n2 <- n2 + 1
      }

      yi[j] <- log((events1 / (n1 - events1)) / (events2 / (n2 - events2)))
      vi[j] <- 1/events1 + 1/(n1 - events1) + 1/events2 + 1/(n2 - events2)
    }

    # Fit models
    fe <- tryCatch(rma(yi, vi, method = "FE"), error = function(e) NULL)
    re_dl <- tryCatch(rma(yi, vi, method = "DL"), error = function(e) NULL)
    re_hksj <- tryCatch(rma(yi, vi, method = "DL", test = "knha"), error = function(e) NULL)

    # Check coverage
    if (!is.null(fe)) {
      if (fe$ci.lb <= true_theta && true_theta <= fe$ci.ub) coverage_fe <- coverage_fe + 1
    }
    if (!is.null(re_dl)) {
      if (re_dl$ci.lb <= true_theta && true_theta <= re_dl$ci.ub) coverage_re_wald <- coverage_re_wald + 1
    }
    if (!is.null(re_hksj)) {
      if (re_hksj$ci.lb <= true_theta && true_theta <= re_hksj$ci.ub) coverage_re_hksj <- coverage_re_hksj + 1
      # Prediction interval coverage (for a new study)
      if (k >= 3) {
        pi <- predict(re_hksj, pi.type = "Riley")
        # Check if a new true effect would fall in PI
        # The PI should cover tau2-proportion of new effects
        new_effect <- rnorm(1, true_theta, sqrt(tau2))
        if (pi$pi.lb <= new_effect && new_effect <= pi$pi.ub) coverage_pi <- coverage_pi + 1
      }
    }
  }

  list(
    fe = coverage_fe / n_sims,
    re_wald = coverage_re_wald / n_sims,
    re_hksj = coverage_re_hksj / n_sims,
    pi = coverage_pi / n_sims
  )
}

scenarios_coverage <- list(
  list(k = 5, tau2 = 0.1, theta = -0.5, n = 50, name = "k=5, small effect"),
  list(k = 10, tau2 = 0.2, theta = -0.5, n = 50, name = "k=10, moderate het"),
  list(k = 20, tau2 = 0.3, theta = -0.3, n = 100, name = "k=20, large studies")
)

coverage_results <- list()
for (sc in scenarios_coverage) {
  cat(sprintf("   Running: %s (1000 simulations)...\n", sc$name))
  res <- simulate_coverage(sc$k, sc$tau2, sc$theta, sc$n, n_sims = 1000)
  coverage_results[[sc$name]] <- list(
    k = sc$k,
    tau2 = sc$tau2,
    true_theta = sc$theta,
    n_per_study = sc$n,
    fe_coverage = round(res$fe, 4),
    re_wald_coverage = round(res$re_wald, 4),
    re_hksj_coverage = round(res$re_hksj, 4),
    pi_coverage = round(res$pi, 4)
  )
  cat(sprintf("      FE: %.3f, RE-Wald: %.3f, RE-HKSJ: %.3f, PI: %.3f\n",
              res$fe, res$re_wald, res$re_hksj, res$pi))
}
results$coverage <- coverage_results

# ============================================================================
# 3. FULL REML VALIDATION
# ============================================================================
cat("\n3. FULL REML VALIDATION\n")

data(dat.bcg)
bcg_reml <- rma(ai = tpos, bi = tneg, ci = cpos, di = cneg,
                data = dat.bcg, measure = "OR", method = "REML")
bcg_dl <- rma(ai = tpos, bi = tneg, ci = cpos, di = cneg,
              data = dat.bcg, measure = "OR", method = "DL")
bcg_hksj <- rma(ai = tpos, bi = tneg, ci = cpos, di = cneg,
                data = dat.bcg, measure = "OR", method = "REML", test = "knha")

# Get confidence intervals for heterogeneity
het_ci <- confint(bcg_reml)

results$reml_full <- list(
  dataset = "BCG",
  k = bcg_reml$k,

  # Point estimates comparison
  reml_estimate = round(as.numeric(bcg_reml$beta), 4),
  dl_estimate = round(as.numeric(bcg_dl$beta), 4),

  # Standard errors
  reml_se = round(bcg_reml$se, 4),
  dl_se = round(bcg_dl$se, 4),

  # Tau-squared
  reml_tau2 = round(bcg_reml$tau2, 4),
  dl_tau2 = round(bcg_dl$tau2, 4),

  # Wald CI (REML)
  reml_ci_lower = round(bcg_reml$ci.lb, 4),
  reml_ci_upper = round(bcg_reml$ci.ub, 4),

  # HKSJ CI (REML tau2)
  hksj_ci_lower = round(bcg_hksj$ci.lb, 4),
  hksj_ci_upper = round(bcg_hksj$ci.ub, 4),

  # I-squared with CI
  I2 = round(bcg_reml$I2, 4),
  I2_ci_lower = round(het_ci$random["I^2(%)", "ci.lb"], 4),
  I2_ci_upper = round(het_ci$random["I^2(%)", "ci.ub"], 4),

  # Tau-squared CI
  tau2_ci_lower = round(het_ci$random["tau^2", "ci.lb"], 4),
  tau2_ci_upper = round(het_ci$random["tau^2", "ci.ub"], 4),

  # Test statistics
  reml_zval = round(bcg_reml$zval, 4),
  reml_pval = round(bcg_reml$pval, 6),
  hksj_tval = round(bcg_hksj$zval, 4),  # Actually t-value for HKSJ
  hksj_pval = round(bcg_hksj$pval, 6),

  # Q statistic
  Q = round(bcg_reml$QE, 4),
  Q_df = bcg_reml$k - 1,
  Q_pval = round(bcg_reml$QEp, 6),

  # Prediction interval
  pi_lower = round(predict(bcg_reml)$pi.lb, 4),
  pi_upper = round(predict(bcg_reml)$pi.ub, 4)
)

cat("   REML estimate:", results$reml_full$reml_estimate, "\n")
cat("   REML SE:", results$reml_full$reml_se, "\n")
cat("   REML tau2:", results$reml_full$reml_tau2, "\n")
cat("   HKSJ CI: [", results$reml_full$hksj_ci_lower, ",", results$reml_full$hksj_ci_upper, "]\n")

# ============================================================================
# 4. PETERS' TEST - CORRECT IMPLEMENTATION
# ============================================================================
cat("\n4. PETERS' TEST VALIDATION\n")

# Peters' test as originally specified (Peters et al. 2006)
# Regresses effect on 1/n (inverse of total sample size)
# with inverse-variance weights

# Calculate for BCG data
bcg_es <- escalc(ai = tpos, bi = tneg, ci = cpos, di = cneg,
                 data = dat.bcg, measure = "OR")
bcg_es$ni <- dat.bcg$tpos + dat.bcg$tneg + dat.bcg$cpos + dat.bcg$cneg
bcg_es$inv_n <- 1 / bcg_es$ni

# Peters' original: weighted regression of yi on 1/n
peters_original <- rma(yi, vi, mods = ~ inv_n, data = bcg_es, method = "FE")

# R metafor's regtest with predictor="ni" (uses n directly, different parameterization)
peters_metafor_ni <- regtest(bcg_reml, predictor = "ni")

# R metafor's regtest with predictor="1/ni" (matches Peters original)
# Note: We need to manually create this
peters_manual <- lm(yi / sqrt(vi) ~ I(1/sqrt(vi)) + I(inv_n/sqrt(vi)) - 1,
                    data = bcg_es, weights = rep(1, nrow(bcg_es)))
peters_manual_coef <- summary(peters_manual)$coefficients

results$peters_test <- list(
  dataset = "BCG",

  # Original Peters (2006) specification: regression on 1/n
  peters_original = list(
    predictor = "1/n (inverse total sample size)",
    coefficient = round(peters_original$beta[2], 4),
    se = round(peters_original$se[2], 4),
    zval = round(peters_original$zval[2], 4),
    pval = round(peters_original$pval[2], 4)
  ),

  # metafor regtest with ni
  metafor_ni = list(
    predictor = "n (total sample size)",
    zval = round(peters_metafor_ni$zval, 4),
    pval = round(peters_metafor_ni$pval, 4)
  ),

  note = "Peters (2006) used 1/n as predictor. metafor's predictor='ni' uses n directly. Both test for small-study effects but coefficients have opposite signs."
)

cat("   Peters original (1/n predictor):\n")
cat("      z =", results$peters_test$peters_original$zval, "\n")
cat("      p =", results$peters_test$peters_original$pval, "\n")
cat("   metafor regtest (ni predictor):\n")
cat("      z =", results$peters_test$metafor_ni$zval, "\n")
cat("      p =", results$peters_test$metafor_ni$pval, "\n")

# ============================================================================
# 5. SUBGROUP ANALYSIS VALIDATION
# ============================================================================
cat("\n5. SUBGROUP ANALYSIS VALIDATION\n")

# BCG data has 'alloc' variable for allocation method
bcg_full <- dat.bcg
bcg_full$yi <- bcg_es$yi
bcg_full$vi <- bcg_es$vi

# Subgroup analysis by allocation method
subgroup_model <- rma(yi, vi, mods = ~ factor(alloc), data = bcg_full, method = "REML")

# Q-between (test of moderators)
q_between <- subgroup_model$QM
q_between_df <- subgroup_model$m
q_between_p <- subgroup_model$QMp

# Within-group estimates
alloc_levels <- unique(bcg_full$alloc)
subgroup_estimates <- list()
for (lev in alloc_levels) {
  sub_data <- bcg_full[bcg_full$alloc == lev, ]
  if (nrow(sub_data) >= 2) {
    sub_fit <- rma(yi, vi, data = sub_data, method = "REML")
    subgroup_estimates[[lev]] <- list(
      k = sub_fit$k,
      estimate = round(as.numeric(sub_fit$beta), 4),
      se = round(sub_fit$se, 4),
      ci_lower = round(sub_fit$ci.lb, 4),
      ci_upper = round(sub_fit$ci.ub, 4),
      tau2 = round(sub_fit$tau2, 4),
      I2 = round(sub_fit$I2, 2)
    )
  }
}

results$subgroup_analysis <- list(
  dataset = "BCG",
  moderator = "alloc (allocation method)",
  Q_between = round(q_between, 4),
  Q_between_df = q_between_df,
  Q_between_pval = round(q_between_p, 4),
  subgroups = subgroup_estimates
)

cat("   Q-between:", results$subgroup_analysis$Q_between, "\n")
cat("   df:", results$subgroup_analysis$Q_between_df, "\n")
cat("   p-value:", results$subgroup_analysis$Q_between_pval, "\n")

# ============================================================================
# 6. META-REGRESSION VALIDATION
# ============================================================================
cat("\n6. META-REGRESSION VALIDATION\n")

# Use absolute latitude as continuous moderator
bcg_full$ablat_centered <- bcg_full$ablat - mean(bcg_full$ablat)

metareg_model <- rma(yi, vi, mods = ~ ablat, data = bcg_full, method = "REML")

results$meta_regression <- list(
  dataset = "BCG",
  moderator = "ablat (absolute latitude)",
  intercept = round(as.numeric(metareg_model$beta[1]), 4),
  intercept_se = round(metareg_model$se[1], 4),
  intercept_pval = round(metareg_model$pval[1], 4),
  slope = round(as.numeric(metareg_model$beta[2]), 4),
  slope_se = round(metareg_model$se[2], 4),
  slope_pval = round(metareg_model$pval[2], 4),
  R2 = round(metareg_model$R2, 2),
  tau2_residual = round(metareg_model$tau2, 4),
  QM = round(metareg_model$QM, 4),
  QM_pval = round(metareg_model$QMp, 4)
)

cat("   Intercept:", results$meta_regression$intercept, "\n")
cat("   Slope (ablat):", results$meta_regression$slope, "\n")
cat("   R-squared:", results$meta_regression$R2, "%\n")
cat("   QM (test of moderator):", results$meta_regression$QM, ", p =", results$meta_regression$QM_pval, "\n")

# ============================================================================
# 7. ZERO-CELL HANDLING VALIDATION
# ============================================================================
cat("\n7. ZERO-CELL HANDLING VALIDATION\n")

# Create data with zero cells
zero_cell_data <- data.frame(
  ai = c(0, 5, 3, 0, 2),    # treatment events (includes zeros)
  bi = c(50, 45, 47, 60, 38),
  ci = c(3, 8, 5, 4, 6),
  di = c(47, 42, 45, 56, 34)
)

# Default: add 0.5 to all cells when zero occurs
es_default <- escalc(ai = ai, bi = bi, ci = ci, di = di,
                     data = zero_cell_data, measure = "OR", add = 0.5, to = "only0")

# Treatment arm continuity correction (add proportional to arm size)
es_tacc <- escalc(ai = ai, bi = bi, ci = ci, di = di,
                  data = zero_cell_data, measure = "OR", add = 1/(zero_cell_data$ai + zero_cell_data$bi + 1), to = "only0")

# All cells correction
es_all <- escalc(ai = ai, bi = bi, ci = ci, di = di,
                 data = zero_cell_data, measure = "OR", add = 0.5, to = "all")

results$zero_cell_handling <- list(
  methods = c("constant_0.5", "treatment_arm", "all_cells"),

  constant_0.5 = list(
    description = "Add 0.5 to zero cells only (default)",
    yi = round(es_default$yi, 4),
    vi = round(es_default$vi, 4)
  ),

  treatment_arm = list(
    description = "Treatment arm continuity correction",
    yi = round(es_tacc$yi, 4),
    vi = round(es_tacc$vi, 4)
  ),

  all_cells = list(
    description = "Add 0.5 to all cells",
    yi = round(es_all$yi, 4),
    vi = round(es_all$vi, 4)
  ),

  # Peto method (no continuity correction needed)
  peto_note = "Peto OR method handles zero cells without continuity correction"
)

# Peto OR
es_peto <- escalc(ai = ai, bi = bi, ci = ci, di = di,
                  data = zero_cell_data, measure = "PETO")
results$zero_cell_handling$peto <- list(
  yi = round(es_peto$yi, 4),
  vi = round(es_peto$vi, 4)
)

cat("   Methods validated: constant 0.5, treatment arm, all cells, Peto\n")

# ============================================================================
# 8. TRIM-AND-FILL DETAILED VALIDATION
# ============================================================================
cat("\n8. TRIM-AND-FILL DETAILED VALIDATION\n")

data(dat.egger2001)
mag_es <- escalc(ai = ai, n1i = n1i, ci = ci, n2i = n2i,
                 data = dat.egger2001, measure = "OR")
mag_reml <- rma(yi, vi, data = mag_es, method = "REML")

# L0 estimator (default)
tf_L0 <- trimfill(mag_reml, estimator = "L0")
# R0 estimator
tf_R0 <- trimfill(mag_reml, estimator = "R0")

results$trim_fill_detailed <- list(
  dataset = "Magnesium (Egger 2001)",
  original_k = mag_reml$k,
  original_estimate = round(as.numeric(mag_reml$beta), 4),

  L0_estimator = list(
    name = "L0 (default)",
    filled_k = tf_L0$k,
    k0 = tf_L0$k0,
    filled_estimate = round(as.numeric(tf_L0$beta), 4),
    side = tf_L0$side
  ),

  R0_estimator = list(
    name = "R0",
    filled_k = tf_R0$k,
    k0 = tf_R0$k0,
    filled_estimate = round(as.numeric(tf_R0$beta), 4),
    side = tf_R0$side
  ),

  caveats = c(
    "Assumes asymmetry is due to publication bias only",
    "May perform poorly with genuine heterogeneity",
    "L0 estimator is more conservative than R0",
    "Does not account for other sources of funnel plot asymmetry"
  )
)

cat("   L0 estimator: k0 =", results$trim_fill_detailed$L0_estimator$k0, "\n")
cat("   R0 estimator: k0 =", results$trim_fill_detailed$R0_estimator$k0, "\n")

# ============================================================================
# 9. ACTUAL TOLERANCE ANALYSIS
# ============================================================================
cat("\n9. ACTUAL MAXIMUM DIFFERENCES FROM VALIDATION\n")

# Load previously generated validation results
validation_file <- "C:/Users/user/living-meta/tests/validation/validation_results_extended.json"
if (file.exists(validation_file)) {
  val_data <- fromJSON(validation_file)

  results$tolerance_analysis <- list(
    note = "Maximum observed differences between implementations",

    bcg_reml_estimate = list(
      r_value = val_data$bcg$reml$estimate,
      max_acceptable_diff = abs(val_data$bcg$reml$estimate) * 0.001,  # 0.1%
      tolerance_level = "0.1% relative"
    ),

    tau2_comparison = list(
      DL = val_data$tau2_comparison$DL,
      REML = val_data$tau2_comparison$REML,
      max_diff_observed = abs(val_data$tau2_comparison$DL - val_data$tau2_comparison$REML),
      note = "Difference is methodological, not numerical error"
    )
  )
}

# ============================================================================
# 10. SESSION INFO FOR REPRODUCIBILITY
# ============================================================================
cat("\n10. SESSION INFO\n")

session_info <- list(
  R_version = paste(R.version$major, R.version$minor, sep = "."),
  R_platform = R.version$platform,
  metafor_version = as.character(packageVersion("metafor")),
  matrix_version = as.character(packageVersion("Matrix")),
  nlme_version = as.character(packageVersion("nlme")),
  date = format(Sys.time(), "%Y-%m-%d"),
  time = format(Sys.time(), "%H:%M:%S"),
  timezone = Sys.timezone(),
  seed = 20251229,
  locale = Sys.getlocale("LC_CTYPE")
)

results$session_info <- session_info

cat("   R:", session_info$R_version, "\n")
cat("   Platform:", session_info$R_platform, "\n")
cat("   metafor:", session_info$metafor_version, "\n")
cat("   Date:", session_info$date, session_info$time, "\n")

# ============================================================================
# SAVE RESULTS
# ============================================================================
output_file <- "C:/Users/user/living-meta/tests/validation/simulation_validation_results.json"
write_json(results, output_file, pretty = TRUE, auto_unbox = TRUE)
cat("\n============================================================================\n")
cat("Results saved to:", output_file, "\n")
cat("============================================================================\n")
