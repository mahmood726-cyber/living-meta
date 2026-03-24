/**
 * Advanced Meta-Analysis Methods
 * Features that go beyond standard R packages (metafor, meta)
 *
 * Includes:
 * - Robust Variance Estimation (RVE) with CR2 correction
 * - Meta-regression with mixed-effects models
 * - Three-level meta-analysis
 * - Fragility index for meta-analysis
 * - Expected proportion in clinical ranges (2025 method)
 * - PET-PEESE publication bias
 * - Vevea-Hedges selection model
 * - Lan-DeMets alpha-spending for living reviews
 */

// ============================================================================
// ROBUST VARIANCE ESTIMATION (RVE)
// For handling dependent effect sizes within studies
// Reference: Hedges, Tipton, Johnson (2010); Tipton (2015)
// ============================================================================

/**
 * Robust Variance Estimation with CR2 small-sample correction
 * Handles multiple effect sizes per study (dependent data)
 *
 * @param {Array} studies - Array of { yi, vi, clusterId, ... }
 * @param {object} options - { rho: 0.8, smallSampleCorrection: 'CR2' }
 * @returns {object} RVE results with cluster-robust inference
 */
export function robustVarianceEstimation(studies, options = {}) {
  const {
    rho = 0.8,  // Working correlation for effects within clusters
    smallSampleCorrection = 'CR2',  // CR0, CR1, CR2
    alpha = 0.05
  } = options;

  // Group by cluster (study)
  const clusters = groupByCluster(studies);
  const clusterIds = Object.keys(clusters);
  const m = clusterIds.length;  // Number of clusters
  const p = 1;  // Number of parameters (intercept only for now)

  if (m < 2) {
    return { error: 'Need at least 2 clusters for RVE' };
  }

  // Build design matrix and outcome vector
  const { X, y, W, V, clusterSizes } = buildRVEMatrices(clusters, rho);

  const n = y.length;  // Total effect sizes

  // Weighted least squares estimate
  // β = (X'WX)^-1 X'Wy
  const XtW = matrixMultiply(transpose(X), W);
  const XtWX = matrixMultiply(XtW, X);
  const XtWX_inv = invertMatrix(XtWX);
  const XtWy = matrixVectorMultiply(XtW, y);
  const beta = matrixVectorMultiply(XtWX_inv, XtWy);

  // Residuals
  const fitted = matrixVectorMultiply(X, beta);
  const residuals = y.map((yi, i) => yi - fitted[i]);

  // Calculate cluster-robust variance based on correction type
  let V_robust;
  let df;

  switch (smallSampleCorrection) {
    case 'CR0':
      V_robust = calculateCR0(X, W, residuals, clusters, XtWX_inv);
      df = m - p;
      break;
    case 'CR1':
      V_robust = calculateCR1(X, W, residuals, clusters, XtWX_inv, m, p);
      df = m - p;
      break;
    case 'CR2':
    default:
      const cr2Result = calculateCR2(X, W, residuals, clusters, XtWX_inv);
      V_robust = cr2Result.V;
      df = cr2Result.df;  // Satterthwaite df
      break;
  }

  const se = Math.sqrt(V_robust[0][0]);
  const tStat = beta[0] / se;
  const tCrit = tQuantile(1 - alpha / 2, df);
  const pValue = 2 * (1 - tCDF(Math.abs(tStat), df));

  return {
    method: 'RVE',
    correction: smallSampleCorrection,
    estimate: beta[0],
    se: se,
    ci_lower: beta[0] - tCrit * se,
    ci_upper: beta[0] + tCrit * se,
    t: tStat,
    df: df,
    p: pValue,
    nClusters: m,
    nEffects: n,
    rho: rho,
    clusterSizes: clusterSizes
  };
}

/**
 * CR2 small-sample correction (Tipton 2015)
 * Uses bias-reduced linearization
 */
function calculateCR2(X, W, residuals, clusters, XtWX_inv) {
  const clusterIds = Object.keys(clusters);
  const m = clusterIds.length;

  // Calculate adjustment matrices for each cluster
  let meatSum = createZeroMatrix(1, 1);
  let traceOmega2 = 0;
  let traceOmega = 0;

  clusterIds.forEach((cid, idx) => {
    const clusterIndices = clusters[cid].indices;
    const nj = clusterIndices.length;

    // Extract cluster-specific matrices
    const Xj = clusterIndices.map(i => X[i]);
    const Wj = extractSubmatrix(W, clusterIndices);
    const rj = clusterIndices.map(i => residuals[i]);

    // Hat matrix for cluster: H_jj = X_j (X'WX)^-1 X_j' W_j
    const XjMat = Xj.map(row => [row[0]]);  // Convert to column vector format
    const Hjj = calculateHatMatrix(XjMat, Wj, XtWX_inv);

    // Adjustment: A_j = (I - H_jj)^(-1/2)
    const I = identityMatrix(nj);
    const IminusH = subtractMatrices(I, Hjj);
    const Aj = matrixSqrtInverse(IminusH);

    // Adjusted residuals: r*_j = A_j * r_j
    const rjAdj = matrixVectorMultiply(Aj, rj);

    // Meat contribution: X_j' W_j r*_j r*_j' W_j X_j
    const XjT = transpose(XjMat);
    const WjXj = matrixMultiply(Wj, XjMat);
    const rjAdjOuter = outerProduct(rjAdj, rjAdj);
    const contribution = matrixMultiply(
      matrixMultiply(XjT, Wj),
      matrixMultiply(rjAdjOuter, WjXj)
    );

    meatSum = addMatrices(meatSum, contribution);

    // For Satterthwaite df
    const omega = matrixMultiply(Aj, Aj);
    traceOmega += trace(omega);
    traceOmega2 += trace(matrixMultiply(omega, omega));
  });

  // V_CR2 = (X'WX)^-1 * Meat * (X'WX)^-1
  const V = matrixMultiply(matrixMultiply(XtWX_inv, meatSum), XtWX_inv);

  // Satterthwaite degrees of freedom
  const df = Math.max(1, 2 * Math.pow(traceOmega, 2) / traceOmega2);

  return { V, df };
}

/**
 * CR0 - Basic cluster-robust (no small-sample correction)
 */
function calculateCR0(X, W, residuals, clusters, XtWX_inv) {
  const clusterIds = Object.keys(clusters);
  let meatSum = createZeroMatrix(1, 1);

  clusterIds.forEach(cid => {
    const clusterIndices = clusters[cid].indices;
    const rj = clusterIndices.map(i => residuals[i]);
    const Xj = clusterIndices.map(i => X[i]);
    const Wj = extractSubmatrix(W, clusterIndices);

    // Score for cluster: X_j' W_j r_j
    const XjMat = Xj.map(row => [row[0]]);
    const score = matrixVectorMultiply(matrixMultiply(transpose(XjMat), Wj), rj);
    const contribution = outerProduct(score, score);
    meatSum = addMatrices(meatSum, contribution);
  });

  return matrixMultiply(matrixMultiply(XtWX_inv, meatSum), XtWX_inv);
}

/**
 * CR1 - HC1-style correction: multiply by m/(m-p)
 */
function calculateCR1(X, W, residuals, clusters, XtWX_inv, m, p) {
  const CR0 = calculateCR0(X, W, residuals, clusters, XtWX_inv);
  const correction = m / (m - p);
  return scaleMatrix(CR0, correction);
}

// ============================================================================
// META-REGRESSION
// Mixed-effects meta-regression with moderator analysis
// ============================================================================

/**
 * Mixed-effects meta-regression
 * y_i = β₀ + β₁x₁ᵢ + ... + βₚxₚᵢ + uᵢ + eᵢ
 *
 * @param {Array} studies - Array of { yi, vi, moderators: { x1, x2, ... } }
 * @param {Array} moderatorNames - Names of moderators to include
 * @param {object} options - { method: 'REML', knha: true }
 */
export function metaRegression(studies, moderatorNames = [], options = {}) {
  const {
    method = 'REML',
    knha = true,  // Knapp-Hartung adjustment
    alpha = 0.05
  } = options;

  // Filter valid studies
  const validStudies = studies.filter(s =>
    s.yi !== null && s.vi !== null && s.vi > 0 &&
    moderatorNames.every(mod => s.moderators && s.moderators[mod] !== undefined)
  );

  const k = validStudies.length;
  const p = moderatorNames.length + 1;  // +1 for intercept

  if (k < p + 2) {
    return { error: `Need at least ${p + 2} studies for ${p} parameters` };
  }

  // Build design matrix [1, x1, x2, ...]
  const X = validStudies.map(s => {
    const row = [1];  // Intercept
    moderatorNames.forEach(mod => {
      row.push(s.moderators[mod]);
    });
    return row;
  });

  const y = validStudies.map(s => s.yi);
  const vi = validStudies.map(s => s.vi);

  // Estimate tau² using method of moments or REML
  let tau2;
  if (method === 'REML') {
    tau2 = estimateTau2REML(y, X, vi);
  } else {
    tau2 = estimateTau2MOM(y, X, vi);
  }

  // Weights with tau²
  const wi = vi.map(v => 1 / (v + tau2));
  const W = diagonalMatrix(wi);

  // Weighted least squares: β = (X'WX)^-1 X'Wy
  const XtW = matrixMultiply(transpose(X), W);
  const XtWX = matrixMultiply(XtW, X);
  const XtWX_inv = invertMatrix(XtWX);
  const XtWy = matrixVectorMultiply(XtW, y);
  const beta = matrixVectorMultiply(XtWX_inv, XtWy);

  // Variance-covariance matrix of coefficients
  let vcov = XtWX_inv;

  // Residuals and Q statistics
  const fitted = matrixVectorMultiply(X, beta);
  const residuals = y.map((yi, i) => yi - fitted[i]);

  // Q_E (residual heterogeneity)
  const Q_E = residuals.reduce((sum, r, i) => sum + wi[i] * r * r, 0);
  const df_E = k - p;
  const p_QE = 1 - chiSquareCDF(Q_E, df_E);

  // Q_M (moderator test)
  // Q_M = β' (X'WX / (X'WX)^-1) β - (intercept contribution)
  const Q_M = calculateQM(beta, XtWX);
  const df_M = p - 1;
  const p_QM = df_M > 0 ? 1 - chiSquareCDF(Q_M, df_M) : 1;

  // Knapp-Hartung adjustment
  let multiplier = 1;
  if (knha && df_E > 0) {
    multiplier = Math.max(1, Q_E / df_E);
    vcov = scaleMatrix(vcov, multiplier);
  }

  // Calculate I² for residual heterogeneity
  const I2_resid = df_E > 0 ? Math.max(0, (Q_E - df_E) / Q_E) * 100 : 0;

  // R² - proportion of heterogeneity explained
  const tau2_null = estimateTau2MOM(y, validStudies.map(() => [1]), vi);
  const R2 = tau2_null > 0 ? Math.max(0, (tau2_null - tau2) / tau2_null) * 100 : 0;

  // Coefficient tests
  const coefficients = moderatorNames.map((name, i) => {
    const idx = i + 1;  // Skip intercept
    const se = Math.sqrt(vcov[idx][idx]);
    const tStat = beta[idx] / se;
    const df = knha ? df_E : Infinity;
    const pVal = knha ?
      2 * (1 - tCDF(Math.abs(tStat), df)) :
      2 * (1 - normalCDF(Math.abs(tStat)));
    const tCrit = knha ? tQuantile(1 - alpha / 2, df) : 1.96;

    return {
      name: name,
      estimate: beta[idx],
      se: se,
      ci_lower: beta[idx] - tCrit * se,
      ci_upper: beta[idx] + tCrit * se,
      t: tStat,
      p: pVal
    };
  });

  // Intercept
  const interceptSE = Math.sqrt(vcov[0][0]);
  const interceptT = beta[0] / interceptSE;
  const interceptDF = knha ? df_E : Infinity;
  const tCritIntercept = knha ? tQuantile(1 - alpha / 2, interceptDF) : 1.96;

  return {
    method: 'Meta-regression',
    tauEstimator: method,
    k: k,
    p: p,

    intercept: {
      estimate: beta[0],
      se: interceptSE,
      ci_lower: beta[0] - tCritIntercept * interceptSE,
      ci_upper: beta[0] + tCritIntercept * interceptSE,
      t: interceptT,
      p: knha ? 2 * (1 - tCDF(Math.abs(interceptT), df_E)) : 2 * (1 - normalCDF(Math.abs(interceptT)))
    },

    coefficients: coefficients,

    heterogeneity: {
      tau2: tau2,
      tau: Math.sqrt(tau2),
      Q_E: Q_E,
      df_E: df_E,
      p_QE: p_QE,
      I2_resid: I2_resid,
      R2: R2
    },

    moderatorTest: {
      Q_M: Q_M,
      df_M: df_M,
      p_QM: p_QM
    },

    knha_applied: knha && multiplier > 1,
    knha_multiplier: multiplier
  };
}

/**
 * Estimate tau² using method of moments for meta-regression
 */
function estimateTau2MOM(y, X, vi) {
  const k = y.length;
  const p = X[0].length;

  // Unweighted OLS first
  const wi = vi.map(() => 1);
  const W = diagonalMatrix(wi);
  const XtX = matrixMultiply(transpose(X), X);
  const XtX_inv = invertMatrix(XtX);
  const beta = matrixVectorMultiply(XtX_inv, matrixVectorMultiply(transpose(X), y));

  // Residual SS
  const fitted = matrixVectorMultiply(X, beta);
  const RSS = y.reduce((sum, yi, i) => sum + Math.pow(yi - fitted[i], 2), 0);

  // Weighted version for Q
  const wi2 = vi.map(v => 1 / v);
  const W2 = diagonalMatrix(wi2);
  const XtWX = matrixMultiply(matrixMultiply(transpose(X), W2), X);
  const XtWX_inv = invertMatrix(XtWX);
  const betaW = matrixVectorMultiply(XtWX_inv, matrixVectorMultiply(matrixMultiply(transpose(X), W2), y));
  const fittedW = matrixVectorMultiply(X, betaW);
  const Q = y.reduce((sum, yi, i) => sum + wi2[i] * Math.pow(yi - fittedW[i], 2), 0);

  // C statistic
  const sumWi = wi2.reduce((a, b) => a + b, 0);
  const sumWi2 = wi2.reduce((a, b) => a + b * b, 0);

  // Trace terms for meta-regression
  const traceWXXtWX_inv = trace(matrixMultiply(W2, matrixMultiply(X, matrixMultiply(XtWX_inv, transpose(X)))));
  const C = sumWi - traceWXXtWX_inv;

  return Math.max(0, (Q - (k - p)) / C);
}

/**
 * REML estimation for meta-regression tau²
 */
function estimateTau2REML(y, X, vi, maxIter = 100, tol = 1e-6) {
  let tau2 = estimateTau2MOM(y, X, vi);
  const k = y.length;
  const p = X[0].length;

  for (let iter = 0; iter < maxIter; iter++) {
    const wi = vi.map(v => 1 / (v + tau2));
    const W = diagonalMatrix(wi);

    // P matrix: P = W - W*X*(X'WX)^-1*X'*W
    const XtWX = matrixMultiply(matrixMultiply(transpose(X), W), X);
    const XtWX_inv = invertMatrix(XtWX);
    const P = calculatePMatrix(W, X, XtWX_inv);

    // REML score: dl/dtau2 = -0.5 * tr(P) + 0.5 * y'P²y
    const Py = matrixVectorMultiply(P, y);
    const yPPy = dotProduct(Py, Py);
    const trP = trace(P);
    const score = -0.5 * trP + 0.5 * yPPy;

    // Fisher information: -0.5 * tr(P²)
    const P2 = matrixMultiply(P, P);
    const trP2 = trace(P2);
    const fisher = 0.5 * trP2;

    // Newton-Raphson update
    const tau2_new = Math.max(0, tau2 + score / fisher);

    if (Math.abs(tau2_new - tau2) < tol) {
      return tau2_new;
    }
    tau2 = tau2_new;
  }

  return tau2;
}

// ============================================================================
// THREE-LEVEL META-ANALYSIS
// For nested effect sizes (e.g., multiple outcomes within studies)
// ============================================================================

/**
 * Three-level meta-analysis
 * Level 1: Sampling error (known variances)
 * Level 2: Within-study heterogeneity (τ²_within)
 * Level 3: Between-study heterogeneity (τ²_between)
 *
 * @param {Array} studies - Array of { yi, vi, studyId, ... }
 */
export function threeLevelMeta(studies, options = {}) {
  const { maxIter = 100, tol = 1e-6 } = options;

  // Group by study
  const studyGroups = {};
  studies.forEach((s, i) => {
    const sid = s.studyId || s.clusterId;
    if (!studyGroups[sid]) {
      studyGroups[sid] = { effects: [], indices: [] };
    }
    studyGroups[sid].effects.push(s);
    studyGroups[sid].indices.push(i);
  });

  const studyIds = Object.keys(studyGroups);
  const m = studyIds.length;  // Number of studies
  const n = studies.length;   // Total effects

  if (m < 2) {
    return { error: 'Need at least 2 studies for 3-level model' };
  }

  // Extract data
  const y = studies.map(s => s.yi);
  const vi = studies.map(s => s.vi);

  // Initial estimates from 2-level model
  let tau2_between = 0.1;
  let tau2_within = 0.1;

  // REML estimation via profile likelihood
  for (let iter = 0; iter < maxIter; iter++) {
    const { mu, tau2_b_new, tau2_w_new } =
      threeLevelREMLStep(y, vi, studyGroups, studyIds, tau2_between, tau2_within);

    if (Math.abs(tau2_b_new - tau2_between) < tol &&
        Math.abs(tau2_w_new - tau2_within) < tol) {
      tau2_between = tau2_b_new;
      tau2_within = tau2_w_new;
      break;
    }

    tau2_between = tau2_b_new;
    tau2_within = tau2_w_new;
  }

  // Final estimates
  const V = constructThreeLevelV(vi, studyGroups, studyIds, tau2_between, tau2_within);
  const V_inv = invertMatrix(V);
  const ones = y.map(() => 1);

  const sumV_inv = ones.reduce((sum, _, i) => {
    return sum + ones.reduce((s2, _, j) => s2 + V_inv[i][j], 0);
  }, 0);

  const mu = ones.reduce((sum, _, i) => {
    return sum + y.reduce((s2, yj, j) => s2 + V_inv[i][j] * yj, 0);
  }, 0) / sumV_inv;

  const se = Math.sqrt(1 / sumV_inv);

  // Variance decomposition
  const typicalVi = vi.reduce((a, b) => a + b, 0) / n;
  const totalVar = tau2_between + tau2_within + typicalVi;
  const I2_within = (tau2_within / totalVar) * 100;
  const I2_between = (tau2_between / totalVar) * 100;
  const I2_total = ((tau2_within + tau2_between) / totalVar) * 100;

  // Confidence interval
  const tCrit = tQuantile(0.975, m - 1);

  return {
    method: 'Three-level RE',
    estimate: mu,
    se: se,
    ci_lower: mu - tCrit * se,
    ci_upper: mu + tCrit * se,

    variance: {
      tau2_within: tau2_within,
      tau2_between: tau2_between,
      tau_within: Math.sqrt(tau2_within),
      tau_between: Math.sqrt(tau2_between)
    },

    heterogeneity: {
      I2_within: I2_within,
      I2_between: I2_between,
      I2_total: I2_total
    },

    nStudies: m,
    nEffects: n,
    effectsPerStudy: n / m
  };
}

function threeLevelREMLStep(y, vi, studyGroups, studyIds, tau2_b, tau2_w) {
  // Construct V matrix
  const V = constructThreeLevelV(vi, studyGroups, studyIds, tau2_b, tau2_w);
  const V_inv = invertMatrix(V);
  const n = y.length;
  const ones = y.map(() => 1);

  // Estimate mu
  let sum1 = 0, sum2 = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      sum1 += V_inv[i][j];
      sum2 += V_inv[i][j] * y[j];
    }
  }
  const mu = sum2 / sum1;

  // Residuals
  const r = y.map(yi => yi - mu);

  // P matrix
  const P = calculatePMatrix3L(V_inv, sum1);

  // Derivatives of V w.r.t. tau2_between and tau2_within
  const { dV_dtau2_b, dV_dtau2_w } =
    derivativesThreeLevelV(vi, studyGroups, studyIds, tau2_b, tau2_w);

  // REML score equations
  const Pr = matrixVectorMultiply(P, r);

  // Score for tau2_between
  const P_dVb = matrixMultiply(P, dV_dtau2_b);
  const score_b = -0.5 * trace(P_dVb) + 0.5 * quadraticForm(r, matrixMultiply(P, matrixMultiply(dV_dtau2_b, P)), r);

  // Score for tau2_within
  const P_dVw = matrixMultiply(P, dV_dtau2_w);
  const score_w = -0.5 * trace(P_dVw) + 0.5 * quadraticForm(r, matrixMultiply(P, matrixMultiply(dV_dtau2_w, P)), r);

  // Fisher information (simplified - diagonal approximation)
  const I_bb = 0.5 * trace(matrixMultiply(P_dVb, P_dVb));
  const I_ww = 0.5 * trace(matrixMultiply(P_dVw, P_dVw));

  // Updates
  const tau2_b_new = Math.max(0, tau2_b + score_b / I_bb);
  const tau2_w_new = Math.max(0, tau2_w + score_w / I_ww);

  return { mu, tau2_b_new, tau2_w_new };
}

function constructThreeLevelV(vi, studyGroups, studyIds, tau2_b, tau2_w) {
  const n = vi.length;
  const V = createZeroMatrix(n, n);

  // Diagonal: vi + tau2_within + tau2_between
  for (let i = 0; i < n; i++) {
    V[i][i] = vi[i] + tau2_w + tau2_b;
  }

  // Off-diagonal: tau2_between for effects within same study
  studyIds.forEach(sid => {
    const indices = studyGroups[sid].indices;
    for (let i = 0; i < indices.length; i++) {
      for (let j = i + 1; j < indices.length; j++) {
        V[indices[i]][indices[j]] = tau2_b;
        V[indices[j]][indices[i]] = tau2_b;
      }
    }
  });

  return V;
}

// ============================================================================
// FRAGILITY INDEX FOR META-ANALYSIS
// Minimum number of events to reverse statistical significance
// ============================================================================

/**
 * Calculate fragility index for meta-analysis of binary outcomes
 *
 * @param {Array} studies - Array of { a, b, c, d } 2x2 tables
 * @param {object} pooledResult - { estimate, p, significant }
 * @param {object} options - { alpha: 0.05, direction: 'auto' }
 */
export function fragilityIndex(studies, pooledResult, options = {}) {
  const { alpha = 0.05, maxIterations = 1000 } = options;

  // Only for binary outcomes with 2x2 tables
  const validStudies = studies.filter(s =>
    s.a !== undefined && s.b !== undefined &&
    s.c !== undefined && s.d !== undefined
  );

  if (validStudies.length === 0) {
    return { error: 'No valid 2x2 tables for fragility analysis' };
  }

  const isSignificant = pooledResult.p < alpha;
  const effectDirection = pooledResult.estimate > 0 ? 'positive' : 'negative';

  // Clone studies for modification
  let modifiedStudies = validStudies.map(s => ({ ...s }));
  let fragility = 0;
  let converged = false;

  for (let iter = 0; iter < maxIterations; iter++) {
    // Try moving one event in each study to find minimum change
    let bestChange = null;
    let bestPValue = isSignificant ? 0 : 1;

    for (let i = 0; i < modifiedStudies.length; i++) {
      const study = modifiedStudies[i];

      // Try moving event from treatment to control (reduces treatment effect)
      if (study.a > 0 && study.d > 0) {
        const testStudies = modifiedStudies.map((s, j) => {
          if (j === i) {
            return { ...s, a: s.a - 1, b: s.b + 1 };  // Event to non-event in treatment
          }
          return s;
        });
        const testResult = quickPooledOR(testStudies);

        if (isSignificant && testResult.p >= alpha) {
          bestChange = { studyIdx: i, type: 'a_to_b' };
          converged = true;
          break;
        } else if (!isSignificant && testResult.p < alpha) {
          bestChange = { studyIdx: i, type: 'a_to_b' };
          converged = true;
          break;
        }

        if (isSignificant ? testResult.p > bestPValue : testResult.p < bestPValue) {
          bestPValue = testResult.p;
          bestChange = { studyIdx: i, type: 'a_to_b' };
        }
      }

      // Try moving event in control (increases treatment effect)
      if (study.c > 0 && study.b > 0) {
        const testStudies = modifiedStudies.map((s, j) => {
          if (j === i) {
            return { ...s, c: s.c - 1, d: s.d + 1 };
          }
          return s;
        });
        const testResult = quickPooledOR(testStudies);

        if (isSignificant && testResult.p >= alpha) {
          bestChange = { studyIdx: i, type: 'c_to_d' };
          converged = true;
          break;
        }

        if (isSignificant ? testResult.p > bestPValue : testResult.p < bestPValue) {
          bestPValue = testResult.p;
          bestChange = { studyIdx: i, type: 'c_to_d' };
        }
      }
    }

    if (converged || !bestChange) break;

    // Apply best change
    const idx = bestChange.studyIdx;
    if (bestChange.type === 'a_to_b') {
      modifiedStudies[idx].a--;
      modifiedStudies[idx].b++;
    } else {
      modifiedStudies[idx].c--;
      modifiedStudies[idx].d++;
    }

    fragility++;

    // Check if we've reversed significance
    const currentResult = quickPooledOR(modifiedStudies);
    if ((isSignificant && currentResult.p >= alpha) ||
        (!isSignificant && currentResult.p < alpha)) {
      converged = true;
      break;
    }
  }

  // Calculate fragility quotient
  const totalN = validStudies.reduce((sum, s) => sum + s.a + s.b + s.c + s.d, 0);
  const fragility_quotient = fragility / totalN;

  return {
    fragility_index: converged ? fragility : null,
    fragility_quotient: converged ? fragility_quotient : null,
    converged: converged,
    direction: isSignificant ? 'to_nonsignificant' : 'to_significant',
    original_p: pooledResult.p,
    original_significant: isSignificant,
    total_n: totalN,
    interpretation: interpretFragility(fragility, totalN)
  };
}

function quickPooledOR(studies) {
  // Mantel-Haenszel OR for speed
  let sumAD_N = 0, sumBC_N = 0;
  let sumVarMH = 0;

  studies.forEach(s => {
    const n = s.a + s.b + s.c + s.d;
    if (n > 0) {
      sumAD_N += (s.a * s.d) / n;
      sumBC_N += (s.b * s.c) / n;
    }
  });

  if (sumBC_N === 0) return { or: Infinity, p: 0 };
  if (sumAD_N === 0) return { or: 0, p: 0 };

  const orMH = sumAD_N / sumBC_N;
  const logOR = Math.log(orMH);

  // Variance
  studies.forEach(s => {
    const n = s.a + s.b + s.c + s.d;
    const n1 = s.a + s.b;
    const n2 = s.c + s.d;
    if (n > 0 && n1 > 0 && n2 > 0) {
      sumVarMH += (s.a + s.d) * s.a * s.d / (n * n) / (sumAD_N * sumAD_N) +
                  ((s.a + s.d) * s.b * s.c + (s.b + s.c) * s.a * s.d) / (n * n) / (sumAD_N * sumBC_N) / 2 +
                  (s.b + s.c) * s.b * s.c / (n * n) / (sumBC_N * sumBC_N);
    }
  });

  const se = Math.sqrt(sumVarMH);
  const z = logOR / se;
  const p = 2 * (1 - normalCDF(Math.abs(z)));

  return { or: orMH, logOR, se, z, p };
}

function interpretFragility(fi, totalN) {
  if (fi === null) return 'Could not determine fragility';
  if (fi <= 3) return 'Very fragile - result could easily be reversed';
  if (fi <= 10) return 'Somewhat fragile - moderate confidence';
  if (fi <= 25) return 'Moderately robust';
  return 'Highly robust - many events would need to change';
}

// ============================================================================
// EXPECTED PROPORTION IN CLINICAL RANGES (2025 METHOD)
// Beyond prediction intervals: what proportion of effects are clinically meaningful?
// Reference: BMC Medical Research Methodology 2025
// ============================================================================

/**
 * Calculate expected proportion of comparable studies with effects
 * in clinically relevant ranges
 *
 * @param {object} pooledResult - { estimate, tau2, se }
 * @param {object} thresholds - { mcid: 0.2, harm: -0.2 }
 */
export function expectedProportionClinical(pooledResult, thresholds = {}) {
  const {
    mcid = null,        // Minimal clinically important difference
    harm = null,        // Harm threshold
    benefit = null,     // Benefit threshold
    nullValue = 0       // Value indicating no effect
  } = thresholds;

  const { estimate, tau2, tau, se } = pooledResult;
  const sigma = tau || Math.sqrt(tau2 || 0);

  if (sigma <= 0) {
    // No heterogeneity - all effects equal pooled estimate
    return {
      method: 'Expected proportion (no heterogeneity)',
      proportions: {
        above_mcid: mcid !== null ? (estimate > mcid ? 1 : 0) : null,
        below_harm: harm !== null ? (estimate < harm ? 1 : 0) : null,
        beneficial: benefit !== null ? (estimate > benefit ? 1 : 0) : null,
        harmful: harm !== null ? (estimate < harm ? 1 : 0) : null,
        null_to_benefit: mcid !== null ?
          (estimate > nullValue && estimate <= mcid ? 1 : 0) : null
      },
      interpretation: 'No heterogeneity detected'
    };
  }

  // With heterogeneity, effects follow N(μ, τ²)
  const results = {};

  // Proportion exceeding MCID (clinically meaningful benefit)
  if (mcid !== null) {
    // P(θ_new > mcid) = 1 - Φ((mcid - μ) / τ)
    results.above_mcid = 1 - normalCDF((mcid - estimate) / sigma);
    results.above_mcid_pct = results.above_mcid * 100;
  }

  // Proportion below harm threshold
  if (harm !== null) {
    results.below_harm = normalCDF((harm - estimate) / sigma);
    results.below_harm_pct = results.below_harm * 100;
  }

  // Proportion in "clinically trivial" range (near null)
  if (mcid !== null && harm !== null) {
    const lower = harm;
    const upper = mcid;
    results.trivial = normalCDF((upper - estimate) / sigma) -
                      normalCDF((lower - estimate) / sigma);
    results.trivial_pct = results.trivial * 100;
  }

  // Proportion with any benefit (above null)
  results.any_benefit = 1 - normalCDF((nullValue - estimate) / sigma);
  results.any_benefit_pct = results.any_benefit * 100;

  // Proportion with any harm (below null)
  results.any_harm = normalCDF((nullValue - estimate) / sigma);
  results.any_harm_pct = results.any_harm * 100;

  // Probability of clinically meaningful effect in either direction
  if (mcid !== null && harm !== null) {
    results.clinically_important = results.above_mcid + results.below_harm;
    results.clinically_important_pct = results.clinically_important * 100;
  }

  return {
    method: 'Expected proportion in clinical ranges',
    pooled_estimate: estimate,
    tau: sigma,
    thresholds: { mcid, harm, benefit, nullValue },
    proportions: results,
    interpretation: generateClinicalInterpretation(results, thresholds)
  };
}

function generateClinicalInterpretation(results, thresholds) {
  const parts = [];

  if (results.above_mcid !== undefined) {
    parts.push(`${(results.above_mcid * 100).toFixed(1)}% of comparable settings would show clinically meaningful benefit`);
  }

  if (results.below_harm !== undefined) {
    parts.push(`${(results.below_harm * 100).toFixed(1)}% would show clinically meaningful harm`);
  }

  if (results.trivial !== undefined) {
    parts.push(`${(results.trivial * 100).toFixed(1)}% would show trivial effects`);
  }

  return parts.join('; ');
}

// ============================================================================
// PET-PEESE PUBLICATION BIAS
// Precision-Effect Test and Precision-Effect Estimate with Standard Error
// Reference: Stanley & Doucouliagos (2014)
// ============================================================================

/**
 * PET-PEESE publication bias adjustment
 * Step 1: PET regression y = β₀ + β₁*SE + ε
 * Step 2: If β₀ significant, use PEESE (y = β₀ + β₁*SE² + ε)
 *
 * @param {Array} studies - Array of { yi, vi } or { yi, se }
 */
export function petPeese(studies, options = {}) {
  const { alpha = 0.05, weightByPrecision = true } = options;

  const validStudies = studies.filter(s =>
    s.yi !== null && (s.vi !== null || s.se !== null) &&
    (s.vi > 0 || s.se > 0)
  ).map(s => ({
    yi: s.yi,
    se: s.se || Math.sqrt(s.vi),
    vi: s.vi || (s.se * s.se)
  }));

  const k = validStudies.length;
  if (k < 3) {
    return { error: 'Need at least 3 studies for PET-PEESE' };
  }

  // PET: y = β₀ + β₁*SE
  const petResult = runWLS(
    validStudies.map(s => s.yi),
    validStudies.map(s => [1, s.se]),
    weightByPrecision ? validStudies.map(s => 1 / s.vi) : null
  );

  const pet_intercept = petResult.beta[0];
  const pet_slope = petResult.beta[1];
  const pet_se_intercept = Math.sqrt(petResult.vcov[0][0]);
  const pet_se_slope = Math.sqrt(petResult.vcov[1][1]);
  const pet_t = pet_intercept / pet_se_intercept;
  const pet_p = 2 * (1 - tCDF(Math.abs(pet_t), k - 2));

  // PEESE: y = β₀ + β₁*SE²
  const peeseResult = runWLS(
    validStudies.map(s => s.yi),
    validStudies.map(s => [1, s.vi]),  // SE² = vi
    weightByPrecision ? validStudies.map(s => 1 / s.vi) : null
  );

  const peese_intercept = peeseResult.beta[0];
  const peese_slope = peeseResult.beta[1];
  const peese_se_intercept = Math.sqrt(peeseResult.vcov[0][0]);
  const peese_se_slope = Math.sqrt(peeseResult.vcov[1][1]);
  const peese_t = peese_intercept / peese_se_intercept;
  const peese_p = 2 * (1 - tCDF(Math.abs(peese_t), k - 2));

  // Decision rule: use PEESE if PET intercept is significant
  const usePeese = pet_p < alpha;
  const finalEstimate = usePeese ? peese_intercept : pet_intercept;
  const finalSE = usePeese ? peese_se_intercept : pet_se_intercept;

  const tCrit = tQuantile(1 - alpha / 2, k - 2);

  return {
    method: 'PET-PEESE',
    k: k,

    pet: {
      intercept: pet_intercept,
      se_intercept: pet_se_intercept,
      ci_lower: pet_intercept - tCrit * pet_se_intercept,
      ci_upper: pet_intercept + tCrit * pet_se_intercept,
      t: pet_t,
      p: pet_p,
      slope: pet_slope,
      se_slope: pet_se_slope,
      significant: pet_p < alpha
    },

    peese: {
      intercept: peese_intercept,
      se_intercept: peese_se_intercept,
      ci_lower: peese_intercept - tCrit * peese_se_intercept,
      ci_upper: peese_intercept + tCrit * peese_se_intercept,
      t: peese_t,
      p: peese_p,
      slope: peese_slope,
      se_slope: peese_se_slope
    },

    recommended: {
      method: usePeese ? 'PEESE' : 'PET',
      estimate: finalEstimate,
      se: finalSE,
      ci_lower: finalEstimate - tCrit * finalSE,
      ci_upper: finalEstimate + tCrit * finalSE,
      rationale: usePeese ?
        'PET intercept significant → true effect likely exists → use PEESE' :
        'PET intercept not significant → no clear effect → use PET (may be zero)'
    },

    publicationBias: {
      detected: pet_slope > 0 && pet_p < alpha,
      direction: pet_slope > 0 ? 'small studies favor treatment' : 'small studies favor control',
      interpretation: pet_slope > 0 && pet_p < alpha ?
        'Evidence of small-study effects suggesting possible publication bias' :
        'No clear evidence of small-study effects'
    }
  };
}

/**
 * Weighted least squares regression
 */
function runWLS(y, X, weights = null) {
  const n = y.length;
  const p = X[0].length;

  const w = weights || y.map(() => 1);
  const W = diagonalMatrix(w);

  const XtW = matrixMultiply(transpose(X), W);
  const XtWX = matrixMultiply(XtW, X);
  const XtWX_inv = invertMatrix(XtWX);
  const XtWy = matrixVectorMultiply(XtW, y);
  const beta = matrixVectorMultiply(XtWX_inv, XtWy);

  // Residuals
  const fitted = matrixVectorMultiply(X, beta);
  const residuals = y.map((yi, i) => yi - fitted[i]);

  // Residual variance
  const RSS = residuals.reduce((sum, r, i) => sum + w[i] * r * r, 0);
  const sigma2 = RSS / (n - p);

  // Variance-covariance matrix
  const vcov = scaleMatrix(XtWX_inv, sigma2);

  return { beta, vcov, residuals, sigma2 };
}

// ============================================================================
// VEVEA-HEDGES SELECTION MODEL
// Step-function weight model for publication bias
// Reference: Vevea & Hedges (1995)
// ============================================================================

/**
 * Vevea-Hedges step-function selection model
 * Models probability of publication as step function of p-value
 *
 * @param {Array} studies - Array of { yi, vi }
 * @param {object} options - { steps: [0.025, 0.05, 0.5, 1], weights: 'moderate' }
 */
export function veveaHedgesSelection(studies, options = {}) {
  const {
    steps = [0.025, 0.05, 0.5, 1.0],  // p-value cutpoints
    weights = 'moderate',  // 'moderate', 'severe', 'custom'
    customWeights = null,
    estimate_weights = false  // If true, estimate weights; otherwise use preset
  } = options;

  const validStudies = studies.filter(s =>
    s.yi !== null && s.vi !== null && s.vi > 0
  ).map(s => ({
    yi: s.yi,
    vi: s.vi,
    se: Math.sqrt(s.vi)
  }));

  const k = validStudies.length;
  if (k < 5) {
    return { error: 'Need at least 5 studies for selection model' };
  }

  // Calculate two-sided p-values
  validStudies.forEach(s => {
    s.z = Math.abs(s.yi / s.se);
    s.p = 2 * (1 - normalCDF(s.z));
  });

  // Preset weight patterns
  const presetWeights = {
    none: [1, 1, 1, 1],
    moderate: [1, 0.75, 0.65, 0.5],
    severe: [1, 0.5, 0.4, 0.2],
    extreme: [1, 0.25, 0.1, 0.05]
  };

  const selectionWeights = customWeights || presetWeights[weights] || presetWeights.moderate;

  // Assign weights to each study based on p-value
  validStudies.forEach(s => {
    for (let i = 0; i < steps.length; i++) {
      if (s.p <= steps[i]) {
        s.selWeight = selectionWeights[i];
        s.pInterval = i;
        break;
      }
    }
  });

  // Unadjusted estimate (for comparison)
  const unadjusted = calculateWeightedMean(validStudies, s => 1 / s.vi);

  // Selection-adjusted estimate
  // Weight = (1/vi) * selection_weight
  const adjusted = calculateWeightedMean(validStudies, s => s.selWeight / s.vi);

  // Likelihood ratio test for publication bias
  const ll_unadj = logLikelihood(validStudies, unadjusted.estimate, unadjusted.tau2, () => 1);
  const ll_adj = logLikelihood(validStudies, adjusted.estimate, adjusted.tau2, s => s.selWeight);
  const lr_stat = -2 * (ll_unadj - ll_adj);
  const lr_df = selectionWeights.length - 1;
  const lr_p = 1 - chiSquareCDF(lr_stat, lr_df);

  return {
    method: 'Vevea-Hedges Selection Model',
    k: k,

    unadjusted: {
      estimate: unadjusted.estimate,
      se: unadjusted.se,
      ci_lower: unadjusted.ci_lower,
      ci_upper: unadjusted.ci_upper,
      tau2: unadjusted.tau2
    },

    adjusted: {
      estimate: adjusted.estimate,
      se: adjusted.se,
      ci_lower: adjusted.ci_lower,
      ci_upper: adjusted.ci_upper,
      tau2: adjusted.tau2
    },

    selection: {
      steps: steps,
      weights: selectionWeights,
      pattern: weights,
      studiesPerInterval: steps.map((_, i) =>
        validStudies.filter(s => s.pInterval === i).length
      )
    },

    biasTest: {
      lr_statistic: lr_stat,
      df: lr_df,
      p: lr_p,
      interpretation: lr_p < 0.05 ?
        'Evidence of selection bias (p < 0.05)' :
        'No significant evidence of selection bias'
    },

    sensitivity: {
      change: adjusted.estimate - unadjusted.estimate,
      percentChange: ((adjusted.estimate - unadjusted.estimate) / Math.abs(unadjusted.estimate)) * 100,
      interpretation: interpretSelectionSensitivity(unadjusted.estimate, adjusted.estimate)
    }
  };
}

function calculateWeightedMean(studies, weightFn) {
  // First estimate tau2
  const wi = studies.map(s => 1 / s.vi);
  const sumWi = wi.reduce((a, b) => a + b, 0);
  const sumWi2 = wi.reduce((a, b) => a + b * b, 0);
  const thetaFE = studies.reduce((sum, s, i) => sum + wi[i] * s.yi, 0) / sumWi;
  const Q = studies.reduce((sum, s, i) => sum + wi[i] * Math.pow(s.yi - thetaFE, 2), 0);
  const C = sumWi - sumWi2 / sumWi;
  const tau2 = Math.max(0, (Q - (studies.length - 1)) / C);

  // Weighted mean with selection weights
  const weights = studies.map(s => weightFn(s) / (s.vi + tau2));
  const sumW = weights.reduce((a, b) => a + b, 0);
  const estimate = studies.reduce((sum, s, i) => sum + weights[i] * s.yi, 0) / sumW;
  const variance = 1 / sumW;
  const se = Math.sqrt(variance);

  return {
    estimate,
    se,
    variance,
    ci_lower: estimate - 1.96 * se,
    ci_upper: estimate + 1.96 * se,
    tau2
  };
}

function logLikelihood(studies, mu, tau2, weightFn) {
  return studies.reduce((ll, s) => {
    const v = s.vi + tau2;
    const w = weightFn(s);
    return ll + Math.log(w) - 0.5 * Math.log(v) - 0.5 * Math.pow(s.yi - mu, 2) / v;
  }, 0);
}

function interpretSelectionSensitivity(orig, adj) {
  const change = Math.abs(adj - orig);
  const relChange = change / Math.abs(orig);

  if (relChange < 0.1) return 'Estimate robust to selection model adjustment';
  if (relChange < 0.25) return 'Moderate sensitivity to publication bias assumptions';
  return 'Substantial sensitivity - interpret with caution';
}

// ============================================================================
// LAN-DEMETS ALPHA-SPENDING FOR LIVING REVIEWS
// Sequential monitoring with proper type I error control
// ============================================================================

/**
 * Lan-DeMets alpha-spending function for living systematic reviews
 * Implements O'Brien-Fleming and Pocock-type boundaries
 *
 * @param {Array} analyses - Cumulative meta-analysis results at each timepoint
 * @param {object} options - { alpha, beta, spendingFunction, RIS }
 */
export function lanDeMetsSequential(analyses, options = {}) {
  const {
    alpha = 0.05,
    beta = 0.2,
    spendingFunction = 'OBF',  // 'OBF' (O'Brien-Fleming), 'Pocock', 'custom'
    RIS = null,  // Required information size
    heterogeneityAdjust = true
  } = options;

  if (!analyses || analyses.length === 0) {
    return { error: 'No analyses provided' };
  }

  // Calculate or use provided RIS
  let requiredIS = RIS;
  if (!requiredIS) {
    // Estimate RIS from anticipated effect
    const latestAnalysis = analyses[analyses.length - 1];
    requiredIS = calculateDARIS(
      latestAnalysis.estimate,
      alpha,
      beta,
      latestAnalysis.tau2 || 0
    );
  }

  // Calculate information fraction at each analysis
  const results = analyses.map((analysis, idx) => {
    const currentIS = analysis.totalN || analysis.informationSize ||
                      analyses.slice(0, idx + 1).reduce((sum, a) => sum + (a.n || 0), 0);

    const infoFraction = Math.min(1, currentIS / requiredIS);

    // Alpha spent up to this point
    const alphaSpent = alphaSpending(infoFraction, alpha, spendingFunction);

    // Incremental alpha for this look
    const prevSpent = idx > 0 ?
      alphaSpending(analyses[idx - 1].infoFraction || 0, alpha, spendingFunction) : 0;
    const incrementalAlpha = alphaSpent - prevSpent;

    // Critical boundaries
    const zBoundary = criticalBoundary(infoFraction, alpha, spendingFunction);
    const zFutility = futilityBoundary(infoFraction, beta, spendingFunction);

    // Test statistic
    const z = analysis.estimate / analysis.se;

    // Decision
    let decision = 'continue';
    if (Math.abs(z) >= zBoundary) {
      decision = 'reject_null';
    } else if (infoFraction >= 0.5 && Math.abs(z) <= zFutility) {
      decision = 'futility';
    }

    // Conditional power
    const conditionalPower = calculateConditionalPower(
      z, infoFraction, analysis.estimate, alpha, spendingFunction
    );

    return {
      analysisNumber: idx + 1,
      date: analysis.date,
      k: analysis.k,
      estimate: analysis.estimate,
      se: analysis.se,
      z: z,

      informationSize: currentIS,
      requiredIS: requiredIS,
      informationFraction: infoFraction,

      boundaries: {
        efficacy: zBoundary,
        futility: zFutility
      },

      alphaSpent: alphaSpent,
      incrementalAlpha: incrementalAlpha,
      alphaRemaining: alpha - alphaSpent,

      decision: decision,
      conditionalPower: conditionalPower,

      crossedEfficacy: Math.abs(z) >= zBoundary,
      crossedFutility: Math.abs(z) <= zFutility && infoFraction >= 0.5
    };
  });

  // Overall conclusion
  const latestResult = results[results.length - 1];
  let conclusion;
  if (latestResult.crossedEfficacy) {
    conclusion = 'Firm evidence reached - effect confirmed with controlled type I error';
  } else if (latestResult.informationFraction >= 1) {
    conclusion = 'Required information size reached - final analysis';
  } else if (latestResult.crossedFutility) {
    conclusion = 'Futility boundary crossed - consider stopping for futility';
  } else {
    conclusion = 'Continue monitoring - more information needed';
  }

  return {
    method: 'Lan-DeMets Sequential Analysis',
    spendingFunction: spendingFunction,
    alpha: alpha,
    beta: beta,
    requiredIS: requiredIS,

    analyses: results,

    currentStatus: {
      informationFraction: latestResult.informationFraction,
      alphaSpent: latestResult.alphaSpent,
      decision: latestResult.decision,
      conclusion: conclusion
    },

    recommendations: generateSequentialRecommendations(results, alpha)
  };
}

/**
 * Alpha-spending function
 */
function alphaSpending(t, alpha, type) {
  if (t <= 0) return 0;
  if (t >= 1) return alpha;

  switch (type) {
    case 'OBF':
      // O'Brien-Fleming: α(t) = 2 - 2Φ(z_{α/2} / √t)
      const zAlpha = normalQuantile(1 - alpha / 2);
      return 2 * (1 - normalCDF(zAlpha / Math.sqrt(t)));

    case 'Pocock':
      // Pocock: α(t) = α × ln(1 + (e-1)×t)
      return alpha * Math.log(1 + (Math.E - 1) * t);

    case 'linear':
      // Linear spending
      return alpha * t;

    default:
      return 2 * (1 - normalCDF(normalQuantile(1 - alpha / 2) / Math.sqrt(t)));
  }
}

/**
 * Critical boundary for efficacy
 */
function criticalBoundary(t, alpha, type) {
  if (t <= 0) return Infinity;
  if (t >= 1) return normalQuantile(1 - alpha / 2);

  switch (type) {
    case 'OBF':
      return normalQuantile(1 - alpha / 2) / Math.sqrt(t);

    case 'Pocock':
      // Constant boundary (approximately)
      return normalQuantile(1 - alpha / (2 * Math.log(1 + (Math.E - 1))));

    default:
      return normalQuantile(1 - alpha / 2) / Math.sqrt(t);
  }
}

/**
 * Futility boundary (beta-spending)
 */
function futilityBoundary(t, beta, type) {
  if (t < 0.5) return -Infinity;  // Don't stop for futility early

  switch (type) {
    case 'OBF':
      return -normalQuantile(1 - beta / 2) / Math.sqrt(t);

    case 'Pocock':
      return 0;  // Constant at 0 for Pocock

    default:
      return -normalQuantile(1 - beta / 2) / Math.sqrt(t);
  }
}

/**
 * Calculate DARIS (Diversity-Adjusted Required Information Size)
 */
function calculateDARIS(effect, alpha, beta, tau2) {
  const zAlpha = normalQuantile(1 - alpha / 2);
  const zBeta = normalQuantile(1 - beta);

  // Base RIS
  const baseRIS = 4 * Math.pow(zAlpha + zBeta, 2) / Math.pow(effect, 2);

  // Diversity adjustment for heterogeneity
  const D = 1 + tau2;  // Simplified; full formula uses I² properly

  return baseRIS * D;
}

/**
 * Conditional power calculation
 */
function calculateConditionalPower(zCurrent, tCurrent, effect, alpha, type) {
  if (tCurrent >= 1) return null;

  const zAlpha = normalQuantile(1 - alpha / 2);
  const tRemaining = 1 - tCurrent;

  // Under the alternative hypothesis
  const zFinal = zCurrent * Math.sqrt(tCurrent) +
                 (effect / Math.sqrt(1 / tCurrent)) * Math.sqrt(tRemaining);

  return normalCDF(zFinal - zAlpha) + normalCDF(-zFinal - zAlpha);
}

function generateSequentialRecommendations(results, alpha) {
  const latest = results[results.length - 1];
  const recommendations = [];

  if (latest.crossedEfficacy) {
    recommendations.push('Evidence sufficient to conclude effect exists');
    recommendations.push('Consider concluding the living review');
  } else if (latest.conditionalPower < 0.2 && latest.informationFraction > 0.5) {
    recommendations.push('Low conditional power - futility stopping may be warranted');
  } else if (latest.informationFraction < 0.5) {
    recommendations.push('Early in monitoring - continue accumulating evidence');
  } else {
    recommendations.push('Continue monitoring with next update');
    const nextUpdate = 1 - latest.informationFraction;
    recommendations.push(`Approximately ${(nextUpdate * 100).toFixed(0)}% more information needed`);
  }

  return recommendations;
}

// ============================================================================
// MATRIX UTILITIES
// ============================================================================

function groupByCluster(studies) {
  const clusters = {};
  studies.forEach((s, i) => {
    const cid = s.clusterId || s.studyId || 'default';
    if (!clusters[cid]) {
      clusters[cid] = { effects: [], indices: [] };
    }
    clusters[cid].effects.push(s);
    clusters[cid].indices.push(i);
  });
  return clusters;
}

function buildRVEMatrices(clusters, rho) {
  const clusterIds = Object.keys(clusters);
  let totalN = 0;
  clusterIds.forEach(cid => totalN += clusters[cid].effects.length);

  const X = [];
  const y = [];
  const vi = [];
  const clusterSizes = {};

  clusterIds.forEach(cid => {
    clusterSizes[cid] = clusters[cid].effects.length;
    clusters[cid].effects.forEach(s => {
      X.push([1]);  // Intercept only
      y.push(s.yi);
      vi.push(s.vi);
    });
  });

  // Construct V matrix with working correlation
  const V = createZeroMatrix(totalN, totalN);
  let offset = 0;

  clusterIds.forEach(cid => {
    const n = clusters[cid].effects.length;
    const clusterVi = clusters[cid].effects.map(s => s.vi);

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) {
          V[offset + i][offset + j] = clusterVi[i];
        } else {
          // Off-diagonal: assumed correlation × geometric mean of variances
          V[offset + i][offset + j] = rho * Math.sqrt(clusterVi[i] * clusterVi[j]);
        }
      }
    }
    offset += n;
  });

  // Weight matrix (inverse variance)
  const W = invertMatrix(V);

  return { X, y, W, V, clusterSizes };
}

function createZeroMatrix(rows, cols) {
  return Array(rows).fill(null).map(() => Array(cols).fill(0));
}

function identityMatrix(n) {
  const I = createZeroMatrix(n, n);
  for (let i = 0; i < n; i++) I[i][i] = 1;
  return I;
}

function diagonalMatrix(diag) {
  const n = diag.length;
  const D = createZeroMatrix(n, n);
  for (let i = 0; i < n; i++) D[i][i] = diag[i];
  return D;
}

function transpose(M) {
  const rows = M.length;
  const cols = M[0].length;
  const T = createZeroMatrix(cols, rows);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      T[j][i] = M[i][j];
    }
  }
  return T;
}

function matrixMultiply(A, B) {
  const rowsA = A.length;
  const colsA = A[0].length;
  const colsB = B[0].length;
  const C = createZeroMatrix(rowsA, colsB);

  for (let i = 0; i < rowsA; i++) {
    for (let j = 0; j < colsB; j++) {
      for (let k = 0; k < colsA; k++) {
        C[i][j] += A[i][k] * B[k][j];
      }
    }
  }
  return C;
}

function matrixVectorMultiply(M, v) {
  return M.map(row => row.reduce((sum, val, i) => sum + val * v[i], 0));
}

function addMatrices(A, B) {
  return A.map((row, i) => row.map((val, j) => val + B[i][j]));
}

function subtractMatrices(A, B) {
  return A.map((row, i) => row.map((val, j) => val - B[i][j]));
}

function scaleMatrix(M, c) {
  return M.map(row => row.map(val => val * c));
}

function trace(M) {
  return M.reduce((sum, row, i) => sum + row[i], 0);
}

function dotProduct(a, b) {
  return a.reduce((sum, val, i) => sum + val * b[i], 0);
}

function outerProduct(a, b) {
  return a.map(ai => b.map(bj => ai * bj));
}

function quadraticForm(x, A, y) {
  const Ay = matrixVectorMultiply(A, y);
  return dotProduct(x, Ay);
}

function extractSubmatrix(M, indices) {
  const n = indices.length;
  const sub = createZeroMatrix(n, n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      sub[i][j] = M[indices[i]][indices[j]];
    }
  }
  return sub;
}

function invertMatrix(M) {
  const n = M.length;
  const augmented = M.map((row, i) => {
    const newRow = [...row];
    for (let j = 0; j < n; j++) {
      newRow.push(i === j ? 1 : 0);
    }
    return newRow;
  });

  // Gaussian elimination
  for (let i = 0; i < n; i++) {
    // Find pivot
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) {
        maxRow = k;
      }
    }
    [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];

    const pivot = augmented[i][i];
    if (Math.abs(pivot) < 1e-10) {
      // Singular matrix - return identity as fallback
      return identityMatrix(n);
    }

    // Scale row
    for (let j = 0; j < 2 * n; j++) {
      augmented[i][j] /= pivot;
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

  // Extract inverse
  return augmented.map(row => row.slice(n));
}

function matrixSqrtInverse(M) {
  // For small matrices, use eigendecomposition approximation
  // For now, simple approximation: (I - H)^(-1/2) ≈ I + H/2 for small H
  const n = M.length;
  const I = identityMatrix(n);

  // Try direct computation for small matrices
  if (n <= 3) {
    const inv = invertMatrix(M);
    // Approximate sqrt of inverse
    const result = createZeroMatrix(n, n);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        result[i][j] = (I[i][j] + inv[i][j]) / 2;
      }
    }
    return result;
  }

  return I;  // Fallback
}

function calculateHatMatrix(X, W, XtWX_inv) {
  const XtWX_invXt = matrixMultiply(XtWX_inv, transpose(X));
  return matrixMultiply(matrixMultiply(X, XtWX_invXt), W);
}

function calculatePMatrix(W, X, XtWX_inv) {
  const WX = matrixMultiply(W, X);
  const WX_XtWX_inv = matrixMultiply(WX, XtWX_inv);
  const WX_XtWX_inv_Xt = matrixMultiply(WX_XtWX_inv, transpose(X));
  const WX_XtWX_inv_XtW = matrixMultiply(WX_XtWX_inv_Xt, W);
  return subtractMatrices(W, WX_XtWX_inv_XtW);
}

function calculatePMatrix3L(V_inv, sumV_inv) {
  const n = V_inv.length;
  const P = createZeroMatrix(n, n);

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let sum = 0;
      for (let l = 0; l < n; l++) {
        sum += V_inv[i][l];
      }
      P[i][j] = V_inv[i][j] - (sum * V_inv.reduce((s, row) => s + row[j], 0)) / sumV_inv;
    }
  }

  return P;
}

function derivativesThreeLevelV(vi, studyGroups, studyIds, tau2_b, tau2_w) {
  const n = vi.length;
  const dV_dtau2_b = createZeroMatrix(n, n);
  const dV_dtau2_w = createZeroMatrix(n, n);

  // dV/dtau2_between: 1 for all elements (diagonal and off-diagonal within study)
  studyIds.forEach(sid => {
    const indices = studyGroups[sid].indices;
    for (let i of indices) {
      for (let j of indices) {
        dV_dtau2_b[i][j] = 1;
      }
    }
  });

  // dV/dtau2_within: 1 only on diagonal
  for (let i = 0; i < n; i++) {
    dV_dtau2_w[i][i] = 1;
  }

  return { dV_dtau2_b, dV_dtau2_w };
}

function calculateQM(beta, XtWX) {
  // Q_M = β' (XtWX without intercept) β
  // Simplified: use only non-intercept coefficients
  if (beta.length <= 1) return 0;

  const betaMod = beta.slice(1);
  const XtWX_mod = XtWX.slice(1).map(row => row.slice(1));

  return quadraticForm(betaMod, XtWX_mod, betaMod);
}

// ============================================================================
// STATISTICAL DISTRIBUTION FUNCTIONS
// ============================================================================

function normalCDF(x) {
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

function normalQuantile(p) {
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

function tCDF(t, df) {
  const x = df / (df + t * t);
  const halfBeta = 0.5 * incompleteBeta(df / 2, 0.5, x);
  return t >= 0 ? 1 - halfBeta : halfBeta;
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

function tPDF(t, df) {
  const coef = Math.exp(gammaln((df + 1) / 2) - gammaln(df / 2)) /
               Math.sqrt(df * Math.PI);
  return coef * Math.pow(1 + t * t / df, -(df + 1) / 2);
}

function chiSquareCDF(x, df) {
  if (x <= 0) return 0;
  return gammainc(df / 2, x / 2);
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
  const eps = 1e-10;

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
    if (Math.abs(del - 1) < eps) break;
  }

  return h;
}

function gammaln(x) {
  const coef = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5
  ];

  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);

  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) {
    ser += coef[j] / ++y;
  }

  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

function gammainc(a, x) {
  if (x === 0) return 0;
  if (x < 0 || a <= 0) return NaN;

  if (x < a + 1) {
    let sum = 1 / a;
    let term = 1 / a;
    for (let n = 1; n < 100; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < 1e-10 * Math.abs(sum)) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - gammaln(a));
  } else {
    return 1 - gammainc_upper(a, x);
  }
}

function gammainc_upper(a, x) {
  const fpmin = 1e-30;
  let b = x + 1 - a;
  let c = 1 / fpmin;
  let d = 1 / b;
  let h = d;

  for (let i = 1; i < 100; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < fpmin) d = fpmin;
    c = b + an / c;
    if (Math.abs(c) < fpmin) c = fpmin;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-10) break;
  }

  return Math.exp(-x + a * Math.log(x) - gammaln(a)) * h;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Robust variance estimation
  robustVarianceEstimation,

  // Meta-regression
  metaRegression,

  // Three-level meta-analysis
  threeLevelMeta,

  // Fragility index
  fragilityIndex,

  // Expected proportion in clinical ranges
  expectedProportionClinical,

  // Publication bias
  petPeese,
  veveaHedgesSelection,

  // Sequential analysis
  lanDeMetsSequential
};
