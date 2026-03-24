#' IPD Meta-Analysis Validation Script
#'
#' Validates JavaScript IPD implementation against R packages:
#' - survival (Kaplan-Meier, log-rank, Cox)
#' - lme4 (mixed models)
#' - metafor (two-stage pooling)
#' - survRM2 (RMST)
#'
#' Reference for comparison with Stata ipdmetan
#'

# Load required packages
suppressPackageStartupMessages({
  library(survival)
  library(metafor)
  if (requireNamespace("lme4", quietly = TRUE)) library(lme4)
  if (requireNamespace("survRM2", quietly = TRUE)) library(survRM2)
})

set.seed(20251229)

# Output file
results_file <- "ipd_validation_results.json"

#' Generate synthetic IPD for validation
generate_ipd_continuous <- function(k = 5, n_per_study = 50, true_effect = 0.5, tau2 = 0.1) {
  ipd <- data.frame()

  for (i in 1:k) {
    # Study-specific effect
    study_effect <- true_effect + rnorm(1, 0, sqrt(tau2))

    n <- n_per_study
    treatment <- rep(c(0, 1), each = n/2)
    outcome <- rnorm(n, mean = 2 + study_effect * treatment, sd = 1)

    ipd <- rbind(ipd, data.frame(
      studyId = i,
      treatment = treatment,
      outcome = outcome
    ))
  }

  return(ipd)
}

generate_ipd_binary <- function(k = 5, n_per_study = 100, log_or = 0.5, tau2 = 0.05) {
  ipd <- data.frame()

  for (i in 1:k) {
    study_log_or <- log_or + rnorm(1, 0, sqrt(tau2))

    n <- n_per_study
    treatment <- rep(c(0, 1), each = n/2)

    # Baseline probability 0.2
    p_control <- 0.2
    p_treat <- p_control * exp(study_log_or) / (1 - p_control + p_control * exp(study_log_or))

    event <- ifelse(treatment == 1,
                    rbinom(n/2, 1, p_treat),
                    rbinom(n/2, 1, p_control))

    ipd <- rbind(ipd, data.frame(
      studyId = i,
      treatment = c(rep(0, n/2), rep(1, n/2)),
      event = event
    ))
  }

  return(ipd)
}

generate_ipd_survival <- function(k = 5, n_per_study = 80, log_hr = -0.5, tau2 = 0.05) {
  ipd <- data.frame()

  for (i in 1:k) {
    study_log_hr <- log_hr + rnorm(1, 0, sqrt(tau2))

    n <- n_per_study
    treatment <- rep(c(0, 1), each = n/2)

    # Exponential survival times
    lambda_control <- 0.1
    lambda_treat <- lambda_control * exp(study_log_hr)

    time <- ifelse(treatment == 1,
                   rexp(n/2, lambda_treat),
                   rexp(n/2, lambda_control))

    # Random censoring at 10 time units
    censor_time <- runif(n, 5, 15)
    event <- ifelse(time <= censor_time, 1, 0)
    time <- pmin(time, censor_time)

    ipd <- rbind(ipd, data.frame(
      studyId = i,
      treatment = c(rep(0, n/2), rep(1, n/2)),
      time = time,
      event = event
    ))
  }

  return(ipd)
}

cat("Generating synthetic IPD datasets...\n")

# Generate datasets
ipd_cont <- generate_ipd_continuous(k = 6, n_per_study = 60, true_effect = 0.4, tau2 = 0.08)
ipd_binary <- generate_ipd_binary(k = 6, n_per_study = 120, log_or = 0.6, tau2 = 0.04)
ipd_surv <- generate_ipd_survival(k = 6, n_per_study = 100, log_hr = -0.4, tau2 = 0.03)

# ============================================================================
# VALIDATION 1: Kaplan-Meier Estimation
# ============================================================================
cat("\n=== Kaplan-Meier Validation ===\n")

km_results <- list()

# Fit KM for each study in survival IPD
for (sid in unique(ipd_surv$studyId)) {
  sdata <- ipd_surv[ipd_surv$studyId == sid, ]
  km_fit <- survfit(Surv(time, event) ~ 1, data = sdata)

  km_results[[paste0("study_", sid)]] <- list(
    n = nrow(sdata),
    events = sum(sdata$event),
    median = summary(km_fit)$table["median"],
    survival_times = km_fit$time,
    survival = km_fit$surv,
    lower = km_fit$lower,
    upper = km_fit$upper
  )
}

# Overall KM
km_overall <- survfit(Surv(time, event) ~ 1, data = ipd_surv)
km_results$overall <- list(
  n = nrow(ipd_surv),
  events = sum(ipd_surv$event),
  median = summary(km_overall)$table["median"],
  survival_at_5 = summary(km_overall, times = 5)$surv,
  survival_at_10 = summary(km_overall, times = 10)$surv
)

cat("KM overall median survival:", km_results$overall$median, "\n")
cat("KM S(5):", km_results$overall$survival_at_5, "\n")
cat("KM S(10):", km_results$overall$survival_at_10, "\n")

# ============================================================================
# VALIDATION 2: Log-Rank Test
# ============================================================================
cat("\n=== Log-Rank Test Validation ===\n")

logrank_results <- list()

# Overall log-rank
lr_overall <- survdiff(Surv(time, event) ~ treatment, data = ipd_surv)
logrank_results$overall <- list(
  statistic = lr_overall$chisq,
  df = length(lr_overall$n) - 1,
  pvalue = 1 - pchisq(lr_overall$chisq, 1),
  observed = lr_overall$obs,
  expected = lr_overall$exp
)

cat("Log-rank chi-sq:", logrank_results$overall$statistic, "\n")
cat("Log-rank p-value:", logrank_results$overall$pvalue, "\n")

# Per-study log-rank
for (sid in unique(ipd_surv$studyId)) {
  sdata <- ipd_surv[ipd_surv$studyId == sid, ]
  lr_study <- survdiff(Surv(time, event) ~ treatment, data = sdata)

  logrank_results[[paste0("study_", sid)]] <- list(
    statistic = lr_study$chisq,
    pvalue = 1 - pchisq(lr_study$chisq, 1)
  )
}

# ============================================================================
# VALIDATION 3: Cox Proportional Hazards
# ============================================================================
cat("\n=== Cox PH Validation ===\n")

cox_results <- list()

# Simple Cox model (stratified by study)
cox_simple <- coxph(Surv(time, event) ~ treatment, data = ipd_surv)
cox_stratified <- coxph(Surv(time, event) ~ treatment + strata(studyId), data = ipd_surv)

cox_results$simple <- list(
  logHR = coef(cox_simple),
  HR = exp(coef(cox_simple)),
  se = sqrt(vcov(cox_simple)[1,1]),
  ci_lower = exp(confint(cox_simple))[1],
  ci_upper = exp(confint(cox_simple))[2],
  pvalue = summary(cox_simple)$coefficients[, "Pr(>|z|)"],
  concordance = summary(cox_simple)$concordance[1]
)

cox_results$stratified <- list(
  logHR = coef(cox_stratified),
  HR = exp(coef(cox_stratified)),
  se = sqrt(vcov(cox_stratified)[1,1]),
  ci_lower = exp(confint(cox_stratified))[1],
  ci_upper = exp(confint(cox_stratified))[2],
  pvalue = summary(cox_stratified)$coefficients[, "Pr(>|z|)"]
)

cat("Cox simple HR:", cox_results$simple$HR, "\n")
cat("Cox stratified HR:", cox_results$stratified$HR, "\n")

# ============================================================================
# VALIDATION 4: RMST (if survRM2 available)
# ============================================================================
cat("\n=== RMST Validation ===\n")

rmst_results <- list()

if (requireNamespace("survRM2", quietly = TRUE)) {
  # RMST comparison at tau = 10
  rmst_fit <- survRM2::rmst2(
    time = ipd_surv$time,
    status = ipd_surv$event,
    arm = ipd_surv$treatment,
    tau = 10
  )

  rmst_results <- list(
    tau = 10,
    rmst_control = rmst_fit$RMST.arm0$rmst["Est."],
    rmst_treatment = rmst_fit$RMST.arm1$rmst["Est."],
    difference = rmst_fit$unadjusted.result[1, "Est."],
    difference_se = rmst_fit$unadjusted.result[1, "se"],
    difference_pvalue = rmst_fit$unadjusted.result[1, "p"],
    ratio = rmst_fit$unadjusted.result[2, "Est."]
  )

  cat("RMST control:", rmst_results$rmst_control, "\n")
  cat("RMST treatment:", rmst_results$rmst_treatment, "\n")
  cat("RMST difference:", rmst_results$difference, "\n")
} else {
  cat("survRM2 not available, skipping RMST validation\n")
}

# ============================================================================
# VALIDATION 5: Two-Stage IPD Meta-Analysis (Continuous)
# ============================================================================
cat("\n=== Two-Stage Continuous Validation ===\n")

two_stage_cont <- list()

# Stage 1: Study-level estimates
study_estimates <- data.frame()

for (sid in unique(ipd_cont$studyId)) {
  sdata <- ipd_cont[ipd_cont$studyId == sid, ]

  trt <- sdata[sdata$treatment == 1, "outcome"]
  ctrl <- sdata[sdata$treatment == 0, "outcome"]

  md <- mean(trt) - mean(ctrl)
  var_md <- var(trt)/length(trt) + var(ctrl)/length(ctrl)

  study_estimates <- rbind(study_estimates, data.frame(
    studyId = sid,
    yi = md,
    vi = var_md,
    n = nrow(sdata)
  ))
}

two_stage_cont$stage1 <- as.list(study_estimates)

# Stage 2: Pool with metafor
ma_cont <- rma(yi = yi, vi = vi, data = study_estimates, method = "DL")

two_stage_cont$stage2 <- list(
  estimate = as.numeric(ma_cont$beta),
  se = ma_cont$se,
  ci_lower = ma_cont$ci.lb,
  ci_upper = ma_cont$ci.ub,
  pvalue = ma_cont$pval,
  tau2 = ma_cont$tau2,
  I2 = ma_cont$I2,
  Q = ma_cont$QE,
  k = ma_cont$k
)

cat("Two-stage continuous estimate:", two_stage_cont$stage2$estimate, "\n")
cat("Two-stage continuous tau2:", two_stage_cont$stage2$tau2, "\n")

# ============================================================================
# VALIDATION 6: Two-Stage IPD Meta-Analysis (Binary)
# ============================================================================
cat("\n=== Two-Stage Binary Validation ===\n")

two_stage_binary <- list()

# Stage 1: Study-level log-OR
study_or <- data.frame()

for (sid in unique(ipd_binary$studyId)) {
  sdata <- ipd_binary[ipd_binary$studyId == sid, ]

  a <- sum(sdata$treatment == 1 & sdata$event == 1)
  b <- sum(sdata$treatment == 1 & sdata$event == 0)
  c <- sum(sdata$treatment == 0 & sdata$event == 1)
  d <- sum(sdata$treatment == 0 & sdata$event == 0)

  # Add continuity correction if needed
  if (a == 0 | b == 0 | c == 0 | d == 0) {
    a <- a + 0.5; b <- b + 0.5; c <- c + 0.5; d <- d + 0.5
  }

  log_or <- log((a * d) / (b * c))
  var_log_or <- 1/a + 1/b + 1/c + 1/d

  study_or <- rbind(study_or, data.frame(
    studyId = sid,
    yi = log_or,
    vi = var_log_or,
    events = sum(sdata$event),
    n = nrow(sdata)
  ))
}

two_stage_binary$stage1 <- as.list(study_or)

# Stage 2: Pool with metafor
ma_binary <- rma(yi = yi, vi = vi, data = study_or, method = "DL")

two_stage_binary$stage2 <- list(
  logOR = as.numeric(ma_binary$beta),
  OR = exp(as.numeric(ma_binary$beta)),
  se = ma_binary$se,
  ci_lower = exp(ma_binary$ci.lb),
  ci_upper = exp(ma_binary$ci.ub),
  pvalue = ma_binary$pval,
  tau2 = ma_binary$tau2,
  I2 = ma_binary$I2
)

cat("Two-stage binary OR:", two_stage_binary$stage2$OR, "\n")

# ============================================================================
# VALIDATION 7: Two-Stage IPD Meta-Analysis (Survival)
# ============================================================================
cat("\n=== Two-Stage Survival Validation ===\n")

two_stage_surv <- list()

# Stage 1: Study-level log-HR (from Cox or log-rank)
study_hr <- data.frame()

for (sid in unique(ipd_surv$studyId)) {
  sdata <- ipd_surv[ipd_surv$studyId == sid, ]

  cox_study <- coxph(Surv(time, event) ~ treatment, data = sdata)

  study_hr <- rbind(study_hr, data.frame(
    studyId = sid,
    yi = coef(cox_study),
    vi = vcov(cox_study)[1,1],
    events = sum(sdata$event),
    n = nrow(sdata)
  ))
}

two_stage_surv$stage1 <- as.list(study_hr)

# Stage 2: Pool with metafor
ma_surv <- rma(yi = yi, vi = vi, data = study_hr, method = "DL")

two_stage_surv$stage2 <- list(
  logHR = as.numeric(ma_surv$beta),
  HR = exp(as.numeric(ma_surv$beta)),
  se = ma_surv$se,
  ci_lower = exp(ma_surv$ci.lb),
  ci_upper = exp(ma_surv$ci.ub),
  pvalue = ma_surv$pval,
  tau2 = ma_surv$tau2,
  I2 = ma_surv$I2
)

cat("Two-stage survival HR:", two_stage_surv$stage2$HR, "\n")

# ============================================================================
# VALIDATION 8: One-Stage Mixed Model (Continuous)
# ============================================================================
cat("\n=== One-Stage Mixed Model (Continuous) Validation ===\n")

one_stage_cont <- list()

if (requireNamespace("lme4", quietly = TRUE)) {
  # Random intercept + random slope model
  lmm_fit <- lme4::lmer(outcome ~ treatment + (1 + treatment | studyId), data = ipd_cont)

  one_stage_cont <- list(
    fixed = list(
      intercept = lme4::fixef(lmm_fit)["(Intercept)"],
      treatment = lme4::fixef(lmm_fit)["treatment"]
    ),
    fixed_se = list(
      intercept = sqrt(diag(vcov(lmm_fit)))["(Intercept)"],
      treatment = sqrt(diag(vcov(lmm_fit)))["treatment"]
    ),
    random = as.data.frame(lme4::VarCorr(lmm_fit)),
    residual_var = sigma(lmm_fit)^2
  )

  cat("One-stage treatment effect:", one_stage_cont$fixed$treatment, "\n")
  cat("One-stage treatment SE:", one_stage_cont$fixed_se$treatment, "\n")
} else {
  cat("lme4 not available, skipping one-stage validation\n")
}

# ============================================================================
# VALIDATION 9: One-Stage Mixed Model (Binary)
# ============================================================================
cat("\n=== One-Stage Mixed Model (Binary) Validation ===\n")

one_stage_binary <- list()

if (requireNamespace("lme4", quietly = TRUE)) {
  # Random intercept model (slope sometimes causes convergence issues)
  glmm_fit <- lme4::glmer(event ~ treatment + (1 | studyId),
                          data = ipd_binary, family = binomial)

  one_stage_binary <- list(
    fixed = list(
      intercept = lme4::fixef(glmm_fit)["(Intercept)"],
      treatment = lme4::fixef(glmm_fit)["treatment"],
      treatment_OR = exp(lme4::fixef(glmm_fit)["treatment"])
    ),
    fixed_se = list(
      intercept = sqrt(diag(vcov(glmm_fit)))["(Intercept)"],
      treatment = sqrt(diag(vcov(glmm_fit)))["treatment"]
    ),
    random_intercept_var = as.data.frame(lme4::VarCorr(glmm_fit))$vcov[1]
  )

  cat("One-stage logOR:", one_stage_binary$fixed$treatment, "\n")
  cat("One-stage OR:", one_stage_binary$fixed$treatment_OR, "\n")
}

# ============================================================================
# Compile Results
# ============================================================================
cat("\n=== Compiling Results ===\n")

validation_results <- list(
  generated_data = list(
    continuous = list(
      k = length(unique(ipd_cont$studyId)),
      n = nrow(ipd_cont),
      studies = as.list(table(ipd_cont$studyId))
    ),
    binary = list(
      k = length(unique(ipd_binary$studyId)),
      n = nrow(ipd_binary),
      total_events = sum(ipd_binary$event)
    ),
    survival = list(
      k = length(unique(ipd_surv$studyId)),
      n = nrow(ipd_surv),
      total_events = sum(ipd_surv$event)
    )
  ),
  kaplan_meier = km_results,
  log_rank = logrank_results,
  cox_ph = cox_results,
  rmst = rmst_results,
  two_stage_continuous = two_stage_cont,
  two_stage_binary = two_stage_binary,
  two_stage_survival = two_stage_surv,
  one_stage_continuous = one_stage_cont,
  one_stage_binary = one_stage_binary,
  session_info = list(
    R_version = R.version.string,
    survival_version = packageVersion("survival"),
    metafor_version = packageVersion("metafor"),
    lme4_version = if (requireNamespace("lme4", quietly = TRUE)) packageVersion("lme4") else "N/A",
    date = Sys.Date(),
    seed = 20251229
  )
)

# Save results
json_output <- jsonlite::toJSON(validation_results, auto_unbox = TRUE, pretty = TRUE)
writeLines(json_output, results_file)

cat("\nResults saved to:", results_file, "\n")

# ============================================================================
# Summary Table
# ============================================================================
cat("\n==========================================\n")
cat("       IPD VALIDATION SUMMARY\n")
cat("==========================================\n\n")

cat("Two-Stage Results:\n")
cat(sprintf("  Continuous MD: %.4f (SE: %.4f, I²: %.1f%%)\n",
            two_stage_cont$stage2$estimate,
            two_stage_cont$stage2$se,
            two_stage_cont$stage2$I2))
cat(sprintf("  Binary OR:     %.4f (SE: %.4f, I²: %.1f%%)\n",
            two_stage_binary$stage2$OR,
            two_stage_binary$stage2$se,
            two_stage_binary$stage2$I2))
cat(sprintf("  Survival HR:   %.4f (SE: %.4f, I²: %.1f%%)\n",
            two_stage_surv$stage2$HR,
            two_stage_surv$stage2$se,
            two_stage_surv$stage2$I2))

cat("\nCox PH Results:\n")
cat(sprintf("  Simple HR:     %.4f [%.4f, %.4f]\n",
            cox_results$simple$HR,
            cox_results$simple$ci_lower,
            cox_results$simple$ci_upper))
cat(sprintf("  Stratified HR: %.4f [%.4f, %.4f]\n",
            cox_results$stratified$HR,
            cox_results$stratified$ci_lower,
            cox_results$stratified$ci_upper))

if (length(one_stage_cont) > 0) {
  cat("\nOne-Stage Results:\n")
  cat(sprintf("  Continuous:    %.4f (SE: %.4f)\n",
              one_stage_cont$fixed$treatment,
              one_stage_cont$fixed_se$treatment))
  cat(sprintf("  Binary OR:     %.4f (SE: %.4f)\n",
              one_stage_binary$fixed$treatment_OR,
              one_stage_binary$fixed_se$treatment))
}

cat("\n==========================================\n")
