library(metafor)
data(dat.bcg)
dat <- escalc(measure='RR', ai=tpos, bi=tneg, ci=cpos, di=cneg, data=dat.bcg)

dl <- rma(yi, vi, data=dat, method='DL')
tf <- trimfill(dl)

cat("=== Original data ===\n")
cat("k:", dl$k, "\n")
cat("Original DL estimate:", dl$beta[1], "\n\n")

cat("=== Trimfill result ===\n")
cat("k0:", tf$k0, "\n")
cat("k total:", tf$k, "\n")
cat("Trimfill estimate:", tf$beta[1], "\n\n")

# Get the filled data
cat("=== Filled data (yi, vi) ===\n")
# The imputed study should be visible
yi_filled <- tf$yi
vi_filled <- tf$vi
for (i in 1:length(yi_filled)) {
  cat(sprintf("Study %2d: yi=%8.4f, vi=%8.4f\n", i, yi_filled[i], vi_filled[i]))
}

cat("\n=== Which study was imputed? ===\n")
# The imputed study should be the one not in original
orig_yi <- sort(dat$yi)
cat("Original yi (sorted):\n")
print(round(orig_yi, 4))
cat("\nFilled yi (sorted):\n")
print(round(sort(yi_filled), 4))

# The new one is the imputed one
new_yi <- yi_filled[!round(yi_filled, 4) %in% round(dat$yi, 4)]
cat("\nImputed yi:", new_yi, "\n")
