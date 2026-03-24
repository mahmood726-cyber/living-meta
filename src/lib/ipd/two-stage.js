/**
 * Two-Stage IPD Meta-Analysis
 *
 * Stage 1: Analyze each study separately to obtain study-specific estimates
 * Stage 2: Pool estimates using standard meta-analysis methods
 *
 * Advantages:
 * - Computational simplicity
 * - Easy to add aggregate data studies
 * - Familiar interpretation
 *
 * References:
 * - Burke DL, et al. (2017). Meta-analysis using individual participant data.
 * - Riley RD, et al. (2010). Meta-analysis of individual participant data.
 */

import { derSimonianLaird, pauleMandel } from '../meta-dl.js';

/**
 * Two-stage analysis for continuous outcomes
 *
 * @param {Array} data - [{studyId, outcome, treatment, ...covariates}, ...]
 * @param {object} options
 * @returns {object} Stage 1 and Stage 2 results
 */
export function twoStageContinuous(data, options = {}) {
  const {
    outcomeVar = 'outcome',
    treatmentVar = 'treatment',
    studyVar = 'studyId',
    covariates = [],
    method = 'DL', // 'DL', 'PM', 'REML'
    hksj = true
  } = options;

  // Validate
  const validData = data.filter(d =>
    d[outcomeVar] !== null && d[outcomeVar] !== undefined &&
    d[treatmentVar] !== null && d[treatmentVar] !== undefined &&
    d[studyVar] !== null
  );

  if (validData.length === 0) {
    return { error: 'No valid data' };
  }

  // Get unique studies
  const studies = [...new Set(validData.map(d => d[studyVar]))];

  if (studies.length < 2) {
    return { error: 'Need at least 2 studies' };
  }

  // Stage 1: Study-specific analyses
  const stage1Results = [];

  for (const studyId of studies) {
    const studyData = validData.filter(d => d[studyVar] === studyId);

    // Separate by treatment
    const treatment = studyData.filter(d => d[treatmentVar] === 1);
    const control = studyData.filter(d => d[treatmentVar] === 0);

    if (treatment.length === 0 || control.length === 0) {
      continue;
    }

    // Calculate means and SDs
    const treatmentOutcomes = treatment.map(d => d[outcomeVar]);
    const controlOutcomes = control.map(d => d[outcomeVar]);

    const m1 = mean(treatmentOutcomes);
    const m2 = mean(controlOutcomes);
    const sd1 = sd(treatmentOutcomes);
    const sd2 = sd(controlOutcomes);
    const n1 = treatment.length;
    const n2 = control.length;

    // Mean difference
    const md = m1 - m2;
    const varMD = (sd1 * sd1) / n1 + (sd2 * sd2) / n2;
    const seMD = Math.sqrt(varMD);

    // Adjusted analysis with covariates (if requested)
    let adjustedMD = md;
    let adjustedVar = varMD;

    if (covariates.length > 0) {
      const regResult = linearRegression(studyData, outcomeVar, treatmentVar, covariates);
      if (regResult && regResult.treatment) {
        adjustedMD = regResult.treatment.estimate;
        adjustedVar = regResult.treatment.se * regResult.treatment.se;
      }
    }

    stage1Results.push({
      id: studyId,
      n: studyData.length,
      n_treatment: n1,
      n_control: n2,
      mean_treatment: m1,
      mean_control: m2,
      sd_treatment: sd1,
      sd_control: sd2,
      yi: covariates.length > 0 ? adjustedMD : md,
      vi: covariates.length > 0 ? adjustedVar : varMD,
      se: Math.sqrt(covariates.length > 0 ? adjustedVar : varMD),
      adjusted: covariates.length > 0
    });
  }

  if (stage1Results.length < 2) {
    return { error: 'Insufficient studies after filtering' };
  }

  // Stage 2: Meta-analysis
  const poolFn = method === 'PM' ? pauleMandel : derSimonianLaird;
  const stage2 = poolFn(stage1Results, { hksj });

  return {
    model: 'two-stage-continuous',
    stage1: stage1Results,
    stage2: {
      ...stage2,
      k: stage1Results.length,
      totalN: stage1Results.reduce((sum, s) => sum + s.n, 0),
      method: method === 'PM' ? 'Paule-Mandel' : 'DerSimonian-Laird'
    },
    summary: {
      estimate: stage2.theta,
      se: stage2.se,
      ci_lower: stage2.ci_lower,
      ci_upper: stage2.ci_upper,
      pValue: stage2.pValue,
      tau2: stage2.tau2,
      I2: stage2.I2,
      pi_lower: stage2.pi_lower,
      pi_upper: stage2.pi_upper
    }
  };
}

/**
 * Two-stage analysis for binary outcomes
 *
 * @param {Array} data - [{studyId, event, treatment, ...}, ...]
 * @param {object} options
 */
export function twoStageBinary(data, options = {}) {
  const {
    outcomeVar = 'event',
    treatmentVar = 'treatment',
    studyVar = 'studyId',
    measure = 'OR', // 'OR', 'RR', 'RD'
    method = 'DL',
    hksj = true,
    cc = 0.5 // Continuity correction
  } = options;

  const validData = data.filter(d =>
    (d[outcomeVar] === 0 || d[outcomeVar] === 1) &&
    (d[treatmentVar] === 0 || d[treatmentVar] === 1) &&
    d[studyVar] !== null
  );

  if (validData.length === 0) {
    return { error: 'No valid data' };
  }

  const studies = [...new Set(validData.map(d => d[studyVar]))];

  if (studies.length < 2) {
    return { error: 'Need at least 2 studies' };
  }

  // Stage 1
  const stage1Results = [];

  for (const studyId of studies) {
    const studyData = validData.filter(d => d[studyVar] === studyId);

    // 2x2 table
    let a = studyData.filter(d => d[treatmentVar] === 1 && d[outcomeVar] === 1).length;
    let b = studyData.filter(d => d[treatmentVar] === 1 && d[outcomeVar] === 0).length;
    let c = studyData.filter(d => d[treatmentVar] === 0 && d[outcomeVar] === 1).length;
    let d = studyData.filter(d => d[treatmentVar] === 0 && d[outcomeVar] === 0).length;

    const n1 = a + b;
    const n2 = c + d;

    if (n1 === 0 || n2 === 0) continue;

    // Apply continuity correction if needed
    let needsCC = (a === 0 || b === 0 || c === 0 || d === 0);
    if (needsCC && cc > 0) {
      a += cc; b += cc; c += cc; d += cc;
    }

    // Calculate effect measure
    let yi, vi;

    if (measure === 'OR') {
      if (a <= 0 || b <= 0 || c <= 0 || d <= 0) continue;
      yi = Math.log((a * d) / (b * c));
      vi = 1/a + 1/b + 1/c + 1/d;
    } else if (measure === 'RR') {
      if (a <= 0 || c <= 0) continue;
      const p1 = a / (a + b);
      const p2 = c / (c + d);
      yi = Math.log(p1 / p2);
      vi = (1 - p1) / a + (1 - p2) / c;
    } else { // RD
      const p1 = a / (a + b);
      const p2 = c / (c + d);
      yi = p1 - p2;
      vi = (p1 * (1 - p1)) / (a + b) + (p2 * (1 - p2)) / (c + d);
    }

    stage1Results.push({
      id: studyId,
      n: studyData.length,
      events_treatment: Math.round(a - (needsCC ? cc : 0)),
      n_treatment: n1,
      events_control: Math.round(c - (needsCC ? cc : 0)),
      n_control: n2,
      yi,
      vi,
      se: Math.sqrt(vi),
      needsCC
    });
  }

  if (stage1Results.length < 2) {
    return { error: 'Insufficient studies after filtering' };
  }

  // Stage 2
  const poolFn = method === 'PM' ? pauleMandel : derSimonianLaird;
  const stage2 = poolFn(stage1Results, { hksj });

  // Back-transform for OR/RR
  const isLogScale = measure !== 'RD';
  const estimate = isLogScale ? Math.exp(stage2.theta) : stage2.theta;
  const ci_lower = isLogScale ? Math.exp(stage2.ci_lower) : stage2.ci_lower;
  const ci_upper = isLogScale ? Math.exp(stage2.ci_upper) : stage2.ci_upper;

  return {
    model: 'two-stage-binary',
    measure,
    stage1: stage1Results,
    stage2: {
      ...stage2,
      k: stage1Results.length,
      totalN: stage1Results.reduce((sum, s) => sum + s.n, 0),
      totalEvents: stage1Results.reduce((sum, s) =>
        sum + s.events_treatment + s.events_control, 0),
      method: method === 'PM' ? 'Paule-Mandel' : 'DerSimonian-Laird'
    },
    summary: {
      estimate,
      logEstimate: stage2.theta,
      se: stage2.se,
      ci_lower,
      ci_upper,
      pValue: stage2.pValue,
      tau2: stage2.tau2,
      I2: stage2.I2,
      pi_lower: isLogScale ? Math.exp(stage2.pi_lower) : stage2.pi_lower,
      pi_upper: isLogScale ? Math.exp(stage2.pi_upper) : stage2.pi_upper
    }
  };
}

/**
 * Two-stage analysis for survival/time-to-event outcomes
 *
 * @param {Array} data - [{studyId, time, event, treatment, ...}, ...]
 * @param {object} options
 */
export function twoStageSurvival(data, options = {}) {
  const {
    timeVar = 'time',
    eventVar = 'event',
    treatmentVar = 'treatment',
    studyVar = 'studyId',
    method = 'DL',
    hksj = true
  } = options;

  const validData = data.filter(d =>
    d[timeVar] > 0 &&
    (d[eventVar] === 0 || d[eventVar] === 1) &&
    (d[treatmentVar] === 0 || d[treatmentVar] === 1) &&
    d[studyVar] !== null
  );

  if (validData.length === 0) {
    return { error: 'No valid data' };
  }

  const studies = [...new Set(validData.map(d => d[studyVar]))];

  if (studies.length < 2) {
    return { error: 'Need at least 2 studies' };
  }

  // Stage 1: Cox-like estimates per study
  const stage1Results = [];

  for (const studyId of studies) {
    const studyData = validData.filter(d => d[studyVar] === studyId);

    const treatment = studyData.filter(d => d[treatmentVar] === 1);
    const control = studyData.filter(d => d[treatmentVar] === 0);

    if (treatment.length === 0 || control.length === 0) continue;

    // Log-rank test approach
    const result = logRankHR(studyData, timeVar, eventVar, treatmentVar);

    if (result.error) continue;

    stage1Results.push({
      id: studyId,
      n: studyData.length,
      n_treatment: treatment.length,
      n_control: control.length,
      events_treatment: treatment.filter(d => d[eventVar] === 1).length,
      events_control: control.filter(d => d[eventVar] === 1).length,
      yi: result.logHR,
      vi: result.variance,
      se: result.se,
      hr: result.hr
    });
  }

  if (stage1Results.length < 2) {
    return { error: 'Insufficient studies after filtering' };
  }

  // Stage 2
  const poolFn = method === 'PM' ? pauleMandel : derSimonianLaird;
  const stage2 = poolFn(stage1Results, { hksj });

  return {
    model: 'two-stage-survival',
    stage1: stage1Results,
    stage2: {
      ...stage2,
      k: stage1Results.length,
      totalN: stage1Results.reduce((sum, s) => sum + s.n, 0),
      totalEvents: stage1Results.reduce((sum, s) =>
        sum + s.events_treatment + s.events_control, 0),
      method: method === 'PM' ? 'Paule-Mandel' : 'DerSimonian-Laird'
    },
    summary: {
      HR: Math.exp(stage2.theta),
      logHR: stage2.theta,
      se: stage2.se,
      ci_lower: Math.exp(stage2.ci_lower),
      ci_upper: Math.exp(stage2.ci_upper),
      pValue: stage2.pValue,
      tau2: stage2.tau2,
      I2: stage2.I2,
      pi_lower: Math.exp(stage2.pi_lower),
      pi_upper: Math.exp(stage2.pi_upper)
    }
  };
}

/**
 * Calculate hazard ratio from IPD using log-rank approach
 */
function logRankHR(data, timeVar, eventVar, treatmentVar) {
  // Get unique event times
  const eventTimes = [...new Set(
    data.filter(d => d[eventVar] === 1).map(d => d[timeVar])
  )].sort((a, b) => a - b);

  if (eventTimes.length === 0) {
    return { error: 'No events' };
  }

  let O1 = 0, E1 = 0, variance = 0;
  let nRisk1 = data.filter(d => d[treatmentVar] === 1).length;
  let nRisk0 = data.filter(d => d[treatmentVar] === 0).length;

  let processed1 = [], processed0 = [];

  for (const t of eventTimes) {
    // Events at this time
    const events1 = data.filter(d =>
      d[treatmentVar] === 1 && d[eventVar] === 1 && d[timeVar] === t
    ).length;
    const events0 = data.filter(d =>
      d[treatmentVar] === 0 && d[eventVar] === 1 && d[timeVar] === t
    ).length;

    const totalEvents = events1 + events0;
    const totalRisk = nRisk1 + nRisk0;

    if (totalRisk > 0 && totalEvents > 0) {
      const expected1 = (nRisk1 / totalRisk) * totalEvents;
      O1 += events1;
      E1 += expected1;

      if (totalRisk > 1) {
        variance += (nRisk1 * nRisk0 * totalEvents * (totalRisk - totalEvents)) /
                   (totalRisk * totalRisk * (totalRisk - 1));
      }
    }

    // Update at-risk
    nRisk1 -= data.filter(d => d[treatmentVar] === 1 && d[timeVar] === t).length;
    nRisk0 -= data.filter(d => d[treatmentVar] === 0 && d[timeVar] === t).length;
  }

  if (variance <= 0) {
    return { error: 'Zero variance' };
  }

  const logHR = (O1 - E1) / variance;
  const se = 1 / Math.sqrt(variance);

  return {
    logHR,
    hr: Math.exp(logHR),
    se,
    variance: se * se,
    observed: O1,
    expected: E1,
    z: logHR / se,
    pValue: 2 * (1 - normalCDF(Math.abs(logHR / se)))
  };
}

/**
 * Linear regression for covariate adjustment
 */
function linearRegression(data, outcomeVar, treatmentVar, covariates) {
  const n = data.length;
  const p = 2 + covariates.length; // Intercept + treatment + covariates

  // Build design matrix
  const X = data.map(d => {
    const row = [1, d[treatmentVar]];
    covariates.forEach(cov => row.push(d[cov] || 0));
    return row;
  });

  const Y = data.map(d => d[outcomeVar]);

  // XtX and XtY
  const XtX = Array(p).fill(null).map(() => Array(p).fill(0));
  const XtY = Array(p).fill(0);

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < p; j++) {
      for (let k = 0; k < p; k++) {
        XtX[j][k] += X[i][j] * X[i][k];
      }
      XtY[j] += X[i][j] * Y[i];
    }
  }

  // Solve
  const beta = solveLinearSystem(XtX, XtY);
  if (!beta) return null;

  // Calculate residual variance
  let sse = 0;
  for (let i = 0; i < n; i++) {
    const pred = X[i].reduce((sum, x, j) => sum + x * beta[j], 0);
    sse += Math.pow(Y[i] - pred, 2);
  }
  const sigma2 = sse / (n - p);

  // Standard errors
  const invXtX = invertMatrix(XtX);
  if (!invXtX) return null;

  const se = invXtX.map((row, i) => Math.sqrt(sigma2 * Math.max(0, row[i])));

  return {
    intercept: { estimate: beta[0], se: se[0] },
    treatment: { estimate: beta[1], se: se[1] },
    covariates: covariates.map((cov, i) => ({
      name: cov,
      estimate: beta[2 + i],
      se: se[2 + i]
    })),
    sigma2,
    r2: 1 - sse / data.reduce((sum, d) => {
      const ybar = mean(data.map(dd => dd[outcomeVar]));
      return sum + Math.pow(d[outcomeVar] - ybar, 2);
    }, 0)
  };
}

// Helper functions
function mean(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function sd(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((sum, x) => sum + Math.pow(x - m, 2), 0) / (arr.length - 1));
}

function solveLinearSystem(A, b) {
  const n = b.length;
  const aug = A.map((row, i) => [...row, b[i]]);

  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(aug[k][i]) > Math.abs(aug[maxRow][i])) maxRow = k;
    }
    [aug[i], aug[maxRow]] = [aug[maxRow], aug[i]];

    if (Math.abs(aug[i][i]) < 1e-12) return null;

    for (let k = i + 1; k < n; k++) {
      const c = aug[k][i] / aug[i][i];
      for (let j = i; j <= n; j++) aug[k][j] -= c * aug[i][j];
    }
  }

  const x = Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = aug[i][n];
    for (let j = i + 1; j < n; j++) x[i] -= aug[i][j] * x[j];
    x[i] /= aug[i][i];
  }
  return x;
}

function invertMatrix(A) {
  const n = A.length;
  const aug = A.map((row, i) => [...row, ...Array(n).fill(0).map((_, j) => i === j ? 1 : 0)]);

  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(aug[k][i]) > Math.abs(aug[maxRow][i])) maxRow = k;
    }
    [aug[i], aug[maxRow]] = [aug[maxRow], aug[i]];

    if (Math.abs(aug[i][i]) < 1e-12) return null;

    const pivot = aug[i][i];
    for (let j = 0; j < 2 * n; j++) aug[i][j] /= pivot;

    for (let k = 0; k < n; k++) {
      if (k !== i) {
        const c = aug[k][i];
        for (let j = 0; j < 2 * n; j++) aug[k][j] -= c * aug[i][j];
      }
    }
  }

  return aug.map(row => row.slice(n));
}

function normalCDF(x) {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);

  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
}

export default {
  twoStageContinuous,
  twoStageBinary,
  twoStageSurvival
};
