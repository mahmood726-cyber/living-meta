/**
 * Standard Deviation Imputation
 * Methods for imputing SD when only SE or CI are available
 */

/**
 * Impute SD from Standard Error
 * SD = SE × √n
 *
 * @param {number} se - Standard error
 * @param {number} n - Sample size
 * @returns {object} Imputed SD with metadata
 */
export function sdFromSE(se, n) {
  if (se <= 0 || n <= 0) {
    return { error: 'Invalid SE or n' };
  }

  const sd = se * Math.sqrt(n);

  return {
    sd,
    se,
    n,
    method: 'SE_conversion',
    flag: 'sd_imputed',
    formula: 'SD = SE × √n'
  };
}

/**
 * Impute SD from Confidence Interval
 * SE = (upper - lower) / (2 × z)
 * SD = SE × √n
 *
 * @param {number} ciLower - Lower CI bound
 * @param {number} ciUpper - Upper CI bound
 * @param {number} n - Sample size
 * @param {number} alpha - Significance level (default 0.05 for 95% CI)
 * @returns {object} Imputed SD with metadata
 */
export function sdFromCI(ciLower, ciUpper, n, alpha = 0.05) {
  if (ciUpper <= ciLower || n <= 0) {
    return { error: 'Invalid CI or n' };
  }

  // Z-value for given alpha
  const z = normalQuantile(1 - alpha / 2);

  // SE from CI width
  const se = (ciUpper - ciLower) / (2 * z);

  // SD from SE
  const sd = se * Math.sqrt(n);

  return {
    sd,
    se,
    ciLower,
    ciUpper,
    n,
    z,
    method: 'CI_conversion',
    flag: 'sd_imputed',
    formula: `SE = (upper - lower) / (2 × ${z.toFixed(2)}), SD = SE × √n`
  };
}

/**
 * Impute SD from interquartile range (IQR)
 * Assumes normal distribution: SD ≈ IQR / 1.35
 *
 * @param {number} q1 - First quartile (25th percentile)
 * @param {number} q3 - Third quartile (75th percentile)
 * @returns {object} Imputed SD with metadata
 */
export function sdFromIQR(q1, q3) {
  if (q3 <= q1) {
    return { error: 'Invalid quartiles' };
  }

  const iqr = q3 - q1;
  const sd = iqr / 1.35;

  return {
    sd,
    iqr,
    q1,
    q3,
    method: 'IQR_conversion',
    flag: 'sd_imputed',
    formula: 'SD ≈ IQR / 1.35 (assumes normality)',
    caveat: 'May underestimate SD if distribution is skewed'
  };
}

/**
 * Impute SD from range using Hozo et al. (2005) method
 * Depends on sample size
 *
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @param {number} n - Sample size
 * @returns {object} Imputed SD with metadata
 */
export function sdFromRange(min, max, n) {
  if (max <= min || n <= 0) {
    return { error: 'Invalid range or n' };
  }

  const range = max - min;
  let sd;
  let formula;

  if (n <= 15) {
    // For small samples: SD ≈ range / 4
    sd = range / 4;
    formula = 'SD ≈ range / 4 (small sample)';
  } else if (n <= 70) {
    // For medium samples: SD ≈ range / 4.5
    sd = range / 4.5;
    formula = 'SD ≈ range / 4.5 (medium sample)';
  } else {
    // For large samples: SD ≈ range / 6
    sd = range / 6;
    formula = 'SD ≈ range / 6 (large sample)';
  }

  return {
    sd,
    range,
    min,
    max,
    n,
    method: 'range_conversion',
    flag: 'sd_imputed',
    formula,
    caveat: 'Range-based imputation is approximate; prefer SE or CI when available'
  };
}

/**
 * Impute SD from median and IQR using Wan et al. (2014) method
 *
 * @param {number} median - Median value
 * @param {number} q1 - First quartile
 * @param {number} q3 - Third quartile
 * @param {number} n - Sample size
 * @returns {object} Imputed mean and SD
 */
export function meanSdFromMedianIQR(median, q1, q3, n) {
  if (q3 <= q1 || n <= 0) {
    return { error: 'Invalid input' };
  }

  // Estimate mean (for skewed distributions, adjust)
  const mean = (q1 + median + q3) / 3;

  // Estimate SD
  const iqr = q3 - q1;
  const sd = iqr / 1.35;

  return {
    mean,
    sd,
    median,
    q1,
    q3,
    n,
    method: 'median_IQR_conversion',
    flag: 'sd_imputed',
    formula: 'mean ≈ (Q1 + median + Q3) / 3, SD ≈ IQR / 1.35'
  };
}

/**
 * Impute SD from median, min, and max using Hozo et al. (2005)
 *
 * @param {number} median - Median value
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @param {number} n - Sample size
 * @returns {object} Imputed mean and SD
 */
export function meanSdFromMedianRange(median, min, max, n) {
  if (max <= min || n <= 0) {
    return { error: 'Invalid input' };
  }

  // Estimate mean
  const mean = (min + 2 * median + max) / 4;

  // Estimate SD based on sample size
  const range = max - min;
  let sd;

  if (n <= 15) {
    sd = Math.sqrt((Math.pow(min - mean, 2) + Math.pow(median - mean, 2) + Math.pow(max - mean, 2) +
                   Math.pow((min + median) / 2 - mean, 2) + Math.pow((median + max) / 2 - mean, 2)) / 5);
  } else if (n <= 70) {
    sd = range / 4;
  } else {
    sd = range / 6;
  }

  return {
    mean,
    sd,
    median,
    min,
    max,
    n,
    method: 'median_range_conversion',
    flag: 'sd_imputed',
    formula: 'Hozo et al. (2005) method'
  };
}

/**
 * Impute SD from P-value and sample sizes (for t-test)
 *
 * @param {number} meanDiff - Mean difference
 * @param {number} pValue - P-value from t-test
 * @param {number} n1 - Sample size group 1
 * @param {number} n2 - Sample size group 2
 * @returns {object} Imputed pooled SD
 */
export function sdFromPValue(meanDiff, pValue, n1, n2) {
  if (pValue <= 0 || pValue >= 1 || n1 <= 1 || n2 <= 1) {
    return { error: 'Invalid input' };
  }

  // Calculate t-value from p-value
  const df = n1 + n2 - 2;
  const tValue = tQuantile(1 - pValue / 2, df);

  // SE = |meanDiff| / t
  const se = Math.abs(meanDiff) / tValue;

  // SE = SD × sqrt(1/n1 + 1/n2), so SD = SE / sqrt(1/n1 + 1/n2)
  const pooledSD = se / Math.sqrt(1/n1 + 1/n2);

  return {
    sd: pooledSD,
    se,
    meanDiff,
    pValue,
    tValue,
    df,
    n1,
    n2,
    method: 'p_value_conversion',
    flag: 'sd_imputed',
    formula: 't = |MD| / SE, SE = SD × √(1/n₁ + 1/n₂)'
  };
}

/**
 * Impute SD from coefficient of variation (CV)
 *
 * @param {number} mean - Mean value
 * @param {number} cv - Coefficient of variation (%)
 * @returns {object} Imputed SD
 */
export function sdFromCV(mean, cv) {
  if (mean === 0 || cv < 0) {
    return { error: 'Invalid input' };
  }

  const sd = (cv / 100) * Math.abs(mean);

  return {
    sd,
    mean,
    cv,
    method: 'CV_conversion',
    flag: 'sd_imputed',
    formula: 'SD = (CV / 100) × |mean|'
  };
}

/**
 * Pool SDs from multiple groups
 *
 * @param {Array} groups - Array of { n, sd } objects
 * @returns {object} Pooled SD
 */
export function poolSD(groups) {
  if (!groups || groups.length === 0) {
    return { error: 'No groups provided' };
  }

  // Calculate pooled variance
  let numerator = 0;
  let denominator = 0;

  groups.forEach(g => {
    if (g.n > 1 && g.sd > 0) {
      numerator += (g.n - 1) * g.sd * g.sd;
      denominator += (g.n - 1);
    }
  });

  if (denominator === 0) {
    return { error: 'Insufficient data' };
  }

  const pooledVariance = numerator / denominator;
  const pooledSD = Math.sqrt(pooledVariance);

  return {
    sd: pooledSD,
    variance: pooledVariance,
    groups,
    method: 'pooled_SD',
    formula: 'σ_pooled = √[Σ(nᵢ-1)σᵢ² / Σ(nᵢ-1)]'
  };
}

/**
 * Auto-impute SD using best available method
 *
 * @param {object} data - Available data { se, ciLower, ciUpper, iqr, q1, q3, min, max, n, mean, pValue, cv }
 * @returns {object} Imputed SD with method used
 */
export function autoImputeSD(data) {
  const { se, ciLower, ciUpper, iqr, q1, q3, min, max, n, mean, pValue, cv, meanDiff, n1, n2 } = data;

  // Priority order: SE > CI > P-value > IQR > CV > Range

  if (se && n) {
    return sdFromSE(se, n);
  }

  if (ciLower !== undefined && ciUpper !== undefined && n) {
    return sdFromCI(ciLower, ciUpper, n);
  }

  if (pValue && meanDiff && n1 && n2) {
    return sdFromPValue(meanDiff, pValue, n1, n2);
  }

  if ((q1 !== undefined && q3 !== undefined) || iqr) {
    if (q1 !== undefined && q3 !== undefined) {
      return sdFromIQR(q1, q3);
    }
    // If only IQR provided
    return {
      sd: iqr / 1.35,
      iqr,
      method: 'IQR_conversion',
      flag: 'sd_imputed'
    };
  }

  if (cv && mean) {
    return sdFromCV(mean, cv);
  }

  if (min !== undefined && max !== undefined && n) {
    return sdFromRange(min, max, n);
  }

  return { error: 'Insufficient data for SD imputation' };
}

/**
 * Assess quality of imputed SD
 */
export function assessImputationQuality(method) {
  const quality = {
    'SE_conversion': { quality: 'high', uncertainty: 'low' },
    'CI_conversion': { quality: 'high', uncertainty: 'low' },
    'p_value_conversion': { quality: 'moderate', uncertainty: 'moderate' },
    'IQR_conversion': { quality: 'moderate', uncertainty: 'moderate' },
    'CV_conversion': { quality: 'moderate', uncertainty: 'moderate' },
    'range_conversion': { quality: 'low', uncertainty: 'high' },
    'median_IQR_conversion': { quality: 'moderate', uncertainty: 'moderate' },
    'median_range_conversion': { quality: 'low', uncertainty: 'high' }
  };

  return quality[method] || { quality: 'unknown', uncertainty: 'unknown' };
}

// Statistical helper functions

function normalQuantile(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;

  const a = [-3.969683028665376e+01, 2.209460984245205e+02,
             -2.759285104469687e+02, 1.383577518672690e+02,
             -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02,
             -1.556989798598866e+02, 6.680131188771972e+01,
             -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01,
             -2.400758277161838e+00, -2.549732539343734e+00,
             4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01,
             2.445134137142996e+00, 3.754408661907416e+00];

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

function tQuantile(p, df) {
  let t = normalQuantile(p);

  for (let iter = 0; iter < 10; iter++) {
    const cdf = tCDF(t, df);
    const pdf = tPDF(t, df);
    if (Math.abs(pdf) < 1e-10) break;

    const diff = cdf - p;
    if (Math.abs(diff) < 1e-10) break;

    t = t - diff / pdf;
  }

  return t;
}

function tCDF(t, df) {
  const x = df / (df + t * t);
  const halfBeta = 0.5 * incompleteBeta(df / 2, 0.5, x);
  // For t >= 0: CDF = 1 - halfBeta, for t < 0: CDF = halfBeta
  return t >= 0 ? 1 - halfBeta : halfBeta;
}

function tPDF(t, df) {
  return Math.exp(gammaln((df + 1) / 2) - gammaln(df / 2)) /
         Math.sqrt(df * Math.PI) *
         Math.pow(1 + t * t / df, -(df + 1) / 2);
}

function incompleteBeta(a, b, x) {
  if (x === 0) return 0;
  if (x === 1) return 1;

  const bt = Math.exp(gammaln(a + b) - gammaln(a) - gammaln(b) +
              a * Math.log(x) + b * Math.log(1 - x));

  if (x < (a + 1) / (a + b + 2)) {
    return bt * betacf(a, b, x) / a;
  } else {
    return 1 - bt * betacf(b, a, 1 - x) / b;
  }
}

function betacf(a, b, x) {
  const maxIter = 100;
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
    h *= d * c;
    if (Math.abs(d * c - 1) < 1e-10) break;
  }

  return h;
}

function gammaln(x) {
  const coef = [76.18009172947146, -86.50532032941677, 24.01409824083091,
                -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];

  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);

  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) {
    ser += coef[j] / ++y;
  }

  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

export default {
  sdFromSE,
  sdFromCI,
  sdFromIQR,
  sdFromRange,
  meanSdFromMedianIQR,
  meanSdFromMedianRange,
  sdFromPValue,
  sdFromCV,
  poolSD,
  autoImputeSD,
  assessImputationQuality
};
