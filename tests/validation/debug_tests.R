# Debug remaining test failures
library(metafor)

# BCG dataset
bcg <- escalc(measure="OR", ai=tpos, bi=tneg, ci=cpos, di=cneg, data=dat.bcg, append=TRUE)
bcg_dl <- rma(yi, vi, data=bcg, method="DL")

cat("=== BCG DL Results ===\n")
cat("Estimate:", as.numeric(bcg_dl$b), "\n")
cat("tau2:", bcg_dl$tau2, "\n")
cat("SE:", bcg_dl$se, "\n")

# Trim-and-fill
bcg_tf <- trimfill(bcg_dl)
cat("\n=== BCG Trim-Fill ===\n")
cat("k0:", bcg_tf$k0, "\n")
cat("side:", bcg_tf$side, "\n")
cat("adjusted estimate:", as.numeric(bcg_tf$b), "\n")
cat("adjusted SE:", bcg_tf$se, "\n")

# Egger test
bcg_egger <- regtest(bcg_dl)
cat("\n=== BCG Egger Test ===\n")
cat("z-value:", bcg_egger$zval, "\n")
cat("p-value:", bcg_egger$pval, "\n")

# Peters test
bcg_peters <- regtest(bcg_dl, predictor="ni", model="lm")
cat("\n=== BCG Peters Test ===\n")
print(summary(bcg_peters))

# HKSJ for SMD data
smd_data <- data.frame(
  yi = c(0.728362, 0.853154, 0.646115, 0.634716, 0.531524,
         0.725031, 0.769912, 0.708831, 0.873785, 0.713559),
  vi = c(0.089004, 0.075322, 0.091659, 0.062828, 0.071483,
         0.054685, 0.064245, 0.078828, 0.059252, 0.067677)
)

smd_dl <- rma(yi, vi, data=smd_data, method="DL")
smd_hksj <- rma(yi, vi, data=smd_data, method="DL", test="knha")

cat("\n=== SMD HKSJ ===\n")
cat("DL estimate:", as.numeric(smd_dl$b), "\n")
cat("DL tau2:", smd_dl$tau2, "\n")
cat("DL SE:", smd_dl$se, "\n")
cat("HKSJ CI lower:", smd_hksj$ci.lb, "\n")
cat("HKSJ CI upper:", smd_hksj$ci.ub, "\n")
cat("HKSJ SE:", smd_hksj$se, "\n")
cat("t-value:", smd_hksj$zval, "\n")

# Check what df metafor uses
cat("\ndf for HKSJ:", smd_hksj$ddf, "\n")
cat("t crit (0.975, df=9):", qt(0.975, 9), "\n")
