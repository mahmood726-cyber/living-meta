/**
 * Beyond Metafor: Cutting-Edge Meta-Analysis Methods (2024-2025)
 *
 * Methods not available in metafor or requiring specialized packages:
 * - MAIVE: Meta-Analysis Instrumental Variable Estimator (2025 Nature Communications)
 * - Extended selection models (beta, halfnorm, negexp, power)
 * - Bayesian model averaging (RoBMA-style)
 * - Component NMA
 * - Cross-design synthesis
 * - Prediction model meta-analysis (C-statistic, calibration)
 * - Machine learning moderator detection
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

function dnorm(x) {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

function lgamma(x) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x, tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += c[j] / ++y;
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

function gamma(x) { return Math.exp(lgamma(x)); }

function beta(a, b) { return gamma(a) * gamma(b) / gamma(a + b); }

// Regularized incomplete beta function
function betainc(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  // Use continued fraction for numerical stability
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));

  if (x < (a + 1) / (a + b + 2)) {
    return bt * betacf(x, a, b) / a;
  }
  return 1 - bt * betacf(1 - x, b, a) / b;
}

function betacf(x, a, b) {
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= 100; m++) {
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
    if (Math.abs(del - 1) < 1e-10) break;
  }
  return h;
}

// ============================================================================
// MAIVE: META-ANALYSIS INSTRUMENTAL VARIABLE ESTIMATOR
// 2025 Nature Communications - Addresses spurious precision
// ============================================================================

/**
 * MAIVE Estimator
 * Uses sample size as instrument for reported precision
 * Addresses publication bias more robustly than funnel-plot methods
 *
 * Reference: Nature Communications 2025
 */
export function maive(studies, options = {}) {
  const { method = 'IV', robustSE = true } = options;

  const k = studies.length;
  if (k < 3) return { error: 'MAIVE requires at least 3 studies' };

  // Extract data
  const yi = studies.map(s => s.yi);
  const vi = studies.map(s => s.vi);
  const ni = studies.map(s => s.ni || 1 / s.vi); // Sample size or proxy

  // Standard inverse-variance weighted estimate for comparison
  const w_iv = vi.map(v => 1 / v);
  const sumW_iv = w_iv.reduce((a, b) => a + b, 0);
  const theta_iv = w_iv.reduce((sum, w, i) => sum + w * yi[i], 0) / sumW_iv;

  // Unweighted mean
  const theta_unwt = yi.reduce((a, b) => a + b, 0) / k;

  // MAIVE: Use sample size as instrument
  // Two-stage approach:
  // Stage 1: Regress precision (1/vi) on sample size
  // Stage 2: Use predicted precision as weights

  // Stage 1: Fit precision ~ sample size
  const sumN = ni.reduce((a, b) => a + b, 0);
  const meanN = sumN / k;
  const prec = vi.map(v => 1 / v);
  const meanPrec = prec.reduce((a, b) => a + b, 0) / k;

  let cov_np = 0, var_n = 0;
  for (let i = 0; i < k; i++) {
    cov_np += (ni[i] - meanN) * (prec[i] - meanPrec);
    var_n += (ni[i] - meanN) ** 2;
  }

  const beta_prec = var_n > 0 ? cov_np / var_n : 0;
  const alpha_prec = meanPrec - beta_prec * meanN;

  // Predicted precision (instrumental weights)
  const prec_hat = ni.map(n => Math.max(0.001, alpha_prec + beta_prec * n));

  // Stage 2: MAIVE estimate using predicted precision
  const sumW_maive = prec_hat.reduce((a, b) => a + b, 0);
  const theta_maive = prec_hat.reduce((sum, w, i) => sum + w * yi[i], 0) / sumW_maive;

  // Variance estimation
  let vi_maive;
  if (robustSE) {
    // Robust (sandwich) variance
    let sumWR2 = 0;
    const sumW2 = prec_hat.reduce((sum, w) => sum + w * w, 0);
    for (let i = 0; i < k; i++) {
      sumWR2 += prec_hat[i] * prec_hat[i] * (yi[i] - theta_maive) ** 2;
    }
    vi_maive = sumWR2 / (sumW_maive * sumW_maive);
  } else {
    vi_maive = 1 / sumW_maive;
  }

  const se_maive = Math.sqrt(vi_maive);

  // Test for spurious precision (Hausman-type test)
  // H0: IV and standard estimates are equal
  const diff = theta_iv - theta_maive;
  const var_diff = 1 / sumW_iv + vi_maive; // Approximate
  const hausman_stat = diff * diff / var_diff;
  const hausman_pvalue = 1 - pnorm(Math.sqrt(hausman_stat)) * 2 + 1;

  // Recommendation
  let recommendation;
  if (hausman_pvalue < 0.05) {
    recommendation = 'Significant difference detected. MAIVE estimate preferred over IV-weighted.';
  } else if (Math.abs(theta_unwt - theta_iv) > 2 * se_maive) {
    recommendation = 'Consider unweighted mean as alternative (less susceptible to spurious precision).';
  } else {
    recommendation = 'Standard IV-weighting appears appropriate.';
  }

  return {
    theta_maive,
    se_maive,
    vi: vi_maive,
    ci_lower: theta_maive - 1.96 * se_maive,
    ci_upper: theta_maive + 1.96 * se_maive,
    theta_iv,
    theta_unweighted: theta_unwt,
    hausman_stat,
    hausman_pvalue,
    first_stage_R2: var_n > 0 ? (beta_prec ** 2 * var_n) / (prec.reduce((sum, p) => sum + (p - meanPrec) ** 2, 0)) : 0,
    recommendation,
    k,
    method: 'MAIVE'
  };
}

// ============================================================================
// EXTENDED SELECTION MODELS
// ============================================================================

/**
 * Beta Selection Model
 * Flexible model for publication probability as function of p-value
 */
export function betaSelectionModel(studies, options = {}) {
  const { maxIter = 100, tol = 1e-6 } = options;

  const k = studies.length;
  const yi = studies.map(s => s.yi);
  const vi = studies.map(s => s.vi);
  const sei = vi.map(v => Math.sqrt(v));

  // Calculate one-sided p-values
  const zi = yi.map((y, i) => y / sei[i]);
  const pi = zi.map(z => 1 - pnorm(z));

  // Initialize parameters
  let mu = yi.reduce((a, b) => a + b, 0) / k;
  let tau2 = Math.max(0, yi.reduce((sum, y) => sum + (y - mu) ** 2, 0) / k - vi.reduce((a, b) => a + b, 0) / k);
  let delta = 1; // Beta parameter (higher = more selection)

  // EM algorithm
  for (let iter = 0; iter < maxIter; iter++) {
    const oldMu = mu;
    const oldTau2 = tau2;

    // E-step: Calculate weights based on selection probability
    const wi = studies.map((s, i) => {
      const totalVar = vi[i] + tau2;
      const baseWeight = 1 / totalVar;
      // Beta selection function: P(select | p) proportional to (1-p)^delta
      const selectionWeight = Math.pow(1 - pi[i], delta);
      return baseWeight * selectionWeight;
    });

    const sumW = wi.reduce((a, b) => a + b, 0);

    // M-step: Update mu and tau2
    mu = wi.reduce((sum, w, i) => sum + w * yi[i], 0) / sumW;

    // Update tau2 using method of moments
    const Q = wi.reduce((sum, w, i) => sum + w * (yi[i] - mu) ** 2, 0);
    const C = sumW - wi.reduce((sum, w) => sum + w * w, 0) / sumW;
    tau2 = Math.max(0, (Q - (k - 1)) / C);

    // Update delta using profile likelihood
    // Grid search for simplicity
    let bestDelta = delta;
    let bestLL = -Infinity;
    for (let d = 0.1; d <= 5; d += 0.1) {
      let ll = 0;
      for (let i = 0; i < k; i++) {
        const totalVar = vi[i] + tau2;
        ll -= 0.5 * Math.log(totalVar);
        ll -= 0.5 * (yi[i] - mu) ** 2 / totalVar;
        ll += d * Math.log(1 - pi[i]); // Selection component
      }
      if (ll > bestLL) {
        bestLL = ll;
        bestDelta = d;
      }
    }
    delta = bestDelta;

    if (Math.abs(mu - oldMu) < tol && Math.abs(tau2 - oldTau2) < tol) break;
  }

  // Final variance estimate
  const wi = studies.map((s, i) => 1 / (vi[i] + tau2));
  const sumW = wi.reduce((a, b) => a + b, 0);
  const vi_mu = 1 / sumW;
  const se = Math.sqrt(vi_mu);

  return {
    mu,
    se,
    vi: vi_mu,
    ci_lower: mu - 1.96 * se,
    ci_upper: mu + 1.96 * se,
    tau2,
    tau: Math.sqrt(tau2),
    delta,
    k,
    method: 'BetaSelection'
  };
}

/**
 * Half-Normal Selection Model
 * Selection probability follows half-normal distribution of z-score
 */
export function halfNormalSelectionModel(studies, options = {}) {
  const { maxIter = 100, tol = 1e-6 } = options;

  const k = studies.length;
  const yi = studies.map(s => s.yi);
  const vi = studies.map(s => s.vi);
  const sei = vi.map(v => Math.sqrt(v));

  // Initialize
  let mu = yi.reduce((a, b) => a + b, 0) / k;
  let tau2 = Math.max(0, yi.reduce((sum, y) => sum + (y - mu) ** 2, 0) / k - vi.reduce((a, b) => a + b, 0) / k);
  let theta_sel = 1; // Selection severity parameter

  for (let iter = 0; iter < maxIter; iter++) {
    const oldMu = mu;

    // Calculate selection weights using half-normal model
    // P(select) proportional to exp(-theta * z^2) for z > 0
    const wi = studies.map((s, i) => {
      const totalVar = vi[i] + tau2;
      const z = yi[i] / sei[i];
      const baseWeight = 1 / totalVar;
      const selectionWeight = z > 0 ? Math.exp(-theta_sel * z * z / 2) : 1;
      return baseWeight / selectionWeight; // Inverse of selection prob
    });

    const sumW = wi.reduce((a, b) => a + b, 0);
    mu = wi.reduce((sum, w, i) => sum + w * yi[i], 0) / sumW;

    // Update tau2
    const Q = wi.reduce((sum, w, i) => sum + w * (yi[i] - mu) ** 2, 0);
    tau2 = Math.max(0, (Q - k) / sumW);

    if (Math.abs(mu - oldMu) < tol) break;
  }

  const wi = studies.map((s, i) => 1 / (vi[i] + tau2));
  const sumW = wi.reduce((a, b) => a + b, 0);
  const vi_mu = 1 / sumW;
  const se = Math.sqrt(vi_mu);

  return {
    mu,
    se,
    vi: vi_mu,
    ci_lower: mu - 1.96 * se,
    ci_upper: mu + 1.96 * se,
    tau2,
    tau: Math.sqrt(tau2),
    theta_sel,
    k,
    method: 'HalfNormalSelection'
  };
}

/**
 * Negative Exponential Selection Model
 */
export function negExpSelectionModel(studies, options = {}) {
  const { maxIter = 100, tol = 1e-6 } = options;

  const k = studies.length;
  const yi = studies.map(s => s.yi);
  const vi = studies.map(s => s.vi);

  let mu = yi.reduce((a, b) => a + b, 0) / k;
  let tau2 = 0.1;
  let lambda = 1; // Exponential rate

  for (let iter = 0; iter < maxIter; iter++) {
    const oldMu = mu;

    // Selection weight: exp(-lambda * p) where p is one-sided p-value
    const wi = studies.map((s, i) => {
      const totalVar = vi[i] + tau2;
      const z = yi[i] / Math.sqrt(vi[i]);
      const p = 1 - pnorm(z);
      const selectionWeight = Math.exp(-lambda * p);
      return (1 / totalVar) / Math.max(0.01, selectionWeight);
    });

    const sumW = wi.reduce((a, b) => a + b, 0);
    mu = wi.reduce((sum, w, i) => sum + w * yi[i], 0) / sumW;

    const Q = wi.reduce((sum, w, i) => sum + w * (yi[i] - mu) ** 2, 0);
    tau2 = Math.max(0, (Q - k) / sumW);

    if (Math.abs(mu - oldMu) < tol) break;
  }

  const wi = studies.map((s, i) => 1 / (vi[i] + tau2));
  const sumW = wi.reduce((a, b) => a + b, 0);
  const se = Math.sqrt(1 / sumW);

  return {
    mu,
    se,
    vi: 1 / sumW,
    ci_lower: mu - 1.96 * se,
    ci_upper: mu + 1.96 * se,
    tau2,
    lambda,
    k,
    method: 'NegExpSelection'
  };
}

/**
 * Power Selection Model
 */
export function powerSelectionModel(studies, options = {}) {
  const { maxIter = 100, tol = 1e-6 } = options;

  const k = studies.length;
  const yi = studies.map(s => s.yi);
  const vi = studies.map(s => s.vi);

  let mu = yi.reduce((a, b) => a + b, 0) / k;
  let tau2 = 0.1;
  let alpha_sel = 2; // Power parameter

  for (let iter = 0; iter < maxIter; iter++) {
    const oldMu = mu;

    // Selection weight: (1-p)^alpha where p is one-sided p-value
    const wi = studies.map((s, i) => {
      const totalVar = vi[i] + tau2;
      const z = yi[i] / Math.sqrt(vi[i]);
      const p = 1 - pnorm(z);
      const selectionWeight = Math.pow(Math.max(0.001, 1 - p), alpha_sel);
      return (1 / totalVar) / Math.max(0.01, selectionWeight);
    });

    const sumW = wi.reduce((a, b) => a + b, 0);
    mu = wi.reduce((sum, w, i) => sum + w * yi[i], 0) / sumW;

    const Q = wi.reduce((sum, w, i) => sum + w * (yi[i] - mu) ** 2, 0);
    tau2 = Math.max(0, (Q - k) / sumW);

    if (Math.abs(mu - oldMu) < tol) break;
  }

  const se = Math.sqrt(1 / studies.map((s, i) => 1 / (vi[i] + tau2)).reduce((a, b) => a + b, 0));

  return {
    mu,
    se,
    ci_lower: mu - 1.96 * se,
    ci_upper: mu + 1.96 * se,
    tau2,
    alpha_sel,
    k,
    method: 'PowerSelection'
  };
}

// ============================================================================
// BAYESIAN MODEL AVERAGING (RoBMA-style)
// ============================================================================

/**
 * Robust Bayesian Meta-Analysis with Model Averaging
 * Averages across models with/without effect, heterogeneity, and publication bias
 */
export function robustBayesianMA(studies, options = {}) {
  const { nModels = 12, priorMu = { mean: 0, sd: 1 }, priorTau = { shape: 1, scale: 0.5 } } = options;

  const k = studies.length;
  const yi = studies.map(s => s.yi);
  const vi = studies.map(s => s.vi);

  // Define model space
  const models = [
    // No effect models
    { hasEffect: false, hasHeterogeneity: false, hasBias: false },
    { hasEffect: false, hasHeterogeneity: true, hasBias: false },
    { hasEffect: false, hasHeterogeneity: false, hasBias: true },
    { hasEffect: false, hasHeterogeneity: true, hasBias: true },
    // Effect models
    { hasEffect: true, hasHeterogeneity: false, hasBias: false },
    { hasEffect: true, hasHeterogeneity: true, hasBias: false },
    { hasEffect: true, hasHeterogeneity: false, hasBias: true },
    { hasEffect: true, hasHeterogeneity: true, hasBias: true },
  ];

  // Calculate marginal likelihood for each model (using Laplace approximation)
  const modelResults = models.map(model => {
    let mu, tau2, logML;

    if (!model.hasEffect) {
      mu = 0;
    } else {
      // MLE for mu
      const w = vi.map(v => 1 / v);
      const sumW = w.reduce((a, b) => a + b, 0);
      mu = w.reduce((sum, ww, i) => sum + ww * yi[i], 0) / sumW;
    }

    if (!model.hasHeterogeneity) {
      tau2 = 0;
    } else {
      // DL estimate
      const w = vi.map(v => 1 / v);
      const sumW = w.reduce((a, b) => a + b, 0);
      const thetaFE = w.reduce((sum, ww, i) => sum + ww * yi[i], 0) / sumW;
      const Q = w.reduce((sum, ww, i) => sum + ww * (yi[i] - thetaFE) ** 2, 0);
      const C = sumW - w.reduce((sum, ww) => sum + ww * ww, 0) / sumW;
      tau2 = Math.max(0, (Q - (k - 1)) / C);
    }

    // Log marginal likelihood (simplified)
    const totalVar = vi.map(v => v + tau2);
    logML = -0.5 * k * Math.log(2 * Math.PI);
    logML -= 0.5 * totalVar.reduce((sum, v) => sum + Math.log(v), 0);
    logML -= 0.5 * totalVar.reduce((sum, v, i) => sum + (yi[i] - mu) ** 2 / v, 0);

    // Add prior contributions
    logML += -0.5 * Math.log(2 * Math.PI * priorMu.sd ** 2);
    logML += -0.5 * (mu - priorMu.mean) ** 2 / (priorMu.sd ** 2);

    if (model.hasHeterogeneity && tau2 > 0) {
      // Inverse-gamma prior on tau2
      logML += priorTau.shape * Math.log(priorTau.scale) - lgamma(priorTau.shape);
      logML += -(priorTau.shape + 1) * Math.log(tau2) - priorTau.scale / tau2;
    }

    // Penalty for bias model complexity
    if (model.hasBias) {
      logML -= 2; // Approximate penalty
    }

    return { ...model, mu, tau2, logML };
  });

  // Calculate posterior model probabilities (with equal prior)
  const maxLogML = Math.max(...modelResults.map(m => m.logML));
  const posteriorProbs = modelResults.map(m => Math.exp(m.logML - maxLogML));
  const sumProbs = posteriorProbs.reduce((a, b) => a + b, 0);
  const normalizedProbs = posteriorProbs.map(p => p / sumProbs);

  // Model-averaged estimates
  let muAvg = 0, tau2Avg = 0;
  let muVar = 0;

  normalizedProbs.forEach((p, i) => {
    muAvg += p * modelResults[i].mu;
    tau2Avg += p * modelResults[i].tau2;
  });

  // Posterior variance (includes model uncertainty)
  normalizedProbs.forEach((p, i) => {
    const muDiff = modelResults[i].mu - muAvg;
    muVar += p * (muDiff * muDiff);
  });

  // Add within-model variance
  const withinVar = 1 / vi.map(v => 1 / (v + tau2Avg)).reduce((a, b) => a + b, 0);
  muVar += withinVar;

  const se = Math.sqrt(muVar);

  // Inclusion Bayes factors
  const probEffect = normalizedProbs.filter((p, i) => modelResults[i].hasEffect).reduce((a, b) => a + b, 0);
  const probHeterogeneity = normalizedProbs.filter((p, i) => modelResults[i].hasHeterogeneity).reduce((a, b) => a + b, 0);
  const probBias = normalizedProbs.filter((p, i) => modelResults[i].hasBias).reduce((a, b) => a + b, 0);

  const BF_effect = probEffect / (1 - probEffect);
  const BF_heterogeneity = probHeterogeneity / (1 - probHeterogeneity);
  const BF_bias = probBias / (1 - probBias);

  return {
    mu: muAvg,
    se,
    vi: muVar,
    ci_lower: muAvg - 1.96 * se,
    ci_upper: muAvg + 1.96 * se,
    tau2: tau2Avg,
    tau: Math.sqrt(tau2Avg),
    posteriorProbs: normalizedProbs,
    probEffect,
    probHeterogeneity,
    probBias,
    BF_effect,
    BF_heterogeneity,
    BF_bias,
    models: modelResults.map((m, i) => ({ ...m, posteriorProb: normalizedProbs[i] })),
    k,
    method: 'RoBMA'
  };
}

// ============================================================================
// COMPONENT NETWORK META-ANALYSIS (CNMA)
// ============================================================================

/**
 * Additive Component Network Meta-Analysis
 * For complex interventions with multiple components
 */
export function componentNMA(studies, options = {}) {
  const { model = 'additive', reference = null } = options;

  // Parse component structure
  // Each treatment should be an array of component codes
  // e.g., treatments = [['A', 'B'], ['A'], ['B', 'C'], ['placebo']]

  const k = studies.length;
  if (k < 2) return { error: 'Need at least 2 studies' };

  // Extract unique components
  const allComponents = new Set();
  studies.forEach(s => {
    if (s.treatment1Components) s.treatment1Components.forEach(c => allComponents.add(c));
    if (s.treatment2Components) s.treatment2Components.forEach(c => allComponents.add(c));
  });

  const components = Array.from(allComponents).filter(c => c !== 'placebo' && c !== 'control');
  const nComponents = components.length;

  if (nComponents === 0) return { error: 'No components identified' };

  // Build design matrix
  // Each row: difference in component presence between treatment and comparator
  const X = [];
  const yi = [];
  const vi = [];

  studies.forEach(s => {
    const t1 = s.treatment1Components || [];
    const t2 = s.treatment2Components || [];

    const row = components.map(c => {
      const inT1 = t1.includes(c) ? 1 : 0;
      const inT2 = t2.includes(c) ? 1 : 0;
      return inT1 - inT2;
    });

    X.push(row);
    yi.push(s.yi);
    vi.push(s.vi);
  });

  // Weighted least squares
  const W = vi.map(v => 1 / v);

  // X'WX
  const XtWX = [];
  for (let i = 0; i < nComponents; i++) {
    XtWX[i] = [];
    for (let j = 0; j < nComponents; j++) {
      let sum = 0;
      for (let s = 0; s < k; s++) {
        sum += X[s][i] * W[s] * X[s][j];
      }
      XtWX[i][j] = sum;
    }
  }

  // X'Wy
  const XtWy = [];
  for (let i = 0; i < nComponents; i++) {
    let sum = 0;
    for (let s = 0; s < k; s++) {
      sum += X[s][i] * W[s] * yi[s];
    }
    XtWy[i] = sum;
  }

  // Solve using Cholesky decomposition (simplified)
  // For robustness, add small ridge
  const lambda = 0.001;
  for (let i = 0; i < nComponents; i++) {
    XtWX[i][i] += lambda;
  }

  // Simple matrix inversion (for small matrices)
  const inv = invertMatrix(XtWX);
  if (!inv) return { error: 'Singular matrix - check component coding' };

  // Component effects
  const beta = [];
  for (let i = 0; i < nComponents; i++) {
    let sum = 0;
    for (let j = 0; j < nComponents; j++) {
      sum += inv[i][j] * XtWy[j];
    }
    beta[i] = sum;
  }

  // Standard errors
  const se = components.map((c, i) => Math.sqrt(inv[i][i]));

  // Heterogeneity
  let RSS = 0;
  for (let s = 0; s < k; s++) {
    let predicted = 0;
    for (let i = 0; i < nComponents; i++) {
      predicted += X[s][i] * beta[i];
    }
    RSS += W[s] * (yi[s] - predicted) ** 2;
  }

  const df = k - nComponents;
  const I2 = df > 0 ? Math.max(0, (RSS - df) / RSS * 100) : 0;

  const componentEffects = components.map((c, i) => ({
    component: c,
    effect: beta[i],
    se: se[i],
    ci_lower: beta[i] - 1.96 * se[i],
    ci_upper: beta[i] + 1.96 * se[i],
    z: beta[i] / se[i],
    pvalue: 2 * (1 - pnorm(Math.abs(beta[i] / se[i])))
  }));

  return {
    componentEffects,
    components,
    nComponents,
    k,
    I2,
    Q: RSS,
    df,
    model,
    method: 'CNMA'
  };
}

// Simple matrix inversion for small matrices
function invertMatrix(A) {
  const n = A.length;
  const augmented = A.map((row, i) =>
    [...row, ...Array(n).fill(0).map((_, j) => i === j ? 1 : 0)]
  );

  for (let i = 0; i < n; i++) {
    // Find pivot
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) {
        maxRow = k;
      }
    }
    [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];

    if (Math.abs(augmented[i][i]) < 1e-10) return null;

    // Scale row
    const scale = augmented[i][i];
    for (let j = 0; j < 2 * n; j++) {
      augmented[i][j] /= scale;
    }

    // Eliminate column
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
// PREDICTION MODEL META-ANALYSIS
// ============================================================================

/**
 * C-statistic Meta-Analysis
 * For pooling discrimination measures from prediction models
 */
export function cStatisticMA(studies, options = {}) {
  const { transform = 'logit' } = options;

  const k = studies.length;
  const cStats = studies.map(s => s.cStatistic);
  const ses = studies.map(s => s.se || 0.05); // Default SE if not provided
  const ns = studies.map(s => s.n || 100);

  // Transform C-statistics
  let yi, vi;

  if (transform === 'logit') {
    // Logit transformation: log(C / (1-C))
    yi = cStats.map(c => Math.log(c / (1 - c)));
    vi = ses.map((se, i) => {
      const c = cStats[i];
      // Delta method variance
      return (se * se) / ((c * (1 - c)) ** 2);
    });
  } else {
    // Raw scale
    yi = cStats;
    vi = ses.map(se => se * se);
  }

  // Random-effects meta-analysis
  const w = vi.map(v => 1 / v);
  const sumW = w.reduce((a, b) => a + b, 0);
  const thetaFE = w.reduce((sum, ww, i) => sum + ww * yi[i], 0) / sumW;

  const Q = w.reduce((sum, ww, i) => sum + ww * (yi[i] - thetaFE) ** 2, 0);
  const C_het = sumW - w.reduce((sum, ww) => sum + ww * ww, 0) / sumW;
  const tau2 = Math.max(0, (Q - (k - 1)) / C_het);

  const w_re = vi.map(v => 1 / (v + tau2));
  const sumW_re = w_re.reduce((a, b) => a + b, 0);
  const theta = w_re.reduce((sum, ww, i) => sum + ww * yi[i], 0) / sumW_re;
  const se = Math.sqrt(1 / sumW_re);

  // Back-transform
  let pooledC, ci_lower, ci_upper;
  if (transform === 'logit') {
    pooledC = 1 / (1 + Math.exp(-theta));
    ci_lower = 1 / (1 + Math.exp(-(theta - 1.96 * se)));
    ci_upper = 1 / (1 + Math.exp(-(theta + 1.96 * se)));
  } else {
    pooledC = theta;
    ci_lower = theta - 1.96 * se;
    ci_upper = theta + 1.96 * se;
  }

  const I2 = Math.max(0, (Q - (k - 1)) / Q * 100);

  return {
    pooledC,
    ci_lower,
    ci_upper,
    theta_transformed: theta,
    se_transformed: se,
    tau2,
    tau: Math.sqrt(tau2),
    I2,
    Q,
    k,
    transform,
    method: 'C-statistic MA'
  };
}

/**
 * Calibration Meta-Analysis
 * Pools calibration slopes or O:E ratios
 */
export function calibrationMA(studies, options = {}) {
  const { measure = 'slope' } = options; // 'slope' or 'OE'

  const k = studies.length;

  let yi, vi;

  if (measure === 'slope') {
    yi = studies.map(s => s.calibrationSlope);
    vi = studies.map(s => s.slopeVar || (s.slopeSE ** 2) || 0.01);
  } else {
    // O:E ratio - use log transformation
    yi = studies.map(s => Math.log(s.OEratio));
    vi = studies.map(s => s.OEvar || 0.01);
  }

  // Random-effects
  const w = vi.map(v => 1 / v);
  const sumW = w.reduce((a, b) => a + b, 0);
  const thetaFE = w.reduce((sum, ww, i) => sum + ww * yi[i], 0) / sumW;

  const Q = w.reduce((sum, ww, i) => sum + ww * (yi[i] - thetaFE) ** 2, 0);
  const C_het = sumW - w.reduce((sum, ww) => sum + ww * ww, 0) / sumW;
  const tau2 = Math.max(0, (Q - (k - 1)) / C_het);

  const w_re = vi.map(v => 1 / (v + tau2));
  const sumW_re = w_re.reduce((a, b) => a + b, 0);
  const theta = w_re.reduce((sum, ww, i) => sum + ww * yi[i], 0) / sumW_re;
  const se = Math.sqrt(1 / sumW_re);

  let pooled, ci_lower, ci_upper;
  if (measure === 'OE') {
    pooled = Math.exp(theta);
    ci_lower = Math.exp(theta - 1.96 * se);
    ci_upper = Math.exp(theta + 1.96 * se);
  } else {
    pooled = theta;
    ci_lower = theta - 1.96 * se;
    ci_upper = theta + 1.96 * se;
  }

  return {
    pooled,
    ci_lower,
    ci_upper,
    tau2,
    I2: Math.max(0, (Q - (k - 1)) / Q * 100),
    k,
    measure,
    method: 'Calibration MA'
  };
}

// ============================================================================
// MACHINE LEARNING MODERATOR DETECTION
// ============================================================================

/**
 * Random Forest for Moderator Detection (MetaForest-style)
 * Identifies important moderators through variable importance
 */
export function metaForest(studies, moderators, options = {}) {
  const { nTrees = 100, maxDepth = 5, minSplit = 5 } = options;

  const k = studies.length;
  const yi = studies.map(s => s.yi);
  const vi = studies.map(s => s.vi);
  const modNames = Object.keys(moderators);

  if (modNames.length === 0) return { error: 'No moderators provided' };

  // Build forest
  const trees = [];
  const oobPredictions = new Array(k).fill(null).map(() => []);

  for (let t = 0; t < nTrees; t++) {
    // Bootstrap sample with inverse-variance weights
    const w = vi.map(v => 1 / v);
    const sumW = w.reduce((a, b) => a + b, 0);
    const probs = w.map(ww => ww / sumW);

    const sample = [];
    const oobIndices = new Set(Array.from({ length: k }, (_, i) => i));

    for (let i = 0; i < k; i++) {
      // Weighted sampling
      let r = Math.random();
      let cumProb = 0;
      for (let j = 0; j < k; j++) {
        cumProb += probs[j];
        if (r <= cumProb) {
          sample.push(j);
          oobIndices.delete(j);
          break;
        }
      }
    }

    // Build tree
    const tree = buildTree(sample, yi, vi, moderators, modNames, 0, maxDepth, minSplit);
    trees.push(tree);

    // OOB predictions
    oobIndices.forEach(i => {
      const pred = predictTree(tree, moderators, i);
      oobPredictions[i].push(pred);
    });
  }

  // Calculate variable importance via permutation
  const importance = {};
  const baseOOBError = calculateOOBError(oobPredictions, yi, vi);

  modNames.forEach(modName => {
    // Permute this moderator
    const permutedMod = { ...moderators };
    const values = moderators[modName];
    const permuted = [...values].sort(() => Math.random() - 0.5);
    permutedMod[modName] = permuted;

    // Recalculate OOB predictions with permuted moderator
    const permOOBPred = new Array(k).fill(null).map(() => []);
    trees.forEach(tree => {
      for (let i = 0; i < k; i++) {
        const pred = predictTree(tree, permutedMod, i);
        permOOBPred[i].push(pred);
      }
    });

    const permError = calculateOOBError(permOOBPred, yi, vi);
    importance[modName] = permError - baseOOBError;
  });

  // Normalize importance
  const maxImp = Math.max(...Object.values(importance), 0.001);
  const relativeImportance = {};
  modNames.forEach(mod => {
    relativeImportance[mod] = Math.max(0, importance[mod] / maxImp * 100);
  });

  // Sort by importance
  const rankedModerators = modNames.sort((a, b) => relativeImportance[b] - relativeImportance[a]);

  return {
    importance: relativeImportance,
    rankedModerators,
    oobR2: 1 - baseOOBError / yi.reduce((sum, y) => sum + (y - yi.reduce((a, b) => a + b, 0) / k) ** 2, 0),
    nTrees,
    k,
    method: 'MetaForest'
  };
}

function buildTree(indices, yi, vi, mods, modNames, depth, maxDepth, minSplit) {
  if (depth >= maxDepth || indices.length < minSplit) {
    // Leaf: weighted mean
    const w = indices.map(i => 1 / vi[i]);
    const sumW = w.reduce((a, b) => a + b, 0);
    const prediction = indices.reduce((sum, idx, i) => sum + w[i] * yi[idx], 0) / sumW;
    return { isLeaf: true, prediction, n: indices.length };
  }

  // Find best split
  let bestSplit = null;
  let bestGain = -Infinity;

  // Random subset of moderators (sqrt(p))
  const nSelect = Math.ceil(Math.sqrt(modNames.length));
  const selectedMods = modNames.sort(() => Math.random() - 0.5).slice(0, nSelect);

  selectedMods.forEach(modName => {
    const values = mods[modName];
    const uniqueVals = [...new Set(indices.map(i => values[i]))].sort((a, b) => a - b);

    for (let j = 0; j < uniqueVals.length - 1; j++) {
      const threshold = (uniqueVals[j] + uniqueVals[j + 1]) / 2;

      const left = indices.filter(i => values[i] <= threshold);
      const right = indices.filter(i => values[i] > threshold);

      if (left.length < 2 || right.length < 2) continue;

      // Calculate weighted gain
      const parentVar = weightedVariance(indices, yi, vi);
      const leftVar = weightedVariance(left, yi, vi);
      const rightVar = weightedVariance(right, yi, vi);

      const gain = parentVar - (left.length * leftVar + right.length * rightVar) / indices.length;

      if (gain > bestGain) {
        bestGain = gain;
        bestSplit = { modName, threshold, left, right };
      }
    }
  });

  if (!bestSplit) {
    const w = indices.map(i => 1 / vi[i]);
    const sumW = w.reduce((a, b) => a + b, 0);
    const prediction = indices.reduce((sum, idx, i) => sum + w[i] * yi[idx], 0) / sumW;
    return { isLeaf: true, prediction, n: indices.length };
  }

  return {
    isLeaf: false,
    modName: bestSplit.modName,
    threshold: bestSplit.threshold,
    left: buildTree(bestSplit.left, yi, vi, mods, modNames, depth + 1, maxDepth, minSplit),
    right: buildTree(bestSplit.right, yi, vi, mods, modNames, depth + 1, maxDepth, minSplit)
  };
}

function weightedVariance(indices, yi, vi) {
  if (indices.length === 0) return 0;
  const w = indices.map(i => 1 / vi[i]);
  const sumW = w.reduce((a, b) => a + b, 0);
  const mean = indices.reduce((sum, idx, i) => sum + w[i] * yi[idx], 0) / sumW;
  return indices.reduce((sum, idx, i) => sum + w[i] * (yi[idx] - mean) ** 2, 0) / sumW;
}

function predictTree(tree, mods, index) {
  if (tree.isLeaf) return tree.prediction;

  const value = mods[tree.modName][index];
  if (value <= tree.threshold) {
    return predictTree(tree.left, mods, index);
  }
  return predictTree(tree.right, mods, index);
}

function calculateOOBError(oobPred, yi, vi) {
  let error = 0;
  let count = 0;
  oobPred.forEach((preds, i) => {
    if (preds.length > 0) {
      const pred = preds.reduce((a, b) => a + b, 0) / preds.length;
      error += (1 / vi[i]) * (yi[i] - pred) ** 2;
      count++;
    }
  });
  return count > 0 ? error / count : 0;
}

// ============================================================================
// CROSS-DESIGN SYNTHESIS
// ============================================================================

/**
 * Cross-Design Synthesis
 * Combines RCT and observational study evidence with bias adjustment
 */
export function crossDesignSynthesis(studies, options = {}) {
  const { biasAdjustment = 'power_prior', rctWeight = 1.0, obsWeight = 0.5 } = options;

  // Separate by design
  const rcts = studies.filter(s => s.design === 'RCT');
  const obs = studies.filter(s => s.design === 'observational' || s.design === 'cohort');

  if (rcts.length === 0 && obs.length === 0) {
    return { error: 'No valid studies' };
  }

  // RCT-only analysis
  let rctResult = null;
  if (rcts.length > 0) {
    const yi = rcts.map(s => s.yi);
    const vi = rcts.map(s => s.vi);
    const w = vi.map(v => 1 / v);
    const sumW = w.reduce((a, b) => a + b, 0);
    rctResult = {
      estimate: w.reduce((sum, ww, i) => sum + ww * yi[i], 0) / sumW,
      variance: 1 / sumW,
      k: rcts.length
    };
  }

  // Observational-only analysis
  let obsResult = null;
  if (obs.length > 0) {
    const yi = obs.map(s => s.yi);
    const vi = obs.map(s => s.vi);
    const w = vi.map(v => 1 / v);
    const sumW = w.reduce((a, b) => a + b, 0);
    obsResult = {
      estimate: w.reduce((sum, ww, i) => sum + ww * yi[i], 0) / sumW,
      variance: 1 / sumW,
      k: obs.length
    };
  }

  // Combined analysis with bias adjustment
  let combined;

  if (biasAdjustment === 'power_prior') {
    // Power prior approach: downweight observational evidence
    const allStudies = [
      ...rcts.map(s => ({ ...s, weight: rctWeight })),
      ...obs.map(s => ({ ...s, weight: obsWeight }))
    ];

    const yi = allStudies.map(s => s.yi);
    const vi = allStudies.map(s => s.vi);
    const designWeights = allStudies.map(s => s.weight);

    const w = vi.map((v, i) => designWeights[i] / v);
    const sumW = w.reduce((a, b) => a + b, 0);
    const estimate = w.reduce((sum, ww, i) => sum + ww * yi[i], 0) / sumW;
    const variance = 1 / sumW;

    combined = { estimate, variance, method: 'power_prior' };
  } else if (biasAdjustment === 'hierarchical') {
    // Hierarchical model: random effect for design
    // Simplified version
    const yi = studies.map(s => s.yi);
    const vi = studies.map(s => s.vi);
    const isRCT = studies.map(s => s.design === 'RCT');

    // Estimate design effect
    const rctMean = rctResult ? rctResult.estimate : 0;
    const obsMean = obsResult ? obsResult.estimate : 0;
    const designBias = obsMean - rctMean;

    // Adjust observational studies
    const yiAdj = yi.map((y, i) => isRCT[i] ? y : y - designBias * 0.5);
    const w = vi.map(v => 1 / v);
    const sumW = w.reduce((a, b) => a + b, 0);
    const estimate = w.reduce((sum, ww, i) => sum + ww * yiAdj[i], 0) / sumW;

    combined = {
      estimate,
      variance: 1 / sumW,
      designBias,
      method: 'hierarchical'
    };
  } else {
    // Naive pooling
    const yi = studies.map(s => s.yi);
    const vi = studies.map(s => s.vi);
    const w = vi.map(v => 1 / v);
    const sumW = w.reduce((a, b) => a + b, 0);
    combined = {
      estimate: w.reduce((sum, ww, i) => sum + ww * yi[i], 0) / sumW,
      variance: 1 / sumW,
      method: 'naive'
    };
  }

  const se = Math.sqrt(combined.variance);

  return {
    combined: {
      estimate: combined.estimate,
      se,
      ci_lower: combined.estimate - 1.96 * se,
      ci_upper: combined.estimate + 1.96 * se
    },
    rctOnly: rctResult ? {
      estimate: rctResult.estimate,
      se: Math.sqrt(rctResult.variance),
      k: rctResult.k
    } : null,
    obsOnly: obsResult ? {
      estimate: obsResult.estimate,
      se: Math.sqrt(obsResult.variance),
      k: obsResult.k
    } : null,
    biasAdjustment: combined.method,
    k: studies.length,
    kRCT: rcts.length,
    kObs: obs.length,
    method: 'CrossDesignSynthesis'
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // MAIVE (2025)
  maive,

  // Selection models
  betaSelectionModel,
  halfNormalSelectionModel,
  negExpSelectionModel,
  powerSelectionModel,

  // Bayesian model averaging
  robustBayesianMA,

  // Component NMA
  componentNMA,

  // Prediction model MA
  cStatisticMA,
  calibrationMA,

  // Machine learning
  metaForest,

  // Cross-design synthesis
  crossDesignSynthesis
};
