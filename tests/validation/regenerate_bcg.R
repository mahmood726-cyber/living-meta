library(metafor)
library(jsonlite)

data(dat.bcg)

# Calculate log RR
dat <- escalc(measure='RR', ai=tpos, bi=tneg, ci=cpos, di=cneg, data=dat.bcg)

cat('// BCG data from metafor dat.bcg\n')
cat('const bcgStudies = [\n')
for (i in 1:nrow(dat)) {
  comma <- ifelse(i < nrow(dat), ',', '')
  cat(sprintf('  { yi: %.10f, vi: %.10f }%s\n', dat$yi[i], dat$vi[i], comma))
}
cat('];\n\n')

# Also output sample sizes for Peters test
cat('const bcgSampleSizes = [\n')
for (i in 1:nrow(dat)) {
  n <- dat$tpos[i] + dat$tneg[i] + dat$cpos[i] + dat$cneg[i]
  comma <- ifelse(i < nrow(dat), ',', '')
  cat(sprintf('  %d%s // %s %d\n', n, comma, dat$author[i], dat$year[i]))
}
cat('];\n\n')

# DL estimates
dl <- rma(yi, vi, data=dat, method='DL')
cat('DL estimate:', dl$beta[1], '\n')
cat('DL tau2:', dl$tau2, '\n')
cat('DL Q:', dl$QE, '\n')
cat('DL I2:', dl$I2, '\n')

# Trim-and-fill
tf <- trimfill(dl)
cat('\nTrim-fill k0:', tf$k0, '\n')
cat('Trim-fill side:', tf$side, '\n')
cat('Trim-fill estimate:', tf$beta[1], '\n')

# LOO
loo <- leave1out(dl)
cat('\n// LOO first 3\n')
cat('estimates:', toJSON(loo$estimate[1:3]), '\n')
cat('tau2:', toJSON(loo$tau2[1:3]), '\n')
cat('I2:', toJSON(loo$I2[1:3]), '\n')

# Peters test
pet <- regtest(dl, model='lm', predictor='ni')
cat('\nPeters p-value:', pet$pval, '\n')
