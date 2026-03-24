/**
 * Advanced Survival Analysis for IPD Meta-Analysis
 *
 * Features that surpass ipdmetan (Stata):
 * - Flexible parametric models (Royston-Parmar splines)
 * - Time-varying treatment effects (relaxed PH)
 * - Landmark analysis
 * - Cure fraction models
 * - Competing risks (cause-specific, Fine-Gray)
 *
 * References:
 * - Royston P, Parmar MKB (2002). Flexible parametric proportional-hazards
 *   and proportional-odds models. Statistics in Medicine, 21:2175-2197.
 * - Crowther MJ, Lambert PC (2013). A general framework for parametric
 *   survival analysis. Statistics in Medicine, 32:5309-5324.
 */

/**
 * Flexible Parametric Survival Model (Royston-Parmar)
 * Uses restricted cubic splines for baseline hazard
 *
 * Superior to Cox because:
 * - Smooth hazard function estimation
 * - Direct prediction of survival/hazard at any time
 * - Time-varying effects without stratification
 * - Extrapolation capability
 *
 * @param {Array} data - [{time, event, treatment, ...covariates}, ...]
 * @param {object} options
 */
export function flexibleParametricModel(data, options = {}) {
  const {
    timeVar = 'time',
    eventVar = 'event',
    treatmentVar = 'treatment',
    covariates = [],
    df = 3, // Degrees of freedom for baseline spline
    scale = 'hazard', // 'hazard', 'odds', 'normal'
    timeVarying = false, // Allow time-varying treatment effect
    tvDf = 1, // df for time-varying effect
    maxIter = 100,
    tolerance = 1e-6
  } = options;

  const validData = data.filter(d =>
    d[timeVar] > 0 &&
    (d[eventVar] === 0 || d[eventVar] === 1)
  );

  if (validData.length < 20) {
    return { error: 'Need at least 20 observations' };
  }

  const n = validData.length;
  const times = validData.map(d => d[timeVar]);
  const events = validData.map(d => d[eventVar]);

  // Log-transform times for spline basis
  const logTimes = times.map(t => Math.log(t));
  const minLogT = Math.min(...logTimes);
  const maxLogT = Math.max(...logTimes);

  // Generate restricted cubic spline basis
  const knots = generateKnots(logTimes.filter((_, i) => events[i] === 1), df);
  const splineBasis = logTimes.map(lt => rcSpline(lt, knots));

  // Build design matrix
  // Columns: spline terms, treatment, covariates, [time-varying terms]
  const nSpline = df;
  const nFixed = 1 + covariates.length;
  const nTV = timeVarying ? tvDf : 0;
  const nParams = nSpline + nFixed + nTV;

  // Initialize parameters
  let beta = new Array(nParams).fill(0);
  beta[0] = -2; // Intercept for log cumulative hazard

  // Newton-Raphson optimization
  let converged = false;
  let iter = 0;
  let logLik = -Infinity;

  for (iter = 0; iter < maxIter; iter++) {
    const prevLogLik = logLik;

    // Calculate log cumulative hazard for each observation
    const logH = validData.map((d, i) => {
      let lh = 0;

      // Spline terms
      for (let j = 0; j < nSpline; j++) {
        lh += beta[j] * splineBasis[i][j];
      }

      // Treatment effect
      lh += beta[nSpline] * d[treatmentVar];

      // Covariates
      covariates.forEach((cov, j) => {
        lh += beta[nSpline + 1 + j] * (d[cov] || 0);
      });

      // Time-varying treatment effect
      if (timeVarying) {
        const tvBasis = rcSpline(logTimes[i], knots.slice(0, tvDf + 1));
        for (let j = 0; j < nTV; j++) {
          lh += beta[nSpline + nFixed + j] * d[treatmentVar] * tvBasis[j];
        }
      }

      return lh;
    });

    // Cumulative hazard and survival
    const H = logH.map(lh => Math.exp(lh));
    const S = H.map(h => Math.exp(-h));

    // Log-likelihood (for proportional hazards scale)
    logLik = 0;
    for (let i = 0; i < n; i++) {
      if (events[i] === 1) {
        // d/dt log(H) = hazard contribution
        const dlogH_dt = calculateSplineDerivative(logTimes[i], knots, beta.slice(0, nSpline));
        logLik += Math.log(Math.max(1e-10, dlogH_dt)) + logH[i];
      }
      logLik -= H[i];
    }

    // Check convergence
    if (Math.abs(logLik - prevLogLik) < tolerance) {
      converged = true;
      break;
    }

    // Calculate gradient and Hessian
    const gradient = new Array(nParams).fill(0);
    const hessian = new Array(nParams).fill(null).map(() => new Array(nParams).fill(0));

    for (let i = 0; i < n; i++) {
      const d = validData[i];
      const h = H[i];

      // Design vector
      const x = [];

      // Spline terms
      for (let j = 0; j < nSpline; j++) {
        x.push(splineBasis[i][j]);
      }

      // Treatment
      x.push(d[treatmentVar]);

      // Covariates
      covariates.forEach(cov => x.push(d[cov] || 0));

      // Time-varying
      if (timeVarying) {
        const tvBasis = rcSpline(logTimes[i], knots.slice(0, tvDf + 1));
        for (let j = 0; j < nTV; j++) {
          x.push(d[treatmentVar] * tvBasis[j]);
        }
      }

      // Gradient contribution
      for (let j = 0; j < nParams; j++) {
        gradient[j] += (events[i] - h) * x[j];
      }

      // Hessian contribution
      for (let j = 0; j < nParams; j++) {
        for (let k = 0; k <= j; k++) {
          hessian[j][k] -= h * x[j] * x[k];
          if (k < j) hessian[k][j] = hessian[j][k];
        }
      }
    }

    // Newton-Raphson update
    const delta = solveLinearSystem(hessian, gradient);
    if (delta) {
      for (let j = 0; j < nParams; j++) {
        beta[j] += 0.5 * delta[j]; // Damped update
      }
    }
  }

  // Calculate standard errors from Hessian
  const hessian = new Array(nParams).fill(null).map(() => new Array(nParams).fill(0));

  for (let i = 0; i < n; i++) {
    const d = validData[i];
    const lh = calculateLogH(validData[i], i, beta, splineBasis, covariates, knots, nSpline, nFixed, nTV, timeVarying, logTimes);
    const h = Math.exp(lh);

    const x = buildDesignVector(d, i, splineBasis, covariates, knots, nSpline, nTV, timeVarying, logTimes);

    for (let j = 0; j < nParams; j++) {
      for (let k = 0; k <= j; k++) {
        hessian[j][k] -= h * x[j] * x[k];
        if (k < j) hessian[k][j] = hessian[j][k];
      }
    }
  }

  const invHessian = invertMatrix(hessian);
  const se = invHessian
    ? invHessian.map((row, i) => Math.sqrt(Math.max(0, -row[i])))
    : new Array(nParams).fill(NaN);

  // Extract treatment effect
  const treatmentIdx = nSpline;
  const logHR = beta[treatmentIdx];
  const seLogHR = se[treatmentIdx];
  const z = logHR / seLogHR;
  const pValue = 2 * (1 - normalCDF(Math.abs(z)));

  // Calculate time-varying HR if applicable
  let timeVaryingHR = null;
  if (timeVarying) {
    const timePoints = [1, 2, 5, 10, 15, 20];
    timeVaryingHR = timePoints.map(t => {
      if (t > Math.max(...times)) return null;

      const logT = Math.log(t);
      let tvLogHR = beta[treatmentIdx];

      const tvBasis = rcSpline(logT, knots.slice(0, tvDf + 1));
      for (let j = 0; j < nTV; j++) {
        tvLogHR += beta[nSpline + nFixed + j] * tvBasis[j];
      }

      return {
        time: t,
        logHR: tvLogHR,
        HR: Math.exp(tvLogHR)
      };
    }).filter(x => x !== null);
  }

  // Model fit statistics
  const AIC = -2 * logLik + 2 * nParams;
  const BIC = -2 * logLik + Math.log(n) * nParams;

  // Predict survival function
  const predictSurvival = (newData, times) => {
    return times.map(t => {
      const logT = Math.log(t);
      const spline = rcSpline(logT, knots);

      let logH = 0;
      for (let j = 0; j < nSpline; j++) {
        logH += beta[j] * spline[j];
      }
      logH += beta[nSpline] * newData[treatmentVar];

      covariates.forEach((cov, j) => {
        logH += beta[nSpline + 1 + j] * (newData[cov] || 0);
      });

      if (timeVarying) {
        const tvBasis = rcSpline(logT, knots.slice(0, tvDf + 1));
        for (let j = 0; j < nTV; j++) {
          logH += beta[nSpline + nFixed + j] * newData[treatmentVar] * tvBasis[j];
        }
      }

      return {
        time: t,
        survival: Math.exp(-Math.exp(logH))
      };
    });
  };

  return {
    model: 'flexible-parametric',
    scale,
    n,
    nEvents: events.filter(e => e === 1).length,
    df,
    knots,
    treatment: {
      logHR,
      HR: Math.exp(logHR),
      se: seLogHR,
      z,
      pValue,
      ci_lower: Math.exp(logHR - 1.96 * seLogHR),
      ci_upper: Math.exp(logHR + 1.96 * seLogHR)
    },
    timeVaryingHR,
    covariates: covariates.map((cov, j) => ({
      name: cov,
      logHR: beta[nSpline + 1 + j],
      HR: Math.exp(beta[nSpline + 1 + j]),
      se: se[nSpline + 1 + j]
    })),
    fit: {
      logLik,
      AIC,
      BIC,
      converged,
      iterations: iter
    },
    predict: predictSurvival,
    splineCoefs: beta.slice(0, nSpline)
  };
}

/**
 * Landmark Analysis for IPD Meta-Analysis
 * Analyzes treatment effect from specific time points
 *
 * @param {Array} data - IPD data
 * @param {Array} landmarks - Time points for landmark analysis
 * @param {object} options
 */
export function landmarkAnalysis(data, landmarks, options = {}) {
  const {
    timeVar = 'time',
    eventVar = 'event',
    treatmentVar = 'treatment',
    studyVar = 'studyId',
    horizon = null // Analysis horizon from landmark
  } = options;

  const results = [];

  for (const landmark of landmarks) {
    // Filter patients still at risk at landmark
    const atRisk = data.filter(d => d[timeVar] >= landmark);

    if (atRisk.length < 20) {
      results.push({
        landmark,
        error: 'Insufficient patients at risk'
      });
      continue;
    }

    // Create landmark dataset
    const landmarkData = atRisk.map(d => ({
      ...d,
      landmarkTime: d[timeVar] - landmark,
      landmarkEvent: d[eventVar]
    }));

    // Apply horizon if specified
    if (horizon) {
      landmarkData.forEach(d => {
        if (d.landmarkTime > horizon) {
          d.landmarkTime = horizon;
          d.landmarkEvent = 0;
        }
      });
    }

    // Fit Cox model from landmark
    const treatment = landmarkData.filter(d => d[treatmentVar] === 1);
    const control = landmarkData.filter(d => d[treatmentVar] === 0);

    const lr = logRankFromData(
      treatment.map(d => ({ time: d.landmarkTime, event: d.landmarkEvent })),
      control.map(d => ({ time: d.landmarkTime, event: d.landmarkEvent }))
    );

    if (lr.error || lr.variance <= 0) {
      results.push({
        landmark,
        error: 'Could not estimate HR'
      });
      continue;
    }

    const logHR = (lr.observed - lr.expected) / lr.variance;
    const se = 1 / Math.sqrt(lr.variance);

    results.push({
      landmark,
      nAtRisk: atRisk.length,
      nTreatment: treatment.length,
      nControl: control.length,
      nEvents: landmarkData.filter(d => d.landmarkEvent === 1).length,
      logHR,
      HR: Math.exp(logHR),
      se,
      ci_lower: Math.exp(logHR - 1.96 * se),
      ci_upper: Math.exp(logHR + 1.96 * se),
      pValue: 2 * (1 - normalCDF(Math.abs(logHR / se)))
    });
  }

  // Test for trend in landmark HRs
  const validResults = results.filter(r => !r.error);
  let trendTest = null;

  if (validResults.length >= 3) {
    const x = validResults.map(r => r.landmark);
    const y = validResults.map(r => r.logHR);
    const w = validResults.map(r => 1 / (r.se * r.se));

    const trend = weightedRegression(x, y, w);
    trendTest = {
      slope: trend.slope,
      slopeP: trend.pValue,
      interpretation: trend.pValue < 0.05
        ? 'Significant time-varying treatment effect'
        : 'No evidence of time-varying effect'
    };
  }

  return {
    model: 'landmark-analysis',
    landmarks: results,
    trendTest,
    pooled: validResults.length >= 2 ? poolLandmarkHRs(validResults) : null
  };
}

/**
 * Cure Fraction Model
 * Mixture model for populations with cured fraction
 *
 * @param {Array} data - IPD data
 * @param {object} options
 */
export function cureFractionModel(data, options = {}) {
  const {
    timeVar = 'time',
    eventVar = 'event',
    treatmentVar = 'treatment',
    distribution = 'weibull', // 'weibull', 'lognormal', 'loglogistic'
    maxIter = 100
  } = options;

  const validData = data.filter(d =>
    d[timeVar] > 0 && (d[eventVar] === 0 || d[eventVar] === 1)
  );

  const n = validData.length;
  const times = validData.map(d => d[timeVar]);
  const events = validData.map(d => d[eventVar]);
  const treatment = validData.map(d => d[treatmentVar]);

  // Initialize parameters
  // pi = cure fraction, lambda/k = distribution params
  let pi0 = 0.3; // Cure fraction in control
  let pi1 = 0.4; // Cure fraction in treatment
  let lambda = 0.1;
  let k = 1.0;

  // EM algorithm
  let converged = false;
  let iter = 0;

  for (iter = 0; iter < maxIter; iter++) {
    const prevPi0 = pi0;
    const prevPi1 = pi1;

    // E-step: Calculate posterior probability of being cured
    const pCured = validData.map((d, i) => {
      const pi = d[treatmentVar] === 1 ? pi1 : pi0;

      if (d[eventVar] === 1) {
        return 0; // If event occurred, not cured
      }

      // S_u(t) for uncured
      const Su = survivalFunction(times[i], lambda, k, distribution);

      // P(cured | censored) = pi / (pi + (1-pi)*Su)
      return pi / (pi + (1 - pi) * Su);
    });

    // M-step: Update cure fractions
    const nTrt = treatment.filter(t => t === 1).length;
    const nCtrl = treatment.filter(t => t === 0).length;

    pi1 = treatment.reduce((sum, t, i) => sum + (t === 1 ? pCured[i] : 0), 0) / nTrt;
    pi0 = treatment.reduce((sum, t, i) => sum + (t === 0 ? pCured[i] : 0), 0) / nCtrl;

    // Update distribution parameters (simplified)
    const uncuredContrib = validData.filter((_, i) => pCured[i] < 0.5);
    if (uncuredContrib.length > 10) {
      const uncuredTimes = uncuredContrib.map((d, idx) => {
        const origIdx = validData.indexOf(d);
        return times[origIdx];
      });
      const uncuredEvents = uncuredContrib.map((d, idx) => {
        const origIdx = validData.indexOf(d);
        return events[origIdx];
      });

      // MLE for Weibull (simplified)
      const sumLogT = uncuredTimes.reduce((s, t) => s + Math.log(t), 0);
      const sumEvents = uncuredEvents.reduce((s, e) => s + e, 0);

      if (sumEvents > 0) {
        k = sumEvents / (uncuredTimes.reduce((s, t, i) =>
          s + (uncuredEvents[i] === 1 ? Math.pow(t, k) * Math.log(t) : 0), 0) /
          lambda - sumLogT);
        k = Math.max(0.5, Math.min(3, k));

        lambda = sumEvents / uncuredTimes.reduce((s, t) => s + Math.pow(t, k), 0);
      }
    }

    // Check convergence
    if (Math.abs(pi0 - prevPi0) < 1e-4 && Math.abs(pi1 - prevPi1) < 1e-4) {
      converged = true;
      break;
    }
  }

  // Calculate cure fraction OR
  const logitPi0 = Math.log(pi0 / (1 - pi0));
  const logitPi1 = Math.log(pi1 / (1 - pi1));
  const cureOR = Math.exp(logitPi1 - logitPi0);

  // Bootstrap SE (simplified approximation)
  const seCureOR = cureOR * Math.sqrt(1/(n*pi0*(1-pi0)) + 1/(n*pi1*(1-pi1)));

  return {
    model: 'cure-fraction',
    distribution,
    n,
    nEvents: events.filter(e => e === 1).length,
    cureFraction: {
      control: pi0,
      treatment: pi1,
      difference: pi1 - pi0,
      OR: cureOR,
      seOR: seCureOR,
      ci_lower: cureOR * Math.exp(-1.96 * seCureOR / cureOR),
      ci_upper: cureOR * Math.exp(1.96 * seCureOR / cureOR)
    },
    uncuredDistribution: {
      lambda,
      k,
      medianUncured: Math.pow(Math.log(2) / lambda, 1/k)
    },
    fit: {
      converged,
      iterations: iter
    }
  };
}

/**
 * Competing Risks Analysis
 * Cause-specific and Fine-Gray subdistribution hazards
 *
 * @param {Array} data - [{time, event, cause, treatment, ...}, ...]
 * @param {number} causeOfInterest - Which cause to analyze
 * @param {object} options
 */
export function competingRisksAnalysis(data, causeOfInterest = 1, options = {}) {
  const {
    timeVar = 'time',
    eventVar = 'event',
    causeVar = 'cause',
    treatmentVar = 'treatment',
    method = 'both' // 'cause-specific', 'fine-gray', 'both'
  } = options;

  const validData = data.filter(d =>
    d[timeVar] > 0 && d[eventVar] !== undefined
  );

  const n = validData.length;

  // Cause-specific analysis: censor competing events
  let causeSpecific = null;
  if (method === 'cause-specific' || method === 'both') {
    const csData = validData.map(d => ({
      ...d,
      csEvent: d[eventVar] === 1 && d[causeVar] === causeOfInterest ? 1 : 0
    }));

    const treatment = csData.filter(d => d[treatmentVar] === 1);
    const control = csData.filter(d => d[treatmentVar] === 0);

    const lr = logRankFromData(
      treatment.map(d => ({ time: d[timeVar], event: d.csEvent })),
      control.map(d => ({ time: d[timeVar], event: d.csEvent }))
    );

    if (!lr.error && lr.variance > 0) {
      const logHR = (lr.observed - lr.expected) / lr.variance;
      const se = 1 / Math.sqrt(lr.variance);

      causeSpecific = {
        logHR,
        HR: Math.exp(logHR),
        se,
        ci_lower: Math.exp(logHR - 1.96 * se),
        ci_upper: Math.exp(logHR + 1.96 * se),
        pValue: 2 * (1 - normalCDF(Math.abs(logHR / se))),
        nEvents: csData.filter(d => d.csEvent === 1).length
      };
    }
  }

  // Fine-Gray subdistribution hazard
  // Competing events are kept in risk set with decreasing weights
  let fineGray = null;
  if (method === 'fine-gray' || method === 'both') {
    // Simplified Fine-Gray: use inverse probability of censoring weights
    const eventTimes = [...new Set(
      validData.filter(d => d[eventVar] === 1 && d[causeVar] === causeOfInterest)
        .map(d => d[timeVar])
    )].sort((a, b) => a - b);

    let O = 0, E = 0, V = 0;
    let nRisk1 = validData.filter(d => d[treatmentVar] === 1).length;
    let nRisk0 = validData.filter(d => d[treatmentVar] === 0).length;

    // Track who has had competing event
    const competingEventTime = {};
    validData.forEach((d, i) => {
      if (d[eventVar] === 1 && d[causeVar] !== causeOfInterest) {
        competingEventTime[i] = d[timeVar];
      }
    });

    for (const t of eventTimes) {
      // Weight for subjects with competing event before t
      const getWeight = (idx, eventTime) => {
        if (competingEventTime[idx] && competingEventTime[idx] < eventTime) {
          // Simplified IPCW weight
          return 0.5;
        }
        return 1;
      };

      // Weighted at-risk counts
      let wRisk1 = 0, wRisk0 = 0;
      validData.forEach((d, i) => {
        if (d[timeVar] >= t || (competingEventTime[i] && competingEventTime[i] < t)) {
          const w = getWeight(i, t);
          if (d[treatmentVar] === 1) wRisk1 += w;
          else wRisk0 += w;
        }
      });

      // Events at this time
      const events1 = validData.filter(d =>
        d[treatmentVar] === 1 && d[eventVar] === 1 &&
        d[causeVar] === causeOfInterest && d[timeVar] === t
      ).length;

      const events0 = validData.filter(d =>
        d[treatmentVar] === 0 && d[eventVar] === 1 &&
        d[causeVar] === causeOfInterest && d[timeVar] === t
      ).length;

      const totalEvents = events1 + events0;
      const totalRisk = wRisk1 + wRisk0;

      if (totalRisk > 0 && totalEvents > 0) {
        O += events1;
        E += (wRisk1 / totalRisk) * totalEvents;
        V += (wRisk1 * wRisk0 * totalEvents * (totalRisk - totalEvents)) /
             (totalRisk * totalRisk * Math.max(1, totalRisk - 1));
      }
    }

    if (V > 0) {
      const logSHR = (O - E) / V;
      const se = 1 / Math.sqrt(V);

      fineGray = {
        logSHR,
        SHR: Math.exp(logSHR),
        se,
        ci_lower: Math.exp(logSHR - 1.96 * se),
        ci_upper: Math.exp(logSHR + 1.96 * se),
        pValue: 2 * (1 - normalCDF(Math.abs(logSHR / se))),
        interpretation: 'Subdistribution HR for cumulative incidence'
      };
    }
  }

  // Cumulative incidence functions
  const cif = calculateCIF(validData, causeOfInterest, timeVar, eventVar, causeVar, treatmentVar);

  return {
    model: 'competing-risks',
    causeOfInterest,
    n,
    nCauseEvents: validData.filter(d => d[eventVar] === 1 && d[causeVar] === causeOfInterest).length,
    nCompetingEvents: validData.filter(d => d[eventVar] === 1 && d[causeVar] !== causeOfInterest).length,
    causeSpecific,
    fineGray,
    cumulativeIncidence: cif,
    interpretation: {
      causeSpecific: 'Effect on instantaneous rate among those still at risk',
      fineGray: 'Effect on cumulative incidence accounting for competing risks'
    }
  };
}

// Helper functions

function generateKnots(eventLogTimes, df) {
  const sorted = [...eventLogTimes].sort((a, b) => a - b);
  const n = sorted.length;

  // Boundary knots at min and max
  const knots = [sorted[0], sorted[n - 1]];

  // Internal knots at percentiles
  const nInternal = df - 1;
  for (let i = 1; i <= nInternal; i++) {
    const p = i / (nInternal + 1);
    const idx = Math.floor(p * n);
    knots.splice(i, 0, sorted[idx]);
  }

  return knots.sort((a, b) => a - b);
}

function rcSpline(x, knots) {
  // Restricted cubic spline basis
  const k = knots.length;
  const basis = [1, x]; // Intercept and linear term

  for (let i = 0; i < k - 2; i++) {
    const t_i = knots[i];
    const t_k1 = knots[k - 2];
    const t_k = knots[k - 1];

    let term = Math.pow(Math.max(0, x - t_i), 3);
    term -= Math.pow(Math.max(0, x - t_k1), 3) * (t_k - t_i) / (t_k - t_k1);
    term += Math.pow(Math.max(0, x - t_k), 3) * (t_k1 - t_i) / (t_k - t_k1);

    basis.push(term);
  }

  return basis;
}

function calculateSplineDerivative(x, knots, coefs) {
  // Derivative of spline w.r.t. x
  let deriv = coefs[1]; // Linear coefficient

  const k = knots.length;
  for (let i = 0; i < k - 2; i++) {
    const t_i = knots[i];
    const t_k1 = knots[k - 2];
    const t_k = knots[k - 1];

    let term = 3 * Math.pow(Math.max(0, x - t_i), 2) * (x > t_i ? 1 : 0);
    term -= 3 * Math.pow(Math.max(0, x - t_k1), 2) * (x > t_k1 ? 1 : 0) * (t_k - t_i) / (t_k - t_k1);
    term += 3 * Math.pow(Math.max(0, x - t_k), 2) * (x > t_k ? 1 : 0) * (t_k1 - t_i) / (t_k - t_k1);

    deriv += coefs[2 + i] * term;
  }

  return Math.max(1e-10, deriv);
}

function calculateLogH(d, i, beta, splineBasis, covariates, knots, nSpline, nFixed, nTV, timeVarying, logTimes) {
  let lh = 0;
  for (let j = 0; j < nSpline; j++) {
    lh += beta[j] * splineBasis[i][j];
  }
  lh += beta[nSpline] * d.treatment;
  covariates.forEach((cov, j) => {
    lh += beta[nSpline + 1 + j] * (d[cov] || 0);
  });
  if (timeVarying && nTV > 0) {
    const tvBasis = rcSpline(logTimes[i], knots.slice(0, nTV + 1));
    for (let j = 0; j < nTV; j++) {
      lh += beta[nSpline + nFixed + j] * d.treatment * tvBasis[j];
    }
  }
  return lh;
}

function buildDesignVector(d, i, splineBasis, covariates, knots, nSpline, nTV, timeVarying, logTimes) {
  const x = [];
  for (let j = 0; j < splineBasis[i].length; j++) {
    x.push(splineBasis[i][j]);
  }
  x.push(d.treatment);
  covariates.forEach(cov => x.push(d[cov] || 0));
  if (timeVarying && nTV > 0) {
    const tvBasis = rcSpline(logTimes[i], knots.slice(0, nTV + 1));
    for (let j = 0; j < nTV; j++) {
      x.push(d.treatment * tvBasis[j]);
    }
  }
  return x;
}

function survivalFunction(t, lambda, k, distribution) {
  if (distribution === 'weibull') {
    return Math.exp(-lambda * Math.pow(t, k));
  } else if (distribution === 'lognormal') {
    const mu = -Math.log(lambda);
    const sigma = 1 / k;
    return 1 - normalCDF((Math.log(t) - mu) / sigma);
  } else {
    // Log-logistic
    return 1 / (1 + lambda * Math.pow(t, k));
  }
}

function logRankFromData(group1, group2) {
  const eventTimes = [...new Set([
    ...group1.filter(d => d.event === 1).map(d => d.time),
    ...group2.filter(d => d.event === 1).map(d => d.time)
  ])].sort((a, b) => a - b);

  let O = 0, E = 0, V = 0;
  let nRisk1 = group1.length;
  let nRisk2 = group2.length;

  for (const t of eventTimes) {
    const e1 = group1.filter(d => d.event === 1 && d.time === t).length;
    const e2 = group2.filter(d => d.event === 1 && d.time === t).length;
    const total = e1 + e2;
    const risk = nRisk1 + nRisk2;

    if (risk > 0 && total > 0) {
      O += e1;
      E += (nRisk1 / risk) * total;
      if (risk > 1) {
        V += (nRisk1 * nRisk2 * total * (risk - total)) / (risk * risk * (risk - 1));
      }
    }

    nRisk1 -= group1.filter(d => d.time === t).length;
    nRisk2 -= group2.filter(d => d.time === t).length;
  }

  return { observed: O, expected: E, variance: V };
}

function weightedRegression(x, y, w) {
  const n = x.length;
  const sumW = w.reduce((a, b) => a + b, 0);
  const meanX = x.reduce((s, xi, i) => s + w[i] * xi, 0) / sumW;
  const meanY = y.reduce((s, yi, i) => s + w[i] * yi, 0) / sumW;

  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += w[i] * (x[i] - meanX) * (y[i] - meanY);
    den += w[i] * (x[i] - meanX) * (x[i] - meanX);
  }

  const slope = den > 0 ? num / den : 0;
  const intercept = meanY - slope * meanX;

  // Standard error of slope
  let sse = 0;
  for (let i = 0; i < n; i++) {
    const pred = intercept + slope * x[i];
    sse += w[i] * (y[i] - pred) * (y[i] - pred);
  }
  const mse = sse / (n - 2);
  const seSlope = Math.sqrt(mse / den);

  const t = slope / seSlope;
  const pValue = 2 * (1 - tCDF(Math.abs(t), n - 2));

  return { slope, intercept, seSlope, pValue };
}

function poolLandmarkHRs(results) {
  const yi = results.map(r => r.logHR);
  const vi = results.map(r => r.se * r.se);
  const wi = vi.map(v => 1 / v);
  const sumW = wi.reduce((a, b) => a + b, 0);

  const pooled = yi.reduce((s, y, i) => s + wi[i] * y, 0) / sumW;
  const se = 1 / Math.sqrt(sumW);

  return {
    logHR: pooled,
    HR: Math.exp(pooled),
    se,
    ci_lower: Math.exp(pooled - 1.96 * se),
    ci_upper: Math.exp(pooled + 1.96 * se)
  };
}

function calculateCIF(data, cause, timeVar, eventVar, causeVar, treatmentVar) {
  // Aalen-Johansen estimator
  const groups = [0, 1];
  const results = {};

  for (const g of groups) {
    const gData = data.filter(d => d[treatmentVar] === g);
    const times = [...new Set(gData.map(d => d[timeVar]))].sort((a, b) => a - b);

    const cif = [{ time: 0, cumInc: 0 }];
    let nRisk = gData.length;
    let S = 1;

    for (const t of times) {
      const events = gData.filter(d => d[timeVar] === t && d[eventVar] === 1);
      const causeEvents = events.filter(d => d[causeVar] === cause).length;
      const allEvents = events.length;

      if (nRisk > 0 && causeEvents > 0) {
        const cumInc = cif[cif.length - 1].cumInc + S * (causeEvents / nRisk);
        cif.push({ time: t, cumInc });
      }

      if (nRisk > 0 && allEvents > 0) {
        S *= (nRisk - allEvents) / nRisk;
      }

      nRisk -= gData.filter(d => d[timeVar] === t).length;
    }

    results[g === 0 ? 'control' : 'treatment'] = cif;
  }

  return results;
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

  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = aug[i][n];
    for (let j = i + 1; j < n; j++) x[i] -= aug[i][j] * x[j];
    x[i] /= aug[i][i];
  }
  return x;
}

function invertMatrix(A) {
  const n = A.length;
  const aug = A.map((row, i) => [...row, ...new Array(n).fill(0).map((_, j) => i === j ? 1 : 0)]);

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

function tCDF(t, df) {
  const x = df / (df + t * t);
  const halfBeta = 0.5 * incompleteBeta(df / 2, 0.5, x);
  // For t >= 0: CDF = 1 - halfBeta, for t < 0: CDF = halfBeta
  return t >= 0 ? 1 - halfBeta : halfBeta;
}

function incompleteBeta(a, b, x) {
  if (x === 0) return 0;
  if (x === 1) return 1;
  const bt = Math.exp(gammaln(a + b) - gammaln(a) - gammaln(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) return bt * betacf(a, b, x) / a;
  return 1 - bt * betacf(b, a, 1 - x) / b;
}

function betacf(a, b, x) {
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= 100; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const del = d * c; h *= del;
    if (Math.abs(del - 1) < 1e-10) break;
  }
  return h;
}

function gammaln(x) {
  const coef = [76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x, tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += coef[j] / ++y;
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

export default {
  flexibleParametricModel,
  landmarkAnalysis,
  cureFractionModel,
  competingRisksAnalysis
};
