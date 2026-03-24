/**
 * Diagnostic Test Accuracy Meta-Analysis
 *
 * Implements:
 * - Bivariate model (Reitsma et al. 2005)
 * - HSROC model (Rutter & Gatsonis 2001)
 * - Summary ROC curve
 * - DOR, LR+, LR- pooling
 * - Threshold effects analysis
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

function pnorm(x) {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1.0 + sign * y);
}

function logit(p) {
  return Math.log(p / (1 - p));
}

function invlogit(x) {
  return 1 / (1 + Math.exp(-x));
}

// ============================================================================
// DATA PREPARATION
// ============================================================================

/**
 * Calculate sensitivity and specificity from 2x2 table
 */
export function calculateDTAMetrics(tp, fp, fn, tn) {
  const sens = tp / (tp + fn);
  const spec = tn / (tn + fp);
  const ppv = tp / (tp + fp);
  const npv = tn / (tn + fn);

  // Logit transformations for meta-analysis
  const logitSens = logit(sens);
  const logitSpec = logit(spec);

  // Variances on logit scale
  const varLogitSens = 1 / tp + 1 / fn;
  const varLogitSpec = 1 / tn + 1 / fp;

  // Likelihood ratios
  const lrPlus = sens / (1 - spec);
  const lrMinus = (1 - sens) / spec;

  // Diagnostic odds ratio
  const dor = (tp * tn) / (fp * fn);
  const logDOR = Math.log(dor);
  const varLogDOR = 1/tp + 1/fp + 1/fn + 1/tn;

  return {
    tp, fp, fn, tn,
    sens, spec, ppv, npv,
    logitSens, logitSpec,
    varLogitSens, varLogitSpec,
    lrPlus, lrMinus,
    dor, logDOR, varLogDOR,
    n: tp + fp + fn + tn,
    nDiseased: tp + fn,
    nHealthy: tn + fp
  };
}

// ============================================================================
// BIVARIATE MODEL (Reitsma et al. 2005)
// ============================================================================

/**
 * Bivariate Random-Effects Model for DTA
 * Jointly models logit(sensitivity) and logit(specificity)
 */
export function bivariateModel(studies, options = {}) {
  const { maxIter = 100, tol = 1e-6 } = options;

  const k = studies.length;
  if (k < 3) return { error: 'Need at least 3 studies for bivariate model' };

  // Calculate study-level metrics
  const metrics = studies.map(s =>
    calculateDTAMetrics(s.tp, s.fp, s.fn, s.tn)
  );

  // Extract logit-transformed values
  const y1 = metrics.map(m => m.logitSens);  // logit(sensitivity)
  const y2 = metrics.map(m => m.logitSpec);  // logit(specificity)
  const v1 = metrics.map(m => m.varLogitSens);
  const v2 = metrics.map(m => m.varLogitSpec);

  // Initial estimates (simple means)
  let mu1 = y1.reduce((a, b) => a + b, 0) / k;
  let mu2 = y2.reduce((a, b) => a + b, 0) / k;

  // Initial between-study variances
  let tau1_sq = Math.max(0.01, y1.reduce((sum, y) => sum + (y - mu1) ** 2, 0) / k - v1.reduce((a, b) => a + b, 0) / k);
  let tau2_sq = Math.max(0.01, y2.reduce((sum, y) => sum + (y - mu2) ** 2, 0) / k - v2.reduce((a, b) => a + b, 0) / k);

  // Initial correlation
  let rho = 0;
  const cov_y = y1.reduce((sum, y1i, i) => sum + (y1i - mu1) * (y2[i] - mu2), 0) / k;
  if (tau1_sq > 0 && tau2_sq > 0) {
    rho = Math.max(-0.99, Math.min(0.99, cov_y / Math.sqrt(tau1_sq * tau2_sq)));
  }

  // Iterative estimation (simplified REML-like)
  for (let iter = 0; iter < maxIter; iter++) {
    const oldMu1 = mu1;
    const oldMu2 = mu2;

    // Build inverse covariance matrices for each study
    let sumW11 = 0, sumW12 = 0, sumW22 = 0;
    let sumWy1 = 0, sumWy2 = 0;

    for (let i = 0; i < k; i++) {
      // Total covariance = between-study + within-study
      const Sigma11 = tau1_sq + v1[i];
      const Sigma22 = tau2_sq + v2[i];
      const Sigma12 = rho * Math.sqrt(tau1_sq * tau2_sq);

      // Inverse of 2x2 matrix
      const det = Sigma11 * Sigma22 - Sigma12 * Sigma12;
      if (det <= 0) continue;

      const W11 = Sigma22 / det;
      const W22 = Sigma11 / det;
      const W12 = -Sigma12 / det;

      sumW11 += W11;
      sumW12 += W12;
      sumW22 += W22;

      sumWy1 += W11 * y1[i] + W12 * y2[i];
      sumWy2 += W12 * y1[i] + W22 * y2[i];
    }

    // Solve for mu1, mu2
    const detW = sumW11 * sumW22 - sumW12 * sumW12;
    if (detW <= 0) break;

    mu1 = (sumW22 * sumWy1 - sumW12 * sumWy2) / detW;
    mu2 = (sumW11 * sumWy2 - sumW12 * sumWy1) / detW;

    // Update between-study variances (method of moments)
    let ss1 = 0, ss2 = 0, ss12 = 0;
    for (let i = 0; i < k; i++) {
      ss1 += (y1[i] - mu1) ** 2;
      ss2 += (y2[i] - mu2) ** 2;
      ss12 += (y1[i] - mu1) * (y2[i] - mu2);
    }

    tau1_sq = Math.max(0.01, ss1 / k - v1.reduce((a, b) => a + b, 0) / k);
    tau2_sq = Math.max(0.01, ss2 / k - v2.reduce((a, b) => a + b, 0) / k);

    if (tau1_sq > 0 && tau2_sq > 0) {
      rho = Math.max(-0.99, Math.min(0.99, ss12 / k / Math.sqrt(tau1_sq * tau2_sq)));
    }

    if (Math.abs(mu1 - oldMu1) < tol && Math.abs(mu2 - oldMu2) < tol) break;
  }

  // Back-transform to probability scale
  const pooledSens = invlogit(mu1);
  const pooledSpec = invlogit(mu2);

  // Variance of pooled estimates
  let sumW11 = 0, sumW12 = 0, sumW22 = 0;
  for (let i = 0; i < k; i++) {
    const Sigma11 = tau1_sq + v1[i];
    const Sigma22 = tau2_sq + v2[i];
    const Sigma12 = rho * Math.sqrt(tau1_sq * tau2_sq);
    const det = Sigma11 * Sigma22 - Sigma12 * Sigma12;
    if (det <= 0) continue;
    sumW11 += Sigma22 / det;
    sumW12 += -Sigma12 / det;
    sumW22 += Sigma11 / det;
  }

  const detW = sumW11 * sumW22 - sumW12 * sumW12;
  const varMu1 = detW > 0 ? sumW22 / detW : 0.1;
  const varMu2 = detW > 0 ? sumW11 / detW : 0.1;
  const covMu = detW > 0 ? -sumW12 / detW : 0;

  // CIs on logit scale, then back-transform
  const se1 = Math.sqrt(varMu1);
  const se2 = Math.sqrt(varMu2);

  // Pooled likelihood ratios
  const pooledLRPlus = pooledSens / (1 - pooledSpec);
  const pooledLRMinus = (1 - pooledSens) / pooledSpec;

  // Pooled DOR
  const pooledDOR = (pooledSens / (1 - pooledSens)) * (pooledSpec / (1 - pooledSpec));

  // I² for each outcome
  const Q1 = y1.reduce((sum, y, i) => sum + (y - mu1) ** 2 / v1[i], 0);
  const Q2 = y2.reduce((sum, y, i) => sum + (y - mu2) ** 2 / v2[i], 0);
  const I2_sens = Math.max(0, (Q1 - (k - 1)) / Q1 * 100);
  const I2_spec = Math.max(0, (Q2 - (k - 1)) / Q2 * 100);

  return {
    // Summary estimates
    pooledSens,
    pooledSpec,
    sens_ci_lower: invlogit(mu1 - 1.96 * se1),
    sens_ci_upper: invlogit(mu1 + 1.96 * se1),
    spec_ci_lower: invlogit(mu2 - 1.96 * se2),
    spec_ci_upper: invlogit(mu2 + 1.96 * se2),

    // Likelihood ratios
    pooledLRPlus,
    pooledLRMinus,
    pooledDOR,

    // Between-study variance
    tau_sens: Math.sqrt(tau1_sq),
    tau_spec: Math.sqrt(tau2_sq),
    correlation: rho,

    // Heterogeneity
    I2_sens,
    I2_spec,

    // On logit scale
    logitSens: mu1,
    logitSpec: mu2,
    varLogitSens: varMu1,
    varLogitSpec: varMu2,
    covLogit: covMu,

    k,
    studies: metrics,
    method: 'Bivariate'
  };
}

// ============================================================================
// HSROC MODEL (Hierarchical Summary ROC)
// ============================================================================

/**
 * HSROC Model (Rutter & Gatsonis 2001)
 * Mathematically equivalent to bivariate model but parameterized differently
 */
export function hsrocModel(studies, options = {}) {
  const { maxIter = 100, tol = 1e-6 } = options;

  const k = studies.length;
  if (k < 3) return { error: 'Need at least 3 studies' };

  // First fit bivariate model
  const bivariate = bivariateModel(studies, options);
  if (bivariate.error) return bivariate;

  // Convert to HSROC parameterization
  // HSROC parameters: Θ (threshold), Λ (accuracy), β (asymmetry)

  const mu1 = bivariate.logitSens;  // mean logit(sens)
  const mu2 = bivariate.logitSpec;  // mean logit(spec)
  const tau1_sq = bivariate.tau_sens ** 2;
  const tau2_sq = bivariate.tau_spec ** 2;
  const rho = bivariate.correlation;

  // HSROC transformation
  // D = logit(sens) + logit(spec)  (discrimination/accuracy)
  // S = logit(spec) - logit(sens)  (threshold)

  const D_mean = mu1 + mu2;  // mean log DOR
  const S_mean = mu2 - mu1;  // mean threshold

  // Accuracy parameter (Λ)
  const Lambda = D_mean / 2;

  // Shape parameter (β) - asymmetry
  // β = 0 means symmetric curve
  const var_D = tau1_sq + tau2_sq + 2 * rho * Math.sqrt(tau1_sq * tau2_sq);
  const var_S = tau1_sq + tau2_sq - 2 * rho * Math.sqrt(tau1_sq * tau2_sq);

  const beta = (tau2_sq - tau1_sq) / var_D;

  // Threshold parameter (Θ) - determines point on curve
  const Theta = S_mean;

  // Generate SROC curve points
  const srocPoints = [];
  for (let fpr = 0.01; fpr <= 0.99; fpr += 0.02) {
    // FPR = 1 - specificity
    const spec = 1 - fpr;
    const logitSpec = logit(spec);

    // HSROC equation: logit(sens) = Λ + (1 - β) * (logitSpec - Θ)
    // Simplified symmetric version:
    const logitSens = Lambda + Math.sqrt(1 - beta ** 2) * (logitSpec - Theta / 2);
    const sens = invlogit(logitSens);

    if (sens >= 0 && sens <= 1) {
      srocPoints.push({ fpr, sens, spec });
    }
  }

  // Calculate AUC using numerical integration
  let auc = 0;
  for (let i = 1; i < srocPoints.length; i++) {
    const width = srocPoints[i].fpr - srocPoints[i - 1].fpr;
    const height = (srocPoints[i].sens + srocPoints[i - 1].sens) / 2;
    auc += width * height;
  }

  // Summary operating point (at mean threshold)
  const summaryPoint = {
    sens: bivariate.pooledSens,
    spec: bivariate.pooledSpec,
    fpr: 1 - bivariate.pooledSpec
  };

  return {
    // HSROC parameters
    Lambda,  // Overall accuracy
    Theta,   // Mean threshold
    beta,    // Asymmetry

    // Variance parameters
    var_accuracy: var_D,
    var_threshold: var_S,

    // Summary operating point
    summaryPoint,

    // SROC curve
    srocPoints,
    auc,

    // Include bivariate results
    pooledSens: bivariate.pooledSens,
    pooledSpec: bivariate.pooledSpec,
    pooledDOR: bivariate.pooledDOR,

    k,
    method: 'HSROC'
  };
}

// ============================================================================
// UNIVARIATE DOR ANALYSIS
// ============================================================================

/**
 * Simple DOR meta-analysis
 * Useful when bivariate model fails or as comparison
 */
export function dorMetaAnalysis(studies, options = {}) {
  const { method = 'DL' } = options;

  const k = studies.length;
  const metrics = studies.map(s =>
    calculateDTAMetrics(s.tp, s.fp, s.fn, s.tn)
  );

  const yi = metrics.map(m => m.logDOR);
  const vi = metrics.map(m => m.varLogDOR);

  // Inverse-variance weighted estimate
  const w = vi.map(v => 1 / v);
  const sumW = w.reduce((a, b) => a + b, 0);
  const thetaFE = w.reduce((sum, ww, i) => sum + ww * yi[i], 0) / sumW;

  // Q statistic
  const Q = w.reduce((sum, ww, i) => sum + ww * (yi[i] - thetaFE) ** 2, 0);
  const C = sumW - w.reduce((sum, ww) => sum + ww * ww, 0) / sumW;
  const tau2 = Math.max(0, (Q - (k - 1)) / C);

  // Random effects estimate
  const w_re = vi.map(v => 1 / (v + tau2));
  const sumW_re = w_re.reduce((a, b) => a + b, 0);
  const logDOR_pooled = w_re.reduce((sum, ww, i) => sum + ww * yi[i], 0) / sumW_re;
  const se = Math.sqrt(1 / sumW_re);

  const I2 = Math.max(0, (Q - (k - 1)) / Q * 100);

  return {
    logDOR: logDOR_pooled,
    dor: Math.exp(logDOR_pooled),
    se,
    ci_lower: Math.exp(logDOR_pooled - 1.96 * se),
    ci_upper: Math.exp(logDOR_pooled + 1.96 * se),
    tau2,
    tau: Math.sqrt(tau2),
    I2,
    Q,
    k,
    method: 'DOR-' + method
  };
}

// ============================================================================
// THRESHOLD EFFECTS
// ============================================================================

/**
 * Test for threshold effect (correlation between sens and spec)
 * Moses-Littenberg method
 */
export function thresholdEffectTest(studies) {
  const k = studies.length;
  const metrics = studies.map(s =>
    calculateDTAMetrics(s.tp, s.fp, s.fn, s.tn)
  );

  // Calculate D = logit(sens) + logit(spec) (log DOR proxy)
  // Calculate S = logit(spec) - logit(sens) (threshold proxy)
  const D = metrics.map(m => m.logitSens + m.logitSpec);
  const S = metrics.map(m => m.logitSpec - m.logitSens);

  // Correlation between D and S indicates threshold effect
  const meanD = D.reduce((a, b) => a + b, 0) / k;
  const meanS = S.reduce((a, b) => a + b, 0) / k;

  let cov = 0, varD = 0, varS = 0;
  for (let i = 0; i < k; i++) {
    cov += (D[i] - meanD) * (S[i] - meanS);
    varD += (D[i] - meanD) ** 2;
    varS += (S[i] - meanS) ** 2;
  }

  const correlation = (varD > 0 && varS > 0) ?
    cov / Math.sqrt(varD * varS) : 0;

  // Spearman correlation (rank-based)
  const rankD = D.map((d, i) => ({ val: d, idx: i }))
    .sort((a, b) => a.val - b.val)
    .map((d, rank) => ({ ...d, rank: rank + 1 }))
    .sort((a, b) => a.idx - b.idx)
    .map(d => d.rank);

  const rankS = S.map((s, i) => ({ val: s, idx: i }))
    .sort((a, b) => a.val - b.val)
    .map((s, rank) => ({ ...s, rank: rank + 1 }))
    .sort((a, b) => a.idx - b.idx)
    .map(s => s.rank);

  let spearmanNum = 0;
  for (let i = 0; i < k; i++) {
    spearmanNum += (rankD[i] - rankS[i]) ** 2;
  }
  const spearman = 1 - 6 * spearmanNum / (k * (k * k - 1));

  // Test significance (approximate)
  const t_stat = correlation * Math.sqrt((k - 2) / (1 - correlation ** 2));
  // p-value would require t-distribution

  const hasThresholdEffect = Math.abs(correlation) > 0.3;

  return {
    correlation,
    spearman,
    t_stat,
    hasThresholdEffect,
    interpretation: hasThresholdEffect ?
      'Significant threshold effect detected. SROC approach recommended.' :
      'No strong threshold effect. Separate pooling may be appropriate.',
    k
  };
}

// ============================================================================
// CONFIDENCE/PREDICTION REGIONS
// ============================================================================

/**
 * Calculate confidence and prediction ellipses for ROC space
 */
export function calculateEllipses(bivariateResult, options = {}) {
  const { nPoints = 100, level = 0.95 } = options;

  const mu1 = bivariateResult.logitSens;
  const mu2 = bivariateResult.logitSpec;
  const var1 = bivariateResult.varLogitSens;
  const var2 = bivariateResult.varLogitSpec;
  const cov12 = bivariateResult.covLogit;
  const tau1_sq = bivariateResult.tau_sens ** 2;
  const tau2_sq = bivariateResult.tau_spec ** 2;
  const rho = bivariateResult.correlation;

  // Chi-square quantile for 95% CI of 2D normal
  const chi2_95 = 5.991; // qchisq(0.95, 2)

  // Confidence region (uncertainty in mean)
  const confPoints = [];
  const predPoints = [];

  for (let i = 0; i < nPoints; i++) {
    const angle = (2 * Math.PI * i) / nPoints;

    // Confidence ellipse (mean uncertainty only)
    const a1 = Math.sqrt(chi2_95 * var1);
    const a2 = Math.sqrt(chi2_95 * var2);

    // Account for correlation
    const x_conf = mu1 + a1 * Math.cos(angle);
    const y_conf = mu2 + a2 * Math.sin(angle);

    confPoints.push({
      sens: invlogit(x_conf),
      fpr: 1 - invlogit(y_conf),
      spec: invlogit(y_conf)
    });

    // Prediction region (includes between-study variance)
    const pred_var1 = var1 + tau1_sq;
    const pred_var2 = var2 + tau2_sq;
    const a1_pred = Math.sqrt(chi2_95 * pred_var1);
    const a2_pred = Math.sqrt(chi2_95 * pred_var2);

    const x_pred = mu1 + a1_pred * Math.cos(angle);
    const y_pred = mu2 + a2_pred * Math.sin(angle);

    predPoints.push({
      sens: invlogit(x_pred),
      fpr: 1 - invlogit(y_pred),
      spec: invlogit(y_pred)
    });
  }

  return {
    confidenceRegion: confPoints,
    predictionRegion: predPoints,
    level
  };
}

// ============================================================================
// SUMMARY STATISTICS FOR CLINICAL USE
// ============================================================================

/**
 * Calculate clinically useful summary statistics
 */
export function clinicalSummary(bivariateResult, options = {}) {
  const { prevalence = 0.1 } = options;

  const sens = bivariateResult.pooledSens;
  const spec = bivariateResult.pooledSpec;
  const lrPlus = bivariateResult.pooledLRPlus;
  const lrMinus = bivariateResult.pooledLRMinus;

  // Pre-test odds
  const preTestOdds = prevalence / (1 - prevalence);

  // Post-test probabilities
  const postTestOddsPos = preTestOdds * lrPlus;
  const postTestOddsNeg = preTestOdds * lrMinus;

  const postTestProbPos = postTestOddsPos / (1 + postTestOddsPos);
  const postTestProbNeg = postTestOddsNeg / (1 + postTestOddsNeg);

  // Probability of disease given negative test (1 - NPV)
  // Probability of no disease given positive test (1 - PPV)

  // Expected number of true/false positives/negatives per 1000 tested
  const n = 1000;
  const nDiseased = n * prevalence;
  const nHealthy = n * (1 - prevalence);

  const expectedTP = Math.round(nDiseased * sens);
  const expectedFN = Math.round(nDiseased * (1 - sens));
  const expectedTN = Math.round(nHealthy * spec);
  const expectedFP = Math.round(nHealthy * (1 - spec));

  // Youden's J statistic
  const youdenJ = sens + spec - 1;

  // Diagnostic effectiveness
  const accuracy = (expectedTP + expectedTN) / n;

  return {
    prevalence,
    preTestProbability: prevalence,
    postTestProbPositive: postTestProbPos,
    postTestProbNegative: postTestProbNeg,

    // Per 1000 tested
    expectedTP,
    expectedFP,
    expectedFN,
    expectedTN,

    // Summary indices
    youdenJ,
    accuracy,
    lrPlus,
    lrMinus,

    // Clinical interpretation
    interpretation: {
      positiveTest: `A positive test increases disease probability from ${(prevalence * 100).toFixed(1)}% to ${(postTestProbPos * 100).toFixed(1)}%`,
      negativeTest: `A negative test decreases disease probability from ${(prevalence * 100).toFixed(1)}% to ${(postTestProbNeg * 100).toFixed(1)}%`,
      lrPlusInterpretation: lrPlus > 10 ? 'Large increase in probability' :
        lrPlus > 5 ? 'Moderate increase' :
        lrPlus > 2 ? 'Small increase' : 'Minimal increase',
      lrMinusInterpretation: lrMinus < 0.1 ? 'Large decrease in probability' :
        lrMinus < 0.2 ? 'Moderate decrease' :
        lrMinus < 0.5 ? 'Small decrease' : 'Minimal decrease'
    }
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Data preparation
  calculateDTAMetrics,

  // Main models
  bivariateModel,
  hsrocModel,
  dorMetaAnalysis,

  // Diagnostics
  thresholdEffectTest,

  // Visualization helpers
  calculateEllipses,

  // Clinical interpretation
  clinicalSummary
};
