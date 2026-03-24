/**
 * Dose-Response Meta-Analysis
 *
 * Implements:
 * - Linear dose-response
 * - Quadratic (restricted cubic splines)
 * - Fractional polynomials
 * - One-stage and two-stage approaches
 * - Covariance reconstruction
 */

// ============================================================================
// STATISTICAL UTILITIES
// ============================================================================

function qnorm(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const pLow = 0.02425, pHigh = 1 - pLow;
  let q;
  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  } else if (p <= pHigh) {
    q = p - 0.5;
    const r = q * q;
    return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  }
}

// Matrix utilities
function matrixMultiply(A, B) {
  const m = A.length;
  const n = B[0].length;
  const p = B.length;
  const C = Array(m).fill(null).map(() => Array(n).fill(0));
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      for (let k = 0; k < p; k++) {
        C[i][j] += A[i][k] * B[k][j];
      }
    }
  }
  return C;
}

function matrixTranspose(A) {
  const m = A.length;
  const n = A[0].length;
  const T = Array(n).fill(null).map(() => Array(m).fill(0));
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      T[j][i] = A[i][j];
    }
  }
  return T;
}

function matrixInverse(A) {
  const n = A.length;
  const augmented = A.map((row, i) =>
    [...row, ...Array(n).fill(0).map((_, j) => i === j ? 1 : 0)]
  );

  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) {
        maxRow = k;
      }
    }
    [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];

    if (Math.abs(augmented[i][i]) < 1e-10) return null;

    const scale = augmented[i][i];
    for (let j = 0; j < 2 * n; j++) {
      augmented[i][j] /= scale;
    }

    for (let k = 0; k < n; k++) {
      if (k !== i) {
        const factor = augmented[k][i];
        for (let j = 0; j < 2 * n; j++) {
          augmented[k][j] -= factor * augmented[i][j];
        }
      }
    }
  }

  return augmented.map(row => row.slice(n));
}

// ============================================================================
// COVARIANCE RECONSTRUCTION
// ============================================================================

/**
 * Reconstruct within-study covariance matrix
 * Based on Greenland & Longnecker (1992) and Orsini et al.
 *
 * For log RR from case-control or cohort data:
 * Cov(logRR_i, logRR_j) = 1/n_ref (approximately)
 */
export function reconstructCovariance(study, options = {}) {
  const { type = 'cases_noncases', referenceGroup = 0 } = options;

  const doses = study.doses;
  const n = doses.length;

  // Create covariance matrix
  const V = Array(n).fill(null).map(() => Array(n).fill(0));

  if (type === 'cases_noncases') {
    // Case-control or cohort with cases/non-cases at each dose level
    const cases = study.cases;
    const noncases = study.noncases;

    for (let i = 0; i < n; i++) {
      // Variance of log RR
      V[i][i] = 1 / cases[i] + 1 / noncases[i];

      // Add reference group contribution
      if (i !== referenceGroup) {
        V[i][i] += 1 / cases[referenceGroup] + 1 / noncases[referenceGroup];
      }

      // Covariance (due to common reference)
      for (let j = i + 1; j < n; j++) {
        if (i !== referenceGroup && j !== referenceGroup) {
          V[i][j] = 1 / cases[referenceGroup] + 1 / noncases[referenceGroup];
          V[j][i] = V[i][j];
        }
      }
    }
  } else if (type === 'person_years') {
    // Cohort with person-years
    const events = study.events;
    const personYears = study.personYears;

    for (let i = 0; i < n; i++) {
      // Variance of log IRR
      V[i][i] = 1 / events[i];

      if (i !== referenceGroup) {
        V[i][i] += 1 / events[referenceGroup];
      }

      for (let j = i + 1; j < n; j++) {
        if (i !== referenceGroup && j !== referenceGroup) {
          V[i][j] = 1 / events[referenceGroup];
          V[j][i] = V[i][j];
        }
      }
    }
  } else if (type === 'se_only') {
    // Only standard errors provided, assume independence
    const se = study.se || study.logRR.map(() => 0.1);
    for (let i = 0; i < n; i++) {
      V[i][i] = se[i] * se[i];
    }
  }

  return V;
}

// ============================================================================
// LINEAR DOSE-RESPONSE
// ============================================================================

/**
 * Linear dose-response meta-analysis (two-stage)
 */
export function linearDoseResponse(studies, options = {}) {
  const { referenceGroup = 0, method = 'REML' } = options;

  // Stage 1: Fit linear trend within each study
  const studyResults = [];

  studies.forEach((study, studyIdx) => {
    const doses = study.doses;
    const logRR = study.logRR || study.yi;
    const n = doses.length;

    // Skip if only one non-reference dose
    const nonRefDoses = doses.filter((d, i) => i !== referenceGroup);
    if (nonRefDoses.length < 1) return;

    // Reconstruct covariance
    const V = study.V || reconstructCovariance(study, { referenceGroup });

    // Remove reference group
    const dosesDiff = [];
    const logRRDiff = [];
    const VDiff = [];

    for (let i = 0; i < n; i++) {
      if (i !== referenceGroup) {
        dosesDiff.push(doses[i] - doses[referenceGroup]);
        logRRDiff.push(logRR[i] - (logRR[referenceGroup] || 0));
      }
    }

    // Extract relevant submatrix of V
    const indices = [];
    for (let i = 0; i < n; i++) {
      if (i !== referenceGroup) indices.push(i);
    }

    const nDiff = indices.length;
    for (let i = 0; i < nDiff; i++) {
      VDiff[i] = [];
      for (let j = 0; j < nDiff; j++) {
        VDiff[i][j] = V[indices[i]][indices[j]];
      }
    }

    // Weighted least squares: beta = (X'WX)^-1 X'Wy
    // where X is dose, W = V^-1, y is log RR

    const X = dosesDiff.map(d => [d]);  // n x 1 design matrix
    const Vinv = matrixInverse(VDiff);

    if (!Vinv) return;

    // X'WX (1x1 for linear)
    let XtWX = 0;
    let XtWy = 0;

    for (let i = 0; i < nDiff; i++) {
      for (let j = 0; j < nDiff; j++) {
        XtWX += dosesDiff[i] * Vinv[i][j] * dosesDiff[j];
        XtWy += dosesDiff[i] * Vinv[i][j] * logRRDiff[j];
      }
    }

    if (XtWX <= 0) return;

    const beta = XtWy / XtWX;
    const varBeta = 1 / XtWX;

    studyResults.push({
      studyId: study.id || studyIdx,
      beta,
      se: Math.sqrt(varBeta),
      vi: varBeta
    });
  });

  if (studyResults.length === 0) {
    return { error: 'No valid studies for dose-response analysis' };
  }

  // Stage 2: Pool study-specific slopes
  const k = studyResults.length;
  const yi = studyResults.map(s => s.beta);
  const vi = studyResults.map(s => s.vi);

  // Fixed effects
  const w = vi.map(v => 1 / v);
  const sumW = w.reduce((a, b) => a + b, 0);
  const betaFE = w.reduce((sum, ww, i) => sum + ww * yi[i], 0) / sumW;
  const seFE = Math.sqrt(1 / sumW);

  // Random effects (DL)
  const Q = w.reduce((sum, ww, i) => sum + ww * (yi[i] - betaFE) ** 2, 0);
  const C = sumW - w.reduce((sum, ww) => sum + ww * ww, 0) / sumW;
  const tau2 = Math.max(0, (Q - (k - 1)) / C);

  const w_re = vi.map(v => 1 / (v + tau2));
  const sumW_re = w_re.reduce((a, b) => a + b, 0);
  const betaRE = w_re.reduce((sum, ww, i) => sum + ww * yi[i], 0) / sumW_re;
  const seRE = Math.sqrt(1 / sumW_re);

  const I2 = Q > k - 1 ? (Q - (k - 1)) / Q * 100 : 0;

  // Calculate RR at specific doses
  function rrAtDose(dose) {
    const logRR = betaRE * dose;
    const seLogRR = seRE * dose;
    return {
      dose,
      rr: Math.exp(logRR),
      logRR,
      ci_lower: Math.exp(logRR - 1.96 * seLogRR),
      ci_upper: Math.exp(logRR + 1.96 * seLogRR)
    };
  }

  // Generate curve
  const allDoses = studies.flatMap(s => s.doses);
  const minDose = Math.min(...allDoses);
  const maxDose = Math.max(...allDoses);

  const curve = [];
  for (let d = minDose; d <= maxDose; d += (maxDose - minDose) / 50) {
    curve.push(rrAtDose(d));
  }

  return {
    // Pooled slope
    beta: betaRE,
    se: seRE,
    ci_lower: betaRE - 1.96 * seRE,
    ci_upper: betaRE + 1.96 * seRE,

    // Per unit increase in dose
    rrPerUnit: Math.exp(betaRE),
    rrPerUnit_ci_lower: Math.exp(betaRE - 1.96 * seRE),
    rrPerUnit_ci_upper: Math.exp(betaRE + 1.96 * seRE),

    // Heterogeneity
    tau2,
    tau: Math.sqrt(tau2),
    I2,
    Q,

    // Fixed effects for comparison
    betaFE,
    seFE,

    // Curve data
    curve,
    rrAtDose,

    // Study results
    studyResults,
    k,

    method: 'Linear',
    model: 'two-stage'
  };
}

// ============================================================================
// RESTRICTED CUBIC SPLINES
// ============================================================================

/**
 * Restricted cubic spline basis functions
 */
function rcsTransform(x, knots) {
  const k = knots.length;
  if (k < 3) return [x]; // Linear if < 3 knots

  const basis = [x]; // First basis is linear

  // Additional basis functions
  for (let j = 0; j < k - 2; j++) {
    const term = cubicTerm(x, knots[j], knots[k - 2], knots[k - 1]);
    basis.push(term);
  }

  return basis;
}

function cubicTerm(x, t_j, t_k1, t_k) {
  // (x - t_j)³₊ - (x - t_{k-1})³₊ * (t_k - t_j)/(t_k - t_{k-1})
  //   + (x - t_k)³₊ * (t_{k-1} - t_j)/(t_k - t_{k-1})

  const pos1 = Math.max(0, x - t_j) ** 3;
  const pos2 = Math.max(0, x - t_k1) ** 3;
  const pos3 = Math.max(0, x - t_k) ** 3;

  const factor1 = (t_k - t_j) / (t_k - t_k1);
  const factor2 = (t_k1 - t_j) / (t_k - t_k1);

  return pos1 - pos2 * factor1 + pos3 * factor2;
}

/**
 * Non-linear dose-response using restricted cubic splines
 */
export function splineDoseResponse(studies, options = {}) {
  const { nKnots = 3, referenceGroup = 0, percentiles = [10, 50, 90] } = options;

  // Collect all doses to determine knots
  const allDoses = studies.flatMap(s => s.doses);
  allDoses.sort((a, b) => a - b);

  // Determine knot positions at percentiles
  const knots = percentiles.map(p => {
    const idx = Math.floor(p / 100 * allDoses.length);
    return allDoses[Math.min(idx, allDoses.length - 1)];
  });

  // Stage 1: Fit spline within each study
  const studyResults = [];

  studies.forEach((study, studyIdx) => {
    const doses = study.doses;
    const logRR = study.logRR || study.yi;
    const n = doses.length;

    // Skip if insufficient data
    if (n < nKnots) return;

    // Reconstruct covariance
    const V = study.V || reconstructCovariance(study, { referenceGroup });

    // Create design matrix with spline terms
    const X = [];
    const indices = [];

    for (let i = 0; i < n; i++) {
      if (i !== referenceGroup) {
        const doseDiff = doses[i] - doses[referenceGroup];
        X.push(rcsTransform(doseDiff, knots));
        indices.push(i);
      }
    }

    if (X.length < 2) return;

    const nDiff = indices.length;
    const p = X[0].length; // Number of spline terms

    // Extract submatrix of V
    const VDiff = [];
    for (let i = 0; i < nDiff; i++) {
      VDiff[i] = [];
      for (let j = 0; j < nDiff; j++) {
        VDiff[i][j] = V[indices[i]][indices[j]];
      }
    }

    const Vinv = matrixInverse(VDiff);
    if (!Vinv) return;

    // WLS: beta = (X'WX)^-1 X'Wy
    const Xt = matrixTranspose(X);
    const XtW = matrixMultiply(Xt, Vinv);
    const XtWX = matrixMultiply(XtW, X);

    const XtWXinv = matrixInverse(XtWX);
    if (!XtWXinv) return;

    // Extract y vector
    const y = [];
    for (let i = 0; i < nDiff; i++) {
      y.push([logRR[indices[i]] - (logRR[referenceGroup] || 0)]);
    }

    const XtWy = matrixMultiply(XtW, y);
    const beta = matrixMultiply(XtWXinv, XtWy).map(row => row[0]);

    studyResults.push({
      studyId: study.id || studyIdx,
      beta,
      vcov: XtWXinv
    });
  });

  if (studyResults.length === 0) {
    return { error: 'No valid studies for spline dose-response' };
  }

  // Stage 2: Pool spline coefficients using multivariate meta-analysis
  // Simplified: pool each coefficient separately (assuming independence)

  const k = studyResults.length;
  const p = studyResults[0].beta.length;

  const pooledBeta = [];
  const pooledSE = [];

  for (let j = 0; j < p; j++) {
    const yi = studyResults.map(s => s.beta[j]);
    const vi = studyResults.map(s => s.vcov[j][j]);

    const w = vi.map(v => 1 / v);
    const sumW = w.reduce((a, b) => a + b, 0);
    const beta = w.reduce((sum, ww, i) => sum + ww * yi[i], 0) / sumW;

    // DL tau²
    const Q = w.reduce((sum, ww, i) => sum + ww * (yi[i] - beta) ** 2, 0);
    const C = sumW - w.reduce((sum, ww) => sum + ww * ww, 0) / sumW;
    const tau2 = Math.max(0, (Q - (k - 1)) / C);

    const w_re = vi.map(v => 1 / (v + tau2));
    const sumW_re = w_re.reduce((a, b) => a + b, 0);
    const betaRE = w_re.reduce((sum, ww, i) => sum + ww * yi[i], 0) / sumW_re;
    const seRE = Math.sqrt(1 / sumW_re);

    pooledBeta.push(betaRE);
    pooledSE.push(seRE);
  }

  // Generate curve
  const minDose = Math.min(...allDoses);
  const maxDose = Math.max(...allDoses);

  function rrAtDose(dose) {
    const splineTerms = rcsTransform(dose, knots);
    let logRR = 0;
    let varLogRR = 0;

    for (let j = 0; j < p; j++) {
      logRR += pooledBeta[j] * splineTerms[j];
      varLogRR += (pooledSE[j] * splineTerms[j]) ** 2;
    }

    const seLogRR = Math.sqrt(varLogRR);

    return {
      dose,
      rr: Math.exp(logRR),
      logRR,
      ci_lower: Math.exp(logRR - 1.96 * seLogRR),
      ci_upper: Math.exp(logRR + 1.96 * seLogRR)
    };
  }

  const curve = [];
  for (let d = minDose; d <= maxDose; d += (maxDose - minDose) / 50) {
    curve.push(rrAtDose(d));
  }

  // Test for non-linearity (Wald test on non-linear terms)
  let waldStat = 0;
  for (let j = 1; j < p; j++) {
    waldStat += (pooledBeta[j] / pooledSE[j]) ** 2;
  }
  const pNonLinear = 1 - pchisq(waldStat, p - 1);

  return {
    beta: pooledBeta,
    se: pooledSE,
    knots,

    // Non-linearity test
    waldStatNonLinear: waldStat,
    pNonLinear,
    isNonLinear: pNonLinear < 0.05,

    // Curve data
    curve,
    rrAtDose,

    k,
    method: 'Spline',
    model: 'two-stage'
  };
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
    d = bn + an * d; if (Math.abs(d) < 1e-30) d = 1e-30;
    c = bn + an / c; if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const delta = c * d; f *= delta;
    if (Math.abs(delta - 1) < 1e-10) break;
  }
  return Math.exp(-x + a * Math.log(x) - lgamma(a)) * f / a;
}

function lgamma(x) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x, tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += c[j] / ++y;
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

// ============================================================================
// FRACTIONAL POLYNOMIALS
// ============================================================================

/**
 * Fractional polynomial dose-response
 * Powers from {-2, -1, -0.5, 0, 0.5, 1, 2, 3}
 * Power 0 = log(x)
 */
export function fractionalPolynomialDR(studies, options = {}) {
  const { degree = 2, referenceGroup = 0 } = options;

  // Standard FP powers
  const powers = [-2, -1, -0.5, 0, 0.5, 1, 2, 3];

  // Collect all doses
  const allDoses = studies.flatMap(s => s.doses);
  const minDose = Math.min(...allDoses.filter(d => d > 0));
  const maxDose = Math.max(...allDoses);

  // Try all power combinations (for degree 2)
  let bestModel = null;
  let bestDeviance = Infinity;

  if (degree === 1) {
    // Single power
    for (const p of powers) {
      const result = fitFP(studies, [p], referenceGroup);
      if (result && result.deviance < bestDeviance) {
        bestDeviance = result.deviance;
        bestModel = result;
      }
    }
  } else {
    // Two powers (can be same = repeated power)
    for (const p1 of powers) {
      for (const p2 of powers) {
        const result = fitFP(studies, [p1, p2], referenceGroup);
        if (result && result.deviance < bestDeviance) {
          bestDeviance = result.deviance;
          bestModel = result;
        }
      }
    }
  }

  if (!bestModel) {
    return { error: 'Failed to fit fractional polynomial model' };
  }

  // Generate curve
  function rrAtDose(dose) {
    if (dose <= 0) dose = minDose / 10;

    const terms = fpTransform(dose, bestModel.powers);
    let logRR = 0;
    let varLogRR = 0;

    for (let j = 0; j < terms.length; j++) {
      logRR += bestModel.beta[j] * terms[j];
      varLogRR += (bestModel.se[j] * terms[j]) ** 2;
    }

    const seLogRR = Math.sqrt(varLogRR);

    return {
      dose,
      rr: Math.exp(logRR),
      logRR,
      ci_lower: Math.exp(logRR - 1.96 * seLogRR),
      ci_upper: Math.exp(logRR + 1.96 * seLogRR)
    };
  }

  const curve = [];
  for (let d = minDose; d <= maxDose; d += (maxDose - minDose) / 50) {
    curve.push(rrAtDose(d));
  }

  return {
    powers: bestModel.powers,
    beta: bestModel.beta,
    se: bestModel.se,
    deviance: bestModel.deviance,

    curve,
    rrAtDose,

    k: studies.length,
    method: 'FractionalPolynomial',
    degree
  };
}

function fpTransform(x, powers) {
  const terms = [];
  let prevPower = null;

  for (const p of powers) {
    if (p === prevPower) {
      // Repeated power: multiply by log(x)
      if (p === 0) {
        terms.push(Math.log(x) * Math.log(x));
      } else {
        terms.push(Math.pow(x, p) * Math.log(x));
      }
    } else {
      if (p === 0) {
        terms.push(Math.log(x));
      } else {
        terms.push(Math.pow(x, p));
      }
    }
    prevPower = p;
  }

  return terms;
}

function fitFP(studies, powers, referenceGroup) {
  // Similar to spline fitting but with FP terms
  const studyResults = [];

  studies.forEach((study, studyIdx) => {
    const doses = study.doses;
    const logRR = study.logRR || study.yi;
    const n = doses.length;

    if (n < powers.length + 1) return;

    const V = study.V || reconstructCovariance(study, { referenceGroup });

    const X = [];
    const indices = [];

    for (let i = 0; i < n; i++) {
      if (i !== referenceGroup && doses[i] > 0) {
        X.push(fpTransform(doses[i], powers));
        indices.push(i);
      }
    }

    if (X.length < 2) return;

    const nDiff = indices.length;
    const p = X[0].length;

    const VDiff = [];
    for (let i = 0; i < nDiff; i++) {
      VDiff[i] = [];
      for (let j = 0; j < nDiff; j++) {
        VDiff[i][j] = V[indices[i]][indices[j]];
      }
    }

    const Vinv = matrixInverse(VDiff);
    if (!Vinv) return;

    const Xt = matrixTranspose(X);
    const XtW = matrixMultiply(Xt, Vinv);
    const XtWX = matrixMultiply(XtW, X);
    const XtWXinv = matrixInverse(XtWX);
    if (!XtWXinv) return;

    const y = [];
    for (let i = 0; i < nDiff; i++) {
      y.push([logRR[indices[i]] - (logRR[referenceGroup] || 0)]);
    }

    const XtWy = matrixMultiply(XtW, y);
    const beta = matrixMultiply(XtWXinv, XtWy).map(row => row[0]);

    // Deviance
    const fitted = X.map(row => row.reduce((sum, x, j) => sum + x * beta[j], 0));
    const residuals = y.map((yi, i) => yi[0] - fitted[i]);

    let deviance = 0;
    for (let i = 0; i < nDiff; i++) {
      for (let j = 0; j < nDiff; j++) {
        deviance += residuals[i] * Vinv[i][j] * residuals[j];
      }
    }

    studyResults.push({ beta, vcov: XtWXinv, deviance });
  });

  if (studyResults.length === 0) return null;

  // Pool coefficients
  const k = studyResults.length;
  const p = studyResults[0].beta.length;
  const pooledBeta = [];
  const pooledSE = [];
  let totalDeviance = 0;

  for (let j = 0; j < p; j++) {
    const yi = studyResults.map(s => s.beta[j]);
    const vi = studyResults.map(s => s.vcov[j][j]);

    const w = vi.map(v => 1 / v);
    const sumW = w.reduce((a, b) => a + b, 0);
    const beta = w.reduce((sum, ww, i) => sum + ww * yi[i], 0) / sumW;
    const se = Math.sqrt(1 / sumW);

    pooledBeta.push(beta);
    pooledSE.push(se);
  }

  studyResults.forEach(s => { totalDeviance += s.deviance; });

  return {
    powers,
    beta: pooledBeta,
    se: pooledSE,
    deviance: totalDeviance
  };
}

// ============================================================================
// ONE-STAGE MODEL
// ============================================================================

/**
 * One-stage dose-response (simplified mixed-effects)
 * Pools all data and fits a single model with random study effects
 */
export function oneStageLinearDR(studies, options = {}) {
  const { referenceGroup = 0 } = options;

  // Flatten all data
  const allData = [];

  studies.forEach((study, studyIdx) => {
    const doses = study.doses;
    const logRR = study.logRR || study.yi;
    const n = doses.length;

    const V = study.V || reconstructCovariance(study, { referenceGroup });

    for (let i = 0; i < n; i++) {
      if (i !== referenceGroup) {
        allData.push({
          studyId: studyIdx,
          dose: doses[i] - doses[referenceGroup],
          logRR: logRR[i] - (logRR[referenceGroup] || 0),
          vi: V[i][i]
        });
      }
    }
  });

  if (allData.length < 3) {
    return { error: 'Insufficient data for one-stage model' };
  }

  // Simple random-intercept model
  // logRR = beta * dose + u_study + epsilon

  const nObs = allData.length;
  const nStudies = new Set(allData.map(d => d.studyId)).size;

  // Initial fit (fixed effects only)
  let sumWD2 = 0, sumWDY = 0;
  allData.forEach(d => {
    const w = 1 / d.vi;
    sumWD2 += w * d.dose * d.dose;
    sumWDY += w * d.dose * d.logRR;
  });

  const betaInit = sumWDY / sumWD2;

  // Estimate between-study variance
  const residuals = allData.map(d => d.logRR - betaInit * d.dose);

  // Group by study
  const studyResiduals = {};
  allData.forEach((d, i) => {
    if (!studyResiduals[d.studyId]) studyResiduals[d.studyId] = [];
    studyResiduals[d.studyId].push({ resid: residuals[i], vi: d.vi });
  });

  // Estimate tau² from study means
  const studyMeans = [];
  Object.values(studyResiduals).forEach(resids => {
    const w = resids.map(r => 1 / r.vi);
    const sumW = w.reduce((a, b) => a + b, 0);
    const mean = resids.reduce((sum, r, i) => sum + w[i] * r.resid, 0) / sumW;
    const vi = 1 / sumW;
    studyMeans.push({ mean, vi });
  });

  const grandMean = studyMeans.reduce((sum, s) => sum + s.mean, 0) / studyMeans.length;
  const BSS = studyMeans.reduce((sum, s) => sum + (s.mean - grandMean) ** 2, 0);
  const avgVi = studyMeans.reduce((sum, s) => sum + s.vi, 0) / studyMeans.length;
  const tau2 = Math.max(0, BSS / (nStudies - 1) - avgVi);

  // Refit with random effects
  let sumWD2_re = 0, sumWDY_re = 0;
  allData.forEach(d => {
    const w = 1 / (d.vi + tau2);
    sumWD2_re += w * d.dose * d.dose;
    sumWDY_re += w * d.dose * d.logRR;
  });

  const beta = sumWDY_re / sumWD2_re;
  const varBeta = 1 / sumWD2_re;
  const se = Math.sqrt(varBeta);

  return {
    beta,
    se,
    ci_lower: beta - 1.96 * se,
    ci_upper: beta + 1.96 * se,

    rrPerUnit: Math.exp(beta),
    rrPerUnit_ci_lower: Math.exp(beta - 1.96 * se),
    rrPerUnit_ci_upper: Math.exp(beta + 1.96 * se),

    tau2,
    tau: Math.sqrt(tau2),

    nObs,
    nStudies,
    method: 'Linear',
    model: 'one-stage'
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Covariance reconstruction
  reconstructCovariance,

  // Two-stage models
  linearDoseResponse,
  splineDoseResponse,
  fractionalPolynomialDR,

  // One-stage model
  oneStageLinearDR,

  // Utilities
  rcsTransform,
  fpTransform
};
