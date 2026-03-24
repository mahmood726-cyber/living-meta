/**
 * Shared Statistical Utilities for Advanced Meta-Analysis Methods
 *
 * This module provides validated statistical functions used across all advanced methods.
 * All functions include edge case handling and numerical stability checks.
 *
 * @module stats-utils
 * @version 1.0.0
 */

import { LRUCache } from './memoize.js';

// Cache for expensive statistical functions
const tQuantileCache = new LRUCache(200);
const betaIncompleteCache = new LRUCache(500);
const logGammaCache = new LRUCache(200);

/**
 * Create cache key for numeric arguments
 * @param {...number} args - Numeric arguments
 * @returns {string} Cache key
 */
function cacheKey(...args) {
  return args.map(a => a.toPrecision(10)).join(',');
}

/**
 * Standard normal cumulative distribution function (Φ)
 * Uses Abramowitz & Stegun approximation (1964, formula 26.2.17)
 * Maximum error: 7.5e-8
 *
 * @param {number} z - Z-score
 * @returns {number} Cumulative probability P(Z ≤ z)
 */
export function normalCDF(z) {
    if (!isFinite(z)) return z > 0 ? 1 : 0;

    const a1 =  0.254829592;
    const a2 = -0.284496736;
    const a3 =  1.421413741;
    const a4 = -1.453152027;
    const a5 =  1.061405429;
    const p  =  0.3275911;

    const sign = z < 0 ? -1 : 1;
    const x = Math.abs(z) / Math.SQRT2;
    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return 0.5 * (1.0 + sign * y);
}

/**
 * Standard normal probability density function (φ)
 *
 * @param {number} z - Z-score
 * @returns {number} Density at z
 */
export function normalPDF(z) {
    if (!isFinite(z)) return 0;
    return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
}

/**
 * Inverse standard normal CDF (Φ⁻¹) - Quantile function
 * Uses Acklam's algorithm (2000)
 * Maximum relative error: 1.15e-9
 *
 * Reference: Acklam, P.J. (2000). An algorithm for computing the inverse
 * normal cumulative distribution function.
 *
 * @param {number} p - Probability (0 < p < 1)
 * @returns {number} Z-score such that P(Z ≤ z) = p
 */
export function normalQuantile(p) {
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    if (p === 0.5) return 0;

    const a = [
        -3.969683028665376e+01,  2.209460984245205e+02,
        -2.759285104469687e+02,  1.383577518672690e+02,
        -3.066479806614716e+01,  2.506628277459239e+00
    ];
    const b = [
        -5.447609879822406e+01,  1.615858368580409e+02,
        -1.556989798598866e+02,  6.680131188771972e+01,
        -1.328068155288572e+01
    ];
    const c = [
        -7.784894002430293e-03, -3.223964580411365e-01,
        -2.400758277161838e+00, -2.549732539343734e+00,
         4.374664141464968e+00,  2.938163982698783e+00
    ];
    const d = [
         7.784695709041462e-03,  3.224671290700398e-01,
         2.445134137142996e+00,  3.754408661907416e+00
    ];

    const pLow = 0.02425;
    const pHigh = 1 - pLow;
    let q, r;

    if (p < pLow) {
        q = Math.sqrt(-2 * Math.log(p));
        return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
               ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
    } else if (p <= pHigh) {
        q = p - 0.5;
        r = q * q;
        return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q /
               (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
    } else {
        q = Math.sqrt(-2 * Math.log(1 - p));
        return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
                ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
    }
}

/**
 * Chi-squared CDF using incomplete gamma function
 *
 * @param {number} x - Chi-squared value
 * @param {number} df - Degrees of freedom
 * @returns {number} P(χ² ≤ x)
 */
export function chiSquaredCDF(x, df) {
    if (x <= 0) return 0;
    if (df <= 0) return NaN;
    return gammaCDF(x / 2, df / 2);
}

/**
 * Incomplete gamma function P(a, x) = γ(a,x)/Γ(a)
 * Uses series or continued fraction depending on x
 *
 * @param {number} x - Upper limit
 * @param {number} a - Shape parameter
 * @returns {number} Regularized incomplete gamma
 */
export function gammaCDF(x, a) {
    if (x <= 0) return 0;
    if (a <= 0) return NaN;

    if (x < a + 1) {
        return gammaSeries(x, a);
    } else {
        return 1 - gammaContinuedFraction(x, a);
    }
}

/**
 * Gamma function series expansion for incomplete gamma
 */
function gammaSeries(x, a) {
    const maxIter = 200;
    const epsilon = 1e-14;

    let sum = 1 / a;
    let term = 1 / a;

    for (let n = 1; n < maxIter; n++) {
        term *= x / (a + n);
        sum += term;
        if (Math.abs(term) < Math.abs(sum) * epsilon) break;
    }

    return sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
}

/**
 * Gamma function continued fraction for incomplete gamma
 */
function gammaContinuedFraction(x, a) {
    const maxIter = 200;
    const epsilon = 1e-14;

    let b = x + 1 - a;
    let c = 1 / 1e-30;
    let d = 1 / b;
    let h = d;

    for (let i = 1; i <= maxIter; i++) {
        const an = -i * (i - a);
        b += 2;
        d = an * d + b;
        if (Math.abs(d) < 1e-30) d = 1e-30;
        c = b + an / c;
        if (Math.abs(c) < 1e-30) c = 1e-30;
        d = 1 / d;
        const del = d * c;
        h *= del;
        if (Math.abs(del - 1) < epsilon) break;
    }

    return Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
}

/**
 * Log-gamma function using Lanczos approximation
 *
 * @param {number} x - Input value
 * @returns {number} ln(Γ(x))
 */
export function logGamma(x) {
    if (x <= 0) return NaN;

    // Check cache for common values
    const key = x.toPrecision(10);
    if (logGammaCache.has(key)) {
      return logGammaCache.get(key);
    }

    const g = 7;
    const c = [
        0.99999999999980993,
        676.5203681218851,
        -1259.1392167224028,
        771.32342877765313,
        -176.61502916214059,
        12.507343278686905,
        -0.13857109526572012,
        9.9843695780195716e-6,
        1.5056327351493116e-7
    ];

    if (x < 0.5) {
        const result = Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
        logGammaCache.set(key, result);
        return result;
    }

    const originalX = x;
    x -= 1;
    let a = c[0];
    const t = x + g + 0.5;

    for (let i = 1; i < g + 2; i++) {
        a += c[i] / (x + i);
    }

    const result = 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
    logGammaCache.set(originalX.toPrecision(10), result);
    return result;
}

/**
 * Beta function B(a, b) = Γ(a)Γ(b)/Γ(a+b)
 *
 * @param {number} a - First parameter
 * @param {number} b - Second parameter
 * @returns {number} Beta function value
 */
export function beta(a, b) {
    return Math.exp(logGamma(a) + logGamma(b) - logGamma(a + b));
}

/**
 * Regularized incomplete beta function I_x(a, b)
 * Uses continued fraction representation
 *
 * @param {number} x - Upper limit (0 ≤ x ≤ 1)
 * @param {number} a - First shape parameter
 * @param {number} b - Second shape parameter
 * @returns {number} I_x(a, b)
 */
export function betaIncomplete(x, a, b) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;

    // Check cache
    const key = cacheKey(x, a, b);
    if (betaIncompleteCache.has(key)) {
      return betaIncompleteCache.get(key);
    }

    // Use symmetry for faster convergence
    if (x > (a + 1) / (a + b + 2)) {
        const result = 1 - betaIncomplete(1 - x, b, a);
        betaIncompleteCache.set(key, result);
        return result;
    }

    const bt = Math.exp(
        logGamma(a + b) - logGamma(a) - logGamma(b) +
        a * Math.log(x) + b * Math.log(1 - x)
    );

    const result = bt * betaContinuedFraction(x, a, b) / a;
    betaIncompleteCache.set(key, result);
    return result;
}

/**
 * Continued fraction for incomplete beta
 */
function betaContinuedFraction(x, a, b) {
    const maxIter = 200;
    const epsilon = 1e-14;

    const qab = a + b;
    const qap = a + 1;
    const qam = a - 1;

    let c = 1;
    let d = 1 - qab * x / qap;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    d = 1 / d;
    let h = d;

    for (let m = 1; m <= maxIter; m++) {
        const m2 = 2 * m;
        let aa = m * (b - m) * x / ((qam + m2) * (a + m2));

        d = 1 + aa * d;
        if (Math.abs(d) < 1e-30) d = 1e-30;
        c = 1 + aa / c;
        if (Math.abs(c) < 1e-30) c = 1e-30;
        d = 1 / d;
        h *= d * c;

        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
        d = 1 + aa * d;
        if (Math.abs(d) < 1e-30) d = 1e-30;
        c = 1 + aa / c;
        if (Math.abs(c) < 1e-30) c = 1e-30;
        d = 1 / d;
        const del = d * c;
        h *= del;

        if (Math.abs(del - 1) < epsilon) break;
    }

    return h;
}

/**
 * Student's t CDF
 *
 * @param {number} t - t statistic
 * @param {number} df - Degrees of freedom
 * @returns {number} P(T ≤ t)
 */
export function tCDF(t, df) {
    if (df <= 0) return NaN;
    if (!isFinite(t)) return t > 0 ? 1 : 0;

    const x = df / (df + t * t);
    const prob = 0.5 * betaIncomplete(x, df / 2, 0.5);

    return t >= 0 ? 1 - prob : prob;
}

/**
 * Student's t quantile function
 * Uses Newton-Raphson iteration
 *
 * @param {number} p - Probability
 * @param {number} df - Degrees of freedom
 * @returns {number} t such that P(T ≤ t) = p
 */
export function tQuantile(p, df) {
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    if (p === 0.5) return 0;
    if (df <= 0) return NaN;

    // Check cache for common values (e.g., 0.975 with integer df)
    const key = cacheKey(p, df);
    if (tQuantileCache.has(key)) {
      return tQuantileCache.get(key);
    }

    // Initial guess from normal approximation
    let t = normalQuantile(p);

    // Newton-Raphson refinement
    const maxIter = 50;
    const tol = 1e-10;

    for (let i = 0; i < maxIter; i++) {
        const cdf = tCDF(t, df);
        const pdf = tPDF(t, df);

        if (pdf < 1e-100) break;

        const delta = (cdf - p) / pdf;
        t -= delta;

        if (Math.abs(delta) < tol * Math.abs(t)) break;
    }

    // Cache result
    tQuantileCache.set(key, t);

    return t;
}

/**
 * Student's t PDF
 *
 * @param {number} t - t statistic
 * @param {number} df - Degrees of freedom
 * @returns {number} Density at t
 */
export function tPDF(t, df) {
    if (df <= 0) return NaN;

    const coef = Math.exp(logGamma((df + 1) / 2) - logGamma(df / 2)) /
                 Math.sqrt(df * Math.PI);
    return coef * Math.pow(1 + t * t / df, -(df + 1) / 2);
}

/**
 * F distribution CDF
 *
 * @param {number} x - F statistic
 * @param {number} df1 - Numerator degrees of freedom
 * @param {number} df2 - Denominator degrees of freedom
 * @returns {number} P(F ≤ x)
 */
export function fCDF(x, df1, df2) {
    if (x <= 0) return 0;
    if (df1 <= 0 || df2 <= 0) return NaN;

    const y = df1 * x / (df1 * x + df2);
    return betaIncomplete(y, df1 / 2, df2 / 2);
}

/**
 * Calculate weighted mean
 *
 * @param {number[]} values - Values
 * @param {number[]} weights - Weights
 * @returns {number} Weighted mean
 */
export function weightedMean(values, weights) {
    if (!values.length || values.length !== weights.length) return NaN;

    let sumWV = 0;
    let sumW = 0;

    for (let i = 0; i < values.length; i++) {
        if (isFinite(values[i]) && isFinite(weights[i]) && weights[i] > 0) {
            sumWV += weights[i] * values[i];
            sumW += weights[i];
        }
    }

    return sumW > 0 ? sumWV / sumW : NaN;
}

/**
 * Calculate weighted variance
 *
 * @param {number[]} values - Values
 * @param {number[]} weights - Weights
 * @param {number} [mean] - Optional pre-computed mean
 * @returns {number} Weighted variance
 */
export function weightedVariance(values, weights, mean) {
    if (!values.length || values.length !== weights.length) return NaN;

    const mu = mean !== undefined ? mean : weightedMean(values, weights);

    let sumW = 0;
    let sumW2 = 0;
    let sumWSq = 0;

    for (let i = 0; i < values.length; i++) {
        if (isFinite(values[i]) && isFinite(weights[i]) && weights[i] > 0) {
            const diff = values[i] - mu;
            sumWSq += weights[i] * diff * diff;
            sumW += weights[i];
            sumW2 += weights[i] * weights[i];
        }
    }

    // Reliability weights formula (Bessel correction for weighted)
    const n1 = sumW - sumW2 / sumW;
    return n1 > 0 ? sumWSq / n1 : 0;
}

/**
 * Calculate median
 *
 * @param {number[]} arr - Array of numbers
 * @returns {number} Median
 */
export function median(arr) {
    if (!arr.length) return NaN;

    const sorted = [...arr].filter(x => isFinite(x)).sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);

    return sorted.length % 2 !== 0
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Calculate quantile
 *
 * @param {number[]} arr - Array of numbers
 * @param {number} p - Probability (0-1)
 * @returns {number} Quantile
 */
export function quantile(arr, p) {
    if (!arr.length || p < 0 || p > 1) return NaN;

    const sorted = [...arr].filter(x => isFinite(x)).sort((a, b) => a - b);
    const n = sorted.length;

    if (p === 0) return sorted[0];
    if (p === 1) return sorted[n - 1];

    const h = (n - 1) * p;
    const lo = Math.floor(h);
    const hi = Math.ceil(h);

    return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}

/**
 * Calculate median absolute deviation (MAD)
 *
 * @param {number[]} arr - Array of numbers
 * @returns {number} MAD
 */
export function mad(arr) {
    const med = median(arr);
    const deviations = arr.map(x => Math.abs(x - med));
    return median(deviations);
}

/**
 * Calculate interquartile range (IQR)
 *
 * @param {number[]} arr - Array of numbers
 * @returns {number} IQR
 */
export function iqr(arr) {
    return quantile(arr, 0.75) - quantile(arr, 0.25);
}

/**
 * Winsorize an array at specified percentiles
 *
 * @param {number[]} arr - Array of numbers
 * @param {number} [lower=0.05] - Lower percentile
 * @param {number} [upper=0.95] - Upper percentile
 * @returns {number[]} Winsorized array
 */
export function winsorize(arr, lower = 0.05, upper = 0.95) {
    const lowerBound = quantile(arr, lower);
    const upperBound = quantile(arr, upper);

    return arr.map(x => {
        if (x < lowerBound) return lowerBound;
        if (x > upperBound) return upperBound;
        return x;
    });
}

/**
 * Generate random samples from standard normal distribution
 * Uses Box-Muller transform
 *
 * @param {number} n - Number of samples
 * @returns {number[]} Random samples
 */
export function randomNormal(n) {
    const result = [];

    for (let i = 0; i < n; i += 2) {
        const u1 = Math.random();
        const u2 = Math.random();
        const r = Math.sqrt(-2 * Math.log(u1));
        const theta = 2 * Math.PI * u2;

        result.push(r * Math.cos(theta));
        if (i + 1 < n) {
            result.push(r * Math.sin(theta));
        }
    }

    return result;
}

/**
 * Generate random samples from gamma distribution
 * Uses Marsaglia and Tsang's method
 *
 * @param {number} n - Number of samples
 * @param {number} shape - Shape parameter (α)
 * @param {number} [scale=1] - Scale parameter (β)
 * @returns {number[]} Random samples
 */
export function randomGamma(n, shape, scale = 1) {
    const result = [];

    for (let i = 0; i < n; i++) {
        if (shape < 1) {
            // Boost to shape >= 1, then scale
            const u = Math.random();
            result.push(randomGamma(1, shape + 1, scale)[0] * Math.pow(u, 1 / shape));
        } else {
            const d = shape - 1/3;
            const c = 1 / Math.sqrt(9 * d);

            let x, v;
            while (true) {
                do {
                    x = randomNormal(1)[0];
                    v = 1 + c * x;
                } while (v <= 0);

                v = v * v * v;
                const u = Math.random();

                if (u < 1 - 0.0331 * x * x * x * x) {
                    result.push(d * v * scale);
                    break;
                }

                if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
                    result.push(d * v * scale);
                    break;
                }
            }
        }
    }

    return result;
}

/**
 * Generate random samples from inverse-gamma distribution
 *
 * @param {number} n - Number of samples
 * @param {number} shape - Shape parameter (α)
 * @param {number} scale - Scale parameter (β)
 * @returns {number[]} Random samples
 */
export function randomInverseGamma(n, shape, scale) {
    return randomGamma(n, shape, 1 / scale).map(x => 1 / x);
}

/**
 * Simple linear regression
 *
 * @param {number[]} x - Predictor values
 * @param {number[]} y - Response values
 * @param {number[]} [weights] - Optional weights
 * @returns {Object} Regression results
 */
export function linearRegression(x, y, weights) {
    const n = x.length;
    if (n < 2 || n !== y.length) return null;

    const w = weights || new Array(n).fill(1);

    let sumW = 0, sumWX = 0, sumWY = 0, sumWXX = 0, sumWXY = 0;

    for (let i = 0; i < n; i++) {
        if (isFinite(x[i]) && isFinite(y[i]) && isFinite(w[i])) {
            sumW += w[i];
            sumWX += w[i] * x[i];
            sumWY += w[i] * y[i];
            sumWXX += w[i] * x[i] * x[i];
            sumWXY += w[i] * x[i] * y[i];
        }
    }

    const denom = sumW * sumWXX - sumWX * sumWX;
    if (Math.abs(denom) < 1e-15) return null;

    const slope = (sumW * sumWXY - sumWX * sumWY) / denom;
    const intercept = (sumWY - slope * sumWX) / sumW;

    // Calculate residuals and standard errors
    const residuals = [];
    let ssRes = 0;

    for (let i = 0; i < n; i++) {
        const pred = intercept + slope * x[i];
        const res = y[i] - pred;
        residuals.push(res);
        ssRes += w[i] * res * res;
    }

    const mse = ssRes / (n - 2);
    const seSlope = Math.sqrt(mse * sumW / denom);
    const seIntercept = Math.sqrt(mse * sumWXX / denom);

    return {
        intercept,
        slope,
        seIntercept,
        seSlope,
        residuals,
        mse,
        df: n - 2
    };
}

/**
 * MCMC convergence diagnostics
 */
export const mcmcDiagnostics = {
    /**
     * Gelman-Rubin R-hat statistic for multiple chains
     *
     * Reference: Gelman & Rubin (1992). Inference from Iterative
     * Simulation Using Multiple Sequences. Statistical Science.
     *
     * @param {number[][]} chains - Array of MCMC chains
     * @returns {number} R-hat (should be < 1.1 for convergence)
     */
    rHat(chains) {
        if (chains.length < 2) return NaN;

        const m = chains.length;
        const n = Math.min(...chains.map(c => c.length));

        // Chain means
        const chainMeans = chains.map(chain =>
            chain.slice(0, n).reduce((a, b) => a + b, 0) / n
        );

        // Overall mean
        const overallMean = chainMeans.reduce((a, b) => a + b, 0) / m;

        // Between-chain variance
        const B = n * chainMeans.reduce((sum, mean) =>
            sum + Math.pow(mean - overallMean, 2), 0
        ) / (m - 1);

        // Within-chain variance
        let W = 0;
        for (let j = 0; j < m; j++) {
            const chainVar = chains[j].slice(0, n).reduce((sum, x) =>
                sum + Math.pow(x - chainMeans[j], 2), 0
            ) / (n - 1);
            W += chainVar;
        }
        W /= m;

        // Pooled variance estimate
        const varPlus = ((n - 1) / n) * W + (1 / n) * B;

        return Math.sqrt(varPlus / W);
    },

    /**
     * Effective sample size (ESS)
     *
     * @param {number[]} chain - Single MCMC chain
     * @returns {number} Effective sample size
     */
    effectiveSampleSize(chain) {
        const n = chain.length;
        if (n < 4) return n;

        const mean = chain.reduce((a, b) => a + b, 0) / n;
        const variance = chain.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / n;

        if (variance < 1e-15) return n;

        // Compute autocorrelations
        const maxLag = Math.min(n - 1, Math.floor(n / 2));
        let rhoSum = 0;

        for (let lag = 1; lag <= maxLag; lag++) {
            let autoCorr = 0;
            for (let i = 0; i < n - lag; i++) {
                autoCorr += (chain[i] - mean) * (chain[i + lag] - mean);
            }
            autoCorr /= (n - lag) * variance;

            // Geyer's initial monotone sequence estimator
            if (lag % 2 === 0) {
                const pairSum = autoCorr + (lag < maxLag ?
                    chain.slice(0, n - lag - 1).reduce((sum, x, i) =>
                        sum + (x - mean) * (chain[i + lag + 1] - mean), 0
                    ) / ((n - lag - 1) * variance) : 0);

                if (pairSum < 0) break;
            }

            rhoSum += autoCorr;
        }

        const tau = 1 + 2 * rhoSum;
        return Math.max(1, n / tau);
    },

    /**
     * Geweke diagnostic for single chain
     * Compares means of first and last portions
     *
     * @param {number[]} chain - MCMC chain
     * @param {number} [firstProp=0.1] - Proportion for first window
     * @param {number} [lastProp=0.5] - Proportion for last window
     * @returns {Object} Z-score and p-value
     */
    geweke(chain, firstProp = 0.1, lastProp = 0.5) {
        const n = chain.length;
        const n1 = Math.floor(n * firstProp);
        const n2 = Math.floor(n * lastProp);

        const first = chain.slice(0, n1);
        const last = chain.slice(n - n2);

        const mean1 = first.reduce((a, b) => a + b, 0) / n1;
        const mean2 = last.reduce((a, b) => a + b, 0) / n2;

        const var1 = first.reduce((sum, x) => sum + Math.pow(x - mean1, 2), 0) / (n1 - 1);
        const var2 = last.reduce((sum, x) => sum + Math.pow(x - mean2, 2), 0) / (n2 - 1);

        const se = Math.sqrt(var1 / n1 + var2 / n2);
        const z = (mean1 - mean2) / se;
        const pValue = 2 * (1 - normalCDF(Math.abs(z)));

        return { z, pValue };
    },

    /**
     * Check overall convergence
     *
     * @param {number[][]} chains - Multiple MCMC chains
     * @returns {Object} Convergence diagnostics
     */
    checkConvergence(chains) {
        const rhat = this.rHat(chains);
        const ess = chains.map(c => this.effectiveSampleSize(c));
        const minESS = Math.min(...ess);
        const totalESS = ess.reduce((a, b) => a + b, 0);

        return {
            rhat,
            ess: totalESS,
            minChainESS: minESS,
            converged: rhat < 1.1 && minESS > 100,
            warnings: [
                ...(rhat >= 1.1 ? [`R-hat ${rhat.toFixed(3)} > 1.1: chains have not converged`] : []),
                ...(minESS < 100 ? [`Min ESS ${minESS.toFixed(0)} < 100: insufficient effective samples`] : [])
            ]
        };
    }
};

/**
 * Numerical integration using adaptive Simpson's rule
 *
 * @param {Function} f - Function to integrate
 * @param {number} a - Lower bound
 * @param {number} b - Upper bound
 * @param {number} [tol=1e-8] - Tolerance
 * @returns {number} Integral value
 */
export function integrate(f, a, b, tol = 1e-8) {
    const maxDepth = 20;

    function adaptiveSimpson(a, b, fa, fb, fm, whole, depth) {
        const m = (a + b) / 2;
        const lm = (a + m) / 2;
        const rm = (m + b) / 2;

        const flm = f(lm);
        const frm = f(rm);

        const left = (fa + 4 * flm + fm) * (m - a) / 6;
        const right = (fm + 4 * frm + fb) * (b - m) / 6;
        const delta = left + right - whole;

        if (depth >= maxDepth || Math.abs(delta) <= 15 * tol) {
            return left + right + delta / 15;
        }

        return adaptiveSimpson(a, m, fa, fm, flm, left, depth + 1) +
               adaptiveSimpson(m, b, fm, fb, frm, right, depth + 1);
    }

    const fa = f(a);
    const fb = f(b);
    const fm = f((a + b) / 2);
    const whole = (fa + 4 * fm + fb) * (b - a) / 6;

    return adaptiveSimpson(a, b, fa, fb, fm, whole, 0);
}

/**
 * Newton-Raphson optimization
 *
 * @param {Function} f - Function to minimize
 * @param {Function} df - Derivative of f
 * @param {number} x0 - Initial guess
 * @param {Object} [options] - Options
 * @returns {Object} Optimization result
 */
export function newtonRaphson(f, df, x0, options = {}) {
    const { maxIter = 100, tol = 1e-10, bounds } = options;

    let x = x0;
    let converged = false;

    for (let i = 0; i < maxIter; i++) {
        const fx = f(x);
        const dfx = df(x);

        if (Math.abs(dfx) < 1e-15) break;

        let step = fx / dfx;

        // Apply bounds if specified
        if (bounds) {
            const newX = x - step;
            if (newX < bounds[0]) step = x - bounds[0];
            if (newX > bounds[1]) step = x - bounds[1];
        }

        x -= step;

        if (Math.abs(step) < tol) {
            converged = true;
            break;
        }
    }

    return { x, converged };
}

/**
 * Validate study data array
 *
 * @param {Object[]} studies - Array of study objects
 * @param {string[]} required - Required fields
 * @returns {Object} Validation result
 */
export function validateStudies(studies, required = ['yi', 'vi']) {
    const errors = [];
    const warnings = [];
    const valid = [];

    if (!Array.isArray(studies)) {
        return { valid: [], errors: ['studies must be an array'], warnings: [] };
    }

    studies.forEach((study, i) => {
        const missing = required.filter(f => study[f] === undefined || study[f] === null);

        if (missing.length > 0) {
            errors.push(`Study ${i + 1}: missing ${missing.join(', ')}`);
            return;
        }

        // Check for invalid values
        for (const field of required) {
            if (!isFinite(study[field])) {
                errors.push(`Study ${i + 1}: ${field} is not a finite number`);
                return;
            }
        }

        // Variance must be positive
        if (study.vi !== undefined && study.vi <= 0) {
            errors.push(`Study ${i + 1}: variance must be positive`);
            return;
        }

        // Check for suspicious values
        if (study.vi !== undefined && study.vi < 1e-10) {
            warnings.push(`Study ${i + 1}: extremely small variance may indicate data error`);
        }

        if (study.yi !== undefined && Math.abs(study.yi) > 10) {
            warnings.push(`Study ${i + 1}: very large effect size (${study.yi.toFixed(2)})`);
        }

        valid.push(study);
    });

    return { valid, errors, warnings };
}

export default {
    normalCDF,
    normalPDF,
    normalQuantile,
    chiSquaredCDF,
    gammaCDF,
    logGamma,
    beta,
    betaIncomplete,
    tCDF,
    tQuantile,
    tPDF,
    fCDF,
    weightedMean,
    weightedVariance,
    median,
    quantile,
    mad,
    iqr,
    winsorize,
    randomNormal,
    randomGamma,
    randomInverseGamma,
    linearRegression,
    mcmcDiagnostics,
    integrate,
    newtonRaphson,
    validateStudies
};
