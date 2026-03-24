/**
 * One-Stage IPD Meta-Analysis
 *
 * Implements mixed-effects models for individual patient data:
 * - Linear mixed models for continuous outcomes
 * - Generalized linear mixed models (logistic) for binary outcomes
 * - Cox frailty models for survival outcomes (approximation)
 *
 * References:
 * - Stewart LA, Tierney JF (2002). To IPD or not to IPD? BMJ.
 * - Debray TPA, et al. (2015). Get real in individual patient data meta-analysis.
 * - Riley RD, et al. (2010). Meta-analysis of individual participant data.
 */

/**
 * One-stage linear mixed model for continuous outcomes
 * Model: Y_ij = (β0 + u0j) + (β1 + u1j) * X_ij + ε_ij
 *
 * @param {Array} data - [{studyId, outcome, treatment, ...covariates}, ...]
 * @param {object} options - { randomSlope: true, covariates: ['age', 'sex'] }
 * @returns {object} Model results
 */
export function linearMixedModel(data, options = {}) {
  const {
    outcomeVar = 'outcome',
    treatmentVar = 'treatment',
    studyVar = 'studyId',
    covariates = [],
    randomSlope = true,
    maxIter = 100,
    tolerance = 1e-6
  } = options;

  // Validate data
  const validData = data.filter(d =>
    d[outcomeVar] !== null && d[outcomeVar] !== undefined &&
    d[treatmentVar] !== null && d[treatmentVar] !== undefined &&
    d[studyVar] !== null && d[studyVar] !== undefined
  );

  if (validData.length === 0) {
    return { error: 'No valid data' };
  }

  // Get unique studies
  const studies = [...new Set(validData.map(d => d[studyVar]))];
  const k = studies.length;

  if (k < 2) {
    return { error: 'Need at least 2 studies' };
  }

  // Separate data by study
  const studyData = {};
  studies.forEach(s => {
    studyData[s] = validData.filter(d => d[studyVar] === s);
  });

  // Initialize parameters
  let beta = [0, 0]; // Intercept, treatment effect
  covariates.forEach(() => beta.push(0));

  let sigma2 = 1; // Residual variance
  let tau2_intercept = 0.1; // Random intercept variance
  let tau2_slope = randomSlope ? 0.1 : 0; // Random slope variance
  let rho = 0; // Correlation between random effects

  // EM-like iteration
  let converged = false;
  let iter = 0;
  let logLik = -Infinity;

  for (iter = 0; iter < maxIter; iter++) {
    const prevLogLik = logLik;

    // E-step: Estimate random effects for each study
    const randomEffects = {};

    for (const s of studies) {
      const sData = studyData[s];
      const n_j = sData.length;

      // Design matrix for study j
      const X_j = sData.map(d => {
        const row = [1, d[treatmentVar]];
        covariates.forEach(cov => row.push(d[cov] || 0));
        return row;
      });

      const Y_j = sData.map(d => d[outcomeVar]);

      // Predicted fixed effects
      const fixedPred = X_j.map(x =>
        x.reduce((sum, val, idx) => sum + val * beta[idx], 0)
      );

      // Residuals
      const resid = Y_j.map((y, i) => y - fixedPred[i]);

      // BLUP for random effects (simplified)
      const sumTrt = sData.reduce((sum, d) => sum + d[treatmentVar], 0);
      const u0 = (tau2_intercept / (tau2_intercept + sigma2 / n_j)) *
                 (resid.reduce((a, b) => a + b, 0) / n_j);

      const u1 = randomSlope
        ? (tau2_slope / (tau2_slope + sigma2 / sumTrt)) *
          resid.reduce((sum, r, i) => sum + r * sData[i][treatmentVar], 0) / Math.max(1, sumTrt)
        : 0;

      randomEffects[s] = { u0, u1 };
    }

    // M-step: Update fixed effects and variance components

    // Update beta using weighted least squares
    const XtX = Array(beta.length).fill(null).map(() => Array(beta.length).fill(0));
    const XtY = Array(beta.length).fill(0);

    for (const s of studies) {
      const sData = studyData[s];
      const { u0, u1 } = randomEffects[s];

      for (const d of sData) {
        const x = [1, d[treatmentVar]];
        covariates.forEach(cov => x.push(d[cov] || 0));

        // Adjust for random effects
        const y_adj = d[outcomeVar] - u0 - u1 * d[treatmentVar];

        for (let i = 0; i < x.length; i++) {
          for (let j = 0; j < x.length; j++) {
            XtX[i][j] += x[i] * x[j];
          }
          XtY[i] += x[i] * y_adj;
        }
      }
    }

    // Solve normal equations
    const newBeta = solveLinearSystem(XtX, XtY);
    if (newBeta) {
      beta = newBeta;
    }

    // Update variance components
    let sse = 0;
    for (const s of studies) {
      const sData = studyData[s];
      const { u0, u1 } = randomEffects[s];

      for (const d of sData) {
        const x = [1, d[treatmentVar]];
        covariates.forEach(cov => x.push(d[cov] || 0));

        const pred = x.reduce((sum, val, idx) => sum + val * beta[idx], 0) +
                     u0 + u1 * d[treatmentVar];
        sse += Math.pow(d[outcomeVar] - pred, 2);
      }
    }
    sigma2 = sse / validData.length;

    // Update tau2 (simplified moment estimator)
    const u0_vals = studies.map(s => randomEffects[s].u0);
    tau2_intercept = Math.max(0, variance(u0_vals) - sigma2 / (validData.length / k));

    if (randomSlope) {
      const u1_vals = studies.map(s => randomEffects[s].u1);
      tau2_slope = Math.max(0, variance(u1_vals));
    }

    // Calculate log-likelihood (approximate)
    logLik = -0.5 * validData.length * Math.log(2 * Math.PI * sigma2) -
             0.5 * sse / sigma2 -
             0.5 * k * Math.log(tau2_intercept + 1e-10);

    if (Math.abs(logLik - prevLogLik) < tolerance) {
      converged = true;
      break;
    }
  }

  // Calculate standard errors using sandwich estimator
  const seFixed = calculateFixedEffectsSE(studyData, studies, beta, covariates, sigma2, treatmentVar, outcomeVar);

  // Treatment effect
  const treatmentEffect = beta[1];
  const treatmentSE = seFixed[1];
  const z = treatmentEffect / treatmentSE;
  const pValue = 2 * (1 - normalCDF(Math.abs(z)));

  // Heterogeneity
  const I2 = tau2_slope / (tau2_slope + sigma2 / (validData.length / k));

  return {
    model: 'one-stage-linear',
    k,
    n: validData.length,
    fixed: {
      intercept: { estimate: beta[0], se: seFixed[0] },
      treatment: {
        estimate: treatmentEffect,
        se: treatmentSE,
        z,
        pValue,
        ci_lower: treatmentEffect - 1.96 * treatmentSE,
        ci_upper: treatmentEffect + 1.96 * treatmentSE
      },
      covariates: covariates.map((cov, i) => ({
        name: cov,
        estimate: beta[2 + i],
        se: seFixed[2 + i]
      }))
    },
    random: {
      tau2_intercept,
      tau2_slope: randomSlope ? tau2_slope : null,
      tau_treatment: Math.sqrt(tau2_slope),
      I2: I2 * 100
    },
    residual: {
      sigma2,
      sigma: Math.sqrt(sigma2)
    },
    fit: {
      logLik,
      AIC: -2 * logLik + 2 * (beta.length + 2),
      BIC: -2 * logLik + Math.log(validData.length) * (beta.length + 2),
      converged,
      iterations: iter
    }
  };
}

/**
 * One-stage logistic mixed model for binary outcomes
 * Uses Laplace approximation for marginal likelihood
 *
 * @param {Array} data - [{studyId, event, treatment, ...}, ...]
 * @param {object} options
 */
export function logisticMixedModel(data, options = {}) {
  const {
    outcomeVar = 'event',
    treatmentVar = 'treatment',
    studyVar = 'studyId',
    covariates = [],
    randomSlope = true,
    maxIter = 50,
    tolerance = 1e-5
  } = options;

  const validData = data.filter(d =>
    (d[outcomeVar] === 0 || d[outcomeVar] === 1) &&
    d[treatmentVar] !== null &&
    d[studyVar] !== null
  );

  if (validData.length === 0) {
    return { error: 'No valid data' };
  }

  const studies = [...new Set(validData.map(d => d[studyVar]))];
  const k = studies.length;

  if (k < 2) {
    return { error: 'Need at least 2 studies' };
  }

  // Separate by study
  const studyData = {};
  studies.forEach(s => {
    studyData[s] = validData.filter(d => d[studyVar] === s);
  });

  // Initialize
  let beta = [0, 0];
  covariates.forEach(() => beta.push(0));
  let tau2_intercept = 0.5;
  let tau2_slope = randomSlope ? 0.1 : 0;

  // Penalized quasi-likelihood iteration
  let converged = false;
  let iter = 0;

  for (iter = 0; iter < maxIter; iter++) {
    const prevBeta = [...beta];

    // Update random effects
    const randomEffects = {};

    for (const s of studies) {
      const sData = studyData[s];

      // Newton-Raphson for study-specific random effects
      let u0 = 0, u1 = 0;

      for (let nr = 0; nr < 10; nr++) {
        let score0 = -u0 / tau2_intercept;
        let score1 = randomSlope ? -u1 / tau2_slope : 0;
        let info00 = 1 / tau2_intercept;
        let info11 = randomSlope ? 1 / tau2_slope : 1;
        let info01 = 0;

        for (const d of sData) {
          const x = [1, d[treatmentVar]];
          covariates.forEach(cov => x.push(d[cov] || 0));

          const eta = x.reduce((sum, v, i) => sum + v * beta[i], 0) + u0 + u1 * d[treatmentVar];
          const p = 1 / (1 + Math.exp(-Math.max(-20, Math.min(20, eta))));
          const w = p * (1 - p);

          score0 += d[outcomeVar] - p;
          score1 += (d[outcomeVar] - p) * d[treatmentVar];
          info00 += w;
          info11 += w * d[treatmentVar] * d[treatmentVar];
          info01 += w * d[treatmentVar];
        }

        // Update
        const det = info00 * info11 - info01 * info01;
        if (Math.abs(det) < 1e-10) break;

        u0 += (info11 * score0 - info01 * score1) / det;
        u1 += (info00 * score1 - info01 * score0) / det;
      }

      randomEffects[s] = { u0, u1 };
    }

    // Update fixed effects
    let score = Array(beta.length).fill(0);
    let info = Array(beta.length).fill(null).map(() => Array(beta.length).fill(0));

    for (const s of studies) {
      const sData = studyData[s];
      const { u0, u1 } = randomEffects[s];

      for (const d of sData) {
        const x = [1, d[treatmentVar]];
        covariates.forEach(cov => x.push(d[cov] || 0));

        const eta = x.reduce((sum, v, i) => sum + v * beta[i], 0) + u0 + u1 * d[treatmentVar];
        const p = 1 / (1 + Math.exp(-Math.max(-20, Math.min(20, eta))));
        const w = p * (1 - p);

        for (let i = 0; i < x.length; i++) {
          score[i] += x[i] * (d[outcomeVar] - p);
          for (let j = 0; j < x.length; j++) {
            info[i][j] += x[i] * x[j] * w;
          }
        }
      }
    }

    // Solve
    const delta = solveLinearSystem(info, score);
    if (delta) {
      beta = beta.map((b, i) => b + 0.5 * delta[i]); // Damped update
    }

    // Update variance components
    const u0_vals = studies.map(s => randomEffects[s].u0);
    const u1_vals = studies.map(s => randomEffects[s].u1);
    tau2_intercept = Math.max(0.01, variance(u0_vals));
    if (randomSlope) {
      tau2_slope = Math.max(0.01, variance(u1_vals));
    }

    // Check convergence
    const maxChange = Math.max(...beta.map((b, i) => Math.abs(b - prevBeta[i])));
    if (maxChange < tolerance) {
      converged = true;
      break;
    }
  }

  // Standard errors from information matrix
  let info = Array(beta.length).fill(null).map(() => Array(beta.length).fill(0));
  for (const s of studies) {
    const sData = studyData[s];

    for (const d of sData) {
      const x = [1, d[treatmentVar]];
      covariates.forEach(cov => x.push(d[cov] || 0));

      const eta = x.reduce((sum, v, i) => sum + v * beta[i], 0);
      const p = 1 / (1 + Math.exp(-Math.max(-20, Math.min(20, eta))));
      const w = p * (1 - p);

      for (let i = 0; i < x.length; i++) {
        for (let j = 0; j < x.length; j++) {
          info[i][j] += x[i] * x[j] * w;
        }
      }
    }
  }

  const invInfo = invertMatrix(info);
  const se = invInfo ? invInfo.map((row, i) => Math.sqrt(Math.max(0, row[i]))) : Array(beta.length).fill(NaN);

  const logOR = beta[1];
  const seLogOR = se[1];
  const z = logOR / seLogOR;
  const pValue = 2 * (1 - normalCDF(Math.abs(z)));

  return {
    model: 'one-stage-logistic',
    k,
    n: validData.length,
    nEvents: validData.filter(d => d[outcomeVar] === 1).length,
    fixed: {
      intercept: { estimate: beta[0], se: se[0] },
      treatment: {
        logOR,
        OR: Math.exp(logOR),
        se: seLogOR,
        z,
        pValue,
        ci_lower: Math.exp(logOR - 1.96 * seLogOR),
        ci_upper: Math.exp(logOR + 1.96 * seLogOR)
      },
      covariates: covariates.map((cov, i) => ({
        name: cov,
        logOR: beta[2 + i],
        OR: Math.exp(beta[2 + i]),
        se: se[2 + i]
      }))
    },
    random: {
      tau2_intercept,
      tau2_slope: randomSlope ? tau2_slope : null,
      tau_treatment: Math.sqrt(tau2_slope)
    },
    fit: {
      converged,
      iterations: iter
    }
  };
}

/**
 * One-stage survival model (Cox frailty approximation)
 * Uses piecewise exponential approximation
 *
 * @param {Array} data - [{studyId, time, event, treatment, ...}, ...]
 * @param {object} options
 */
export function survivalMixedModel(data, options = {}) {
  const {
    timeVar = 'time',
    eventVar = 'event',
    treatmentVar = 'treatment',
    studyVar = 'studyId',
    covariates = [],
    intervals = 10 // Number of time intervals for piecewise model
  } = options;

  const validData = data.filter(d =>
    d[timeVar] > 0 &&
    (d[eventVar] === 0 || d[eventVar] === 1) &&
    d[treatmentVar] !== null &&
    d[studyVar] !== null
  );

  if (validData.length === 0) {
    return { error: 'No valid data' };
  }

  const studies = [...new Set(validData.map(d => d[studyVar]))];
  const k = studies.length;

  // Create time intervals
  const times = validData.map(d => d[timeVar]);
  const maxTime = Math.max(...times);
  const intervalWidth = maxTime / intervals;
  const cutpoints = Array.from({ length: intervals }, (_, i) => (i + 1) * intervalWidth);

  // Expand data to piecewise exponential format
  const expandedData = [];
  for (const d of validData) {
    for (let i = 0; i < intervals; i++) {
      const tStart = i * intervalWidth;
      const tEnd = Math.min(d[timeVar], (i + 1) * intervalWidth);

      if (tEnd <= tStart) break;

      expandedData.push({
        ...d,
        interval: i,
        exposure: tEnd - tStart,
        y: (d[eventVar] === 1 && d[timeVar] <= (i + 1) * intervalWidth && d[timeVar] > tStart) ? 1 : 0
      });
    }
  }

  // Fit Poisson model with offset
  // This is equivalent to piecewise exponential survival model
  let beta = Array(1 + intervals + covariates.length).fill(0);
  beta[0] = 0; // Treatment effect

  let tau2 = 0.1; // Frailty variance

  const maxIter = 30;
  let converged = false;

  for (let iter = 0; iter < maxIter; iter++) {
    const prevBeta = [...beta];

    // E-step: frailties
    const frailties = {};
    for (const s of studies) {
      const sData = expandedData.filter(d => d[studyVar] === s);

      let sumY = 0, sumMu = 0;
      for (const d of sData) {
        sumY += d.y;

        let eta = beta[0] * d[treatmentVar] + beta[1 + d.interval];
        covariates.forEach((cov, j) => {
          eta += beta[1 + intervals + j] * (d[cov] || 0);
        });

        sumMu += d.exposure * Math.exp(eta);
      }

      // BLUP for frailty
      frailties[s] = (sumY + 1/tau2) / (sumMu + 1/tau2) - 1;
    }

    // M-step: fixed effects via IRLS
    let score = Array(beta.length).fill(0);
    let info = Array(beta.length).fill(null).map(() => Array(beta.length).fill(0));

    for (const d of expandedData) {
      const u = frailties[d[studyVar]] || 0;

      let eta = beta[0] * d[treatmentVar] + beta[1 + d.interval];
      covariates.forEach((cov, j) => {
        eta += beta[1 + intervals + j] * (d[cov] || 0);
      });

      const mu = d.exposure * Math.exp(eta + u);

      // Gradient
      const x = [d[treatmentVar]];
      for (let i = 0; i < intervals; i++) {
        x.push(d.interval === i ? 1 : 0);
      }
      covariates.forEach(cov => x.push(d[cov] || 0));

      for (let i = 0; i < x.length; i++) {
        score[i] += x[i] * (d.y - mu);
        for (let j = 0; j < x.length; j++) {
          info[i][j] += x[i] * x[j] * mu;
        }
      }
    }

    const delta = solveLinearSystem(info, score);
    if (delta) {
      beta = beta.map((b, i) => b + 0.3 * delta[i]);
    }

    // Update tau2
    const frailtyVals = Object.values(frailties);
    tau2 = Math.max(0.01, variance(frailtyVals));

    // Convergence
    const maxChange = Math.max(...beta.map((b, i) => Math.abs(b - prevBeta[i])));
    if (maxChange < 1e-4) {
      converged = true;
      break;
    }
  }

  // Standard error for treatment effect
  let info00 = 0;
  for (const d of expandedData) {
    let eta = beta[0] * d[treatmentVar] + beta[1 + d.interval];
    const mu = d.exposure * Math.exp(eta);
    info00 += d[treatmentVar] * d[treatmentVar] * mu;
  }
  const seTreatment = 1 / Math.sqrt(info00);

  const logHR = beta[0];
  const z = logHR / seTreatment;
  const pValue = 2 * (1 - normalCDF(Math.abs(z)));

  return {
    model: 'one-stage-survival',
    k,
    n: validData.length,
    nEvents: validData.filter(d => d[eventVar] === 1).length,
    treatment: {
      logHR,
      HR: Math.exp(logHR),
      se: seTreatment,
      z,
      pValue,
      ci_lower: Math.exp(logHR - 1.96 * seTreatment),
      ci_upper: Math.exp(logHR + 1.96 * seTreatment)
    },
    frailty: {
      tau2,
      tau: Math.sqrt(tau2)
    },
    baseline: cutpoints.map((t, i) => ({
      interval: i,
      time: t,
      logHazard: beta[1 + i]
    })),
    fit: {
      converged
    }
  };
}

// Helper functions

function solveLinearSystem(A, b) {
  const n = b.length;
  const aug = A.map((row, i) => [...row, b[i]]);

  // Gaussian elimination
  for (let i = 0; i < n; i++) {
    // Pivot
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(aug[k][i]) > Math.abs(aug[maxRow][i])) {
        maxRow = k;
      }
    }
    [aug[i], aug[maxRow]] = [aug[maxRow], aug[i]];

    if (Math.abs(aug[i][i]) < 1e-12) return null;

    for (let k = i + 1; k < n; k++) {
      const c = aug[k][i] / aug[i][i];
      for (let j = i; j <= n; j++) {
        aug[k][j] -= c * aug[i][j];
      }
    }
  }

  // Back substitution
  const x = Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = aug[i][n];
    for (let j = i + 1; j < n; j++) {
      x[i] -= aug[i][j] * x[j];
    }
    x[i] /= aug[i][i];
  }

  return x;
}

function invertMatrix(A) {
  const n = A.length;
  const aug = A.map((row, i) => {
    const newRow = [...row];
    for (let j = 0; j < n; j++) {
      newRow.push(i === j ? 1 : 0);
    }
    return newRow;
  });

  // Gaussian elimination
  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(aug[k][i]) > Math.abs(aug[maxRow][i])) {
        maxRow = k;
      }
    }
    [aug[i], aug[maxRow]] = [aug[maxRow], aug[i]];

    if (Math.abs(aug[i][i]) < 1e-12) return null;

    const pivot = aug[i][i];
    for (let j = 0; j < 2 * n; j++) {
      aug[i][j] /= pivot;
    }

    for (let k = 0; k < n; k++) {
      if (k !== i) {
        const c = aug[k][i];
        for (let j = 0; j < 2 * n; j++) {
          aug[k][j] -= c * aug[i][j];
        }
      }
    }
  }

  return aug.map(row => row.slice(n));
}

function variance(arr) {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  return arr.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / (arr.length - 1);
}

function calculateFixedEffectsSE(studyData, studies, beta, covariates, sigma2, treatmentVar, outcomeVar) {
  const p = beta.length;
  let XtX = Array(p).fill(null).map(() => Array(p).fill(0));

  for (const s of studies) {
    const sData = studyData[s];
    for (const d of sData) {
      const x = [1, d[treatmentVar]];
      covariates.forEach(cov => x.push(d[cov] || 0));

      for (let i = 0; i < p; i++) {
        for (let j = 0; j < p; j++) {
          XtX[i][j] += x[i] * x[j];
        }
      }
    }
  }

  const invXtX = invertMatrix(XtX);
  if (!invXtX) return Array(p).fill(NaN);

  return invXtX.map((row, i) => Math.sqrt(sigma2 * Math.max(0, row[i])));
}

function normalCDF(x) {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);

  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
}

export default {
  linearMixedModel,
  logisticMixedModel,
  survivalMixedModel
};
