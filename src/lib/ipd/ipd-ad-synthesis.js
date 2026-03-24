/**
 * IPD + Aggregate Data Synthesis
 *
 * Combines individual patient data (IPD) with aggregate data (AD) studies
 * in a unified meta-analysis framework.
 *
 * Methods:
 * - Two-stage approach: Reduce IPD to AD, then standard MA
 * - Hierarchical approach: Model IPD and AD at different levels
 * - Bayesian synthesis: Prior from AD, update with IPD
 *
 * References:
 * - Riley RD, et al. (2008). Meta-analysis of individual participant data.
 * - Debray TPA, et al. (2015). Get real in individual patient data meta-analysis.
 * - Sutton AJ, et al. (2008). Evidence synthesis for decision making.
 */

import { derSimonianLaird, pauleMandel } from '../meta-dl.js';
import { twoStageContinuous, twoStageBinary, twoStageSurvival } from './two-stage.js';

/**
 * Synthesize IPD and AD studies using two-stage approach
 * IPD studies are reduced to AD, then pooled with other AD studies
 *
 * @param {object} input
 *   - ipd: Array of IPD records [{studyId, outcome, treatment, ...}, ...]
 *   - ad: Array of AD records [{studyId, yi, vi, ...}, ...]
 * @param {object} options
 * @returns {object} Combined analysis results
 */
export function synthesizeTwoStage(input, options = {}) {
  const {
    outcomeType = 'continuous', // 'continuous', 'binary', 'survival'
    outcomeVar = 'outcome',
    eventVar = 'event',
    timeVar = 'time',
    treatmentVar = 'treatment',
    studyVar = 'studyId',
    method = 'DL',
    hksj = true,
    measure = 'OR' // For binary: 'OR', 'RR', 'RD'
  } = options;

  const { ipd = [], ad = [] } = input;

  // Stage 1: Reduce IPD to aggregate estimates
  let ipdReducedResults;

  if (ipd.length > 0) {
    if (outcomeType === 'continuous') {
      ipdReducedResults = twoStageContinuous(ipd, {
        outcomeVar, treatmentVar, studyVar, method, hksj
      });
    } else if (outcomeType === 'binary') {
      ipdReducedResults = twoStageBinary(ipd, {
        outcomeVar: eventVar, treatmentVar, studyVar, method, hksj, measure
      });
    } else if (outcomeType === 'survival') {
      ipdReducedResults = twoStageSurvival(ipd, {
        timeVar, eventVar, treatmentVar, studyVar, method, hksj
      });
    }
  }

  // Combine IPD-derived estimates with AD studies
  const combinedStudies = [];

  // Add IPD study-level estimates
  if (ipdReducedResults && ipdReducedResults.stage1) {
    for (const study of ipdReducedResults.stage1) {
      combinedStudies.push({
        ...study,
        source: 'IPD',
        dataType: 'individual'
      });
    }
  }

  // Add AD studies
  for (const study of ad) {
    // Validate AD entry
    if (study.yi === null || study.yi === undefined ||
        study.vi === null || study.vi === undefined ||
        study.vi <= 0) {
      continue;
    }

    combinedStudies.push({
      id: study.studyId || study.id,
      yi: study.yi,
      vi: study.vi,
      se: Math.sqrt(study.vi),
      n: study.n || null,
      source: 'AD',
      dataType: 'aggregate'
    });
  }

  if (combinedStudies.length < 2) {
    return { error: 'Need at least 2 studies total' };
  }

  // Stage 2: Pool all estimates
  const poolFn = method === 'PM' ? pauleMandel : derSimonianLaird;
  const pooled = poolFn(combinedStudies, { hksj });

  // Calculate summary statistics by data source
  const ipdStudies = combinedStudies.filter(s => s.source === 'IPD');
  const adStudies = combinedStudies.filter(s => s.source === 'AD');

  let ipdPooled = null, adPooled = null;
  if (ipdStudies.length >= 2) {
    ipdPooled = poolFn(ipdStudies, { hksj });
  }
  if (adStudies.length >= 2) {
    adPooled = poolFn(adStudies, { hksj });
  }

  // Back-transform for ratio measures
  const isLogScale = outcomeType === 'binary' && measure !== 'RD' || outcomeType === 'survival';

  return {
    model: 'ipd-ad-synthesis',
    outcomeType,
    measure: outcomeType === 'binary' ? measure : null,
    studies: combinedStudies,
    pooled: {
      ...pooled,
      estimate: isLogScale ? Math.exp(pooled.theta) : pooled.theta,
      ci_lower: isLogScale ? Math.exp(pooled.ci_lower) : pooled.ci_lower,
      ci_upper: isLogScale ? Math.exp(pooled.ci_upper) : pooled.ci_upper
    },
    bySource: {
      ipd: ipdPooled ? {
        k: ipdStudies.length,
        n: ipdStudies.reduce((sum, s) => sum + (s.n || 0), 0),
        estimate: isLogScale ? Math.exp(ipdPooled.theta) : ipdPooled.theta,
        se: ipdPooled.se,
        ci_lower: isLogScale ? Math.exp(ipdPooled.ci_lower) : ipdPooled.ci_lower,
        ci_upper: isLogScale ? Math.exp(ipdPooled.ci_upper) : ipdPooled.ci_upper,
        tau2: ipdPooled.tau2,
        I2: ipdPooled.I2
      } : { k: ipdStudies.length, n: ipdStudies.reduce((sum, s) => sum + (s.n || 0), 0) },
      ad: adPooled ? {
        k: adStudies.length,
        estimate: isLogScale ? Math.exp(adPooled.theta) : adPooled.theta,
        se: adPooled.se,
        ci_lower: isLogScale ? Math.exp(adPooled.ci_lower) : adPooled.ci_lower,
        ci_upper: isLogScale ? Math.exp(adPooled.ci_upper) : adPooled.ci_upper,
        tau2: adPooled.tau2,
        I2: adPooled.I2
      } : { k: adStudies.length }
    },
    heterogeneity: {
      tau2: pooled.tau2,
      tau: pooled.tau,
      I2: pooled.I2,
      Q: pooled.Q,
      pQ: pooled.pQ
    },
    sensitivity: {
      ipdOnly: ipdPooled ? {
        estimate: isLogScale ? Math.exp(ipdPooled.theta) : ipdPooled.theta,
        ci_lower: isLogScale ? Math.exp(ipdPooled.ci_lower) : ipdPooled.ci_lower,
        ci_upper: isLogScale ? Math.exp(ipdPooled.ci_upper) : ipdPooled.ci_upper
      } : null,
      adOnly: adPooled ? {
        estimate: isLogScale ? Math.exp(adPooled.theta) : adPooled.theta,
        ci_lower: isLogScale ? Math.exp(adPooled.ci_lower) : adPooled.ci_lower,
        ci_upper: isLogScale ? Math.exp(adPooled.ci_upper) : adPooled.ci_upper
      } : null
    }
  };
}

/**
 * Hierarchical synthesis with different levels of aggregation
 *
 * Uses a two-level model where:
 * - Level 1: Within-study (IPD) or aggregate (AD)
 * - Level 2: Between-study heterogeneity
 *
 * AD studies are weighted by their inverse variance
 * IPD studies contribute with their full covariance structure
 *
 * @param {object} input
 * @param {object} options
 */
export function synthesizeHierarchical(input, options = {}) {
  const {
    outcomeType = 'continuous',
    outcomeVar = 'outcome',
    treatmentVar = 'treatment',
    studyVar = 'studyId',
    maxIter = 50,
    tolerance = 1e-5
  } = options;

  const { ipd = [], ad = [] } = input;

  // Get IPD studies
  const ipdStudies = [...new Set(ipd.map(d => d[studyVar]))];
  const adStudies = ad.map(s => s.studyId || s.id);

  const k = ipdStudies.length + adStudies.length;
  if (k < 2) {
    return { error: 'Need at least 2 studies' };
  }

  // Initialize parameters
  let beta = 0; // Overall treatment effect
  let tau2 = 0.1; // Between-study variance

  // Iterative estimation (simplified REML-like)
  let converged = false;
  let iter = 0;

  for (iter = 0; iter < maxIter; iter++) {
    const prevBeta = beta;

    // Calculate study-specific contributions
    const contributions = [];

    // IPD studies
    for (const studyId of ipdStudies) {
      const studyData = ipd.filter(d => d[studyVar] === studyId);

      const treatment = studyData.filter(d => d[treatmentVar] === 1);
      const control = studyData.filter(d => d[treatmentVar] === 0);

      if (treatment.length === 0 || control.length === 0) continue;

      const m1 = mean(treatment.map(d => d[outcomeVar]));
      const m2 = mean(control.map(d => d[outcomeVar]));
      const v1 = variance(treatment.map(d => d[outcomeVar])) / treatment.length;
      const v2 = variance(control.map(d => d[outcomeVar])) / control.length;

      const yi = m1 - m2;
      const vi = v1 + v2;

      contributions.push({
        studyId,
        source: 'IPD',
        yi,
        vi,
        weight: 1 / (vi + tau2)
      });
    }

    // AD studies
    for (const study of ad) {
      if (study.yi === null || study.vi === null || study.vi <= 0) continue;

      contributions.push({
        studyId: study.studyId || study.id,
        source: 'AD',
        yi: study.yi,
        vi: study.vi,
        weight: 1 / (study.vi + tau2)
      });
    }

    if (contributions.length < 2) {
      return { error: 'Insufficient valid studies' };
    }

    // Update beta (weighted mean)
    const sumW = contributions.reduce((sum, c) => sum + c.weight, 0);
    const sumWY = contributions.reduce((sum, c) => sum + c.weight * c.yi, 0);
    beta = sumWY / sumW;

    // Update tau2 (DerSimonian-Laird style)
    const Q = contributions.reduce((sum, c) =>
      sum + c.weight * Math.pow(c.yi - beta, 2), 0);

    const sumW2 = contributions.reduce((sum, c) => sum + c.weight * c.weight, 0);
    const C = sumW - sumW2 / sumW;

    const newTau2 = Math.max(0, (Q - (contributions.length - 1)) / C);
    tau2 = newTau2;

    // Check convergence
    if (Math.abs(beta - prevBeta) < tolerance) {
      converged = true;
      break;
    }
  }

  // Final calculations
  const contributions = [];

  for (const studyId of ipdStudies) {
    const studyData = ipd.filter(d => d[studyVar] === studyId);
    const treatment = studyData.filter(d => d[treatmentVar] === 1);
    const control = studyData.filter(d => d[treatmentVar] === 0);

    if (treatment.length === 0 || control.length === 0) continue;

    const yi = mean(treatment.map(d => d[outcomeVar])) -
               mean(control.map(d => d[outcomeVar]));
    const vi = variance(treatment.map(d => d[outcomeVar])) / treatment.length +
               variance(control.map(d => d[outcomeVar])) / control.length;

    contributions.push({ studyId, source: 'IPD', yi, vi, n: studyData.length });
  }

  for (const study of ad) {
    if (study.yi === null || study.vi === null || study.vi <= 0) continue;
    contributions.push({
      studyId: study.studyId || study.id,
      source: 'AD',
      yi: study.yi,
      vi: study.vi,
      n: study.n || null
    });
  }

  // Calculate final pooled estimate with RE weights
  const weights = contributions.map(c => 1 / (c.vi + tau2));
  const sumW = weights.reduce((a, b) => a + b, 0);
  const se = 1 / Math.sqrt(sumW);

  // Q statistic
  const Q = contributions.reduce((sum, c, i) =>
    sum + weights[i] * Math.pow(c.yi - beta, 2), 0);

  // I²
  const I2 = Math.max(0, (Q - (contributions.length - 1)) / Q * 100);

  const z = beta / se;
  const pValue = 2 * (1 - normalCDF(Math.abs(z)));

  return {
    model: 'hierarchical-synthesis',
    k: contributions.length,
    nIPD: ipdStudies.length,
    nAD: adStudies.length,
    studies: contributions.map((c, i) => ({
      ...c,
      weight: weights[i],
      weightPercent: (weights[i] / sumW) * 100
    })),
    estimate: beta,
    se,
    ci_lower: beta - 1.96 * se,
    ci_upper: beta + 1.96 * se,
    z,
    pValue,
    tau2,
    tau: Math.sqrt(tau2),
    Q,
    df: contributions.length - 1,
    pQ: 1 - chiSquareCDF(Q, contributions.length - 1),
    I2,
    converged,
    iterations: iter
  };
}

/**
 * Bayesian-style synthesis using AD as prior
 *
 * Uses aggregate data to form an informative prior,
 * then updates with IPD for improved precision
 *
 * @param {object} input
 * @param {object} options
 */
export function synthesizeBayesian(input, options = {}) {
  const {
    outcomeType = 'continuous',
    outcomeVar = 'outcome',
    treatmentVar = 'treatment',
    studyVar = 'studyId',
    priorWeight = 1.0 // Weight of AD prior (1.0 = full weight)
  } = options;

  const { ipd = [], ad = [] } = input;

  // Step 1: Calculate prior from AD studies
  let priorMean = 0;
  let priorVar = 100; // Vague prior

  if (ad.length >= 2) {
    const validAD = ad.filter(s => s.yi !== null && s.vi > 0);

    if (validAD.length >= 2) {
      const adPooled = derSimonianLaird(validAD.map(s => ({
        yi: s.yi,
        vi: s.vi,
        id: s.studyId || s.id
      })));

      priorMean = adPooled.theta;
      priorVar = adPooled.variance * priorWeight;
    }
  } else if (ad.length === 1 && ad[0].yi !== null && ad[0].vi > 0) {
    priorMean = ad[0].yi;
    priorVar = ad[0].vi * priorWeight;
  }

  // Step 2: Calculate likelihood from IPD
  const ipdStudies = [...new Set(ipd.map(d => d[studyVar]))];
  const ipdEstimates = [];

  for (const studyId of ipdStudies) {
    const studyData = ipd.filter(d => d[studyVar] === studyId);

    const treatment = studyData.filter(d => d[treatmentVar] === 1);
    const control = studyData.filter(d => d[treatmentVar] === 0);

    if (treatment.length === 0 || control.length === 0) continue;

    const yi = mean(treatment.map(d => d[outcomeVar])) -
               mean(control.map(d => d[outcomeVar]));
    const vi = variance(treatment.map(d => d[outcomeVar])) / treatment.length +
               variance(control.map(d => d[outcomeVar])) / control.length;

    ipdEstimates.push({ studyId, yi, vi, n: studyData.length });
  }

  let likelihoodMean = 0;
  let likelihoodVar = 100;

  if (ipdEstimates.length >= 2) {
    const ipdPooled = derSimonianLaird(ipdEstimates);
    likelihoodMean = ipdPooled.theta;
    likelihoodVar = ipdPooled.variance;
  } else if (ipdEstimates.length === 1) {
    likelihoodMean = ipdEstimates[0].yi;
    likelihoodVar = ipdEstimates[0].vi;
  }

  // Step 3: Bayesian update (conjugate normal)
  // Posterior precision = prior precision + likelihood precision
  const priorPrecision = 1 / priorVar;
  const likelihoodPrecision = 1 / likelihoodVar;
  const posteriorPrecision = priorPrecision + likelihoodPrecision;
  const posteriorVar = 1 / posteriorPrecision;

  // Posterior mean = weighted average
  const posteriorMean = (priorPrecision * priorMean + likelihoodPrecision * likelihoodMean) /
                        posteriorPrecision;

  const posteriorSE = Math.sqrt(posteriorVar);
  const z = posteriorMean / posteriorSE;
  const pValue = 2 * (1 - normalCDF(Math.abs(z)));

  // 95% credible interval
  const ci_lower = posteriorMean - 1.96 * posteriorSE;
  const ci_upper = posteriorMean + 1.96 * posteriorSE;

  return {
    model: 'bayesian-synthesis',
    prior: {
      source: 'AD',
      k: ad.length,
      mean: priorMean,
      variance: priorVar / priorWeight,
      effectiveVariance: priorVar,
      weight: priorWeight
    },
    likelihood: {
      source: 'IPD',
      k: ipdEstimates.length,
      mean: likelihoodMean,
      variance: likelihoodVar
    },
    posterior: {
      mean: posteriorMean,
      variance: posteriorVar,
      se: posteriorSE,
      ci_lower,
      ci_upper,
      z,
      pValue
    },
    shrinkage: {
      ipdToAD: likelihoodPrecision / posteriorPrecision,
      adToIPD: priorPrecision / posteriorPrecision
    },
    studies: {
      ad: ad.map(s => ({ id: s.studyId || s.id, yi: s.yi, vi: s.vi })),
      ipd: ipdEstimates
    }
  };
}

/**
 * Compare IPD and AD estimates for consistency
 * Tests whether IPD and AD studies provide consistent evidence
 */
export function testConsistency(input, options = {}) {
  const {
    outcomeType = 'continuous',
    outcomeVar = 'outcome',
    treatmentVar = 'treatment',
    studyVar = 'studyId'
  } = options;

  const { ipd = [], ad = [] } = input;

  // Get pooled estimates from each source
  const ipdStudies = [...new Set(ipd.map(d => d[studyVar]))];
  const ipdEstimates = [];

  for (const studyId of ipdStudies) {
    const studyData = ipd.filter(d => d[studyVar] === studyId);
    const treatment = studyData.filter(d => d[treatmentVar] === 1);
    const control = studyData.filter(d => d[treatmentVar] === 0);

    if (treatment.length === 0 || control.length === 0) continue;

    const yi = mean(treatment.map(d => d[outcomeVar])) -
               mean(control.map(d => d[outcomeVar]));
    const vi = variance(treatment.map(d => d[outcomeVar])) / treatment.length +
               variance(control.map(d => d[outcomeVar])) / control.length;

    ipdEstimates.push({ yi, vi });
  }

  const validAD = ad.filter(s => s.yi !== null && s.vi > 0);

  if (ipdEstimates.length < 1 || validAD.length < 1) {
    return { error: 'Need at least 1 study from each source' };
  }

  let ipdMean, ipdVar, adMean, adVar;

  if (ipdEstimates.length >= 2) {
    const pooled = derSimonianLaird(ipdEstimates);
    ipdMean = pooled.theta;
    ipdVar = pooled.variance;
  } else {
    ipdMean = ipdEstimates[0].yi;
    ipdVar = ipdEstimates[0].vi;
  }

  if (validAD.length >= 2) {
    const pooled = derSimonianLaird(validAD);
    adMean = pooled.theta;
    adVar = pooled.variance;
  } else {
    adMean = validAD[0].yi;
    adVar = validAD[0].vi;
  }

  // Test difference
  const diff = ipdMean - adMean;
  const seDiff = Math.sqrt(ipdVar + adVar);
  const z = diff / seDiff;
  const pValue = 2 * (1 - normalCDF(Math.abs(z)));

  return {
    test: 'consistency',
    ipd: {
      k: ipdEstimates.length,
      estimate: ipdMean,
      se: Math.sqrt(ipdVar)
    },
    ad: {
      k: validAD.length,
      estimate: adMean,
      se: Math.sqrt(adVar)
    },
    difference: {
      estimate: diff,
      se: seDiff,
      z,
      pValue,
      ci_lower: diff - 1.96 * seDiff,
      ci_upper: diff + 1.96 * seDiff
    },
    consistent: pValue > 0.05,
    interpretation: pValue > 0.05
      ? 'No significant difference between IPD and AD estimates (consistent)'
      : 'Significant difference between IPD and AD estimates (potential inconsistency)'
  };
}

// Helper functions
function mean(arr) {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function variance(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return arr.reduce((sum, x) => sum + Math.pow(x - m, 2), 0) / (arr.length - 1);
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
  synthesizeTwoStage,
  synthesizeHierarchical,
  synthesizeBayesian,
  testConsistency
};
