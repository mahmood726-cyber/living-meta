# Debug Peters test implementation
library(metafor)

bcg <- escalc(measure="OR", ai=tpos, bi=tneg, ci=cpos, di=cneg, data=dat.bcg, append=TRUE)
bcg$n <- bcg$tpos + bcg$tneg + bcg$cpos + bcg$cneg

bcg_dl <- rma(yi, vi, data=bcg, method="DL")

# Peters test
cat("=== Peters test details ===\n")
bcg_peters <- regtest(bcg_dl, predictor="ni", model="lm")
cat("p-value:", bcg_peters$pval, "\n")
cat("z-value:", bcg_peters$zval, "\n")
cat("dfs:", bcg_peters$dfs, "\n\n")

# Get the underlying fit
print(summary(bcg_peters$fit))

# Manual calculation
cat("\n=== Manual calculation ===\n")
cat("yi:", bcg$yi, "\n")
cat("vi:", bcg$vi, "\n")
cat("n:", bcg$n, "\n")

# Peters uses: yi ~ 1/n (weighted by 1/vi)
# Let's do the regression manually
y <- bcg$yi
x <- 1/bcg$n
w <- 1/bcg$vi

# Weighted regression
wls_fit <- lm(y ~ x, weights = w)
cat("\nWeighted regression summary:\n")
print(summary(wls_fit))

# Compare t-test for slope
cat("\nt-value for slope:", summary(wls_fit)$coefficients[2,3], "\n")
cat("p-value for slope:", summary(wls_fit)$coefficients[2,4], "\n")

# Also check HKSJ q value
smd_data <- data.frame(
  yi = c(0.728362, 0.853154, 0.646115, 0.634716, 0.531524,
         0.725031, 0.769912, 0.708831, 0.873785, 0.713559),
  vi = c(0.089004, 0.075322, 0.091659, 0.062828, 0.071483,
         0.054685, 0.064245, 0.078828, 0.059252, 0.067677)
)

smd_dl <- rma(yi, vi, data=smd_data, method="DL")
smd_hksj <- rma(yi, vi, data=smd_data, method="DL", test="knha")

cat("\n=== SMD HKSJ details ===\n")
cat("DL estimate:", as.numeric(smd_dl$b), "\n")
cat("DL SE:", smd_dl$se, "\n")
cat("HKSJ SE:", smd_hksj$se, "\n")
cat("Q statistic:", smd_dl$QE, "\n")
cat("q = Q/(k-1):", smd_dl$QE/9, "\n")

# Compute q manually using RE weights
wi <- 1/(smd_data$vi + smd_dl$tau2)
theta <- as.numeric(smd_dl$b)
q_manual <- sum(wi * (smd_data$yi - theta)^2) / 9
cat("q (manual with RE weights):", q_manual, "\n")
cat("sqrt(q):", sqrt(q_manual), "\n")
cat("SE_HKSJ (computed):", smd_dl$se * sqrt(q_manual), "\n")
