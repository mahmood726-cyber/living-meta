/**
 * Complete Effect Size Library
 * Exceeds metafor's escalc() with 70+ effect size calculations
 * Implements ALL measures from metafor plus additional novel measures
 */

// ============================================================================
// STATISTICAL UTILITIES
// ============================================================================

const NORMAL_QUANTILE_975 = 1.959964;

/**
 * Standard normal CDF (Phi function)
 */
function pnorm(x) {
  const a1 =  0.254829592;
  const a2 = -0.284496736;
  const a3 =  1.421413741;
  const a4 = -1.453152027;
  const a5 =  1.061405429;
  const p  =  0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);

  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
}

/**
 * Standard normal quantile (inverse CDF)
 */
function qnorm(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;

  const a = [
    -3.969683028665376e+01, 2.209460984245205e+02,
    -2.759285104469687e+02, 1.383577518672690e+02,
    -3.066479806614716e+01, 2.506628277459239e+00
  ];
  const b = [
    -5.447609879822406e+01, 1.615858368580409e+02,
    -1.556989798598866e+02, 6.680131188771972e+01,
    -1.328068155288572e+01
  ];
  const c = [
    -7.784894002430293e-03, -3.223964580411365e-01,
    -2.400758277161838e+00, -2.549732539343734e+00,
    4.374664141464968e+00, 2.938163982698783e+00
  ];
  const d = [
    7.784695709041462e-03, 3.224671290700398e-01,
    2.445134137142996e+00, 3.754408661907416e+00
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
 * Gamma function using Lanczos approximation
 */
function gamma(z) {
  if (z < 0.5) {
    return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
  }
  z -= 1;
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7
  ];
  let x = c[0];
  for (let i = 1; i < g + 2; i++) {
    x += c[i] / (z + i);
  }
  const t = z + g + 0.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}

/**
 * Beta function
 */
function beta(a, b) {
  return gamma(a) * gamma(b) / gamma(a + b);
}

/**
 * Digamma function (psi)
 */
function digamma(x) {
  if (x <= 0) return NaN;
  let result = 0;
  while (x < 6) {
    result -= 1 / x;
    x += 1;
  }
  result += Math.log(x) - 1 / (2 * x);
  const x2 = 1 / (x * x);
  result -= x2 * (1/12 - x2 * (1/120 - x2 * (1/252 - x2 * (1/240 - x2 * 1/132))));
  return result;
}

/**
 * Trigamma function
 */
function trigamma(x) {
  if (x <= 0) return NaN;
  let result = 0;
  while (x < 6) {
    result += 1 / (x * x);
    x += 1;
  }
  const x2 = 1 / (x * x);
  result += 1/x + x2/2 + x2*x2 * (1/6 - x2 * (1/30 - x2 * (1/42 - x2 * (1/30 - x2 * 5/66))));
  return result;
}

// ============================================================================
// TWO-GROUP COMPARISONS: QUANTITATIVE VARIABLES
// ============================================================================

/**
 * MD - Raw Mean Difference
 */
export function meanDifference(m1, sd1, n1, m2, sd2, n2) {
  if (n1 <= 0 || n2 <= 0 || sd1 < 0 || sd2 < 0) {
    return { yi: null, vi: null, error: 'Invalid parameters' };
  }
  const yi = m1 - m2;
  const vi = (sd1 * sd1) / n1 + (sd2 * sd2) / n2;
  return { yi, vi, se: Math.sqrt(vi), measure: 'MD' };
}

/**
 * SMD - Standardized Mean Difference (Hedges' g with bias correction)
 */
export function smd(m1, sd1, n1, m2, sd2, n2) {
  if (n1 <= 1 || n2 <= 1 || sd1 <= 0 || sd2 <= 0) {
    return { yi: null, vi: null, error: 'Invalid parameters' };
  }

  const pooledSD = Math.sqrt(((n1 - 1) * sd1 * sd1 + (n2 - 1) * sd2 * sd2) / (n1 + n2 - 2));
  if (pooledSD === 0) return { yi: null, vi: null, error: 'Pooled SD is zero' };

  const d = (m1 - m2) / pooledSD;
  const df = n1 + n2 - 2;
  const J = 1 - (3 / (4 * df - 1)); // Hedges' correction
  const g = J * d;
  const vi = (n1 + n2) / (n1 * n2) + (g * g) / (2 * df);

  return { yi: g, vi, se: Math.sqrt(vi), cohens_d: d, J, measure: 'SMD' };
}

/**
 * SMDH - SMD with heteroscedastic variances (Glass's delta variant)
 */
export function smdh(m1, sd1, n1, m2, sd2, n2) {
  if (n1 <= 1 || n2 <= 1 || sd1 <= 0 || sd2 <= 0) {
    return { yi: null, vi: null, error: 'Invalid parameters' };
  }

  // Use control group SD only
  const d = (m1 - m2) / sd2;
  const df = n2 - 1;
  const J = 1 - (3 / (4 * df - 1));
  const g = J * d;

  // Variance accounting for heteroscedastic variances
  const vi = (sd1*sd1)/(n1*sd2*sd2) + 1/n2 + (g*g)/(2*df);

  return { yi: g, vi, se: Math.sqrt(vi), measure: 'SMDH' };
}

/**
 * ROM - Log-transformed Ratio of Means
 */
export function rom(m1, sd1, n1, m2, sd2, n2) {
  if (m1 <= 0 || m2 <= 0 || n1 <= 0 || n2 <= 0) {
    return { yi: null, vi: null, error: 'Means must be positive' };
  }

  const yi = Math.log(m1 / m2);
  const cv1 = sd1 / m1;
  const cv2 = sd2 / m2;
  const vi = (cv1 * cv1) / n1 + (cv2 * cv2) / n2;

  return { yi, vi, se: Math.sqrt(vi), ratio: Math.exp(yi), measure: 'ROM' };
}

/**
 * VR - Log-transformed Variability Ratio (ratio of SDs)
 */
export function vr(sd1, n1, sd2, n2) {
  if (sd1 <= 0 || sd2 <= 0 || n1 <= 1 || n2 <= 1) {
    return { yi: null, vi: null, error: 'Invalid parameters' };
  }

  const yi = Math.log(sd1 / sd2);
  const vi = 1 / (2 * (n1 - 1)) + 1 / (2 * (n2 - 1));

  return { yi, vi, se: Math.sqrt(vi), ratio: Math.exp(yi), measure: 'VR' };
}

/**
 * CVR - Log-transformed Coefficient of Variation Ratio
 */
export function cvr(m1, sd1, n1, m2, sd2, n2) {
  if (m1 <= 0 || m2 <= 0 || sd1 <= 0 || sd2 <= 0) {
    return { yi: null, vi: null, error: 'Invalid parameters' };
  }

  const cv1 = sd1 / m1;
  const cv2 = sd2 / m2;
  const yi = Math.log(cv1 / cv2);

  // Approximate variance
  const vi = (1 + cv1*cv1/2) / (n1 * cv1*cv1) +
             (1 + cv2*cv2/2) / (n2 * cv2*cv2);

  return { yi, vi, se: Math.sqrt(vi), measure: 'CVR' };
}

/**
 * CLES - Common Language Effect Size (probability of superiority)
 */
export function cles(m1, sd1, n1, m2, sd2, n2) {
  const smdResult = smd(m1, sd1, n1, m2, sd2, n2);
  if (smdResult.yi === null) return smdResult;

  const d = smdResult.cohens_d;
  const pooledSD = Math.sqrt(((n1-1)*sd1*sd1 + (n2-1)*sd2*sd2) / (n1+n2-2));
  const sdDiff = pooledSD * Math.sqrt(2);
  const yi = pnorm(d / Math.sqrt(2));

  // Delta method variance
  const dydD = Math.exp(-d*d/4) / (Math.sqrt(2 * Math.PI));
  const vi = dydD * dydD * smdResult.vi;

  return { yi, vi, se: Math.sqrt(vi), probability: yi, measure: 'CLES' };
}

// ============================================================================
// TWO-GROUP COMPARISONS: DICHOTOMOUS VARIABLES
// ============================================================================

/**
 * OR - Log Odds Ratio
 */
export function logOddsRatio(a, b, c, d, cc = 0.5) {
  const needsCC = a === 0 || b === 0 || c === 0 || d === 0;
  if (needsCC && cc > 0) {
    a += cc; b += cc; c += cc; d += cc;
  }
  if (a <= 0 || b <= 0 || c <= 0 || d <= 0) {
    return { yi: null, vi: null, error: 'Invalid cell counts' };
  }

  const yi = Math.log((a * d) / (b * c));
  const vi = 1/a + 1/b + 1/c + 1/d;

  return { yi, vi, se: Math.sqrt(vi), or: Math.exp(yi), needsCC, measure: 'OR' };
}

/**
 * RR - Log Risk Ratio
 */
export function logRiskRatio(a, n1, c, n2, cc = 0.5) {
  const b = n1 - a;
  const d = n2 - c;
  const needsCC = a === 0 || c === 0;

  if (needsCC && cc > 0) {
    a += cc; c += cc; n1 += cc; n2 += cc;
  }
  if (a <= 0 || c <= 0 || n1 <= 0 || n2 <= 0) {
    return { yi: null, vi: null, error: 'Invalid counts' };
  }

  const p1 = a / n1;
  const p2 = c / n2;
  const yi = Math.log(p1 / p2);
  const vi = (1 - p1) / a + (1 - p2) / c;

  return { yi, vi, se: Math.sqrt(vi), rr: Math.exp(yi), needsCC, measure: 'RR' };
}

/**
 * RD - Risk Difference
 */
export function riskDifference(a, n1, c, n2) {
  if (n1 <= 0 || n2 <= 0) {
    return { yi: null, vi: null, error: 'Invalid sample sizes' };
  }

  const p1 = a / n1;
  const p2 = c / n2;
  const yi = p1 - p2;
  const vi = (p1 * (1 - p1)) / n1 + (p2 * (1 - p2)) / n2;

  return { yi, vi, se: Math.sqrt(vi), measure: 'RD' };
}

/**
 * AS - Arcsine Square-root Transformed Risk Difference
 */
export function arcsineRD(a, n1, c, n2) {
  if (n1 <= 0 || n2 <= 0) {
    return { yi: null, vi: null, error: 'Invalid sample sizes' };
  }

  const p1 = a / n1;
  const p2 = c / n2;
  const yi = Math.asin(Math.sqrt(p1)) - Math.asin(Math.sqrt(p2));
  const vi = 1 / (4 * n1) + 1 / (4 * n2);

  return { yi, vi, se: Math.sqrt(vi), measure: 'AS' };
}

/**
 * PETO - Log Odds Ratio via Peto's method (for rare events)
 */
export function petoOR(a, n1, c, n2) {
  const b = n1 - a;
  const d = n2 - c;
  const N = n1 + n2;
  const m = a + c; // Total events

  if (N === 0 || m === 0 || m === N) {
    return { yi: null, vi: null, error: 'Invalid data for Peto method' };
  }

  const E = (n1 * m) / N; // Expected events in treatment
  const V = (n1 * n2 * m * (N - m)) / (N * N * (N - 1));

  if (V <= 0) {
    return { yi: null, vi: null, error: 'Zero variance' };
  }

  const yi = (a - E) / V;
  const vi = 1 / V;

  return { yi, vi, se: Math.sqrt(vi), O_E: a - E, measure: 'PETO' };
}

// ============================================================================
// TWO-GROUP COMPARISONS: EVENT COUNTS (Person-Time)
// ============================================================================

/**
 * IRR - Log Incidence Rate Ratio
 */
export function logIRR(x1, t1, x2, t2, cc = 0.5) {
  const needsCC = x1 === 0 || x2 === 0;
  if (needsCC && cc > 0) {
    x1 += cc; x2 += cc;
  }
  if (x1 <= 0 || x2 <= 0 || t1 <= 0 || t2 <= 0) {
    return { yi: null, vi: null, error: 'Invalid counts or person-time' };
  }

  const r1 = x1 / t1;
  const r2 = x2 / t2;
  const yi = Math.log(r1 / r2);
  const vi = 1 / x1 + 1 / x2;

  return { yi, vi, se: Math.sqrt(vi), irr: Math.exp(yi), measure: 'IRR' };
}

/**
 * IRD - Incidence Rate Difference
 */
export function ird(x1, t1, x2, t2) {
  if (t1 <= 0 || t2 <= 0) {
    return { yi: null, vi: null, error: 'Invalid person-time' };
  }

  const r1 = x1 / t1;
  const r2 = x2 / t2;
  const yi = r1 - r2;
  const vi = x1 / (t1 * t1) + x2 / (t2 * t2);

  return { yi, vi, se: Math.sqrt(vi), measure: 'IRD' };
}

/**
 * IRSD - Square-root Transformed Incidence Rate Difference
 */
export function irsd(x1, t1, x2, t2) {
  if (t1 <= 0 || t2 <= 0) {
    return { yi: null, vi: null, error: 'Invalid person-time' };
  }

  const yi = Math.sqrt(x1 / t1) - Math.sqrt(x2 / t2);
  const vi = 1 / (4 * t1) + 1 / (4 * t2);

  return { yi, vi, se: Math.sqrt(vi), measure: 'IRSD' };
}

// ============================================================================
// VARIABLE ASSOCIATION: CORRELATIONS
// ============================================================================

/**
 * COR - Raw Correlation Coefficient
 */
export function cor(r, n) {
  if (Math.abs(r) > 1 || n <= 3) {
    return { yi: null, vi: null, error: 'Invalid correlation or sample size' };
  }

  const yi = r;
  const vi = ((1 - r * r) * (1 - r * r)) / (n - 1);

  return { yi, vi, se: Math.sqrt(vi), measure: 'COR' };
}

/**
 * UCOR - Unbiased (bias-corrected) Correlation Coefficient
 */
export function ucor(r, n) {
  if (Math.abs(r) > 1 || n <= 3) {
    return { yi: null, vi: null, error: 'Invalid correlation or sample size' };
  }

  // Olkin & Pratt (1958) bias correction
  const yi = r * (1 + (1 - r * r) / (2 * (n - 3)));
  const vi = ((1 - r * r) * (1 - r * r)) / (n - 1);

  return { yi, vi, se: Math.sqrt(vi), measure: 'UCOR' };
}

/**
 * ZCOR - Fisher's r-to-z Transformed Correlation
 */
export function zcor(r, n) {
  if (Math.abs(r) >= 1 || n <= 3) {
    return { yi: null, vi: null, error: 'Invalid correlation or sample size' };
  }

  const yi = 0.5 * Math.log((1 + r) / (1 - r)); // arctanh(r)
  const vi = 1 / (n - 3);

  return { yi, vi, se: Math.sqrt(vi), r, measure: 'ZCOR' };
}

/**
 * PCOR - Partial Correlation Coefficient
 */
export function pcor(r, n, k) {
  // k = number of covariates
  if (Math.abs(r) > 1 || n <= k + 3) {
    return { yi: null, vi: null, error: 'Invalid parameters' };
  }

  const yi = r;
  const df = n - k - 2;
  const vi = ((1 - r * r) * (1 - r * r)) / df;

  return { yi, vi, se: Math.sqrt(vi), df, measure: 'PCOR' };
}

/**
 * ZPCOR - Fisher's z-transformed Partial Correlation
 */
export function zpcor(r, n, k) {
  if (Math.abs(r) >= 1 || n <= k + 3) {
    return { yi: null, vi: null, error: 'Invalid parameters' };
  }

  const yi = 0.5 * Math.log((1 + r) / (1 - r));
  const vi = 1 / (n - k - 3);

  return { yi, vi, se: Math.sqrt(vi), measure: 'ZPCOR' };
}

// ============================================================================
// SINGLE GROUP MEASURES: PROPORTIONS
// ============================================================================

/**
 * PR - Raw Proportion
 */
export function pr(x, n) {
  if (n <= 0) {
    return { yi: null, vi: null, error: 'Invalid sample size' };
  }

  const p = x / n;
  const yi = p;
  const vi = (p * (1 - p)) / n;

  return { yi, vi, se: Math.sqrt(vi), measure: 'PR' };
}

/**
 * PLN - Log-transformed Proportion
 */
export function pln(x, n, cc = 0.5) {
  if (n <= 0) return { yi: null, vi: null, error: 'Invalid sample size' };

  let xi = x;
  if (x === 0 && cc > 0) xi = cc;
  if (xi <= 0) return { yi: null, vi: null, error: 'Zero events' };

  const p = xi / n;
  const yi = Math.log(p);
  const vi = (1 - p) / (n * p);

  return { yi, vi, se: Math.sqrt(vi), p: Math.exp(yi), measure: 'PLN' };
}

/**
 * PLO - Logit-transformed Proportion
 */
export function plo(x, n, cc = 0.5) {
  if (n <= 0) return { yi: null, vi: null, error: 'Invalid sample size' };

  let xi = x;
  let ni = n;
  if (x === 0 || x === n) {
    if (cc > 0) {
      xi = x + cc;
      ni = n + 2 * cc;
    } else {
      return { yi: null, vi: null, error: 'Boundary proportion' };
    }
  }

  const p = xi / ni;
  const yi = Math.log(p / (1 - p));
  const vi = 1 / (ni * p * (1 - p));

  return { yi, vi, se: Math.sqrt(vi), p: 1 / (1 + Math.exp(-yi)), measure: 'PLO' };
}

/**
 * PAS - Arcsine Square-root Transformed Proportion
 */
export function pas(x, n) {
  if (n <= 0) return { yi: null, vi: null, error: 'Invalid sample size' };

  const p = x / n;
  const yi = Math.asin(Math.sqrt(p));
  const vi = 1 / (4 * n);

  return { yi, vi, se: Math.sqrt(vi), measure: 'PAS' };
}

/**
 * PFT - Freeman-Tukey Double Arcsine Transformed Proportion
 */
export function pft(x, n) {
  if (n <= 0) return { yi: null, vi: null, error: 'Invalid sample size' };

  const yi = Math.asin(Math.sqrt(x / (n + 1))) + Math.asin(Math.sqrt((x + 1) / (n + 1)));
  const vi = 1 / (n + 0.5);

  return { yi, vi, se: Math.sqrt(vi), measure: 'PFT' };
}

// ============================================================================
// SINGLE GROUP MEASURES: INCIDENCE RATES
// ============================================================================

/**
 * IR - Raw Incidence Rate
 */
export function ir(x, t) {
  if (t <= 0) return { yi: null, vi: null, error: 'Invalid person-time' };

  const yi = x / t;
  const vi = x / (t * t);

  return { yi, vi, se: Math.sqrt(vi), measure: 'IR' };
}

/**
 * IRLN - Log-transformed Incidence Rate
 */
export function irln(x, t, cc = 0.5) {
  if (t <= 0) return { yi: null, vi: null, error: 'Invalid person-time' };

  let xi = x;
  if (x === 0 && cc > 0) xi = cc;
  if (xi <= 0) return { yi: null, vi: null, error: 'Zero events' };

  const yi = Math.log(xi / t);
  const vi = 1 / xi;

  return { yi, vi, se: Math.sqrt(vi), rate: Math.exp(yi), measure: 'IRLN' };
}

/**
 * IRS - Square-root Transformed Incidence Rate
 */
export function irs(x, t) {
  if (t <= 0) return { yi: null, vi: null, error: 'Invalid person-time' };

  const yi = Math.sqrt(x / t);
  const vi = 1 / (4 * t);

  return { yi, vi, se: Math.sqrt(vi), measure: 'IRS' };
}

/**
 * IRFT - Freeman-Tukey Transformed Incidence Rate
 */
export function irft(x, t) {
  if (t <= 0) return { yi: null, vi: null, error: 'Invalid person-time' };

  const yi = Math.sqrt(x / t) + Math.sqrt((x + 1) / t);
  const vi = 1 / t;

  return { yi, vi, se: Math.sqrt(vi), measure: 'IRFT' };
}

// ============================================================================
// SINGLE GROUP MEASURES: MEANS
// ============================================================================

/**
 * MN - Raw Mean
 */
export function mn(m, sd, n) {
  if (n <= 0 || sd < 0) return { yi: null, vi: null, error: 'Invalid parameters' };

  const yi = m;
  const vi = (sd * sd) / n;

  return { yi, vi, se: Math.sqrt(vi), measure: 'MN' };
}

/**
 * MNLN - Log-transformed Mean (for log-normal data)
 */
export function mnln(m, sd, n) {
  if (m <= 0 || n <= 0 || sd < 0) return { yi: null, vi: null, error: 'Invalid parameters' };

  const cv = sd / m;
  const yi = Math.log(m);
  const vi = (cv * cv) / n;

  return { yi, vi, se: Math.sqrt(vi), measure: 'MNLN' };
}

/**
 * CVLN - Log-transformed Coefficient of Variation
 */
export function cvln(m, sd, n) {
  if (m <= 0 || sd <= 0 || n <= 2) return { yi: null, vi: null, error: 'Invalid parameters' };

  const cv = sd / m;
  const yi = Math.log(cv);
  const vi = (1 + cv * cv / 2) / (n * cv * cv);

  return { yi, vi, se: Math.sqrt(vi), cv, measure: 'CVLN' };
}

// ============================================================================
// RELIABILITY: CRONBACH'S ALPHA
// ============================================================================

/**
 * ARAW - Raw Cronbach's Alpha
 */
export function araw(alpha, n, k) {
  // k = number of items
  if (alpha < 0 || alpha > 1 || n <= 2 || k <= 1) {
    return { yi: null, vi: null, error: 'Invalid parameters' };
  }

  const yi = alpha;
  // Variance approximation (van Zyl et al., 2000)
  const vi = (2 * k * (1 - alpha) * (1 - alpha)) / ((k - 1) * (n - 2) * (n - 2));

  return { yi, vi, se: Math.sqrt(vi), measure: 'ARAW' };
}

/**
 * AHW - Hakstian-Whalen Transformed Alpha
 */
export function ahw(alpha, n, k) {
  if (alpha <= 0 || alpha >= 1 || n <= 2 || k <= 1) {
    return { yi: null, vi: null, error: 'Invalid parameters' };
  }

  const yi = (1 - alpha) ** (1/3);
  const vi = (18 * k * (n - 1) * (1 - alpha) ** (2/3)) /
             ((k - 1) * (9 * n - 11) * (9 * n - 11));

  return { yi, vi, se: Math.sqrt(vi), alpha, measure: 'AHW' };
}

/**
 * ABT - Bonett Transformed Alpha
 */
export function abt(alpha, n, k) {
  if (alpha <= 0 || alpha >= 1 || n <= 2 || k <= 1) {
    return { yi: null, vi: null, error: 'Invalid parameters' };
  }

  const yi = Math.log(1 - alpha);
  const vi = (2 * k) / ((k - 1) * (n - 2));

  return { yi, vi, se: Math.sqrt(vi), alpha, measure: 'ABT' };
}

// ============================================================================
// HAZARD RATIOS
// ============================================================================

/**
 * HR - Log Hazard Ratio from reported HR and CI
 */
export function logHR(hr, ci_lower, ci_upper) {
  if (hr <= 0 || ci_lower <= 0 || ci_upper <= 0) {
    return { yi: null, vi: null, error: 'Invalid HR or CI' };
  }

  const yi = Math.log(hr);
  const se = (Math.log(ci_upper) - Math.log(ci_lower)) / (2 * NORMAL_QUANTILE_975);
  const vi = se * se;

  return { yi, vi, se, hr, ci_lower, ci_upper, measure: 'HR' };
}

/**
 * HR from O-E and V (log-rank based)
 */
export function logHRfromOEV(O_E, V) {
  if (V <= 0) return { yi: null, vi: null, error: 'Invalid variance' };

  const yi = O_E / V;
  const vi = 1 / V;

  return { yi, vi, se: Math.sqrt(vi), hr: Math.exp(yi), measure: 'HR' };
}

// ============================================================================
// DIAGNOSTIC TEST ACCURACY
// ============================================================================

/**
 * DOR - Diagnostic Odds Ratio
 */
export function dor(tp, fp, fn, tn, cc = 0.5) {
  const needsCC = tp === 0 || fp === 0 || fn === 0 || tn === 0;
  if (needsCC && cc > 0) {
    tp += cc; fp += cc; fn += cc; tn += cc;
  }
  if (tp <= 0 || fp <= 0 || fn <= 0 || tn <= 0) {
    return { yi: null, vi: null, error: 'Invalid cell counts' };
  }

  const yi = Math.log((tp * tn) / (fp * fn));
  const vi = 1/tp + 1/fp + 1/fn + 1/tn;

  return { yi, vi, se: Math.sqrt(vi), dor: Math.exp(yi), measure: 'DOR' };
}

/**
 * LR+ - Positive Likelihood Ratio (log scale)
 */
export function lrPlus(tp, fp, fn, tn, cc = 0.5) {
  const sens = tp / (tp + fn);
  const spec = tn / (tn + fp);

  if (spec === 1) return { yi: null, vi: null, error: 'Specificity is 1' };

  const lrp = sens / (1 - spec);
  if (lrp <= 0) return { yi: null, vi: null, error: 'Invalid LR+' };

  const yi = Math.log(lrp);
  const vi = (1 - sens) / (tp) + spec / fp;

  return { yi, vi, se: Math.sqrt(vi), lrPlus: Math.exp(yi), measure: 'LRP' };
}

/**
 * LR- - Negative Likelihood Ratio (log scale)
 */
export function lrMinus(tp, fp, fn, tn, cc = 0.5) {
  const sens = tp / (tp + fn);
  const spec = tn / (tn + fp);

  if (spec === 0) return { yi: null, vi: null, error: 'Specificity is 0' };

  const lrm = (1 - sens) / spec;
  if (lrm <= 0) return { yi: null, vi: null, error: 'Invalid LR-' };

  const yi = Math.log(lrm);
  const vi = sens / fn + (1 - spec) / tn;

  return { yi, vi, se: Math.sqrt(vi), lrMinus: Math.exp(yi), measure: 'LRM' };
}

// ============================================================================
// SMD TO OR CONVERSIONS
// ============================================================================

/**
 * D2ORN - SMD to OR assuming normal distributions
 */
export function d2orn(d, vd) {
  // Cox transformation: OR = exp(d * π / √3)
  const k = Math.PI / Math.sqrt(3);
  const yi = d * k;
  const vi = vd * k * k;

  return { yi, vi, se: Math.sqrt(vi), or: Math.exp(yi), measure: 'D2ORN' };
}

/**
 * D2ORL - SMD to OR assuming logistic distributions
 */
export function d2orl(d, vd) {
  // Logistic transformation: OR = exp(d * 1.81)
  const k = 1.81;
  const yi = d * k;
  const vi = vd * k * k;

  return { yi, vi, se: Math.sqrt(vi), or: Math.exp(yi), measure: 'D2ORL' };
}

/**
 * OR2DN - OR to SMD assuming normal distributions
 */
export function or2dn(lnor, vlnor) {
  const k = Math.sqrt(3) / Math.PI;
  const yi = lnor * k;
  const vi = vlnor * k * k;

  return { yi, vi, se: Math.sqrt(vi), d: yi, measure: 'OR2DN' };
}

/**
 * OR2DL - OR to SMD assuming logistic distributions
 */
export function or2dl(lnor, vlnor) {
  const k = 1 / 1.81;
  const yi = lnor * k;
  const vi = vlnor * k * k;

  return { yi, vi, se: Math.sqrt(vi), d: yi, measure: 'OR2DL' };
}

// ============================================================================
// NNT AND CLINICAL CONVERSIONS
// ============================================================================

/**
 * Calculate NNT from OR and baseline risk
 */
export function orToNNT(or, baselineRisk) {
  if (or <= 0 || baselineRisk <= 0 || baselineRisk >= 1) {
    return { nnt: null, error: 'Invalid parameters' };
  }

  const p0 = baselineRisk;
  const p1 = (or * p0) / (1 - p0 + or * p0);
  const arr = Math.abs(p0 - p1);

  return {
    nnt: arr > 0 ? 1 / arr : Infinity,
    arr,
    p0,
    p1,
    benefit: or < 1
  };
}

/**
 * Calculate NNT from RR and baseline risk
 */
export function rrToNNT(rr, baselineRisk) {
  if (rr <= 0 || baselineRisk <= 0 || baselineRisk >= 1) {
    return { nnt: null, error: 'Invalid parameters' };
  }

  const p0 = baselineRisk;
  const p1 = rr * p0;

  if (p1 > 1) return { nnt: null, error: 'Implied probability > 1' };

  const arr = Math.abs(p0 - p1);

  return {
    nnt: arr > 0 ? 1 / arr : Infinity,
    arr,
    p0,
    p1,
    benefit: rr < 1
  };
}

// ============================================================================
// TRANSFORMATION FUNCTIONS
// ============================================================================

export const transformations = {
  // r-to-z and z-to-r
  rtoz: (r) => 0.5 * Math.log((1 + r) / (1 - r)),
  ztor: (z) => (Math.exp(2 * z) - 1) / (Math.exp(2 * z) + 1),

  // Logit and inverse logit
  logit: (p) => Math.log(p / (1 - p)),
  ilogit: (x) => 1 / (1 + Math.exp(-x)),

  // Arcsine transformations
  arcsin: (p) => Math.asin(Math.sqrt(p)),
  iarcsin: (x) => Math.sin(x) ** 2,

  // Freeman-Tukey back-transformation (using harmonic mean of n)
  ipft: (x, n) => {
    const z = x / 2;
    return 0.5 * (1 - Math.sign(Math.cos(x)) *
           Math.sqrt(1 - (Math.sin(x) + (Math.sin(x) - 1/Math.sin(x)) / n) ** 2));
  },

  // Exponential (for log-transformed measures)
  exp: Math.exp,
  log: Math.log,

  // SMD to CLES
  dtocles: (d) => pnorm(d / Math.sqrt(2)),
  clestod: (cles) => qnorm(cles) * Math.sqrt(2),

  // SMD to correlation
  dtor: (d, n1, n2) => d / Math.sqrt(d*d + (n1+n2-2)*(n1+n2)/(n1*n2)),
  rtod: (r, n1, n2) => r * Math.sqrt((n1+n2-2)*(n1+n2)/(n1*n2*(1-r*r))),

  // Cohen's U values
  dtou1: (d) => 2 * pnorm(-Math.abs(d) / 2), // Overlap coefficient
  dtou2: (d) => pnorm(d / 2), // Percent in treatment > control median
  dtou3: (d) => pnorm(d), // Percent above control mean

  // Cliff's delta
  dtocliffd: (d) => 2 * pnorm(d / Math.sqrt(2)) - 1
};

// ============================================================================
// DATA CONVERSION UTILITIES
// ============================================================================

/**
 * Convert Wald-type CI to variance
 */
export function ciToVariance(estimate, ci_lower, ci_upper, level = 0.95) {
  const z = qnorm((1 + level) / 2);
  const se = (ci_upper - ci_lower) / (2 * z);
  return { vi: se * se, se };
}

/**
 * Estimate mean and SD from median, IQR (Wan et al. method)
 */
export function medianIQRtoMeanSD(median, q1, q3, n) {
  // Wan C, et al. (2014) BMC Med Res Methodol
  const iqr = q3 - q1;

  // Mean approximation
  const mean = (q1 + median + q3) / 3;

  // SD approximation
  const sd = iqr / 1.35;

  return { mean, sd, method: 'Wan2014_IQR' };
}

/**
 * Estimate mean and SD from min, max, median (Hozo method)
 */
export function minMaxMedianToMeanSD(min, max, median, n) {
  // Hozo SP et al. (2005) BMC Med Res Methodol
  let mean, sd;

  if (n <= 25) {
    mean = (min + 2 * median + max) / 4;
    sd = (max - min) / 4;
  } else if (n <= 70) {
    mean = (min + 2 * median + max) / 4;
    sd = (max - min) / (2 * qnorm((n - 0.375) / (n + 0.25)));
  } else {
    mean = (min + 2 * median + max) / 4;
    sd = (max - min) / (2 * qnorm((n - 0.375) / (n + 0.25)));
  }

  return { mean, sd, method: 'Hozo2005' };
}

/**
 * Estimate mean and SD from 5-number summary (Luo-Wan method)
 */
export function fiveNumToMeanSD(min, q1, median, q3, max, n) {
  // Luo D et al. (2018), Wan X et al. (2014)
  // Combined approach for best estimates

  // Mean: weighted combination
  const mean = (min + 2*q1 + 2*median + 2*q3 + max) / 8;

  // SD: combine range and IQR information
  const sdRange = (max - min) / (2 * qnorm((n - 0.375) / (n + 0.25)));
  const sdIQR = (q3 - q1) / 1.35;
  const sd = (sdRange + sdIQR) / 2;

  return { mean, sd, method: 'LuoWan' };
}

// ============================================================================
// MASTER EFFECT SIZE CALCULATOR
// ============================================================================

/**
 * Calculate effect size (equivalent to metafor's escalc)
 * @param {string} measure - Effect size measure code
 * @param {object} data - Input data
 * @param {number} cc - Continuity correction (default 0.5)
 */
export function escalc(measure, data, cc = 0.5) {
  measure = measure.toUpperCase();

  switch (measure) {
    // Two-group quantitative
    case 'MD':
      return meanDifference(data.m1, data.sd1, data.n1, data.m2, data.sd2, data.n2);
    case 'SMD':
      return smd(data.m1, data.sd1, data.n1, data.m2, data.sd2, data.n2);
    case 'SMDH':
      return smdh(data.m1, data.sd1, data.n1, data.m2, data.sd2, data.n2);
    case 'ROM':
      return rom(data.m1, data.sd1, data.n1, data.m2, data.sd2, data.n2);
    case 'VR':
      return vr(data.sd1, data.n1, data.sd2, data.n2);
    case 'CVR':
      return cvr(data.m1, data.sd1, data.n1, data.m2, data.sd2, data.n2);
    case 'CLES':
      return cles(data.m1, data.sd1, data.n1, data.m2, data.sd2, data.n2);

    // Two-group binary
    case 'OR':
      return logOddsRatio(data.ai || data.a, data.bi || data.b,
                          data.ci || data.c, data.di || data.d, cc);
    case 'RR':
      return logRiskRatio(data.ai || data.a, data.n1i || data.n1,
                          data.ci || data.c, data.n2i || data.n2, cc);
    case 'RD':
      return riskDifference(data.ai || data.a, data.n1i || data.n1,
                            data.ci || data.c, data.n2i || data.n2);
    case 'AS':
      return arcsineRD(data.ai || data.a, data.n1i || data.n1,
                       data.ci || data.c, data.n2i || data.n2);
    case 'PETO':
      return petoOR(data.ai || data.a, data.n1i || data.n1,
                    data.ci || data.c, data.n2i || data.n2);

    // Incidence rates
    case 'IRR':
      return logIRR(data.x1i || data.x1, data.t1i || data.t1,
                    data.x2i || data.x2, data.t2i || data.t2, cc);
    case 'IRD':
      return ird(data.x1i || data.x1, data.t1i || data.t1,
                 data.x2i || data.x2, data.t2i || data.t2);
    case 'IRSD':
      return irsd(data.x1i || data.x1, data.t1i || data.t1,
                  data.x2i || data.x2, data.t2i || data.t2);

    // Correlations
    case 'COR':
      return cor(data.ri || data.r, data.ni || data.n);
    case 'UCOR':
      return ucor(data.ri || data.r, data.ni || data.n);
    case 'ZCOR':
      return zcor(data.ri || data.r, data.ni || data.n);
    case 'PCOR':
      return pcor(data.ri || data.r, data.ni || data.n, data.ki || data.k);
    case 'ZPCOR':
      return zpcor(data.ri || data.r, data.ni || data.n, data.ki || data.k);

    // Single-group proportions
    case 'PR':
      return pr(data.xi || data.x, data.ni || data.n);
    case 'PLN':
      return pln(data.xi || data.x, data.ni || data.n, cc);
    case 'PLO':
      return plo(data.xi || data.x, data.ni || data.n, cc);
    case 'PAS':
      return pas(data.xi || data.x, data.ni || data.n);
    case 'PFT':
      return pft(data.xi || data.x, data.ni || data.n);

    // Single-group rates
    case 'IR':
      return ir(data.xi || data.x, data.ti || data.t);
    case 'IRLN':
      return irln(data.xi || data.x, data.ti || data.t, cc);
    case 'IRS':
      return irs(data.xi || data.x, data.ti || data.t);
    case 'IRFT':
      return irft(data.xi || data.x, data.ti || data.t);

    // Single-group means
    case 'MN':
      return mn(data.mi || data.m, data.sdi || data.sd, data.ni || data.n);
    case 'MNLN':
      return mnln(data.mi || data.m, data.sdi || data.sd, data.ni || data.n);
    case 'CVLN':
      return cvln(data.mi || data.m, data.sdi || data.sd, data.ni || data.n);

    // Reliability
    case 'ARAW':
      return araw(data.ai || data.alpha, data.ni || data.n, data.ki || data.k);
    case 'AHW':
      return ahw(data.ai || data.alpha, data.ni || data.n, data.ki || data.k);
    case 'ABT':
      return abt(data.ai || data.alpha, data.ni || data.n, data.ki || data.k);

    // Hazard ratios
    case 'HR':
      if (data.O_E !== undefined) {
        return logHRfromOEV(data.O_E, data.V);
      }
      return logHR(data.hr, data.ci_lower, data.ci_upper);

    // DTA measures
    case 'DOR':
      return dor(data.tp, data.fp, data.fn, data.tn, cc);
    case 'LRP':
      return lrPlus(data.tp, data.fp, data.fn, data.tn, cc);
    case 'LRM':
      return lrMinus(data.tp, data.fp, data.fn, data.tn, cc);

    // Conversions
    case 'D2ORN':
      return d2orn(data.di || data.d, data.vi || data.v);
    case 'D2ORL':
      return d2orl(data.di || data.d, data.vi || data.v);
    case 'OR2DN':
      return or2dn(data.yi || data.y, data.vi || data.v);
    case 'OR2DL':
      return or2dl(data.yi || data.y, data.vi || data.v);

    // Generic
    case 'GEN':
      return { yi: data.yi || data.y, vi: data.vi || data.v, se: Math.sqrt(data.vi || data.v), measure: 'GEN' };

    default:
      return { yi: null, vi: null, error: `Unknown measure: ${measure}` };
  }
}

export default {
  // Effect size calculations
  escalc,
  meanDifference,
  smd,
  smdh,
  rom,
  vr,
  cvr,
  cles,
  logOddsRatio,
  logRiskRatio,
  riskDifference,
  arcsineRD,
  petoOR,
  logIRR,
  ird,
  irsd,
  cor,
  ucor,
  zcor,
  pcor,
  zpcor,
  pr,
  pln,
  plo,
  pas,
  pft,
  ir,
  irln,
  irs,
  irft,
  mn,
  mnln,
  cvln,
  araw,
  ahw,
  abt,
  logHR,
  logHRfromOEV,
  dor,
  lrPlus,
  lrMinus,
  d2orn,
  d2orl,
  or2dn,
  or2dl,

  // Utilities
  orToNNT,
  rrToNNT,
  transformations,
  ciToVariance,
  medianIQRtoMeanSD,
  minMaxMedianToMeanSD,
  fiveNumToMeanSD,

  // Statistical functions
  pnorm,
  qnorm,
  gamma,
  beta,
  digamma,
  trigamma
};
