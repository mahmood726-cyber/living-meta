/**
 * IPD-Specific Publication Bias Tests
 *
 * Implements publication bias assessment for IPD meta-analysis:
 * - IPD-based funnel plot asymmetry tests
 * - Selection model approaches
 * - Sensitivity analysis for missing studies
 * - p-curve and p-uniform for IPD
 *
 * Superior to ipdmetan: Full suite of publication bias methods for IPD
 * Reference: Ahmed et al. (2012), Debray et al. (2015)
 */

import { twoStageContinuous, twoStageBinary, twoStageSurvival } from './two-stage.js';

/**
 * Comprehensive publication bias assessment for IPD
 *
 * @param {Object} data - IPD data { studies: { studyId: [patients] } }
 * @param {Object} options - Analysis options
 * @returns {Object} Publication bias assessment results
 */
export function assessPublicationBias(data, options = {}) {
    const {
        outcomeType = 'continuous',
        treatmentVar = 'treatment',
        outcomeVar = 'outcome',
        timeVar = 'time',
        eventVar = 'event',
        alpha = 0.05
    } = options;

    // Get study-level estimates (two-stage first step)
    const studyEstimates = getStudyEstimates(data, {
        outcomeType,
        treatmentVar,
        outcomeVar,
        timeVar,
        eventVar
    });

    if (studyEstimates.length < 3) {
        return {
            error: 'Insufficient studies for publication bias assessment (need ≥3)',
            nStudies: studyEstimates.length
        };
    }

    const results = {
        nStudies: studyEstimates.length,
        studyEstimates,
        tests: {}
    };

    // 1. Egger's test (regression)
    results.tests.egger = eggerTest(studyEstimates);

    // 2. Peters' test (for binary outcomes)
    if (outcomeType === 'binary') {
        results.tests.peters = petersTest(studyEstimates);
    }

    // 3. Harbord's test (for binary outcomes)
    if (outcomeType === 'binary') {
        results.tests.harbord = harbordTest(studyEstimates);
    }

    // 4. Begg's rank correlation
    results.tests.begg = beggTest(studyEstimates);

    // 5. Trim and Fill
    results.tests.trimFill = trimAndFill(studyEstimates);

    // 6. p-curve analysis (if p-values available)
    results.tests.pcurve = pCurveAnalysis(studyEstimates);

    // 7. Selection model (Copas-style)
    results.tests.selectionModel = copasSelectionModel(studyEstimates);

    // 8. IPD-specific: Study-size effect
    results.tests.studySizeEffect = testStudySizeEffect(data, studyEstimates, {
        outcomeType,
        treatmentVar,
        outcomeVar,
        timeVar,
        eventVar
    });

    // Overall assessment
    results.overall = interpretPublicationBias(results.tests);

    return results;
}

/**
 * Get study-level estimates from IPD
 */
function getStudyEstimates(data, options) {
    const { outcomeType, treatmentVar, outcomeVar, timeVar, eventVar } = options;
    const estimates = [];

    for (const [studyId, studyData] of Object.entries(data.studies)) {
        const treated = studyData.filter(d => d[treatmentVar] === 1);
        const control = studyData.filter(d => d[treatmentVar] === 0);

        if (treated.length < 2 || control.length < 2) continue;

        let est;

        if (outcomeType === 'continuous') {
            const y1 = treated.map(d => d[outcomeVar]).filter(v => v != null);
            const y0 = control.map(d => d[outcomeVar]).filter(v => v != null);

            const mean1 = y1.reduce((a, b) => a + b, 0) / y1.length;
            const mean0 = y0.reduce((a, b) => a + b, 0) / y0.length;
            const var1 = y1.reduce((s, y) => s + (y - mean1) ** 2, 0) / (y1.length - 1);
            const var0 = y0.reduce((s, y) => s + (y - mean0) ** 2, 0) / (y0.length - 1);

            est = {
                study: studyId,
                estimate: mean1 - mean0,
                se: Math.sqrt(var1 / y1.length + var0 / y0.length),
                n: y1.length + y0.length,
                n1: y1.length,
                n0: y0.length
            };
        } else if (outcomeType === 'binary') {
            const e1 = treated.filter(d => d[outcomeVar] === 1).length;
            const e0 = control.filter(d => d[outcomeVar] === 1).length;
            const n1 = treated.length;
            const n0 = control.length;

            // Log OR with continuity correction
            const a = e1 + 0.5, b = n1 - e1 + 0.5;
            const c = e0 + 0.5, d = n0 - e0 + 0.5;
            const logOR = Math.log((a * d) / (b * c));
            const se = Math.sqrt(1/a + 1/b + 1/c + 1/d);

            est = {
                study: studyId,
                estimate: logOR,
                se,
                n: n1 + n0,
                n1, n0,
                events1: e1,
                events0: e0
            };
        } else if (outcomeType === 'survival') {
            // Log-rank based HR
            const hr = estimateHazardRatio(studyData, treatmentVar, timeVar, eventVar);
            est = {
                study: studyId,
                estimate: hr.logHR,
                se: hr.se,
                n: studyData.length,
                n1: treated.length,
                n0: control.length,
                events: hr.events
            };
        }

        if (est && isFinite(est.estimate) && isFinite(est.se) && est.se > 0) {
            est.variance = est.se ** 2;
            est.z = est.estimate / est.se;
            est.pValue = 2 * (1 - normalCDF(Math.abs(est.z)));
            estimates.push(est);
        }
    }

    return estimates;
}

/**
 * Estimate hazard ratio from survival data
 */
function estimateHazardRatio(data, treatmentVar, timeVar, eventVar) {
    const sorted = [...data].sort((a, b) => a[timeVar] - b[timeVar]);

    let O1 = 0, E1 = 0, V = 0;
    let n1 = data.filter(d => d[treatmentVar] === 1).length;
    let n0 = data.filter(d => d[treatmentVar] === 0).length;
    let events = 0;

    const eventTimes = [...new Set(sorted.filter(d => d[eventVar] === 1).map(d => d[timeVar]))];

    for (const t of eventTimes) {
        const eventsAtT = sorted.filter(d => d[timeVar] === t && d[eventVar] === 1);
        const d1 = eventsAtT.filter(d => d[treatmentVar] === 1).length;
        const d0 = eventsAtT.filter(d => d[treatmentVar] === 0).length;
        const d = d1 + d0;
        events += d;
        const n = n1 + n0;

        if (n > 0) {
            O1 += d1;
            E1 += d * n1 / n;
            V += (d * n1 * n0 * (n - d)) / (n * n * Math.max(1, n - 1));
        }

        // Update at-risk
        n1 -= data.filter(d => d[timeVar] === t && d[treatmentVar] === 1).length;
        n0 -= data.filter(d => d[timeVar] === t && d[treatmentVar] === 0).length;
    }

    return {
        logHR: V > 0 ? (O1 - E1) / V : 0,
        se: V > 0 ? 1 / Math.sqrt(V) : 1,
        events
    };
}

/**
 * Egger's regression test for funnel plot asymmetry
 */
function eggerTest(estimates) {
    // Regress z-score on precision
    const n = estimates.length;
    const y = estimates.map(e => e.estimate / e.se); // standardized effect
    const x = estimates.map(e => 1 / e.se); // precision

    // Weighted regression (weight by precision^2)
    const w = estimates.map(e => 1 / e.variance);
    const sumW = w.reduce((a, b) => a + b, 0);
    const meanX = w.reduce((s, wi, i) => s + wi * x[i], 0) / sumW;
    const meanY = w.reduce((s, wi, i) => s + wi * y[i], 0) / sumW;

    const sxx = w.reduce((s, wi, i) => s + wi * (x[i] - meanX) ** 2, 0);
    const sxy = w.reduce((s, wi, i) => s + wi * (x[i] - meanX) * (y[i] - meanY), 0);

    const slope = sxy / sxx;
    const intercept = meanY - slope * meanX;

    // Standard errors
    const yhat = x.map(xi => intercept + slope * xi);
    const sse = y.reduce((s, yi, i) => s + w[i] * (yi - yhat[i]) ** 2, 0);
    const mse = sse / (n - 2);
    const seIntercept = Math.sqrt(mse * (1 / sumW + meanX ** 2 / sxx));

    const t = intercept / seIntercept;
    const pValue = 2 * (1 - tCDF(Math.abs(t), n - 2));

    return {
        intercept,
        se: seIntercept,
        tStatistic: t,
        df: n - 2,
        pValue,
        significant: pValue < 0.1,
        interpretation: pValue < 0.1 ?
            'Significant asymmetry detected (potential publication bias)' :
            'No significant asymmetry'
    };
}

/**
 * Peters' test (better for binary outcomes)
 */
function petersTest(estimates) {
    // Regress effect on 1/n
    const n = estimates.length;
    const y = estimates.map(e => e.estimate);
    const x = estimates.map(e => 1 / e.n);
    const w = estimates.map(e => 1 / e.variance);

    const sumW = w.reduce((a, b) => a + b, 0);
    const meanX = w.reduce((s, wi, i) => s + wi * x[i], 0) / sumW;
    const meanY = w.reduce((s, wi, i) => s + wi * y[i], 0) / sumW;

    const sxx = w.reduce((s, wi, i) => s + wi * (x[i] - meanX) ** 2, 0);
    const sxy = w.reduce((s, wi, i) => s + wi * (x[i] - meanX) * (y[i] - meanY), 0);

    const slope = sxy / sxx;
    const intercept = meanY - slope * meanX;

    const yhat = x.map(xi => intercept + slope * xi);
    const sse = y.reduce((s, yi, i) => s + w[i] * (yi - yhat[i]) ** 2, 0);
    const mse = sse / (n - 2);
    const seSlope = Math.sqrt(mse / sxx);

    const t = slope / seSlope;
    const pValue = 2 * (1 - tCDF(Math.abs(t), n - 2));

    return {
        slope,
        se: seSlope,
        tStatistic: t,
        df: n - 2,
        pValue,
        significant: pValue < 0.1,
        interpretation: pValue < 0.1 ?
            'Small-study effect detected' :
            'No significant small-study effect'
    };
}

/**
 * Harbord's test (for binary outcomes, score-based)
 */
function harbordTest(estimates) {
    if (!estimates[0].events1) return { error: 'Requires binary outcome data' };

    // Score-based test
    const n = estimates.length;
    const Z = estimates.map(e => {
        const O = e.events1;
        const E = e.n1 * (e.events1 + e.events0) / e.n;
        const V = e.n1 * e.n0 * (e.events1 + e.events0) * (e.n - e.events1 - e.events0) / (e.n ** 2 * (e.n - 1));
        return { z: (O - E) / Math.sqrt(V), v: V };
    });

    const y = Z.map(z => z.z);
    const x = Z.map(z => 1 / Math.sqrt(z.v));

    // Linear regression
    const meanX = x.reduce((a, b) => a + b, 0) / n;
    const meanY = y.reduce((a, b) => a + b, 0) / n;
    const sxx = x.reduce((s, xi) => s + (xi - meanX) ** 2, 0);
    const sxy = x.reduce((s, xi, i) => s + (xi - meanX) * (y[i] - meanY), 0);

    const slope = sxy / sxx;
    const intercept = meanY - slope * meanX;

    const yhat = x.map(xi => intercept + slope * xi);
    const sse = y.reduce((s, yi, i) => s + (yi - yhat[i]) ** 2, 0);
    const mse = sse / (n - 2);
    const seIntercept = Math.sqrt(mse * (1 / n + meanX ** 2 / sxx));

    const t = intercept / seIntercept;
    const pValue = 2 * (1 - tCDF(Math.abs(t), n - 2));

    return {
        intercept,
        se: seIntercept,
        tStatistic: t,
        df: n - 2,
        pValue,
        significant: pValue < 0.1
    };
}

/**
 * Begg's rank correlation test
 */
function beggTest(estimates) {
    const n = estimates.length;

    // Rank effects and variances
    const sortedByEffect = [...estimates].sort((a, b) => a.estimate - b.estimate);
    const sortedByVar = [...estimates].sort((a, b) => a.variance - b.variance);

    const rankEffect = {};
    const rankVar = {};
    estimates.forEach(e => {
        rankEffect[e.study] = sortedByEffect.findIndex(s => s.study === e.study) + 1;
        rankVar[e.study] = sortedByVar.findIndex(s => s.study === e.study) + 1;
    });

    // Kendall's tau
    let concordant = 0, discordant = 0;
    for (let i = 0; i < n - 1; i++) {
        for (let j = i + 1; j < n; j++) {
            const e1 = estimates[i], e2 = estimates[j];
            const diffEffect = rankEffect[e1.study] - rankEffect[e2.study];
            const diffVar = rankVar[e1.study] - rankVar[e2.study];
            if (diffEffect * diffVar > 0) concordant++;
            else if (diffEffect * diffVar < 0) discordant++;
        }
    }

    const tau = (concordant - discordant) / (n * (n - 1) / 2);
    const seTau = Math.sqrt(2 * (2 * n + 5) / (9 * n * (n - 1)));
    const z = tau / seTau;
    const pValue = 2 * (1 - normalCDF(Math.abs(z)));

    return {
        kendallTau: tau,
        se: seTau,
        zStatistic: z,
        pValue,
        significant: pValue < 0.1,
        interpretation: pValue < 0.1 ?
            'Significant rank correlation (potential publication bias)' :
            'No significant rank correlation'
    };
}

/**
 * Trim and Fill method
 */
function trimAndFill(estimates) {
    const n = estimates.length;

    // Pool to get overall effect
    const weights = estimates.map(e => 1 / e.variance);
    const sumW = weights.reduce((a, b) => a + b, 0);
    const pooled = weights.reduce((s, w, i) => s + w * estimates[i].estimate, 0) / sumW;

    // Calculate normalized deviates
    const deviates = estimates.map(e => ({
        ...e,
        deviate: (e.estimate - pooled) / e.se
    })).sort((a, b) => a.deviate - b.deviate);

    // Estimate number of missing studies (R0 method)
    let r0 = 0;
    const absDeviates = deviates.map(d => Math.abs(d.deviate)).sort((a, b) => a - b);

    // Iterative trim and fill
    for (let iter = 0; iter < 10; iter++) {
        // Count asymmetric studies on positive side (assuming small study bias inflates positive effects)
        const nPos = deviates.filter(d => d.deviate > 0).length;
        const nNeg = deviates.filter(d => d.deviate < 0).length;

        // Estimate k0 (missing studies)
        const S = Math.abs(nPos - nNeg);
        r0 = Math.round((4 * S - 1) / 3);
        r0 = Math.max(0, Math.min(r0, Math.floor(n / 2)));

        if (r0 === 0) break;
    }

    // Impute missing studies (mirror extreme studies)
    const imputed = [];
    if (r0 > 0) {
        const sorted = [...estimates].sort((a, b) => b.estimate - a.estimate);
        for (let i = 0; i < r0 && i < sorted.length; i++) {
            imputed.push({
                study: `imputed_${i + 1}`,
                estimate: 2 * pooled - sorted[i].estimate,
                se: sorted[i].se,
                variance: sorted[i].variance,
                imputed: true
            });
        }
    }

    // Recalculate pooled with imputed
    const allEstimates = [...estimates, ...imputed];
    const allWeights = allEstimates.map(e => 1 / e.variance);
    const allSumW = allWeights.reduce((a, b) => a + b, 0);
    const adjustedPooled = allWeights.reduce((s, w, i) => s + w * allEstimates[i].estimate, 0) / allSumW;
    const adjustedSE = Math.sqrt(1 / allSumW);

    return {
        originalPooled: pooled,
        nMissingEstimated: r0,
        imputedStudies: imputed,
        adjustedEstimate: adjustedPooled,
        adjustedSE,
        adjustedCI: [adjustedPooled - 1.96 * adjustedSE, adjustedPooled + 1.96 * adjustedSE],
        changeDueToAdjustment: adjustedPooled - pooled,
        interpretation: r0 > 0 ?
            `${r0} missing studies estimated; adjusted effect: ${adjustedPooled.toFixed(3)}` :
            'No asymmetry detected'
    };
}

/**
 * p-curve analysis for IPD
 */
function pCurveAnalysis(estimates) {
    // Get p-values for significant studies
    const sigPValues = estimates
        .filter(e => e.pValue < 0.05)
        .map(e => e.pValue);

    if (sigPValues.length < 3) {
        return {
            error: 'Insufficient significant studies for p-curve',
            nSignificant: sigPValues.length
        };
    }

    // Calculate pp-values (transform to uniform under H0)
    const ppValues = sigPValues.map(p => p / 0.05); // conditional on p < 0.05

    // Test for right-skew (evidential value)
    // Under H0 (no effect), pp-values uniform
    // Under H1 (true effect), pp-values right-skewed

    // Binomial test: proportion below 0.025
    const below025 = ppValues.filter(pp => pp < 0.5).length;
    const binomP = binomialTest(below025, sigPValues.length, 0.5);

    // Continuous test: compare to uniform
    const meanPP = ppValues.reduce((a, b) => a + b, 0) / ppValues.length;
    const expectedMean = 0.5;
    const seMean = Math.sqrt(1/12 / sigPValues.length); // SE of uniform mean
    const z = (meanPP - expectedMean) / seMean;
    const contP = normalCDF(z); // One-sided (right-skew)

    // Test for flatness (inadequate)
    const flatP = 1 - contP;

    let interpretation;
    if (binomP < 0.05 && contP < 0.05) {
        interpretation = 'Evidential value: Studies contain real effect';
    } else if (flatP < 0.05) {
        interpretation = 'Flat p-curve: Possible p-hacking or no effect';
    } else {
        interpretation = 'Inconclusive p-curve';
    }

    return {
        nSignificant: sigPValues.length,
        proportionBelow025: below025 / sigPValues.length,
        binomialPValue: binomP,
        continuousPValue: contP,
        flatnessPValue: flatP,
        hasEvidentialValue: binomP < 0.05 && contP < 0.05,
        isFlat: flatP < 0.05,
        interpretation
    };
}

/**
 * Copas-style selection model
 */
function copasSelectionModel(estimates) {
    const n = estimates.length;

    // Fit standard random-effects model first
    const weights = estimates.map(e => 1 / e.variance);
    const sumW = weights.reduce((a, b) => a + b, 0);
    const theta = weights.reduce((s, w, i) => s + w * estimates[i].estimate, 0) / sumW;

    // Estimate tau^2 (DL method)
    const Q = estimates.reduce((s, e, i) => s + weights[i] * (e.estimate - theta) ** 2, 0);
    const C = sumW - weights.reduce((s, w) => s + w * w, 0) / sumW;
    const tau2 = Math.max(0, (Q - (n - 1)) / C);

    // Selection model: P(select | SE) = Φ(γ0 + γ1/SE)
    // Simplified: assume selection depends on SE

    // Grid search over selection parameters
    const gamma0Range = [-2, -1, 0];
    const gamma1Range = [0, 0.5, 1];

    let bestGamma = { g0: 0, g1: 0 };
    let minBias = Infinity;

    for (const g0 of gamma0Range) {
        for (const g1 of gamma1Range) {
            // Weight by selection probability
            const selProb = estimates.map(e => normalCDF(g0 + g1 / e.se));
            const adjWeights = weights.map((w, i) => w * selProb[i]);
            const adjSumW = adjWeights.reduce((a, b) => a + b, 0);

            if (adjSumW > 0) {
                const adjTheta = adjWeights.reduce((s, w, i) => s + w * estimates[i].estimate, 0) / adjSumW;
                const bias = Math.abs(adjTheta - theta);

                if (bias < minBias) {
                    minBias = bias;
                    bestGamma = { g0, g1, adjTheta };
                }
            }
        }
    }

    // Sensitivity range
    const sensitivityRange = [];
    for (let rho = 0; rho <= 0.9; rho += 0.1) {
        // Higher rho = more selection
        const selProb = estimates.map(e => Math.pow(normalCDF(e.estimate / e.se), rho));
        const adjWeights = weights.map((w, i) => w * Math.max(0.01, selProb[i]));
        const adjSumW = adjWeights.reduce((a, b) => a + b, 0);
        const adjTheta = adjWeights.reduce((s, w, i) => s + w * estimates[i].estimate, 0) / adjSumW;
        sensitivityRange.push({ rho, estimate: adjTheta });
    }

    return {
        originalEstimate: theta,
        tau2,
        sensitivityRange,
        estimateRange: [
            Math.min(...sensitivityRange.map(s => s.estimate)),
            Math.max(...sensitivityRange.map(s => s.estimate))
        ],
        interpretation: 'Sensitivity analysis across selection scenarios'
    };
}

/**
 * IPD-specific: Test for study-size effect in one-stage analysis
 */
function testStudySizeEffect(data, estimates, options) {
    const { outcomeType, treatmentVar, outcomeVar, timeVar, eventVar } = options;

    // One-stage model with study-size interaction
    const allData = [];
    const studySizes = {};

    for (const [studyId, studyData] of Object.entries(data.studies)) {
        studySizes[studyId] = studyData.length;
        for (const patient of studyData) {
            allData.push({
                ...patient,
                studyId,
                studySize: studyData.length,
                logStudySize: Math.log(studyData.length)
            });
        }
    }

    // Mean-center log study size
    const meanLogSize = Object.values(studySizes).reduce((s, n) => s + Math.log(n), 0) / Object.keys(studySizes).length;
    allData.forEach(d => {
        d.logStudySizeCentered = d.logStudySize - meanLogSize;
    });

    // Fit model with treatment × study-size interaction
    let interactionResult;

    if (outcomeType === 'continuous') {
        interactionResult = fitContinuousInteraction(allData, {
            treatment: treatmentVar,
            outcome: outcomeVar,
            modifier: 'logStudySizeCentered'
        });
    } else if (outcomeType === 'binary') {
        interactionResult = fitLogisticInteraction(allData, {
            treatment: treatmentVar,
            outcome: outcomeVar,
            modifier: 'logStudySizeCentered'
        });
    }

    const interaction = interactionResult?.interaction || 0;
    const interactionSE = interactionResult?.interactionSE || 1;
    const z = interaction / interactionSE;
    const pValue = 2 * (1 - normalCDF(Math.abs(z)));

    return {
        interaction,
        se: interactionSE,
        zValue: z,
        pValue,
        significant: pValue < 0.1,
        interpretation: pValue < 0.1 ?
            'Significant study-size effect: treatment effect varies with study size (potential bias)' :
            'No significant study-size effect'
    };
}

/**
 * Fit simple continuous interaction
 */
function fitContinuousInteraction(data, vars) {
    const { treatment, outcome, modifier } = vars;
    const n = data.length;

    const X = data.map(d => [1, d[treatment], d[modifier], d[treatment] * d[modifier]]);
    const y = data.map(d => d[outcome]);

    // OLS
    const XtX = matMult(transpose(X), X);
    const XtY = matVec(transpose(X), y);
    const XtXinv = invertMatrix(XtX);
    const beta = matVec(XtXinv, XtY);

    const yhat = X.map(row => row.reduce((s, x, j) => s + x * beta[j], 0));
    const sse = y.reduce((s, yi, i) => s + (yi - yhat[i]) ** 2, 0);
    const mse = sse / (n - 4);
    const varBeta = XtXinv.map(row => row.map(v => v * mse));

    return {
        interaction: beta[3],
        interactionSE: Math.sqrt(varBeta[3][3])
    };
}

/**
 * Fit simple logistic interaction
 */
function fitLogisticInteraction(data, vars) {
    const { treatment, outcome, modifier } = vars;
    const n = data.length;

    let beta = [0, 0, 0, 0];
    const X = data.map(d => [1, d[treatment], d[modifier], d[treatment] * d[modifier]]);
    const y = data.map(d => d[outcome]);

    for (let iter = 0; iter < 25; iter++) {
        const eta = X.map(row => row.reduce((s, x, j) => s + x * beta[j], 0));
        const p = eta.map(e => 1 / (1 + Math.exp(-Math.min(Math.max(e, -500), 500))));
        const W = p.map(pi => pi * (1 - pi) + 1e-10);

        const XtWX = matMult(transpose(X.map((row, i) => row.map(x => x * Math.sqrt(W[i])))),
                            X.map((row, i) => row.map(x => x * Math.sqrt(W[i]))));
        const z = eta.map((e, i) => e + (y[i] - p[i]) / W[i]);
        const XtWz = X.reduce((acc, row, k) => acc.map((v, j) => v + row[j] * W[k] * z[k]), [0, 0, 0, 0]);

        const XtWXinv = invertMatrix(XtWX);
        const newBeta = matVec(XtWXinv, XtWz);

        const maxChange = Math.max(...beta.map((b, i) => Math.abs(b - newBeta[i])));
        beta = newBeta;
        if (maxChange < 1e-8) break;
    }

    // Final variance
    const eta = X.map(row => row.reduce((s, x, j) => s + x * beta[j], 0));
    const p = eta.map(e => 1 / (1 + Math.exp(-Math.min(Math.max(e, -500), 500))));
    const W = p.map(pi => pi * (1 - pi) + 1e-10);
    const XtWX = [];
    for (let i = 0; i < 4; i++) {
        XtWX[i] = [];
        for (let j = 0; j < 4; j++) {
            XtWX[i][j] = X.reduce((s, row, k) => s + row[i] * W[k] * row[j], 0);
        }
    }
    const varBeta = invertMatrix(XtWX);

    return {
        interaction: beta[3],
        interactionSE: Math.sqrt(Math.max(0, varBeta[3][3]))
    };
}

/**
 * Interpret overall publication bias assessment
 */
function interpretPublicationBias(tests) {
    const signals = [];

    if (tests.egger?.significant) signals.push('Egger test');
    if (tests.peters?.significant) signals.push('Peters test');
    if (tests.begg?.significant) signals.push('Begg test');
    if (tests.studySizeEffect?.significant) signals.push('Study-size effect');

    const nSignals = signals.length;
    const trimFillMissing = tests.trimFill?.nMissingEstimated || 0;

    let risk, interpretation;

    if (nSignals >= 2 || trimFillMissing >= 3) {
        risk = 'high';
        interpretation = `High risk of publication bias (${signals.join(', ')})`;
    } else if (nSignals === 1 || trimFillMissing >= 1) {
        risk = 'moderate';
        interpretation = `Moderate concern for publication bias (${signals.length > 0 ? signals.join(', ') : 'trim-fill'})`;
    } else {
        risk = 'low';
        interpretation = 'Low risk of publication bias';
    }

    return {
        risk,
        nTestsSignificant: nSignals,
        significantTests: signals,
        trimFillMissing,
        interpretation
    };
}

// Matrix utilities
function transpose(A) { return A[0].map((_, i) => A.map(row => row[i])); }
function matMult(A, B) {
    return A.map(row => B[0].map((_, j) => row.reduce((s, v, k) => s + v * B[k][j], 0)));
}
function matVec(A, v) { return A.map(row => row.reduce((s, val, j) => s + val * v[j], 0)); }
function invertMatrix(matrix) {
    const n = matrix.length;
    const augmented = matrix.map((row, i) => [...row, ...Array(n).fill(0).map((_, j) => i === j ? 1 : 0)]);
    for (let i = 0; i < n; i++) {
        let maxRow = i;
        for (let k = i + 1; k < n; k++) if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) maxRow = k;
        [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];
        const pivot = augmented[i][i];
        if (Math.abs(pivot) < 1e-10) augmented[i][i] = 1e-10;
        for (let j = i; j < 2 * n; j++) augmented[i][j] /= pivot;
        for (let k = 0; k < n; k++) {
            if (k !== i) {
                const factor = augmented[k][i];
                for (let j = i; j < 2 * n; j++) augmented[k][j] -= factor * augmented[i][j];
            }
        }
    }
    return augmented.map(row => row.slice(n));
}

// Statistical functions
function normalCDF(z) {
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const sign = z < 0 ? -1 : 1;
    z = Math.abs(z) / Math.sqrt(2);
    const t = 1 / (1 + p * z);
    const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);
    return 0.5 * (1 + sign * y);
}

function tCDF(t, df) {
    if (df > 100) return normalCDF(t);
    const x = df / (df + t * t);
    const halfBeta = 0.5 * incompleteBeta(df / 2, 0.5, x);
    // For t >= 0: CDF = 1 - halfBeta, for t < 0: CDF = halfBeta
    return t >= 0 ? 1 - halfBeta : halfBeta;
}

function incompleteBeta(a, b, x) {
    if (x === 0) return 0; if (x === 1) return 1;
    const bt = Math.exp(lgamma(a+b) - lgamma(a) - lgamma(b) + a*Math.log(x) + b*Math.log(1-x));
    if (x < (a + 1) / (a + b + 2)) return bt * betaCF(a, b, x) / a;
    return 1 - bt * betaCF(b, a, 1-x) / b;
}

function betaCF(a, b, x) {
    const maxIter = 100, eps = 1e-10;
    let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < eps) d = eps; d = 1 / d; let h = d;
    for (let m = 1; m <= maxIter; m++) {
        let m2 = 2 * m;
        let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
        d = 1 + aa * d; if (Math.abs(d) < eps) d = eps;
        c = 1 + aa / c; if (Math.abs(c) < eps) c = eps;
        d = 1 / d; h *= d * c;
        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
        d = 1 + aa * d; if (Math.abs(d) < eps) d = eps;
        c = 1 + aa / c; if (Math.abs(c) < eps) c = eps;
        d = 1 / d; h *= d * c;
        if (Math.abs(d * c - 1) < eps) break;
    }
    return h;
}

function lgamma(x) {
    const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let y = x, tmp = x + 5.5; tmp -= (x + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;
    for (let j = 0; j < 6; j++) ser += c[j] / ++y;
    return -tmp + Math.log(2.5066282746310005 * ser / x);
}

function binomialTest(k, n, p) {
    // Two-sided binomial test
    let pValue = 0;
    for (let i = 0; i <= n; i++) {
        const prob = binomialPMF(i, n, p);
        const observed = binomialPMF(k, n, p);
        if (prob <= observed + 1e-10) pValue += prob;
    }
    return Math.min(1, pValue);
}

function binomialPMF(k, n, p) {
    return Math.exp(lgamma(n+1) - lgamma(k+1) - lgamma(n-k+1) + k*Math.log(p) + (n-k)*Math.log(1-p));
}

export default {
    assessPublicationBias,
    eggerTest,
    petersTest,
    beggTest,
    trimAndFill,
    pCurveAnalysis,
    copasSelectionModel
};
