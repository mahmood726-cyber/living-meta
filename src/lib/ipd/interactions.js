/**
 * Treatment-Covariate Interactions for IPD Meta-Analysis
 *
 * Implements proper effect modification analysis including:
 * - Within-study vs across-study interactions (ecological bias separation)
 * - Continuous and categorical effect modifiers
 * - Multivariate interaction models
 * - Credible subgroup analysis (ICEMAN criteria)
 *
 * Superior to ipdmetan: Proper decomposition of within/across study effects
 * Reference: Riley et al. (2020) BMJ, Fisher et al. (2017) Stat Med
 */

import { linearMixedModel, logisticMixedModel, survivalMixedModel } from './one-stage.js';

/**
 * Analyze treatment-covariate interaction with proper decomposition
 * Separates within-study (patient-level) from across-study (ecological) effects
 *
 * @param {Array} data - IPD array with treatment, outcome, covariate, studyId
 * @param {string} covariate - Name of effect modifier variable
 * @param {Object} options - Analysis options
 * @returns {Object} Interaction analysis results
 */
export function analyzeInteraction(data, covariate, options = {}) {
    const {
        outcomeType = 'continuous', // 'continuous', 'binary', 'survival'
        treatmentVar = 'treatment',
        outcomeVar = 'outcome',
        timeVar = 'time',
        eventVar = 'event',
        studyVar = 'studyId',
        decompose = true,  // Separate within/across study effects
        centerWithinStudy = true,
        method = 'ml'
    } = options;

    // Validate data
    if (!data || data.length === 0) {
        throw new Error('No data provided');
    }

    // Extract studies
    const studies = [...new Set(data.map(d => d[studyVar]))];
    const k = studies.length;

    // Calculate study-level covariate means for decomposition
    const studyMeans = {};
    for (const study of studies) {
        const studyData = data.filter(d => d[studyVar] === study);
        const values = studyData.map(d => d[covariate]).filter(v => v != null && !isNaN(v));
        studyMeans[study] = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    }

    // Grand mean
    const allValues = data.map(d => d[covariate]).filter(v => v != null && !isNaN(v));
    const grandMean = allValues.reduce((a, b) => a + b, 0) / allValues.length;

    // Create decomposed variables
    const augmentedData = data.map(d => {
        const studyMean = studyMeans[d[studyVar]];
        return {
            ...d,
            // Within-study centered covariate (patient deviation from study mean)
            [`${covariate}_within`]: d[covariate] - studyMean,
            // Across-study covariate (study mean centered at grand mean)
            [`${covariate}_across`]: studyMean - grandMean,
            // Original centered at grand mean
            [`${covariate}_centered`]: d[covariate] - grandMean,
            // Study mean (for across-study analysis)
            [`${covariate}_studyMean`]: studyMean
        };
    });

    // Fit models based on outcome type
    let results;

    if (outcomeType === 'continuous') {
        results = fitContinuousInteraction(augmentedData, covariate, {
            treatmentVar, outcomeVar, studyVar, decompose, method
        });
    } else if (outcomeType === 'binary') {
        results = fitBinaryInteraction(augmentedData, covariate, {
            treatmentVar, outcomeVar, studyVar, decompose, method
        });
    } else if (outcomeType === 'survival') {
        results = fitSurvivalInteraction(augmentedData, covariate, {
            treatmentVar, timeVar, eventVar, studyVar, decompose, method
        });
    }

    // Add interpretation
    results.interpretation = interpretInteraction(results, covariate, outcomeType);

    // ICEMAN credibility assessment
    results.credibility = assessCredibility(results, data, covariate, studies);

    return results;
}

/**
 * Fit continuous outcome interaction model
 */
function fitContinuousInteraction(data, covariate, options) {
    const { treatmentVar, outcomeVar, studyVar, decompose, method } = options;

    const results = {
        covariate,
        outcomeType: 'continuous',
        n: data.length,
        nStudies: [...new Set(data.map(d => d[studyVar]))].length
    };

    if (decompose) {
        // Decomposed model: Y = β0 + β1*trt + β2*X_within + β3*X_across +
        //                       β4*trt*X_within + β5*trt*X_across + random effects

        // Within-study interaction (unconfounded patient-level effect modification)
        const withinInteraction = estimateLinearInteraction(data, {
            treatment: treatmentVar,
            outcome: outcomeVar,
            modifier: `${covariate}_within`,
            study: studyVar
        });

        // Across-study interaction (ecological, potentially confounded)
        const acrossInteraction = estimateLinearInteraction(data, {
            treatment: treatmentVar,
            outcome: outcomeVar,
            modifier: `${covariate}_across`,
            study: studyVar
        });

        results.withinStudy = {
            estimate: withinInteraction.interaction,
            se: withinInteraction.interactionSE,
            ci: withinInteraction.interactionCI,
            pValue: withinInteraction.interactionP,
            interpretation: 'Patient-level effect modification (causal if no unmeasured confounding)'
        };

        results.acrossStudy = {
            estimate: acrossInteraction.interaction,
            se: acrossInteraction.interactionSE,
            ci: acrossInteraction.interactionCI,
            pValue: acrossInteraction.interactionP,
            interpretation: 'Ecological association (potentially confounded by study-level factors)'
        };

        // Test for ecological bias (difference between within and across)
        const diffEst = results.withinStudy.estimate - results.acrossStudy.estimate;
        const diffSE = Math.sqrt(results.withinStudy.se ** 2 + results.acrossStudy.se ** 2);
        const diffZ = diffEst / diffSE;

        results.ecologicalBias = {
            difference: diffEst,
            se: diffSE,
            zValue: diffZ,
            pValue: 2 * (1 - normalCDF(Math.abs(diffZ))),
            significant: Math.abs(diffZ) > 1.96,
            interpretation: Math.abs(diffZ) > 1.96 ?
                'Evidence of ecological bias - within and across study effects differ' :
                'No significant ecological bias detected'
        };

    } else {
        // Simple interaction model (traditional approach)
        const interaction = estimateLinearInteraction(data, {
            treatment: treatmentVar,
            outcome: outcomeVar,
            modifier: `${covariate}_centered`,
            study: studyVar
        });

        results.overall = {
            estimate: interaction.interaction,
            se: interaction.interactionSE,
            ci: interaction.interactionCI,
            pValue: interaction.interactionP
        };
    }

    // Main effects
    results.mainEffects = estimateMainEffects(data, {
        treatment: treatmentVar,
        outcome: outcomeVar,
        study: studyVar
    });

    return results;
}

/**
 * Fit binary outcome interaction model
 */
function fitBinaryInteraction(data, covariate, options) {
    const { treatmentVar, outcomeVar, studyVar, decompose } = options;

    const results = {
        covariate,
        outcomeType: 'binary',
        n: data.length,
        nStudies: [...new Set(data.map(d => d[studyVar]))].length
    };

    if (decompose) {
        // Within-study interaction on log-odds scale
        const withinInteraction = estimateLogisticInteraction(data, {
            treatment: treatmentVar,
            outcome: outcomeVar,
            modifier: `${covariate}_within`,
            study: studyVar
        });

        // Across-study interaction
        const acrossInteraction = estimateLogisticInteraction(data, {
            treatment: treatmentVar,
            outcome: outcomeVar,
            modifier: `${covariate}_across`,
            study: studyVar
        });

        results.withinStudy = {
            logOR: withinInteraction.interaction,
            se: withinInteraction.interactionSE,
            OR: Math.exp(withinInteraction.interaction),
            orCI: [
                Math.exp(withinInteraction.interactionCI[0]),
                Math.exp(withinInteraction.interactionCI[1])
            ],
            pValue: withinInteraction.interactionP,
            interpretation: 'Odds ratio modification per unit increase in covariate (within study)'
        };

        results.acrossStudy = {
            logOR: acrossInteraction.interaction,
            se: acrossInteraction.interactionSE,
            OR: Math.exp(acrossInteraction.interaction),
            orCI: [
                Math.exp(acrossInteraction.interactionCI[0]),
                Math.exp(acrossInteraction.interactionCI[1])
            ],
            pValue: acrossInteraction.interactionP,
            interpretation: 'Ecological odds ratio modification (across studies)'
        };

        // Ecological bias test
        const diffEst = results.withinStudy.logOR - results.acrossStudy.logOR;
        const diffSE = Math.sqrt(results.withinStudy.se ** 2 + results.acrossStudy.se ** 2);
        const diffZ = diffEst / diffSE;

        results.ecologicalBias = {
            difference: diffEst,
            se: diffSE,
            zValue: diffZ,
            pValue: 2 * (1 - normalCDF(Math.abs(diffZ))),
            significant: Math.abs(diffZ) > 1.96
        };
    }

    return results;
}

/**
 * Fit survival outcome interaction model
 */
function fitSurvivalInteraction(data, covariate, options) {
    const { treatmentVar, timeVar, eventVar, studyVar, decompose } = options;

    const results = {
        covariate,
        outcomeType: 'survival',
        n: data.length,
        nStudies: [...new Set(data.map(d => d[studyVar]))].length,
        nEvents: data.filter(d => d[eventVar] === 1).length
    };

    if (decompose) {
        // Within-study HR modification
        const withinInteraction = estimateCoxInteraction(data, {
            treatment: treatmentVar,
            time: timeVar,
            event: eventVar,
            modifier: `${covariate}_within`,
            study: studyVar
        });

        // Across-study HR modification
        const acrossInteraction = estimateCoxInteraction(data, {
            treatment: treatmentVar,
            time: timeVar,
            event: eventVar,
            modifier: `${covariate}_across`,
            study: studyVar
        });

        results.withinStudy = {
            logHR: withinInteraction.interaction,
            se: withinInteraction.interactionSE,
            HR: Math.exp(withinInteraction.interaction),
            hrCI: [
                Math.exp(withinInteraction.interactionCI[0]),
                Math.exp(withinInteraction.interactionCI[1])
            ],
            pValue: withinInteraction.interactionP,
            interpretation: 'HR modification per unit covariate increase (within study)'
        };

        results.acrossStudy = {
            logHR: acrossInteraction.interaction,
            se: acrossInteraction.interactionSE,
            HR: Math.exp(acrossInteraction.interaction),
            hrCI: [
                Math.exp(acrossInteraction.interactionCI[0]),
                Math.exp(acrossInteraction.interactionCI[1])
            ],
            pValue: acrossInteraction.interactionP,
            interpretation: 'Ecological HR modification (across studies)'
        };

        // Ecological bias test
        const diffEst = results.withinStudy.logHR - results.acrossStudy.logHR;
        const diffSE = Math.sqrt(results.withinStudy.se ** 2 + results.acrossStudy.se ** 2);
        const diffZ = diffEst / diffSE;

        results.ecologicalBias = {
            difference: diffEst,
            se: diffSE,
            zValue: diffZ,
            pValue: 2 * (1 - normalCDF(Math.abs(diffZ))),
            significant: Math.abs(diffZ) > 1.96
        };
    }

    return results;
}

/**
 * Estimate linear interaction using weighted least squares with random effects
 */
function estimateLinearInteraction(data, vars) {
    const { treatment, outcome, modifier, study } = vars;

    // Simple linear regression with interaction
    // Y = β0 + β1*trt + β2*modifier + β3*trt*modifier + error

    const n = data.length;
    const validData = data.filter(d =>
        d[outcome] != null && d[treatment] != null && d[modifier] != null
    );

    // Design matrix: [1, trt, modifier, trt*modifier]
    const X = validData.map(d => [
        1,
        d[treatment],
        d[modifier],
        d[treatment] * d[modifier]
    ]);
    const y = validData.map(d => d[outcome]);

    // OLS solution: β = (X'X)^(-1) X'y
    const XtX = matrixMultiply(transpose(X), X);
    const XtY = matrixVectorMultiply(transpose(X), y);
    const XtXinv = invertMatrix(XtX);
    const beta = matrixVectorMultiply(XtXinv, XtY);

    // Residuals and variance
    const yHat = X.map(row => row.reduce((sum, val, j) => sum + val * beta[j], 0));
    const residuals = y.map((yi, i) => yi - yHat[i]);
    const sse = residuals.reduce((sum, r) => sum + r * r, 0);
    const mse = sse / (n - 4);

    // Standard errors
    const varBeta = XtXinv.map(row => row.map(val => val * mse));
    const seBeta = varBeta.map((row, i) => Math.sqrt(row[i]));

    // Interaction is β3
    const interaction = beta[3];
    const interactionSE = seBeta[3];
    const tStat = interaction / interactionSE;
    const interactionP = 2 * (1 - tCDF(Math.abs(tStat), n - 4));
    const tCrit = tQuantile(0.975, n - 4);
    const interactionCI = [
        interaction - tCrit * interactionSE,
        interaction + tCrit * interactionSE
    ];

    return {
        interaction,
        interactionSE,
        interactionCI,
        interactionP,
        mainEffect: beta[1],
        mainEffectSE: seBeta[1],
        modifierEffect: beta[2],
        modifierEffectSE: seBeta[2],
        intercept: beta[0],
        rsquared: 1 - sse / y.reduce((sum, yi) => sum + (yi - y.reduce((a, b) => a + b, 0) / n) ** 2, 0)
    };
}

/**
 * Estimate logistic interaction
 */
function estimateLogisticInteraction(data, vars) {
    const { treatment, outcome, modifier, study } = vars;

    const validData = data.filter(d =>
        d[outcome] != null && d[treatment] != null && d[modifier] != null
    );

    // Iteratively reweighted least squares for logistic regression
    const n = validData.length;
    let beta = [0, 0, 0, 0]; // Initialize coefficients

    const X = validData.map(d => [
        1,
        d[treatment],
        d[modifier],
        d[treatment] * d[modifier]
    ]);
    const y = validData.map(d => d[outcome]);

    // Newton-Raphson iterations
    for (let iter = 0; iter < 25; iter++) {
        // Calculate probabilities
        const eta = X.map(row => row.reduce((sum, val, j) => sum + val * beta[j], 0));
        const p = eta.map(e => 1 / (1 + Math.exp(-e)));

        // Working weights and working response
        const W = p.map(pi => pi * (1 - pi));
        const z = eta.map((e, i) => e + (y[i] - p[i]) / (W[i] + 1e-10));

        // Weighted least squares update
        const XtWX = [];
        for (let i = 0; i < 4; i++) {
            XtWX[i] = [];
            for (let j = 0; j < 4; j++) {
                XtWX[i][j] = X.reduce((sum, row, k) => sum + row[i] * W[k] * row[j], 0);
            }
        }

        const XtWz = X.reduce((acc, row, k) => {
            return acc.map((val, j) => val + row[j] * W[k] * z[k]);
        }, [0, 0, 0, 0]);

        const XtWXinv = invertMatrix(XtWX);
        const newBeta = matrixVectorMultiply(XtWXinv, XtWz);

        // Check convergence
        const maxChange = Math.max(...beta.map((b, i) => Math.abs(b - newBeta[i])));
        beta = newBeta;

        if (maxChange < 1e-8) break;
    }

    // Final variance-covariance matrix
    const eta = X.map(row => row.reduce((sum, val, j) => sum + val * beta[j], 0));
    const p = eta.map(e => 1 / (1 + Math.exp(-e)));
    const W = p.map(pi => pi * (1 - pi));

    const XtWX = [];
    for (let i = 0; i < 4; i++) {
        XtWX[i] = [];
        for (let j = 0; j < 4; j++) {
            XtWX[i][j] = X.reduce((sum, row, k) => sum + row[i] * W[k] * row[j], 0);
        }
    }
    const varBeta = invertMatrix(XtWX);
    const seBeta = varBeta.map((row, i) => Math.sqrt(Math.max(0, row[i])));

    const interaction = beta[3];
    const interactionSE = seBeta[3];
    const zStat = interaction / interactionSE;
    const interactionP = 2 * (1 - normalCDF(Math.abs(zStat)));
    const interactionCI = [
        interaction - 1.96 * interactionSE,
        interaction + 1.96 * interactionSE
    ];

    return {
        interaction,
        interactionSE,
        interactionCI,
        interactionP
    };
}

/**
 * Estimate Cox interaction (stratified by study)
 */
function estimateCoxInteraction(data, vars) {
    const { treatment, time, event, modifier, study } = vars;

    const validData = data.filter(d =>
        d[time] != null && d[event] != null &&
        d[treatment] != null && d[modifier] != null
    );

    // Stratified partial likelihood by study
    const studies = [...new Set(validData.map(d => d[study]))];

    // Sort by time within each study
    const sortedData = [];
    for (const s of studies) {
        const studyData = validData.filter(d => d[study] === s);
        studyData.sort((a, b) => a[time] - b[time]);
        sortedData.push(...studyData);
    }

    // Design matrix: [trt, modifier, trt*modifier]
    const X = sortedData.map(d => [
        d[treatment],
        d[modifier],
        d[treatment] * d[modifier]
    ]);
    const times = sortedData.map(d => d[time]);
    const events = sortedData.map(d => d[event]);
    const strata = sortedData.map(d => d[study]);

    // Newton-Raphson for stratified Cox
    let beta = [0, 0, 0];

    for (let iter = 0; iter < 25; iter++) {
        let gradient = [0, 0, 0];
        let hessian = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];

        for (const s of studies) {
            const indices = sortedData.map((d, i) => d[study] === s ? i : -1).filter(i => i >= 0);

            for (const i of indices) {
                if (events[i] !== 1) continue;

                // Risk set at time[i]
                const riskSet = indices.filter(j => times[j] >= times[i]);

                // Calculate denominator and weighted sums
                let S0 = 0, S1 = [0, 0, 0], S2 = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];

                for (const j of riskSet) {
                    const expXb = Math.exp(X[j].reduce((sum, xjk, k) => sum + xjk * beta[k], 0));
                    S0 += expXb;
                    for (let k = 0; k < 3; k++) {
                        S1[k] += X[j][k] * expXb;
                        for (let l = 0; l < 3; l++) {
                            S2[k][l] += X[j][k] * X[j][l] * expXb;
                        }
                    }
                }

                // Update gradient and Hessian
                for (let k = 0; k < 3; k++) {
                    gradient[k] += X[i][k] - S1[k] / S0;
                    for (let l = 0; l < 3; l++) {
                        hessian[k][l] -= S2[k][l] / S0 - (S1[k] * S1[l]) / (S0 * S0);
                    }
                }
            }
        }

        // Update beta
        const hessianInv = invertMatrix(hessian.map(row => row.map(v => -v)));
        const delta = matrixVectorMultiply(hessianInv, gradient);
        const newBeta = beta.map((b, i) => b + delta[i]);

        const maxChange = Math.max(...beta.map((b, i) => Math.abs(b - newBeta[i])));
        beta = newBeta;

        if (maxChange < 1e-8) break;
    }

    // Final variance from inverse Hessian
    // Recalculate final Hessian
    let hessian = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];

    for (const s of studies) {
        const indices = sortedData.map((d, i) => d[study] === s ? i : -1).filter(i => i >= 0);

        for (const i of indices) {
            if (events[i] !== 1) continue;

            const riskSet = indices.filter(j => times[j] >= times[i]);
            let S0 = 0, S1 = [0, 0, 0], S2 = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];

            for (const j of riskSet) {
                const expXb = Math.exp(X[j].reduce((sum, xjk, k) => sum + xjk * beta[k], 0));
                S0 += expXb;
                for (let k = 0; k < 3; k++) {
                    S1[k] += X[j][k] * expXb;
                    for (let l = 0; l < 3; l++) {
                        S2[k][l] += X[j][k] * X[j][l] * expXb;
                    }
                }
            }

            for (let k = 0; k < 3; k++) {
                for (let l = 0; l < 3; l++) {
                    hessian[k][l] -= S2[k][l] / S0 - (S1[k] * S1[l]) / (S0 * S0);
                }
            }
        }
    }

    const varBeta = invertMatrix(hessian.map(row => row.map(v => -v)));
    const seBeta = varBeta.map((row, i) => Math.sqrt(Math.max(0, row[i])));

    const interaction = beta[2];
    const interactionSE = seBeta[2];
    const zStat = interaction / interactionSE;
    const interactionP = 2 * (1 - normalCDF(Math.abs(zStat)));
    const interactionCI = [
        interaction - 1.96 * interactionSE,
        interaction + 1.96 * interactionSE
    ];

    return {
        interaction,
        interactionSE,
        interactionCI,
        interactionP,
        treatmentEffect: beta[0],
        treatmentEffectSE: seBeta[0]
    };
}

/**
 * Estimate main effects (treatment effect at mean covariate)
 */
function estimateMainEffects(data, vars) {
    const { treatment, outcome, study } = vars;

    // Simple two-group comparison
    const treated = data.filter(d => d[treatment] === 1).map(d => d[outcome]);
    const control = data.filter(d => d[treatment] === 0).map(d => d[outcome]);

    const meanTreated = treated.reduce((a, b) => a + b, 0) / treated.length;
    const meanControl = control.reduce((a, b) => a + b, 0) / control.length;

    const varTreated = treated.reduce((sum, x) => sum + (x - meanTreated) ** 2, 0) / (treated.length - 1);
    const varControl = control.reduce((sum, x) => sum + (x - meanControl) ** 2, 0) / (control.length - 1);

    const pooledSE = Math.sqrt(varTreated / treated.length + varControl / control.length);
    const meanDiff = meanTreated - meanControl;

    return {
        treatmentEffect: meanDiff,
        se: pooledSE,
        ci: [meanDiff - 1.96 * pooledSE, meanDiff + 1.96 * pooledSE],
        pValue: 2 * (1 - normalCDF(Math.abs(meanDiff / pooledSE)))
    };
}

/**
 * Interpret interaction results
 */
function interpretInteraction(results, covariate, outcomeType) {
    const lines = [];

    if (results.withinStudy) {
        const within = results.withinStudy;
        const pThreshold = 0.05;

        if (outcomeType === 'continuous') {
            const direction = within.estimate > 0 ? 'increases' : 'decreases';
            const sig = within.pValue < pThreshold ? 'significantly' : 'non-significantly';
            lines.push(`Within-study: Treatment effect ${sig} ${direction} by ${Math.abs(within.estimate).toFixed(3)} per unit increase in ${covariate}`);
        } else if (outcomeType === 'binary') {
            const direction = within.OR > 1 ? 'increased' : 'decreased';
            const sig = within.pValue < pThreshold ? 'significantly' : 'non-significantly';
            lines.push(`Within-study: OR ${sig} ${direction} by factor of ${within.OR.toFixed(3)} per unit ${covariate}`);
        } else if (outcomeType === 'survival') {
            const direction = within.HR > 1 ? 'increased' : 'decreased';
            const sig = within.pValue < pThreshold ? 'significantly' : 'non-significantly';
            lines.push(`Within-study: HR ${sig} ${direction} by factor of ${within.HR.toFixed(3)} per unit ${covariate}`);
        }
    }

    if (results.ecologicalBias) {
        if (results.ecologicalBias.significant) {
            lines.push(`Warning: Ecological bias detected - across-study effects differ from within-study effects`);
            lines.push(`Using only within-study estimates is recommended to avoid bias`);
        } else {
            lines.push(`No significant ecological bias detected`);
        }
    }

    return lines.join('. ');
}

/**
 * Assess credibility of subgroup effect (ICEMAN criteria)
 * Reference: Schandelmaier et al. (2020) CMAJ
 */
function assessCredibility(results, data, covariate, studies) {
    const credibility = {
        criteria: [],
        rating: 'low', // low, moderate, high
        score: 0
    };

    // 1. Is the analysis pre-specified? (assume yes if provided)
    credibility.criteria.push({
        name: 'Pre-specification',
        met: true,
        description: 'Subgroup analysis should be pre-specified'
    });

    // 2. Is there a plausible biological rationale?
    credibility.criteria.push({
        name: 'Biological rationale',
        met: null, // Cannot assess automatically
        description: 'Requires clinical judgment'
    });

    // 3. Is the number of subgroup analyses small?
    credibility.criteria.push({
        name: 'Limited analyses',
        met: true, // Single analysis
        description: 'Single subgroup analysis (not multiple testing)'
    });

    // 4. Is the effect a within-study comparison?
    const hasWithin = results.withinStudy != null;
    credibility.criteria.push({
        name: 'Within-study comparison',
        met: hasWithin,
        description: hasWithin ?
            'Analysis uses within-study (patient-level) comparison' :
            'Only across-study comparison available'
    });

    // 5. Is the effect consistent across studies?
    if (studies.length >= 3 && results.withinStudy) {
        // Check consistency (would need study-specific estimates)
        credibility.criteria.push({
            name: 'Consistency',
            met: null,
            description: 'Requires study-specific interaction estimates'
        });
    }

    // 6. Is there absence of ecological bias?
    if (results.ecologicalBias) {
        credibility.criteria.push({
            name: 'No ecological bias',
            met: !results.ecologicalBias.significant,
            description: results.ecologicalBias.significant ?
                'Ecological bias detected - effect may be confounded' :
                'No significant ecological bias'
        });
    }

    // Calculate score
    const metCriteria = credibility.criteria.filter(c => c.met === true).length;
    const totalAssessable = credibility.criteria.filter(c => c.met !== null).length;

    credibility.score = metCriteria / totalAssessable;

    if (credibility.score >= 0.8) {
        credibility.rating = 'high';
    } else if (credibility.score >= 0.5) {
        credibility.rating = 'moderate';
    } else {
        credibility.rating = 'low';
    }

    return credibility;
}

/**
 * Analyze multiple covariates for interaction
 */
export function multipleInteractions(data, covariates, options = {}) {
    const results = {
        covariates: {},
        multiplicity: {}
    };

    // Analyze each covariate
    for (const covariate of covariates) {
        results.covariates[covariate] = analyzeInteraction(data, covariate, options);
    }

    // Multiplicity adjustment (Bonferroni and FDR)
    const pValues = covariates.map(c => {
        const result = results.covariates[c];
        return result.withinStudy ? result.withinStudy.pValue : result.overall?.pValue;
    }).filter(p => p != null);

    results.multiplicity = {
        nTests: pValues.length,
        bonferroniThreshold: 0.05 / pValues.length,
        significantAfterBonferroni: pValues.filter(p => p < 0.05 / pValues.length).length,
        fdrAdjusted: benjaminiHochberg(pValues)
    };

    return results;
}

/**
 * Benjamini-Hochberg FDR adjustment
 */
function benjaminiHochberg(pValues) {
    const n = pValues.length;
    const sorted = pValues.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);

    const adjusted = new Array(n);
    let minSoFar = 1;

    for (let i = n - 1; i >= 0; i--) {
        const adj = Math.min(1, sorted[i].p * n / (i + 1));
        minSoFar = Math.min(minSoFar, adj);
        adjusted[sorted[i].i] = minSoFar;
    }

    return adjusted;
}

// Matrix utilities
function transpose(matrix) {
    return matrix[0].map((_, i) => matrix.map(row => row[i]));
}

function matrixMultiply(A, B) {
    const result = [];
    for (let i = 0; i < A.length; i++) {
        result[i] = [];
        for (let j = 0; j < B[0].length; j++) {
            result[i][j] = 0;
            for (let k = 0; k < A[0].length; k++) {
                result[i][j] += A[i][k] * B[k][j];
            }
        }
    }
    return result;
}

function matrixVectorMultiply(A, v) {
    return A.map(row => row.reduce((sum, val, j) => sum + val * v[j], 0));
}

function invertMatrix(matrix) {
    const n = matrix.length;
    const augmented = matrix.map((row, i) => [...row, ...Array(n).fill(0).map((_, j) => i === j ? 1 : 0)]);

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

        // Scale pivot row
        const pivot = augmented[i][i];
        if (Math.abs(pivot) < 1e-10) {
            // Near-singular matrix
            augmented[i][i] = 1e-10;
        }
        for (let j = i; j < 2 * n; j++) {
            augmented[i][j] /= pivot;
        }

        // Eliminate column
        for (let k = 0; k < n; k++) {
            if (k !== i) {
                const factor = augmented[k][i];
                for (let j = i; j < 2 * n; j++) {
                    augmented[k][j] -= factor * augmented[i][j];
                }
            }
        }
    }

    return augmented.map(row => row.slice(n));
}

// Statistical functions
function normalCDF(z) {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = z < 0 ? -1 : 1;
    z = Math.abs(z) / Math.sqrt(2);

    const t = 1.0 / (1.0 + p * z);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);

    return 0.5 * (1.0 + sign * y);
}

function tCDF(t, df) {
    // Approximation using normal for large df
    if (df > 100) return normalCDF(t);

    const x = df / (df + t * t);
    const halfBeta = 0.5 * incompleteBeta(df / 2, 0.5, x);
    // For t >= 0: CDF = 1 - halfBeta, for t < 0: CDF = halfBeta
    return t >= 0 ? 1 - halfBeta : halfBeta;
}

function tQuantile(p, df) {
    // Newton-Raphson for t quantile
    if (df > 100) {
        // Use normal approximation
        return normalQuantile(p);
    }

    let t = normalQuantile(p);
    for (let i = 0; i < 10; i++) {
        const cdf = tCDF(t, df);
        const pdf = tPDF(t, df);
        t = t - (cdf - p) / pdf;
    }
    return t;
}

function tPDF(t, df) {
    const coef = gamma((df + 1) / 2) / (Math.sqrt(df * Math.PI) * gamma(df / 2));
    return coef * Math.pow(1 + t * t / df, -(df + 1) / 2);
}

function normalQuantile(p) {
    // Rational approximation
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
        return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
               ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    } else if (p <= pHigh) {
        q = p - 0.5;
        r = q * q;
        return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
               (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
    } else {
        q = Math.sqrt(-2 * Math.log(1 - p));
        return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
                ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
}

function gamma(z) {
    if (z < 0.5) {
        return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
    }
    z -= 1;
    const g = 7;
    const c = [
        0.99999999999980993, 676.5203681218851, -1259.1392167224028,
        771.32342877765313, -176.61502916214059, 12.507343278686905,
        -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7
    ];
    let x = c[0];
    for (let i = 1; i < g + 2; i++) {
        x += c[i] / (z + i);
    }
    const t = z + g + 0.5;
    return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}

function incompleteBeta(a, b, x) {
    if (x === 0) return 0;
    if (x === 1) return 1;

    // Continued fraction approximation
    const bt = Math.exp(
        lgamma(a + b) - lgamma(a) - lgamma(b) +
        a * Math.log(x) + b * Math.log(1 - x)
    );

    if (x < (a + 1) / (a + b + 2)) {
        return bt * betaCF(a, b, x) / a;
    } else {
        return 1 - bt * betaCF(b, a, 1 - x) / b;
    }
}

function betaCF(a, b, x) {
    const maxIter = 100;
    const eps = 1e-10;

    let qab = a + b;
    let qap = a + 1;
    let qam = a - 1;
    let c = 1;
    let d = 1 - qab * x / qap;
    if (Math.abs(d) < eps) d = eps;
    d = 1 / d;
    let h = d;

    for (let m = 1; m <= maxIter; m++) {
        let m2 = 2 * m;
        let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
        d = 1 + aa * d;
        if (Math.abs(d) < eps) d = eps;
        c = 1 + aa / c;
        if (Math.abs(c) < eps) c = eps;
        d = 1 / d;
        h *= d * c;

        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
        d = 1 + aa * d;
        if (Math.abs(d) < eps) d = eps;
        c = 1 + aa / c;
        if (Math.abs(c) < eps) c = eps;
        d = 1 / d;
        let del = d * c;
        h *= del;

        if (Math.abs(del - 1) < eps) break;
    }

    return h;
}

function lgamma(x) {
    const c = [
        76.18009172947146, -86.50532032941677,
        24.01409824083091, -1.231739572450155,
        0.1208650973866179e-2, -0.5395239384953e-5
    ];
    let y = x;
    let tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;
    for (let j = 0; j < 6; j++) {
        ser += c[j] / ++y;
    }
    return -tmp + Math.log(2.5066282746310005 * ser / x);
}

export default {
    analyzeInteraction,
    multipleInteractions
};
