library(metafor)
data(dat.bcg)

# Calculate log RR
dat <- escalc(measure='RR', ai=tpos, bi=tneg, ci=cpos, di=cneg, data=dat.bcg)

cat('=== dat.bcg with escalc ===\n')
print(dat[, c('author', 'year', 'yi', 'vi')])

cat('\n=== DerSimonian-Laird ===\n')
dl <- rma(yi, vi, data=dat, method='DL')
cat('estimate:', dl$beta[1], '\n')
cat('tau2:', dl$tau2, '\n')
cat('Q:', dl$QE, '\n')
cat('I2:', dl$I2, '\n')

cat('\n=== FE ===\n')
fe <- rma(yi, vi, data=dat, method='FE')
cat('FE estimate:', fe$beta[1], '\n')

cat('\n=== Trim-and-Fill ===\n')
tf <- trimfill(dl)
cat('k0:', tf$k0, '\n')
cat('side:', tf$side, '\n')
cat('estimate:', tf$beta[1], '\n')
