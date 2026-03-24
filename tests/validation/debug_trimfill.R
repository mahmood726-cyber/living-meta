library(metafor)
data(dat.bcg)
dat <- escalc(measure='RR', ai=tpos, bi=tneg, ci=cpos, di=cneg, data=dat.bcg)

dl <- rma(yi, vi, data=dat, method='DL')
cat('DL estimate:', dl$beta[1], '\n')
cat('DL tau2:', dl$tau2, '\n\n')

# Manually debug trim-and-fill algorithm
theta <- dl$beta[1]
yi <- dat$yi
vi <- dat$vi
k <- length(yi)

cat('=== Manual Trim-Fill Debug ===\n')
cat('k:', k, '\n')
cat('theta:', theta, '\n\n')

# Calculate residuals
resid <- yi - theta
cat('Residuals:\n')
print(round(resid, 4))

# Rank by absolute residual
abs_resid <- abs(resid)
ranks <- rank(abs_resid)
cat('\nRanks of abs(resid):\n')
print(ranks)

# Sum of ranks for positive and negative residuals
right_ranks <- ranks[resid > 0]
left_ranks <- ranks[resid < 0]
cat('\nRight (positive) rank sum:', sum(right_ranks), '(', length(right_ranks), 'studies)\n')
cat('Left (negative) rank sum:', sum(left_ranks), '(', length(left_ranks), 'studies)\n')

# L0 formula
S <- min(sum(right_ranks), sum(left_ranks))
L0_raw <- (4 * S - k * (k + 1) / 2) / (2 * k - 1)
k0 <- max(0, round(L0_raw))
cat('\nS (smaller rank sum):', S, '\n')
cat('L0_raw:', L0_raw, '\n')
cat('k0 (rounded):', k0, '\n')

cat('\n=== Actual trimfill output ===\n')
tf <- trimfill(dl)
cat('trimfill k0:', tf$k0, '\n')
cat('trimfill side:', tf$side, '\n')
