library(metafor)
data(dat.bcg)
dat <- escalc(measure='RR', ai=tpos, bi=tneg, ci=cpos, di=cneg, data=dat.bcg)

dl <- rma(yi, vi, data=dat, method='DL')

# Check different estimators
cat('=== Different L0 estimators ===\n')
tf_l0 <- trimfill(dl, estimator='L0')
cat('L0 estimator k0:', tf_l0$k0, '\n')

tf_r0 <- trimfill(dl, estimator='R0')
cat('R0 estimator k0:', tf_r0$k0, '\n')

tf_q0 <- trimfill(dl, estimator='Q0')
cat('Q0 estimator k0:', tf_q0$k0, '\n')

# Check with different sides
cat('\n=== Side selection ===\n')
tf_left <- trimfill(dl, side='left')
cat('Left side k0:', tf_left$k0, '\n')

tf_right <- trimfill(dl, side='right')
cat('Right side k0:', tf_right$k0, '\n')

# Look at the trimfill function details
cat('\n=== Default parameters ===\n')
cat('Default estimator:', formals(trimfill.rma.uni)$estimator, '\n')

# Try to understand the algorithm
cat('\n=== Step-by-step with trimfill internal ===\n')
# The key insight: trimfill looks at the FITTED values, not the raw yi
theta <- dl$beta[1]  # pooled estimate
yi <- dat$yi
vi <- dat$vi
k <- length(yi)

# In trimfill, the deviation is based on position relative to theta
# But the ranking in L0 is based on the deviation weighted by precision
# Actually, let me check if metafor uses weighted ranks

# Standard L0 uses unweighted ranks, but the deviation might be calculated differently
# Let's look at which studies would be reflected

# Studies on the right of theta (positive effect relative to theta)
right_idx <- which(yi > theta)
left_idx <- which(yi < theta)

cat('Studies on RIGHT (yi > theta):\n')
print(yi[right_idx])
cat('Studies on LEFT (yi < theta):\n')
print(yi[left_idx])

cat('\n\nActual trimfill result:\n')
print(tf_l0)
