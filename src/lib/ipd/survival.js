/**
 * Survival Analysis Module for IPD Meta-Analysis
 *
 * Provides comprehensive time-to-event analysis capabilities:
 * - Kaplan-Meier estimation with confidence intervals
 * - Log-rank, Wilcoxon, and weighted log-rank tests
 * - Cox proportional hazards model
 * - Restricted mean survival time (RMST)
 * - Hazard ratio estimation methods
 *
 * References:
 * - Royston P, Parmar MK (2011). The use of restricted mean survival time.
 * - Tierney JF, et al. (2007). Practical methods for incorporating summary
 *   time-to-event data into meta-analysis.
 * - Parmar MK, et al. (1998). Extracting summary statistics for meta-analysis.
 */

/**
 * Kaplan-Meier survival estimator
 * @param {Array} data - [{time, event}, ...]
 * @returns {object} KM curve with confidence intervals
 */
export function kaplanMeier(data) {
  if (!data || data.length === 0) {
    return { error: 'No data' };
  }

  // Sort by time
  const sorted = [...data].sort((a, b) => a.time - b.time);

  // Get unique event times
  const eventTimes = [...new Set(
    sorted.filter(d => d.event === 1).map(d => d.time)
  )].sort((a, b) => a - b);

  const curve = [];
  let nRisk = sorted.length;
  let survival = 1;
  let varLog = 0; // Variance of log(S)
  let processedIdx = 0;

  // Add initial point
  curve.push({
    time: 0,
    survival: 1,
    se: 0,
    ci_lower: 1,
    ci_upper: 1,
    nRisk: sorted.length,
    nEvent: 0,
    nCensor: 0
  });

  for (const t of eventTimes) {
    // Count censored before this time
    let nCensorBefore = 0;
    while (processedIdx < sorted.length && sorted[processedIdx].time < t) {
      if (sorted[processedIdx].event === 0) {
        nCensorBefore++;
      }
      processedIdx++;
    }
    nRisk -= nCensorBefore;

    // Count events at this time
    let nEvent = 0;
    let nCensorAt = 0;
    while (processedIdx < sorted.length && sorted[processedIdx].time === t) {
      if (sorted[processedIdx].event === 1) {
        nEvent++;
      } else {
        nCensorAt++;
      }
      processedIdx++;
    }

    if (nRisk > 0 && nEvent > 0) {
      // KM update
      survival *= (nRisk - nEvent) / nRisk;

      // Greenwood's formula for variance
      varLog += nEvent / (nRisk * (nRisk - nEvent));

      // SE using delta method
      const se = survival * Math.sqrt(varLog);

      // Log-log CI (recommended by Kalbfleisch & Prentice)
      let ci_lower, ci_upper;
      if (survival > 0 && survival < 1) {
        const logLogS = Math.log(-Math.log(survival));
        const seLogLog = Math.sqrt(varLog) / Math.abs(Math.log(survival));
        ci_lower = Math.exp(-Math.exp(logLogS + 1.96 * seLogLog));
        ci_upper = Math.exp(-Math.exp(logLogS - 1.96 * seLogLog));
      } else {
        ci_lower = survival;
        ci_upper = survival;
      }

      curve.push({
        time: t,
        survival,
        se,
        ci_lower: Math.max(0, Math.min(1, ci_lower)),
        ci_upper: Math.max(0, Math.min(1, ci_upper)),
        nRisk,
        nEvent,
        nCensor: nCensorAt
      });

      nRisk -= nEvent + nCensorAt;
    }
  }

  // Summary statistics
  const medianIdx = curve.findIndex(p => p.survival <= 0.5);
  const medianSurvival = medianIdx >= 0 ? curve[medianIdx].time : null;

  return {
    curve,
    n: data.length,
    nEvents: data.filter(d => d.event === 1).length,
    nCensored: data.filter(d => d.event === 0).length,
    medianSurvival,
    medianSurvivalCI: medianIdx >= 0 ? {
      lower: curve[medianIdx].time,
      upper: curve.find(p => p.survival <= 0.25)?.time || null
    } : null
  };
}

/**
 * Log-rank test for comparing two survival curves
 * @param {Array} group1 - [{time, event}, ...]
 * @param {Array} group2 - [{time, event}, ...]
 * @param {string} rho - Weight function: 'log-rank' (0), 'wilcoxon' (1), 'tarone-ware' (0.5)
 * @returns {object} Test results
 */
export function logRankTest(group1, group2, rho = 0) {
  // Merge data with group indicator
  const allData = [
    ...group1.map(d => ({ ...d, group: 1 })),
    ...group2.map(d => ({ ...d, group: 2 }))
  ].sort((a, b) => a.time - b.time);

  // Get unique event times
  const eventTimes = [...new Set(
    allData.filter(d => d.event === 1).map(d => d.time)
  )].sort((a, b) => a - b);

  let O1 = 0, E1 = 0, variance = 0;
  let nRisk1 = group1.length;
  let nRisk2 = group2.length;
  let survival = 1; // For weighted tests

  let processed = { 1: 0, 2: 0 };

  for (const t of eventTimes) {
    // Count censored before this time (by group)
    for (const g of [1, 2]) {
      const groupData = g === 1 ? group1 : group2;
      while (processed[g] < groupData.length && groupData[processed[g]].time < t) {
        if (groupData[processed[g]].event === 0) {
          if (g === 1) nRisk1--;
          else nRisk2--;
        }
        processed[g]++;
      }
    }

    // Count events at this time
    let events1 = 0, events2 = 0;
    for (const g of [1, 2]) {
      const groupData = g === 1 ? group1 : group2;
      while (processed[g] < groupData.length && groupData[processed[g]].time === t) {
        if (groupData[processed[g]].event === 1) {
          if (g === 1) events1++;
          else events2++;
        }
        processed[g]++;
      }
    }

    const totalEvents = events1 + events2;
    const totalRisk = nRisk1 + nRisk2;

    if (totalRisk > 0 && totalEvents > 0) {
      // Weight based on rho
      const weight = Math.pow(survival, rho);

      const expected1 = (nRisk1 / totalRisk) * totalEvents;
      O1 += weight * events1;
      E1 += weight * expected1;

      // Variance contribution
      if (totalRisk > 1) {
        variance += weight * weight *
          (nRisk1 * nRisk2 * totalEvents * (totalRisk - totalEvents)) /
          (totalRisk * totalRisk * (totalRisk - 1));
      }

      // Update pooled survival for weighting
      survival *= (totalRisk - totalEvents) / totalRisk;
    }

    nRisk1 -= events1 + group1.filter(d => d.time === t && d.event === 0).length;
    nRisk2 -= events2 + group2.filter(d => d.time === t && d.event === 0).length;
  }

  if (variance <= 0) {
    return { error: 'Zero variance' };
  }

  const statistic = Math.pow(O1 - E1, 2) / variance;
  const z = (O1 - E1) / Math.sqrt(variance);
  const pValue = 1 - chiSquareCDF(statistic, 1);

  return {
    test: rho === 0 ? 'log-rank' : rho === 1 ? 'wilcoxon' : 'weighted-log-rank',
    rho,
    observed: O1,
    expected: E1,
    variance,
    statistic,
    df: 1,
    z,
    pValue,
    n1: group1.length,
    n2: group2.length,
    events1: group1.filter(d => d.event === 1).length,
    events2: group2.filter(d => d.event === 1).length
  };
}

/**
 * Cox proportional hazards model (univariate, via log-rank)
 * @param {Array} data - [{time, event, treatment, ...covariates}, ...]
 * @param {string} treatmentVar - Name of treatment variable
 * @returns {object} Cox model results
 */
export function coxPH(data, treatmentVar = 'treatment') {
  const treatment = data.filter(d => d[treatmentVar] === 1);
  const control = data.filter(d => d[treatmentVar] === 0);

  if (treatment.length === 0 || control.length === 0) {
    return { error: 'Need observations in both groups' };
  }

  // Use log-rank for univariate Cox
  const lr = logRankTest(treatment, control);
  if (lr.error) return lr;

  // Estimate log(HR) from log-rank
  const logHR = (lr.observed - lr.expected) / lr.variance;
  const se = 1 / Math.sqrt(lr.variance);
  const z = logHR / se;
  const pValue = 2 * (1 - normalCDF(Math.abs(z)));

  return {
    model: 'cox-ph',
    n: data.length,
    nEvents: data.filter(d => d.event === 1).length,
    treatment: {
      logHR,
      HR: Math.exp(logHR),
      se,
      z,
      pValue,
      ci_lower: Math.exp(logHR - 1.96 * se),
      ci_upper: Math.exp(logHR + 1.96 * se)
    },
    logRankTest: lr,
    schoenfeld: null, // Would need time-varying covariate analysis
    concordance: calculateConcordance(data, treatmentVar)
  };
}

/**
 * Calculate concordance (C-statistic) for survival model
 */
function calculateConcordance(data, treatmentVar) {
  let concordant = 0;
  let discordant = 0;
  let tied = 0;

  const events = data.filter(d => d.event === 1);
  const censored = data.filter(d => d.event === 0);

  for (const e of events) {
    for (const c of censored) {
      if (c.time > e.time) {
        // Comparable pair
        if (e[treatmentVar] > c[treatmentVar]) {
          discordant++;
        } else if (e[treatmentVar] < c[treatmentVar]) {
          concordant++;
        } else {
          tied++;
        }
      }
    }
  }

  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const e1 = events[i];
      const e2 = events[j];

      if (e1.time !== e2.time) {
        const earlier = e1.time < e2.time ? e1 : e2;
        const later = e1.time < e2.time ? e2 : e1;

        if (earlier[treatmentVar] > later[treatmentVar]) {
          discordant++;
        } else if (earlier[treatmentVar] < later[treatmentVar]) {
          concordant++;
        } else {
          tied++;
        }
      }
    }
  }

  const total = concordant + discordant + tied;
  if (total === 0) return null;

  return {
    concordance: (concordant + 0.5 * tied) / total,
    concordant,
    discordant,
    tied,
    total
  };
}

/**
 * Restricted Mean Survival Time (RMST)
 * Provides a model-free summary measure
 *
 * @param {Array} data - [{time, event}, ...]
 * @param {number} tau - Restriction time (max follow-up if null)
 * @returns {object} RMST with CI
 */
export function restrictedMeanSurvivalTime(data, tau = null) {
  const km = kaplanMeier(data);
  if (km.error) return km;

  // Determine tau
  const maxTime = Math.max(...data.map(d => d.time));
  tau = tau || maxTime;

  // RMST = integral of S(t) from 0 to tau
  let rmst = 0;
  let varRMST = 0;
  let prevTime = 0;
  let prevSurvival = 1;

  const curveToTau = km.curve.filter(p => p.time <= tau);

  for (let i = 1; i < curveToTau.length; i++) {
    const dt = curveToTau[i].time - prevTime;
    rmst += prevSurvival * dt;
    prevTime = curveToTau[i].time;
    prevSurvival = curveToTau[i].survival;
  }

  // Add final segment to tau
  rmst += prevSurvival * (tau - prevTime);

  // Variance using Greenwood-type formula
  // Var(RMST) = sum of (integral from t_j to tau of S(u)du)^2 * d_j / (n_j * (n_j - d_j))
  for (let i = 1; i < curveToTau.length; i++) {
    const t_j = curveToTau[i].time;
    const d_j = curveToTau[i].nEvent;
    const n_j = curveToTau[i].nRisk + d_j; // At risk before event

    // Integral of S(u) from t_j to tau
    let integralFromTj = 0;
    for (let k = i; k < curveToTau.length; k++) {
      const tStart = k === i ? t_j : curveToTau[k].time;
      const tEnd = k < curveToTau.length - 1 ? curveToTau[k + 1].time : tau;
      integralFromTj += curveToTau[k].survival * (Math.min(tEnd, tau) - tStart);
    }
    // Add final segment
    if (curveToTau[curveToTau.length - 1].time < tau) {
      integralFromTj += curveToTau[curveToTau.length - 1].survival *
        (tau - curveToTau[curveToTau.length - 1].time);
    }

    if (n_j > d_j) {
      varRMST += Math.pow(integralFromTj, 2) * d_j / (n_j * (n_j - d_j));
    }
  }

  const seRMST = Math.sqrt(varRMST);

  return {
    rmst,
    se: seRMST,
    ci_lower: rmst - 1.96 * seRMST,
    ci_upper: rmst + 1.96 * seRMST,
    tau,
    n: data.length,
    nEvents: data.filter(d => d.event === 1).length
  };
}

/**
 * Compare RMST between two groups
 * @param {Array} group1 - Treatment group
 * @param {Array} group2 - Control group
 * @param {number} tau - Restriction time
 * @returns {object} RMST difference and ratio
 */
export function compareRMST(group1, group2, tau = null) {
  // Determine common tau
  const maxTime = Math.min(
    Math.max(...group1.map(d => d.time)),
    Math.max(...group2.map(d => d.time))
  );
  tau = tau || maxTime;

  const rmst1 = restrictedMeanSurvivalTime(group1, tau);
  const rmst2 = restrictedMeanSurvivalTime(group2, tau);

  if (rmst1.error || rmst2.error) {
    return { error: rmst1.error || rmst2.error };
  }

  // Difference
  const diff = rmst1.rmst - rmst2.rmst;
  const seDiff = Math.sqrt(rmst1.se * rmst1.se + rmst2.se * rmst2.se);
  const zDiff = diff / seDiff;
  const pDiff = 2 * (1 - normalCDF(Math.abs(zDiff)));

  // Ratio (using delta method)
  const ratio = rmst1.rmst / rmst2.rmst;
  const logRatio = Math.log(ratio);
  const seLogRatio = Math.sqrt(
    Math.pow(rmst1.se / rmst1.rmst, 2) +
    Math.pow(rmst2.se / rmst2.rmst, 2)
  );
  const zRatio = logRatio / seLogRatio;
  const pRatio = 2 * (1 - normalCDF(Math.abs(zRatio)));

  return {
    tau,
    group1: rmst1,
    group2: rmst2,
    difference: {
      estimate: diff,
      se: seDiff,
      z: zDiff,
      pValue: pDiff,
      ci_lower: diff - 1.96 * seDiff,
      ci_upper: diff + 1.96 * seDiff
    },
    ratio: {
      estimate: ratio,
      se: ratio * seLogRatio,
      z: zRatio,
      pValue: pRatio,
      ci_lower: Math.exp(logRatio - 1.96 * seLogRatio),
      ci_upper: Math.exp(logRatio + 1.96 * seLogRatio)
    }
  };
}

/**
 * Extract HR and variance from published survival data
 * Implements Parmar et al. (1998) and Tierney et al. (2007) methods
 *
 * @param {object} input - Various input formats
 * @returns {object} { logHR, varLogHR, hr, ci_lower, ci_upper }
 */
export function extractHR(input) {
  const {
    hr, ci_lower, ci_upper,
    logrank_pvalue, logrank_statistic,
    observed, expected, variance,
    events_treatment, events_control, total_events,
    n_treatment, n_control
  } = input;

  let logHR, varLogHR;

  // Method 1: From reported HR and CI
  if (hr && ci_lower && ci_upper) {
    logHR = Math.log(hr);
    const seLogHR = (Math.log(ci_upper) - Math.log(ci_lower)) / (2 * 1.96);
    varLogHR = seLogHR * seLogHR;
  }
  // Method 2: From observed/expected events
  else if (observed !== undefined && expected !== undefined && variance) {
    logHR = (observed - expected) / variance;
    varLogHR = 1 / variance;
  }
  // Method 3: From log-rank p-value and total events
  else if (logrank_pvalue && total_events) {
    // Derive z from p-value
    const z = normalQuantile(1 - logrank_pvalue / 2);

    // Approximate variance from total events
    // Var(O-E) ≈ D/4 where D is total events
    const approxVar = total_events / 4;

    logHR = z / Math.sqrt(approxVar);
    varLogHR = 1 / approxVar;
  }
  // Method 4: From event counts (crude estimate)
  else if (events_treatment !== undefined && events_control !== undefined &&
           n_treatment && n_control) {
    // Crude HR estimate
    const rate1 = events_treatment / n_treatment;
    const rate2 = events_control / n_control;

    if (rate2 > 0) {
      hr_est = rate1 / rate2;
      logHR = Math.log(hr_est);

      // Variance approximation
      varLogHR = 1 / events_treatment + 1 / events_control;
    }
  }
  else {
    return { error: 'Insufficient data to extract HR' };
  }

  if (logHR === undefined || varLogHR === undefined) {
    return { error: 'Could not calculate HR' };
  }

  const seLogHR = Math.sqrt(varLogHR);

  return {
    logHR,
    varLogHR,
    seLogHR,
    hr: Math.exp(logHR),
    ci_lower: Math.exp(logHR - 1.96 * seLogHR),
    ci_upper: Math.exp(logHR + 1.96 * seLogHR),
    pValue: 2 * (1 - normalCDF(Math.abs(logHR / seLogHR)))
  };
}

/**
 * Parametric survival model fitting (exponential)
 * For simple cases where parametric assumption holds
 */
export function exponentialModel(data) {
  const events = data.filter(d => d.event === 1).length;
  const totalTime = data.reduce((sum, d) => sum + d.time, 0);

  if (events === 0 || totalTime <= 0) {
    return { error: 'No events or zero follow-up time' };
  }

  const hazardRate = events / totalTime;
  const seHazard = hazardRate / Math.sqrt(events);

  return {
    model: 'exponential',
    hazardRate,
    seHazard,
    ci_lower: hazardRate * Math.exp(-1.96 / Math.sqrt(events)),
    ci_upper: hazardRate * Math.exp(1.96 / Math.sqrt(events)),
    medianSurvival: Math.log(2) / hazardRate,
    meanSurvival: 1 / hazardRate,
    n: data.length,
    events,
    personTime: totalTime
  };
}

// Helper functions
function normalCDF(x) {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;

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

function chiSquareCDF(x, df) {
  if (x <= 0) return 0;
  return gammainc(df / 2, x / 2);
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

export default {
  kaplanMeier,
  logRankTest,
  coxPH,
  restrictedMeanSurvivalTime,
  compareRMST,
  extractHR,
  exponentialModel
};
