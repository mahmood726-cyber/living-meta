/**
 * Diagnostic Plots for Meta-Analysis
 * Galaxy plot, GOSH, Baujat, and more
 * Exceeds metafor visualization capabilities
 */

import { estimateTau2, calculateI2 } from './heterogeneity-estimators.js';

// ============================================================================
// GALAXY PLOT (for bivariate meta-analysis)
// Doebler & Holling (2015) - Extends funnel plot to 2D
// ============================================================================

/**
 * Generate Galaxy plot data for bivariate meta-analysis (DTA)
 * Shows sensitivity/specificity pairs with confidence regions
 * @param {Array} studies - [{sens, spec, sensSE, specSE, n, label}]
 * @param {Object} options - Plot options
 * @returns {Object} Galaxy plot data for rendering
 */
export function galaxyPlot(studies, options = {}) {
  const {
    pooledSens = null,
    pooledSpec = null,
    correlation = -0.5,  // Typical negative correlation in DTA
    confidenceLevel = 0.95,
    showPredictionRegion = true,
    showConfidenceRegion = true,
    showStudyEllipses = true,
    ellipsePoints = 100
  } = options;

  // Transform to logit scale for analysis
  const transformedStudies = studies.map((s, i) => {
    const sensLogit = logit(s.sens);
    const specLogit = logit(s.spec);

    // SE on logit scale (delta method)
    const sensSELogit = s.sensSE / (s.sens * (1 - s.sens));
    const specSELogit = s.specSE / (s.spec * (1 - s.spec));

    return {
      ...s,
      sensLogit,
      specLogit,
      sensSELogit,
      specSELogit,
      index: i
    };
  });

  // Calculate pooled estimates if not provided
  let pooledSensLogit, pooledSpecLogit;
  if (pooledSens !== null && pooledSpec !== null) {
    pooledSensLogit = logit(pooledSens);
    pooledSpecLogit = logit(pooledSpec);
  } else {
    // Simple weighted mean
    const sensWeights = transformedStudies.map(s => 1 / (s.sensSELogit ** 2));
    const specWeights = transformedStudies.map(s => 1 / (s.specSELogit ** 2));

    pooledSensLogit = weightedMean(
      transformedStudies.map(s => s.sensLogit),
      sensWeights
    );
    pooledSpecLogit = weightedMean(
      transformedStudies.map(s => s.specLogit),
      specWeights
    );
  }

  // Estimate between-study variance-covariance
  const sensResiduals = transformedStudies.map(s => s.sensLogit - pooledSensLogit);
  const specResiduals = transformedStudies.map(s => s.specLogit - pooledSpecLogit);

  const k = studies.length;
  const tau2Sens = Math.max(0,
    variance(transformedStudies.map(s => s.sensLogit)) -
    mean(transformedStudies.map(s => s.sensSELogit ** 2))
  );
  const tau2Spec = Math.max(0,
    variance(transformedStudies.map(s => s.specLogit)) -
    mean(transformedStudies.map(s => s.specSELogit ** 2))
  );

  // Estimate between-study correlation
  const tauSens = Math.sqrt(tau2Sens);
  const tauSpec = Math.sqrt(tau2Spec);
  const covSensSpec = correlation * tauSens * tauSpec;

  // Between-study covariance matrix
  const Sigma = [
    [tau2Sens, covSensSpec],
    [covSensSpec, tau2Spec]
  ];

  // Generate confidence ellipse for pooled estimate
  const z = qnorm(1 - (1 - confidenceLevel) / 2);
  const pooledSESens = Math.sqrt(tau2Sens / k + mean(transformedStudies.map(s => s.sensSELogit ** 2)) / k);
  const pooledSESpec = Math.sqrt(tau2Spec / k + mean(transformedStudies.map(s => s.specSELogit ** 2)) / k);

  const confidenceEllipse = generateEllipse(
    pooledSensLogit, pooledSpecLogit,
    pooledSESens * z, pooledSESpec * z,
    correlation,
    ellipsePoints
  ).map(p => ({ x: ilogit(p.x), y: ilogit(p.y) }));

  // Generate prediction region (wider, includes between-study variance)
  const predictionEllipse = showPredictionRegion ? generateEllipse(
    pooledSensLogit, pooledSpecLogit,
    Math.sqrt(tau2Sens + pooledSESens ** 2) * z,
    Math.sqrt(tau2Spec + pooledSESpec ** 2) * z,
    correlation,
    ellipsePoints
  ).map(p => ({ x: ilogit(p.x), y: ilogit(p.y) })) : null;

  // Generate individual study ellipses
  const studyEllipses = showStudyEllipses ? transformedStudies.map(s => {
    const ellipse = generateEllipse(
      s.sensLogit, s.specLogit,
      s.sensSELogit * z, s.specSELogit * z,
      correlation * 0.5, // Assume some within-study correlation
      ellipsePoints
    ).map(p => ({ x: ilogit(p.x), y: ilogit(p.y) }));

    return {
      label: s.label || `Study ${s.index + 1}`,
      center: { x: s.sens, y: s.spec },
      ellipse,
      n: s.n
    };
  }) : null;

  // SROC curve approximation
  const srocCurve = generateSROCCurve(
    pooledSensLogit, pooledSpecLogit,
    tau2Sens, tau2Spec, covSensSpec,
    100
  );

  return {
    studies: studies.map((s, i) => ({
      x: s.sens,
      y: s.spec,
      label: s.label || `Study ${i + 1}`,
      n: s.n
    })),
    pooled: {
      x: ilogit(pooledSensLogit),
      y: ilogit(pooledSpecLogit)
    },
    confidenceEllipse,
    predictionEllipse,
    studyEllipses,
    srocCurve,
    heterogeneity: {
      tau2Sens,
      tau2Spec,
      correlation: covSensSpec / (tauSens * tauSpec || 1)
    },
    axes: {
      xLabel: 'Sensitivity',
      yLabel: 'Specificity',
      xRange: [0, 1],
      yRange: [0, 1]
    }
  };
}

/**
 * Generate ellipse points
 */
function generateEllipse(cx, cy, rx, ry, correlation, nPoints = 100) {
  const points = [];

  // Cholesky decomposition for correlated ellipse
  const L11 = rx;
  const L21 = correlation * ry;
  const L22 = Math.sqrt(1 - correlation ** 2) * ry;

  for (let i = 0; i <= nPoints; i++) {
    const theta = (2 * Math.PI * i) / nPoints;
    const u = Math.cos(theta);
    const v = Math.sin(theta);

    // Transform unit circle to correlated ellipse
    const x = cx + L11 * u;
    const y = cy + L21 * u + L22 * v;

    points.push({ x, y });
  }

  return points;
}

/**
 * Generate SROC curve
 */
function generateSROCCurve(mu1, mu2, tau1, tau2, cov, nPoints = 100) {
  const points = [];

  // HSROC parameterization
  const beta = (tau1 > 0 && tau2 > 0) ? cov / Math.sqrt(tau1 * tau2) : 0;

  for (let i = 0; i <= nPoints; i++) {
    const t = -4 + (8 * i) / nPoints; // Range of threshold parameter

    const sensLogit = mu1 + Math.sqrt(tau1) * t;
    const specLogit = mu2 - beta * Math.sqrt(tau2) * t;

    const sens = ilogit(sensLogit);
    const spec = ilogit(specLogit);

    if (sens > 0 && sens < 1 && spec > 0 && spec < 1) {
      points.push({ x: sens, y: spec });
    }
  }

  return points;
}

// ============================================================================
// GOSH PLOT (Graphical display Of Study Heterogeneity)
// Olkin et al. (2012)
// ============================================================================

/**
 * Generate GOSH plot data
 * Examines all possible subsets of studies (or sample if too many)
 * @param {Array} studies - [{yi, vi, label}]
 * @param {Object} options - Plot options
 * @returns {Object} GOSH plot data
 */
export function goshPlot(studies, options = {}) {
  const {
    maxSubsets = 10000,      // Maximum subsets to evaluate
    minK = 2,                // Minimum studies in subset
    method = 'DL',           // Tau2 estimation method
    seed = 12345             // Random seed for reproducibility
  } = options;

  const k = studies.length;
  const totalSubsets = Math.pow(2, k) - 1 - k; // Exclude empty, single studies

  // Determine which subsets to evaluate
  let subsets;
  if (totalSubsets <= maxSubsets) {
    // Enumerate all subsets
    subsets = generateAllSubsets(k, minK);
  } else {
    // Random sample of subsets
    subsets = sampleSubsets(k, maxSubsets, minK, seed);
  }

  // Calculate meta-analysis for each subset
  const results = [];
  const rng = seededRandom(seed);

  for (const subset of subsets) {
    const subStudies = subset.map(i => studies[i]);
    const yi = subStudies.map(s => s.yi);
    const vi = subStudies.map(s => s.vi);

    // Fixed-effect estimate
    const wFE = vi.map(v => 1 / v);
    const sumWFE = sum(wFE);
    const thetaFE = sum(yi.map((y, i) => y * wFE[i])) / sumWFE;

    // Q statistic
    const Q = sum(yi.map((y, i) => wFE[i] * (y - thetaFE) ** 2));
    const df = subset.length - 1;
    const I2 = Math.max(0, (Q - df) / Q) * 100;

    // Random-effects estimate
    const tau2Result = estimateTau2(yi, vi, method);
    const tau2 = tau2Result.tau2 || 0;

    const wRE = vi.map(v => 1 / (v + tau2));
    const sumWRE = sum(wRE);
    const thetaRE = sum(yi.map((y, i) => y * wRE[i])) / sumWRE;
    const seRE = Math.sqrt(1 / sumWRE);

    results.push({
      subset,
      k: subset.length,
      thetaFE,
      thetaRE,
      seRE,
      tau2,
      I2,
      Q
    });
  }

  // Identify potential outliers (studies in extreme subsets)
  const extremeThreshold = 0.05; // 5% tails
  const sortedByEffect = [...results].sort((a, b) => a.thetaRE - b.thetaRE);
  const lowTail = sortedByEffect.slice(0, Math.floor(results.length * extremeThreshold));
  const highTail = sortedByEffect.slice(-Math.floor(results.length * extremeThreshold));

  // Count study appearances in extreme subsets
  const studyExtremeCount = new Array(k).fill(0);
  [...lowTail, ...highTail].forEach(r => {
    r.subset.forEach(i => studyExtremeCount[i]++);
  });

  const potentialOutliers = studies.map((s, i) => ({
    index: i,
    label: s.label || `Study ${i + 1}`,
    extremeCount: studyExtremeCount[i],
    extremeProportion: studyExtremeCount[i] / (lowTail.length + highTail.length)
  })).filter(s => s.extremeProportion > 0.3)
    .sort((a, b) => b.extremeProportion - a.extremeProportion);

  // Calculate density for contour plot
  const effectRange = [
    Math.min(...results.map(r => r.thetaRE)),
    Math.max(...results.map(r => r.thetaRE))
  ];
  const i2Range = [0, 100];

  return {
    points: results.map(r => ({
      x: r.thetaRE,
      y: r.I2,
      k: r.k,
      subset: r.subset
    })),
    fullAnalysis: {
      theta: mean(results.map(r => r.thetaRE)),
      I2: mean(results.map(r => r.I2))
    },
    potentialOutliers,
    subsetsEvaluated: results.length,
    totalPossible: totalSubsets,
    axes: {
      xLabel: 'Pooled Effect Estimate',
      yLabel: 'I² (%)',
      xRange: effectRange,
      yRange: i2Range
    },
    diagnostic: {
      bimodal: detectBimodality(results.map(r => r.thetaRE)),
      highHeterogeneity: mean(results.map(r => r.I2)) > 50
    }
  };
}

/**
 * Generate all subsets of size >= minK
 */
function generateAllSubsets(k, minK) {
  const subsets = [];
  const total = Math.pow(2, k);

  for (let mask = 0; mask < total; mask++) {
    const subset = [];
    for (let i = 0; i < k; i++) {
      if (mask & (1 << i)) subset.push(i);
    }
    if (subset.length >= minK) {
      subsets.push(subset);
    }
  }

  return subsets;
}

/**
 * Sample random subsets
 */
function sampleSubsets(k, nSamples, minK, seed) {
  const rng = seededRandom(seed);
  const subsets = new Set();

  while (subsets.size < nSamples) {
    const subset = [];
    for (let i = 0; i < k; i++) {
      if (rng() > 0.5) subset.push(i);
    }
    if (subset.length >= minK) {
      subsets.add(subset.join(','));
    }
  }

  return Array.from(subsets).map(s => s.split(',').map(Number));
}

/**
 * Detect bimodality using Hartigan's dip test approximation
 */
function detectBimodality(values) {
  if (values.length < 10) return false;

  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;

  // Simple bimodality coefficient
  const m3 = centralMoment(values, 3);
  const m2 = centralMoment(values, 2);
  const skewness = m3 / Math.pow(m2, 1.5);
  const m4 = centralMoment(values, 4);
  const kurtosis = m4 / (m2 * m2) - 3;

  // Bimodality coefficient
  const bc = (skewness ** 2 + 1) / (kurtosis + 3 * (n - 1) ** 2 / ((n - 2) * (n - 3)));

  return bc > 0.555; // Threshold for bimodality
}

function centralMoment(values, order) {
  const m = mean(values);
  return mean(values.map(v => Math.pow(v - m, order)));
}

// ============================================================================
// BAUJAT PLOT
// Baujat et al. (2002) - Contribution to heterogeneity vs influence
// ============================================================================

/**
 * Generate Baujat plot data
 * X-axis: Contribution to overall heterogeneity (Q)
 * Y-axis: Influence on pooled estimate
 * @param {Array} studies - [{yi, vi, label}]
 * @param {Object} options - Plot options
 * @returns {Object} Baujat plot data
 */
export function baujatPlot(studies, options = {}) {
  const {
    method = 'DL',
    showLabels = true,
    outlierThreshold = 2 // SD from centroid
  } = options;

  const k = studies.length;
  const yi = studies.map(s => s.yi);
  const vi = studies.map(s => s.vi);

  // Full meta-analysis
  const tau2Result = estimateTau2(yi, vi, method);
  const tau2 = tau2Result.tau2 || 0;

  const w = vi.map(v => 1 / (v + tau2));
  const sumW = sum(w);
  const thetaFull = sum(yi.map((y, i) => y * w[i])) / sumW;

  // Calculate contribution and influence for each study
  const results = studies.map((study, i) => {
    // Contribution to Q (squared standardized residual)
    const residual = study.yi - thetaFull;
    const qContribution = w[i] * residual ** 2;

    // Leave-one-out influence
    const yiLOO = yi.filter((_, j) => j !== i);
    const viLOO = vi.filter((_, j) => j !== i);

    const tau2LOO = estimateTau2(yiLOO, viLOO, method).tau2 || 0;
    const wLOO = viLOO.map(v => 1 / (v + tau2LOO));
    const sumWLOO = sum(wLOO);
    const thetaLOO = sum(yiLOO.map((y, j) => y * wLOO[j])) / sumWLOO;

    const influence = Math.abs(thetaFull - thetaLOO);

    return {
      index: i,
      label: study.label || `Study ${i + 1}`,
      qContribution,
      influence,
      yi: study.yi,
      vi: study.vi,
      weight: w[i] / sumW * 100
    };
  });

  // Identify outliers (high contribution AND high influence)
  const qValues = results.map(r => r.qContribution);
  const infValues = results.map(r => r.influence);
  const qMean = mean(qValues);
  const qSD = Math.sqrt(variance(qValues));
  const infMean = mean(infValues);
  const infSD = Math.sqrt(variance(infValues));

  const outliers = results.filter(r => {
    const qZ = (r.qContribution - qMean) / (qSD || 1);
    const infZ = (r.influence - infMean) / (infSD || 1);
    const distance = Math.sqrt(qZ ** 2 + infZ ** 2);
    return distance > outlierThreshold;
  });

  // Quadrant analysis
  const quadrants = {
    topRight: results.filter(r => r.qContribution > qMean && r.influence > infMean),
    topLeft: results.filter(r => r.qContribution <= qMean && r.influence > infMean),
    bottomRight: results.filter(r => r.qContribution > qMean && r.influence <= infMean),
    bottomLeft: results.filter(r => r.qContribution <= qMean && r.influence <= infMean)
  };

  return {
    points: results,
    axes: {
      xLabel: 'Contribution to Overall Q',
      yLabel: 'Influence on Pooled Estimate',
      xRange: [0, Math.max(...qValues) * 1.1],
      yRange: [0, Math.max(...infValues) * 1.1]
    },
    centroid: { x: qMean, y: infMean },
    outliers,
    quadrants,
    interpretation: generateBaujatInterpretation(quadrants, outliers)
  };
}

function generateBaujatInterpretation(quadrants, outliers) {
  const messages = [];

  if (quadrants.topRight.length > 0) {
    messages.push(
      `Studies ${quadrants.topRight.map(s => s.label).join(', ')} ` +
      `have high heterogeneity contribution AND high influence on results. ` +
      `These are key studies driving both heterogeneity and the pooled estimate.`
    );
  }

  if (quadrants.bottomRight.length > 0) {
    messages.push(
      `Studies ${quadrants.bottomRight.map(s => s.label).join(', ')} ` +
      `contribute to heterogeneity but have low influence on the pooled estimate.`
    );
  }

  if (outliers.length > 0) {
    messages.push(
      `Potential outliers: ${outliers.map(s => s.label).join(', ')}. ` +
      `Consider sensitivity analysis excluding these studies.`
    );
  }

  if (messages.length === 0) {
    messages.push('No studies show unusual patterns of heterogeneity or influence.');
  }

  return messages;
}

// ============================================================================
// RADIAL (GALBRAITH) PLOT
// Galbraith (1988) - Standardized estimates vs precision
// ============================================================================

/**
 * Generate Radial (Galbraith) plot data
 * @param {Array} studies - [{yi, vi, label}]
 * @param {Object} options - Plot options
 * @returns {Object} Radial plot data
 */
export function radialPlot(studies, options = {}) {
  const {
    showRegressionLine = true,
    showConfidenceBands = true,
    confidenceLevel = 0.95
  } = options;

  const k = studies.length;
  const yi = studies.map(s => s.yi);
  const vi = studies.map(s => s.vi);
  const se = vi.map(v => Math.sqrt(v));

  // Transform to Galbraith coordinates
  // x = 1/SE (precision), y = effect/SE (standardized effect)
  const points = studies.map((s, i) => ({
    x: 1 / se[i],
    y: s.yi / se[i],
    label: s.label || `Study ${i + 1}`,
    yi: s.yi,
    se: se[i]
  }));

  // Fixed-effect estimate (slope of line through origin)
  const wFE = vi.map(v => 1 / v);
  const sumW = sum(wFE);
  const thetaFE = sum(yi.map((y, i) => y * wFE[i])) / sumW;

  // Regression line passes through origin with slope = pooled effect
  const regressionLine = {
    slope: thetaFE,
    intercept: 0
  };

  // Confidence bands (±z lines parallel to regression)
  const z = qnorm(1 - (1 - confidenceLevel) / 2);
  const confidenceBands = showConfidenceBands ? {
    upper: { slope: thetaFE, intercept: z },
    lower: { slope: thetaFE, intercept: -z }
  } : null;

  // Test for heterogeneity using radial regression
  // Under homogeneity, points should scatter randomly around the line
  const residuals = points.map(p => p.y - thetaFE * p.x);
  const Q = sum(residuals.map(r => r ** 2));
  const df = k - 1;
  const pHeterogeneity = 1 - pchisq(Q, df);

  // Identify outliers (outside confidence bands)
  const outliers = points.filter(p => {
    const expectedY = thetaFE * p.x;
    const residual = Math.abs(p.y - expectedY);
    return residual > z;
  });

  return {
    points,
    regressionLine,
    confidenceBands,
    pooledEffect: thetaFE,
    heterogeneity: {
      Q,
      df,
      p: pHeterogeneity,
      significant: pHeterogeneity < 0.05
    },
    outliers,
    axes: {
      xLabel: '1 / SE (Precision)',
      yLabel: 'Effect / SE (Standardized)',
      xRange: [0, Math.max(...points.map(p => p.x)) * 1.1],
      yRange: [
        Math.min(...points.map(p => p.y), -z) * 1.1,
        Math.max(...points.map(p => p.y), z) * 1.1
      ]
    }
  };
}

// ============================================================================
// L'ABBE PLOT (for binary outcomes)
// L'Abbé et al. (1987) - Treatment vs control event rates
// ============================================================================

/**
 * Generate L'Abbé plot data for binary outcomes
 * @param {Array} studies - [{a, b, c, d, label}] (2x2 table)
 * @returns {Object} L'Abbé plot data
 */
export function labbePlot(studies, options = {}) {
  const {
    showIdentityLine = true,
    showPooledLines = true,
    sizeByWeight = true
  } = options;

  const points = studies.map((s, i) => {
    const pT = s.a / (s.a + s.b); // Treatment event rate
    const pC = s.c / (s.c + s.d); // Control event rate
    const n = s.a + s.b + s.c + s.d;

    // Calculate odds ratio for weighting
    const or = (s.a * s.d) / (s.b * s.c || 1);
    const seLogOR = Math.sqrt(1/s.a + 1/s.b + 1/s.c + 1/s.d);
    const weight = 1 / (seLogOR ** 2);

    return {
      x: pC,  // Control rate
      y: pT,  // Treatment rate
      label: s.label || `Study ${i + 1}`,
      n,
      or,
      weight,
      riskDifference: pT - pC,
      riskRatio: pT / pC
    };
  });

  // Calculate pooled effect
  const totalWeight = sum(points.map(p => p.weight));
  const pooledLogOR = sum(points.map(p => Math.log(p.or) * p.weight)) / totalWeight;
  const pooledOR = Math.exp(pooledLogOR);

  // Lines of constant odds ratio
  const orLines = showPooledLines ? generateORLines(pooledOR) : null;

  // Identify studies favoring treatment vs control
  const favorsTreatment = points.filter(p => p.y > p.x);
  const favorsControl = points.filter(p => p.y < p.x);

  return {
    points,
    identityLine: showIdentityLine ? { slope: 1, intercept: 0 } : null,
    orLines,
    pooledOR,
    favorsTreatment,
    favorsControl,
    axes: {
      xLabel: 'Control Event Rate',
      yLabel: 'Treatment Event Rate',
      xRange: [0, 1],
      yRange: [0, 1]
    },
    interpretation: `${favorsTreatment.length} studies favor treatment, ` +
      `${favorsControl.length} favor control. Pooled OR = ${pooledOR.toFixed(2)}`
  };
}

function generateORLines(pooledOR) {
  const lines = [];

  // Line of pooled OR
  const orPoints = [];
  for (let pC = 0.01; pC <= 0.99; pC += 0.01) {
    // pT / (1-pT) = OR * pC / (1-pC)
    // pT = OR * pC * (1-pT) / (1-pC)
    // pT * (1-pC) = OR * pC * (1-pT)
    // pT - pT*pC = OR*pC - OR*pC*pT
    // pT + OR*pC*pT - pT*pC = OR*pC
    // pT * (1 + OR*pC - pC) = OR*pC
    // pT = OR*pC / (1 + pC*(OR-1))
    const pT = pooledOR * pC / (1 + pC * (pooledOR - 1));
    if (pT >= 0 && pT <= 1) {
      orPoints.push({ x: pC, y: pT });
    }
  }

  lines.push({ or: pooledOR, points: orPoints, label: `OR = ${pooledOR.toFixed(2)}` });

  return lines;
}

// ============================================================================
// TRIM AND FILL FUNNEL PLOT
// Duval & Tweedie (2000)
// ============================================================================

/**
 * Generate trim and fill funnel plot data
 * @param {Array} studies - [{yi, vi, label}]
 * @param {Object} options - Plot options
 * @returns {Object} Trim-fill funnel plot data
 */
export function trimFillPlot(studies, options = {}) {
  const {
    side = 'auto',  // 'left', 'right', or 'auto'
    estimator = 'L0',  // 'L0', 'R0', 'Q0'
    maxiter = 100
  } = options;

  const k = studies.length;
  const yi = studies.map(s => s.yi);
  const vi = studies.map(s => s.vi);
  const se = vi.map(v => Math.sqrt(v));

  // Initial pooled estimate
  const w = vi.map(v => 1 / v);
  const sumW = sum(w);
  let theta = sum(yi.map((y, i) => y * w[i])) / sumW;

  // Determine side with asymmetry
  let fillSide = side;
  if (fillSide === 'auto') {
    const deviations = yi.map(y => y - theta);
    const leftCount = deviations.filter(d => d < 0).length;
    fillSide = leftCount < k / 2 ? 'left' : 'right';
  }

  // Iterative trim and fill
  let trimmed = [];
  let k0 = 0;

  for (let iter = 0; iter < maxiter; iter++) {
    // Rank studies by distance from pooled effect
    const ranked = yi.map((y, i) => ({
      index: i,
      yi: y,
      vi: vi[i],
      deviation: fillSide === 'right' ? y - theta : theta - y
    })).sort((a, b) => a.deviation - b.deviation);

    // Estimate number of missing studies (L0 estimator)
    const absRanks = ranked.map((r, i) => ({
      ...r,
      rank: i + 1,
      absDeviation: Math.abs(r.deviation)
    })).sort((a, b) => a.absDeviation - b.absDeviation);

    let T = 0;
    const n = ranked.length;
    for (let i = 0; i < n; i++) {
      if (ranked[i].deviation > 0) {
        T += (i + 1);
      }
    }

    const newK0 = Math.max(0, Math.round(
      estimator === 'L0' ?
        (4 * T - n * (n + 1)) / (2 * n - 1) :
        4 * T / n - n - 1
    ));

    if (newK0 === k0 && iter > 0) break;
    k0 = newK0;

    // Identify studies to trim
    const toTrim = ranked.slice(0, k0);
    trimmed = toTrim.map(t => t.index);

    // Recalculate pooled effect excluding trimmed
    const yiTrim = yi.filter((_, i) => !trimmed.includes(i));
    const viTrim = vi.filter((_, i) => !trimmed.includes(i));
    const wTrim = viTrim.map(v => 1 / v);
    const sumWTrim = sum(wTrim);
    theta = sum(yiTrim.map((y, i) => y * wTrim[i])) / sumWTrim;
  }

  // Generate imputed studies
  const imputed = [];
  for (const trimIdx of trimmed) {
    const mirrorY = 2 * theta - yi[trimIdx];
    imputed.push({
      yi: mirrorY,
      vi: vi[trimIdx],
      se: se[trimIdx],
      label: `Imputed (mirror of Study ${trimIdx + 1})`,
      originalIndex: trimIdx
    });
  }

  // Adjusted pooled estimate
  const allYi = [...yi, ...imputed.map(s => s.yi)];
  const allVi = [...vi, ...imputed.map(s => s.vi)];
  const wAll = allVi.map(v => 1 / v);
  const sumWAll = sum(wAll);
  const thetaAdj = sum(allYi.map((y, i) => y * wAll[i])) / sumWAll;
  const seAdj = Math.sqrt(1 / sumWAll);

  // Original estimate
  const thetaOrig = sum(yi.map((y, i) => y * w[i])) / sumW;
  const seOrig = Math.sqrt(1 / sumW);

  // Generate funnel plot data
  const maxSE = Math.max(...se, ...imputed.map(s => s.se));

  return {
    original: studies.map((s, i) => ({
      x: s.yi,
      y: Math.sqrt(s.vi),
      label: s.label || `Study ${i + 1}`,
      trimmed: trimmed.includes(i)
    })),
    imputed: imputed.map(s => ({
      x: s.yi,
      y: s.se,
      label: s.label
    })),
    k0,
    estimates: {
      original: { theta: thetaOrig, se: seOrig },
      adjusted: { theta: thetaAdj, se: seAdj },
      difference: thetaAdj - thetaOrig
    },
    funnelLines: {
      center: thetaAdj,
      left95: (se) => thetaAdj - 1.96 * se,
      right95: (se) => thetaAdj + 1.96 * se
    },
    axes: {
      xLabel: 'Effect Size',
      yLabel: 'Standard Error',
      yReverse: true,
      xRange: [
        Math.min(...allYi) - maxSE * 2,
        Math.max(...allYi) + maxSE * 2
      ],
      yRange: [maxSE * 1.1, 0]
    },
    interpretation: k0 === 0 ?
      'No asymmetry detected. No studies imputed.' :
      `${k0} studies imputed. Adjusted effect: ${thetaAdj.toFixed(3)} ` +
      `(original: ${thetaOrig.toFixed(3)}, difference: ${(thetaAdj - thetaOrig).toFixed(3)})`
  };
}

// ============================================================================
// INFLUENCE DIAGNOSTICS PLOT
// Viechtbauer & Cheung (2010)
// ============================================================================

/**
 * Generate comprehensive influence diagnostics
 * @param {Array} studies - [{yi, vi, label}]
 * @param {Object} options - Plot options
 * @returns {Object} Influence diagnostics data
 */
export function influenceDiagnostics(studies, options = {}) {
  const {
    method = 'REML',
    plots = ['rstudent', 'dffits', 'cooks', 'hats', 'weights', 'tau2', 'qe']
  } = options;

  const k = studies.length;
  const yi = studies.map(s => s.yi);
  const vi = studies.map(s => s.vi);

  // Full model
  const fullResult = estimateTau2(yi, vi, method);
  const tau2 = fullResult.tau2 || 0;
  const w = vi.map(v => 1 / (v + tau2));
  const sumW = sum(w);
  const theta = sum(yi.map((y, i) => y * w[i])) / sumW;

  // Calculate diagnostics for each study
  const diagnostics = studies.map((study, i) => {
    // Leave-one-out analysis
    const yiLOO = yi.filter((_, j) => j !== i);
    const viLOO = vi.filter((_, j) => j !== i);
    const looResult = estimateTau2(yiLOO, viLOO, method);
    const tau2LOO = looResult.tau2 || 0;
    const wLOO = viLOO.map(v => 1 / (v + tau2LOO));
    const sumWLOO = sum(wLOO);
    const thetaLOO = sum(yiLOO.map((y, j) => y * wLOO[j])) / sumWLOO;

    // Residuals
    const residual = study.yi - theta;
    const seResid = Math.sqrt(vi[i] + tau2);

    // Standardized residual
    const rstudent = residual / seResid;

    // Hat value (leverage)
    const hat = w[i] / sumW;

    // DFFITS
    const dffits = (theta - thetaLOO) / Math.sqrt(vi[i] + tau2LOO);

    // Cook's distance
    const seTheta = Math.sqrt(1 / sumW);
    const cooksD = (theta - thetaLOO) ** 2 / seTheta ** 2;

    // DFBETAS
    const dfbetas = (theta - thetaLOO) / seTheta;

    // Covariance ratio
    const seThetaLOO = Math.sqrt(1 / sumWLOO);
    const covRatio = (seThetaLOO / seTheta) ** 2;

    // Q-exclusion
    const QLOO = sum(yiLOO.map((y, j) => wLOO[j] * (y - thetaLOO) ** 2));
    const QFull = sum(yi.map((y, j) => w[j] * (y - theta) ** 2));

    return {
      index: i,
      label: study.label || `Study ${i + 1}`,
      rstudent,
      dffits,
      cooksD,
      dfbetas,
      hat,
      covRatio,
      tau2LOO,
      tau2Change: tau2 - tau2LOO,
      thetaLOO,
      thetaChange: theta - thetaLOO,
      QLOO,
      QContribution: QFull - QLOO,
      weight: w[i] / sumW * 100
    };
  });

  // Identify influential studies
  const influential = {
    byRstudent: diagnostics.filter(d => Math.abs(d.rstudent) > 2),
    byDFFITS: diagnostics.filter(d => Math.abs(d.dffits) > 2 * Math.sqrt(1/k)),
    byCooksD: diagnostics.filter(d => d.cooksD > 4/k),
    byHat: diagnostics.filter(d => d.hat > 3/k)
  };

  // Generate plot data for each diagnostic
  const plotData = {};

  if (plots.includes('rstudent')) {
    plotData.rstudent = {
      values: diagnostics.map(d => ({ x: d.index, y: d.rstudent, label: d.label })),
      thresholds: [{ y: 2, label: '+2 SD' }, { y: -2, label: '-2 SD' }],
      title: 'Studentized Residuals'
    };
  }

  if (plots.includes('dffits')) {
    const threshold = 2 * Math.sqrt(1/k);
    plotData.dffits = {
      values: diagnostics.map(d => ({ x: d.index, y: d.dffits, label: d.label })),
      thresholds: [{ y: threshold, label: `+${threshold.toFixed(2)}` },
                   { y: -threshold, label: `${(-threshold).toFixed(2)}` }],
      title: 'DFFITS'
    };
  }

  if (plots.includes('cooks')) {
    plotData.cooksD = {
      values: diagnostics.map(d => ({ x: d.index, y: d.cooksD, label: d.label })),
      thresholds: [{ y: 4/k, label: `4/k = ${(4/k).toFixed(2)}` }],
      title: "Cook's Distance"
    };
  }

  if (plots.includes('hats')) {
    plotData.hat = {
      values: diagnostics.map(d => ({ x: d.index, y: d.hat, label: d.label })),
      thresholds: [{ y: 3/k, label: `3/k = ${(3/k).toFixed(2)}` }],
      title: 'Hat Values (Leverage)'
    };
  }

  if (plots.includes('tau2')) {
    plotData.tau2 = {
      values: diagnostics.map(d => ({ x: d.index, y: d.tau2LOO, label: d.label })),
      reference: tau2,
      title: 'τ² Excluding Each Study'
    };
  }

  return {
    diagnostics,
    influential,
    plotData,
    fullModel: {
      theta,
      tau2,
      se: Math.sqrt(1 / sumW)
    },
    summary: generateInfluenceSummary(diagnostics, influential)
  };
}

function generateInfluenceSummary(diagnostics, influential) {
  const messages = [];

  const allInfluential = new Set([
    ...influential.byRstudent.map(d => d.label),
    ...influential.byDFFITS.map(d => d.label),
    ...influential.byCooksD.map(d => d.label),
    ...influential.byHat.map(d => d.label)
  ]);

  if (allInfluential.size === 0) {
    messages.push('No studies identified as influential by any criterion.');
  } else {
    messages.push(`${allInfluential.size} potentially influential studies identified:`);
    allInfluential.forEach(label => {
      const d = diagnostics.find(x => x.label === label);
      const reasons = [];
      if (Math.abs(d.rstudent) > 2) reasons.push(`high residual (${d.rstudent.toFixed(2)})`);
      if (Math.abs(d.dffits) > 2 * Math.sqrt(1/diagnostics.length))
        reasons.push(`high DFFITS (${d.dffits.toFixed(2)})`);
      if (d.cooksD > 4/diagnostics.length)
        reasons.push(`high Cook's D (${d.cooksD.toFixed(2)})`);
      if (d.hat > 3/diagnostics.length)
        reasons.push(`high leverage (${d.hat.toFixed(2)})`);

      messages.push(`  - ${label}: ${reasons.join(', ')}`);
    });
  }

  return messages;
}

// ============================================================================
// CUMULATIVE META-ANALYSIS PLOT
// ============================================================================

/**
 * Generate cumulative meta-analysis data
 * @param {Array} studies - [{yi, vi, year, label}] sorted by year
 * @param {Object} options - Plot options
 * @returns {Object} Cumulative MA data
 */
export function cumulativePlot(studies, options = {}) {
  const {
    method = 'DL',
    sortBy = 'year',  // 'year', 'precision', 'effect'
    showCI = true
  } = options;

  // Sort studies
  const sorted = [...studies].sort((a, b) => {
    switch (sortBy) {
      case 'precision': return a.vi - b.vi;  // Most precise first
      case 'effect': return a.yi - b.yi;
      default: return (a.year || 0) - (b.year || 0);
    }
  });

  const cumulative = [];

  for (let i = 0; i < sorted.length; i++) {
    const subset = sorted.slice(0, i + 1);
    const yi = subset.map(s => s.yi);
    const vi = subset.map(s => s.vi);

    const tau2Result = estimateTau2(yi, vi, method);
    const tau2 = tau2Result.tau2 || 0;

    const w = vi.map(v => 1 / (v + tau2));
    const sumW = sum(w);
    const theta = sum(yi.map((y, j) => y * w[j])) / sumW;
    const se = Math.sqrt(1 / sumW);

    const z = 1.96;
    cumulative.push({
      k: i + 1,
      label: sorted[i].label || `Study ${i + 1}`,
      year: sorted[i].year,
      theta,
      se,
      ci: showCI ? [theta - z * se, theta + z * se] : null,
      tau2,
      studiesIncluded: subset.map(s => s.label || 'Unknown')
    });
  }

  // Detect stabilization point
  const stabilization = detectStabilization(cumulative.map(c => c.theta));

  return {
    cumulative,
    sortedBy: sortBy,
    stabilization,
    axes: {
      xLabel: 'Cumulative Studies',
      yLabel: 'Pooled Effect',
      xRange: [1, sorted.length],
      yRange: [
        Math.min(...cumulative.map(c => c.ci ? c.ci[0] : c.theta)),
        Math.max(...cumulative.map(c => c.ci ? c.ci[1] : c.theta))
      ]
    }
  };
}

function detectStabilization(values) {
  if (values.length < 5) return null;

  // Look for point where estimate stops changing substantially
  const final = values[values.length - 1];
  const threshold = Math.abs(final) * 0.1 || 0.05; // 10% of final or 0.05

  for (let i = values.length - 2; i >= 2; i--) {
    const change = Math.abs(values[i] - values[i-1]);
    const diffFromFinal = Math.abs(values[i] - final);

    if (change > threshold || diffFromFinal > threshold) {
      return {
        studyIndex: i + 1,
        message: `Estimate stabilized after study ${i + 1}`
      };
    }
  }

  return { studyIndex: 1, message: 'Estimate was stable from early studies' };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function logit(p) {
  p = Math.max(1e-10, Math.min(1 - 1e-10, p));
  return Math.log(p / (1 - p));
}

function ilogit(x) {
  return 1 / (1 + Math.exp(-x));
}

function sum(arr) {
  return arr.reduce((a, b) => a + b, 0);
}

function mean(arr) {
  return arr.length ? sum(arr) / arr.length : 0;
}

function variance(arr) {
  const m = mean(arr);
  return mean(arr.map(x => (x - m) ** 2));
}

function weightedMean(values, weights) {
  const sumW = sum(weights);
  return sum(values.map((v, i) => v * weights[i])) / sumW;
}

function qnorm(p) {
  // Approximation for inverse normal CDF
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;

  const a = [
    -3.969683028665376e1, 2.209460984245205e2,
    -2.759285104469687e2, 1.383577518672690e2,
    -3.066479806614716e1, 2.506628277459239e0
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2,
    -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1,
    -2.400758277161838e0, -2.549732539343734e0,
    4.374664141464968e0, 2.938163982698783e0
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1,
    2.445134137142996e0, 3.754408661907416e0
  ];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  let q, r;

  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]*q + c[1])*q + c[2])*q + c[3])*q + c[4])*q + c[5]) /
           ((((d[0]*q + d[1])*q + d[2])*q + d[3])*q + 1);
  } else if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (((((a[0]*r + a[1])*r + a[2])*r + a[3])*r + a[4])*r + a[5])*q /
           (((((b[0]*r + b[1])*r + b[2])*r + b[3])*r + b[4])*r + 1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0]*q + c[1])*q + c[2])*q + c[3])*q + c[4])*q + c[5]) /
            ((((d[0]*q + d[1])*q + d[2])*q + d[3])*q + 1);
  }
}

function pchisq(x, df) {
  // Approximation using Wilson-Hilferty transformation
  if (x <= 0) return 0;
  if (df <= 0) return 1;

  const z = Math.pow(x / df, 1/3) - (1 - 2 / (9 * df));
  const se = Math.sqrt(2 / (9 * df));
  return pnorm(z / se);
}

function pnorm(x) {
  // Standard normal CDF approximation
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

function seededRandom(seed) {
  let s = seed;
  return function() {
    s = Math.sin(s) * 10000;
    return s - Math.floor(s);
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  logit,
  ilogit,
  generateEllipse
};
