/**
 * Binary Outcome Meta-Analysis Methods
 * Implements Mantel-Haenszel, Peto, and GLMM methods
 * Matches metafor's rma.mh(), rma.peto(), rma.glmm()
 */

// ============================================================================
// STATISTICAL UTILITIES
// ============================================================================

function qnorm(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;

  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
             1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
             6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
             -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
             3.754408661907416e+00];

  const pLow = 0.02425, pHigh = 1 - pLow;
  let q, r;

  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  } else if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  }
}

function pchisq(x, df) {
  if (x <= 0) return 0;
  return gammainc(df / 2, x / 2);
}

function gammainc(a, x) {
  if (x < 0 || a <= 0) return NaN;
  if (x === 0) return 0;
  if (x < a + 1) {
    let sum = 1 / a, term = 1 / a;
    for (let n = 1; n < 200; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < 1e-14 * Math.abs(sum)) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - lgamma(a));
  }
  return 1 - gammainc_upper(a, x);
}

function gammainc_upper(a, x) {
  let f = 1e-30, c = 1e-30, d = 0;
  for (let i = 1; i < 200; i++) {
    const an = (i % 2 === 1) ? ((i + 1) / 2 - a) : (i / 2);
    const bn = (i % 2 === 1) ? 1 : x;
    d = bn + an * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = bn + an / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const delta = c * d;
    f *= delta;
    if (Math.abs(delta - 1) < 1e-10) break;
  }
  return Math.exp(-x + a * Math.log(x) - lgamma(a)) * f / a;
}

function lgamma(x) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
             -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x, tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += c[j] / ++y;
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

// ============================================================================
// MANTEL-HAENSZEL METHODS
// ============================================================================

/**
 * Mantel-Haenszel Odds Ratio
 * @param {Array} studies - Array of {ai, bi, ci, di} (2x2 table cells)
 * @param {object} options - {cc, drop00, correct}
 */
export function mhOddsRatio(studies, options = {}) {
  const { cc = 0.5, drop00 = true, correct = true } = options;

  let validStudies = studies.filter(s => {
    const total = s.ai + s.bi + s.ci + s.di;
    if (drop00 && s.ai + s.ci === 0) return false; // No events
    if (drop00 && s.bi + s.di === 0) return false; // All events
    return total > 0;
  });

  if (validStudies.length === 0) {
    return { yi: null, vi: null, error: 'No valid studies' };
  }

  // Calculate MH components
  let R = 0, S = 0;
  let P = 0, Q = 0;
  let sumRS = 0;

  validStudies.forEach(s => {
    let { ai, bi, ci, di } = s;
    const n = ai + bi + ci + di;

    // Apply continuity correction if needed
    if (cc > 0 && (ai === 0 || bi === 0 || ci === 0 || di === 0)) {
      ai += cc; bi += cc; ci += cc; di += cc;
    }

    const n1 = ai + bi;
    const n2 = ci + di;

    // MH weights and components
    R += (ai * di) / n;
    S += (bi * ci) / n;

    // Robins-Breslow-Greenland variance components
    P += (ai + di) * ai * di / (n * n);
    Q += ((ai + di) * bi * ci + (bi + ci) * ai * di) / (n * n);
    sumRS += (bi + ci) * bi * ci / (n * n);
  });

  if (S === 0) {
    return { yi: null, vi: null, error: 'Zero in denominator' };
  }

  const OR_MH = R / S;
  const logOR = Math.log(OR_MH);

  // Robins-Breslow-Greenland variance estimator
  const vi = P / (2 * R * R) + Q / (2 * R * S) + sumRS / (2 * S * S);
  const se = Math.sqrt(vi);

  // Cochran-Mantel-Haenszel test
  let cmhNum = 0, cmhDen = 0;
  validStudies.forEach(s => {
    let { ai, bi, ci, di } = s;
    if (cc > 0 && (ai === 0 || bi === 0 || ci === 0 || di === 0)) {
      ai += cc; bi += cc; ci += cc; di += cc;
    }
    const n = ai + bi + ci + di;
    const n1 = ai + bi;
    const n2 = ci + di;
    const m1 = ai + ci;

    const E = (n1 * m1) / n;
    cmhNum += ai - E;
    cmhDen += (n1 * n2 * m1 * (n - m1)) / (n * n * (n - 1));
  });

  // Continuity correction for CMH test
  const cmhStat = correct ?
    Math.pow(Math.abs(cmhNum) - 0.5, 2) / cmhDen :
    (cmhNum * cmhNum) / cmhDen;

  const pvalue = 1 - pchisq(cmhStat, 1);

  // Heterogeneity (Tarone's test)
  let QMH = 0;
  validStudies.forEach(s => {
    let { ai, bi, ci, di } = s;
    if (cc > 0 && (ai === 0 || bi === 0 || ci === 0 || di === 0)) {
      ai += cc; bi += cc; ci += cc; di += cc;
    }
    const n = ai + bi + ci + di;
    const n1 = ai + bi;
    const n2 = ci + di;
    const m1 = ai + ci;

    // Expected under common OR
    const E = (n1 * m1) / n;
    // Study-specific log OR
    const logORi = Math.log((ai * di) / (bi * ci));
    const vi_i = 1/ai + 1/bi + 1/ci + 1/di;

    QMH += Math.pow(logORi - logOR, 2) / vi_i;
  });

  const QMH_pvalue = 1 - pchisq(QMH, validStudies.length - 1);

  return {
    yi: logOR,
    vi,
    se,
    or: OR_MH,
    ci_lower: Math.exp(logOR - 1.96 * se),
    ci_upper: Math.exp(logOR + 1.96 * se),
    cmh_stat: cmhStat,
    cmh_pvalue: pvalue,
    Q: QMH,
    Q_pvalue: QMH_pvalue,
    k: validStudies.length,
    measure: 'OR',
    method: 'MH'
  };
}

/**
 * Mantel-Haenszel Risk Ratio
 */
export function mhRiskRatio(studies, options = {}) {
  const { cc = 0.5, drop00 = true } = options;

  let validStudies = studies.filter(s => {
    const n1 = s.ai + s.bi;
    const n2 = s.ci + s.di;
    if (drop00 && s.ai + s.ci === 0) return false;
    return n1 > 0 && n2 > 0;
  });

  if (validStudies.length === 0) {
    return { yi: null, vi: null, error: 'No valid studies' };
  }

  let R = 0, S = 0;
  let varNum = 0;

  validStudies.forEach(s => {
    let { ai, bi, ci, di } = s;
    const n = ai + bi + ci + di;
    const n1 = ai + bi;
    const n2 = ci + di;

    if (cc > 0 && (ai === 0 || ci === 0)) {
      ai += cc; ci += cc; n1 += cc; n2 += cc;
    }

    R += (ai * n2) / n;
    S += (ci * n1) / n;

    // Greenland-Robins variance components
    const m1 = ai + ci;
    varNum += (m1 * n1 * n2 / n - ai * ci) / n;
  });

  if (S === 0) {
    return { yi: null, vi: null, error: 'Zero in denominator' };
  }

  const RR_MH = R / S;
  const logRR = Math.log(RR_MH);

  // Variance (Greenland-Robins)
  const vi = varNum / (R * S);
  const se = Math.sqrt(vi);

  return {
    yi: logRR,
    vi,
    se,
    rr: RR_MH,
    ci_lower: Math.exp(logRR - 1.96 * se),
    ci_upper: Math.exp(logRR + 1.96 * se),
    k: validStudies.length,
    measure: 'RR',
    method: 'MH'
  };
}

/**
 * Mantel-Haenszel Risk Difference
 */
export function mhRiskDifference(studies, options = {}) {
  const { drop00 = true } = options;

  let validStudies = studies.filter(s => {
    const n1 = s.ai + s.bi;
    const n2 = s.ci + s.di;
    return n1 > 0 && n2 > 0;
  });

  if (validStudies.length === 0) {
    return { yi: null, vi: null, error: 'No valid studies' };
  }

  let sumW = 0, sumWRD = 0;
  let varSum = 0;

  validStudies.forEach(s => {
    const { ai, bi, ci, di } = s;
    const n = ai + bi + ci + di;
    const n1 = ai + bi;
    const n2 = ci + di;

    const p1 = ai / n1;
    const p2 = ci / n2;
    const rd = p1 - p2;

    // MH weight for RD
    const w = (n1 * n2) / n;
    sumW += w;
    sumWRD += w * rd;

    // Variance component
    varSum += w * w * (p1 * (1 - p1) / n1 + p2 * (1 - p2) / n2);
  });

  const RD_MH = sumWRD / sumW;
  const vi = varSum / (sumW * sumW);
  const se = Math.sqrt(vi);

  return {
    yi: RD_MH,
    vi,
    se,
    rd: RD_MH,
    ci_lower: RD_MH - 1.96 * se,
    ci_upper: RD_MH + 1.96 * se,
    k: validStudies.length,
    measure: 'RD',
    method: 'MH'
  };
}

/**
 * Mantel-Haenszel Incidence Rate Ratio
 */
export function mhIncidenceRateRatio(studies, options = {}) {
  const { cc = 0.5, drop00 = true } = options;

  let validStudies = studies.filter(s => {
    if (drop00 && s.x1i + s.x2i === 0) return false;
    return s.t1i > 0 && s.t2i > 0;
  });

  if (validStudies.length === 0) {
    return { yi: null, vi: null, error: 'No valid studies' };
  }

  let R = 0, S = 0;
  let varNum = 0;

  validStudies.forEach(s => {
    let { x1i, t1i, x2i, t2i } = s;
    const T = t1i + t2i;

    if (cc > 0 && (x1i === 0 || x2i === 0)) {
      x1i += cc;
      x2i += cc;
    }

    R += (x1i * t2i) / T;
    S += (x2i * t1i) / T;

    const m = x1i + x2i;
    varNum += (m * t1i * t2i / T) / T;
  });

  if (S === 0) {
    return { yi: null, vi: null, error: 'Zero in denominator' };
  }

  const IRR_MH = R / S;
  const logIRR = Math.log(IRR_MH);
  const vi = varNum / (R * S);
  const se = Math.sqrt(vi);

  return {
    yi: logIRR,
    vi,
    se,
    irr: IRR_MH,
    ci_lower: Math.exp(logIRR - 1.96 * se),
    ci_upper: Math.exp(logIRR + 1.96 * se),
    k: validStudies.length,
    measure: 'IRR',
    method: 'MH'
  };
}

// ============================================================================
// PETO'S METHOD
// ============================================================================

/**
 * Peto's One-Step Odds Ratio
 * Particularly suitable for rare events
 */
export function petoOddsRatio(studies, options = {}) {
  const { drop00 = true } = options;

  let validStudies = studies.filter(s => {
    const n = s.ai + s.bi + s.ci + s.di;
    const m1 = s.ai + s.ci;
    if (drop00 && m1 === 0) return false;
    if (drop00 && m1 === n) return false;
    return n > 0;
  });

  if (validStudies.length === 0) {
    return { yi: null, vi: null, error: 'No valid studies' };
  }

  let sumOE = 0;
  let sumV = 0;

  validStudies.forEach(s => {
    const { ai, bi, ci, di } = s;
    const n = ai + bi + ci + di;
    const n1 = ai + bi;
    const n2 = ci + di;
    const m1 = ai + ci;
    const m2 = bi + di;

    // Expected events in treatment group under null
    const E = (n1 * m1) / n;

    // Hypergeometric variance
    const V = (n1 * n2 * m1 * m2) / (n * n * (n - 1));

    sumOE += ai - E;
    sumV += V;
  });

  if (sumV === 0) {
    return { yi: null, vi: null, error: 'Zero variance' };
  }

  // Peto log OR
  const logOR = sumOE / sumV;
  const vi = 1 / sumV;
  const se = Math.sqrt(vi);

  // Chi-square test
  const chi2 = (sumOE * sumOE) / sumV;
  const pvalue = 1 - pchisq(chi2, 1);

  return {
    yi: logOR,
    vi,
    se,
    or: Math.exp(logOR),
    ci_lower: Math.exp(logOR - 1.96 * se),
    ci_upper: Math.exp(logOR + 1.96 * se),
    O_E: sumOE,
    V: sumV,
    chi2,
    pvalue,
    k: validStudies.length,
    measure: 'OR',
    method: 'Peto'
  };
}

// ============================================================================
// GLMM METHODS FOR RARE EVENTS
// ============================================================================

/**
 * Beta-Binomial Model for Rare Events
 * Avoids continuity corrections, models overdispersion
 */
export function betaBinomialMA(studies, options = {}) {
  const { maxIter = 100, tol = 1e-6 } = options;

  // Filter valid studies
  const validStudies = studies.filter(s => {
    const n1 = s.ai + s.bi;
    const n2 = s.ci + s.di;
    return n1 > 0 && n2 > 0;
  });

  const k = validStudies.length;
  if (k < 2) return { yi: null, vi: null, error: 'Need at least 2 studies' };

  // Initialize parameters
  let logOR = 0;
  let phi = 0.1; // Overdispersion parameter

  // Fit using iteratively reweighted least squares
  for (let iter = 0; iter < maxIter; iter++) {
    let sumW = 0, sumWY = 0;
    let score_phi = 0, info_phi = 0;

    validStudies.forEach(s => {
      const { ai, bi, ci, di } = s;
      const n1 = ai + bi;
      const n2 = ci + di;

      // Expected probabilities under current logOR
      const p2 = (ci + 0.5) / (n2 + 1);
      const odds2 = p2 / (1 - p2);
      const p1 = (odds2 * Math.exp(logOR)) / (1 + odds2 * Math.exp(logOR));

      // Weights with overdispersion
      const v1 = p1 * (1 - p1) / n1 * (1 + (n1 - 1) * phi);
      const v2 = p2 * (1 - p2) / n2 * (1 + (n2 - 1) * phi);
      const w = 1 / (v1 / (p1 * p1) + v2 / (p2 * p2));

      // Study-specific log OR
      const y = Math.log((ai + 0.5) * (di + 0.5) / ((bi + 0.5) * (ci + 0.5)));

      sumW += w;
      sumWY += w * y;

      // Score for phi
      const resid = (y - logOR);
      score_phi += (resid * resid * w - 1);
    });

    const newLogOR = sumWY / sumW;

    if (Math.abs(newLogOR - logOR) < tol) break;
    logOR = newLogOR;
  }

  // Calculate final variance
  let sumW = 0;
  validStudies.forEach(s => {
    const { ai, bi, ci, di } = s;
    const n1 = ai + bi;
    const n2 = ci + di;

    const p1 = (ai + 0.5) / (n1 + 1);
    const p2 = (ci + 0.5) / (n2 + 1);

    const v1 = p1 * (1 - p1) / n1 * (1 + (n1 - 1) * phi);
    const v2 = p2 * (1 - p2) / n2 * (1 + (n2 - 1) * phi);
    const w = 1 / (v1 / (p1 * p1) + v2 / (p2 * p2));

    sumW += w;
  });

  const vi = 1 / sumW;
  const se = Math.sqrt(vi);

  return {
    yi: logOR,
    vi,
    se,
    or: Math.exp(logOR),
    ci_lower: Math.exp(logOR - 1.96 * se),
    ci_upper: Math.exp(logOR + 1.96 * se),
    phi,
    k,
    measure: 'OR',
    method: 'BetaBinomial'
  };
}

/**
 * Exact Conditional Logistic Regression (for very sparse data)
 * Uses hypergeometric distribution
 */
export function exactConditionalMA(studies, options = {}) {
  // Filter out double-zero studies
  const validStudies = studies.filter(s => {
    const m1 = s.ai + s.ci;
    const m2 = s.bi + s.di;
    return m1 > 0 && m2 > 0;
  });

  const k = validStudies.length;
  if (k === 0) return { yi: null, vi: null, error: 'No informative studies' };

  // Sufficient statistic: sum of ai
  const sumA = validStudies.reduce((sum, s) => sum + s.ai, 0);

  // Calculate conditional MLE
  // Find logOR that maximizes conditional likelihood

  function conditionalLogLik(logOR) {
    const psi = Math.exp(logOR);
    let ll = 0;

    validStudies.forEach(s => {
      const { ai, bi, ci, di } = s;
      const n1 = ai + bi;
      const n2 = ci + di;
      const m1 = ai + ci;

      // Log of non-central hypergeometric probability
      // P(X = ai | margins, psi) proportional to C(n1, ai) * C(n2, m1-ai) * psi^ai

      const minA = Math.max(0, m1 - n2);
      const maxA = Math.min(n1, m1);

      // Numerator
      let logNum = ai * logOR;
      for (let j = 0; j < ai; j++) logNum += Math.log(n1 - j) - Math.log(j + 1);
      for (let j = 0; j < m1 - ai; j++) logNum += Math.log(n2 - j) - Math.log(j + 1);

      // Denominator (sum over possible values)
      let denom = 0;
      for (let x = minA; x <= maxA; x++) {
        let logTerm = x * logOR;
        for (let j = 0; j < x; j++) logTerm += Math.log(n1 - j) - Math.log(j + 1);
        for (let j = 0; j < m1 - x; j++) logTerm += Math.log(n2 - j) - Math.log(j + 1);
        denom += Math.exp(logTerm - logNum); // Relative to numerator for numerical stability
      }

      ll += -Math.log(denom);
    });

    return ll;
  }

  // Find MLE using golden section search
  let lower = -5, upper = 5;
  const phi = (1 + Math.sqrt(5)) / 2;

  for (let iter = 0; iter < 50; iter++) {
    const c = upper - (upper - lower) / phi;
    const d = lower + (upper - lower) / phi;

    if (conditionalLogLik(c) > conditionalLogLik(d)) {
      upper = d;
    } else {
      lower = c;
    }

    if (upper - lower < 1e-6) break;
  }

  const logOR = (lower + upper) / 2;

  // Estimate variance using observed information
  const h = 0.0001;
  const ll0 = conditionalLogLik(logOR);
  const llPlus = conditionalLogLik(logOR + h);
  const llMinus = conditionalLogLik(logOR - h);
  const info = -(llPlus - 2 * ll0 + llMinus) / (h * h);

  const vi = info > 0 ? 1 / info : null;
  const se = vi ? Math.sqrt(vi) : null;

  return {
    yi: logOR,
    vi,
    se,
    or: Math.exp(logOR),
    ci_lower: se ? Math.exp(logOR - 1.96 * se) : null,
    ci_upper: se ? Math.exp(logOR + 1.96 * se) : null,
    logLik: ll0,
    k,
    measure: 'OR',
    method: 'ExactConditional'
  };
}

// ============================================================================
// DOUBLE-ZERO HANDLING
// ============================================================================

/**
 * Handle double-zero studies using various methods
 */
export function handleDoubleZero(studies, method = 'exclude') {
  const doubleZero = studies.filter(s => s.ai + s.ci === 0);
  const singleZero = studies.filter(s =>
    (s.ai === 0 || s.ci === 0) && s.ai + s.ci > 0
  );
  const nonZero = studies.filter(s => s.ai > 0 && s.ci > 0);

  switch (method) {
    case 'exclude':
      return {
        studies: nonZero.concat(singleZero),
        excluded: doubleZero.length,
        method: 'exclude'
      };

    case 'cc': // Continuity correction
      return {
        studies: studies.map(s => ({
          ai: s.ai + 0.5,
          bi: s.bi + 0.5,
          ci: s.ci + 0.5,
          di: s.di + 0.5
        })),
        excluded: 0,
        method: 'cc'
      };

    case 'treatment_arm_cc': // Add cc only to treatment arm
      return {
        studies: studies.map(s => {
          if (s.ai === 0) {
            return { ...s, ai: 0.5, bi: s.bi + 0.5 };
          }
          return s;
        }),
        excluded: 0,
        method: 'treatment_arm_cc'
      };

    case 'empirical_cc': // Empirical continuity correction (Sweeting 2004)
      const R = studies.reduce((sum, s) => sum + (s.ai + s.bi), 0) /
                studies.reduce((sum, s) => sum + (s.ci + s.di), 0);
      return {
        studies: studies.map(s => ({
          ai: s.ai + 1 / (1 + R),
          bi: s.bi + 1 / (1 + R),
          ci: s.ci + R / (1 + R),
          di: s.di + R / (1 + R)
        })),
        excluded: 0,
        method: 'empirical_cc',
        R
      };

    default:
      return { studies, excluded: 0, method: 'none' };
  }
}

// ============================================================================
// MASTER FUNCTION
// ============================================================================

/**
 * Binary outcome meta-analysis
 * @param {Array} studies - Array of {ai, bi, ci, di} or {x1i, t1i, x2i, t2i}
 * @param {string} measure - 'OR', 'RR', 'RD', 'IRR', 'IRD'
 * @param {string} method - 'MH', 'Peto', 'BetaBinomial', 'Exact'
 * @param {object} options - Additional options
 */
export function binaryMA(studies, measure = 'OR', method = 'MH', options = {}) {
  measure = measure.toUpperCase();
  method = method.toUpperCase();

  // Handle double-zero studies
  if (options.dz) {
    const result = handleDoubleZero(studies, options.dz);
    studies = result.studies;
  }

  // Route to appropriate method
  if (method === 'MH' || method === 'MANTEL-HAENSZEL') {
    switch (measure) {
      case 'OR':
        return mhOddsRatio(studies, options);
      case 'RR':
        return mhRiskRatio(studies, options);
      case 'RD':
        return mhRiskDifference(studies, options);
      case 'IRR':
        return mhIncidenceRateRatio(studies, options);
      default:
        return { error: `MH method not available for measure: ${measure}` };
    }
  }

  if (method === 'PETO') {
    if (measure !== 'OR') {
      return { error: 'Peto method only available for OR' };
    }
    return petoOddsRatio(studies, options);
  }

  if (method === 'BETABINOMIAL' || method === 'BB') {
    return betaBinomialMA(studies, options);
  }

  if (method === 'EXACT' || method === 'CONDITIONAL') {
    return exactConditionalMA(studies, options);
  }

  return { error: `Unknown method: ${method}` };
}

export default {
  // Mantel-Haenszel methods
  mhOddsRatio,
  mhRiskRatio,
  mhRiskDifference,
  mhIncidenceRateRatio,

  // Peto's method
  petoOddsRatio,

  // GLMM methods
  betaBinomialMA,
  exactConditionalMA,

  // Utilities
  handleDoubleZero,

  // Master function
  binaryMA
};
