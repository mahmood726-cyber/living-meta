# Get exact BCG effect sizes and sample sizes for validation
library(metafor)
library(jsonlite)

bcg <- escalc(measure="OR", ai=tpos, bi=tneg, ci=cpos, di=cneg,
              data=dat.bcg, append=TRUE)

# Print exact values
cat("BCG yi values:\n")
cat(paste(sprintf("%.10f", bcg$yi), collapse=", "), "\n\n")

cat("BCG vi values:\n")
cat(paste(sprintf("%.10f", bcg$vi), collapse=", "), "\n\n")

# Total sample sizes
bcg$n_total <- bcg$tpos + bcg$tneg + bcg$cpos + bcg$cneg
cat("BCG sample sizes:\n")
cat(paste(bcg$n_total, collapse=", "), "\n\n")

# Also run leave-one-out with exact data
bcg_dl <- rma(yi, vi, data=bcg, method="DL")
bcg_loo <- leave1out(bcg_dl)

cat("LOO estimates:\n")
cat(paste(sprintf("%.10f", bcg_loo$estimate), collapse=", "), "\n\n")

cat("LOO tau2:\n")
cat(paste(sprintf("%.10f", bcg_loo$tau2), collapse=", "), "\n\n")

cat("LOO I2:\n")
cat(paste(sprintf("%.10f", bcg_loo$I2), collapse=", "), "\n\n")

# Peters test
bcg_peters <- regtest(bcg_dl, predictor="ni", model="lm")
cat("Peters p-value:", bcg_peters$pval, "\n")

# Output as JSON
bcg_exact <- list(
  yi = as.numeric(bcg$yi),
  vi = as.numeric(bcg$vi),
  n = bcg$n_total,
  loo_estimates = as.numeric(bcg_loo$estimate),
  loo_tau2 = as.numeric(bcg_loo$tau2),
  loo_I2 = as.numeric(bcg_loo$I2)
)

json_output <- toJSON(bcg_exact, auto_unbox = FALSE, digits = 10, pretty = TRUE)
writeLines(json_output, "bcg_exact.json")
cat("\nExact values written to bcg_exact.json\n")
