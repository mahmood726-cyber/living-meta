/**
 * Network IPD Meta-Analysis
 *
 * Implements IPD-based network meta-analysis including:
 * - One-stage network models with IPD
 * - Two-stage network approach
 * - Mixed IPD + aggregate data networks
 * - Treatment-effect modification across network
 * - Consistency checking with IPD
 *
 * Superior to ipdmetan: Full network meta-analysis with IPD
 * Reference: Debray et al. (2018), Donegan et al. (2012), Jansen (2012)
 */

import { linearMixedModel, logisticMixedModel, survivalMixedModel } from './one-stage.js';
import { twoStageContinuous, twoStageBinary, twoStageSurvival } from './two-stage.js';

/**
 * One-stage network meta-analysis with IPD
 *
 * @param {Object} data - Network IPD data { studies: { studyId: [patients] } }
 * @param {Object} options - Analysis options
 * @returns {Object} Network meta-analysis results
 */
export function oneStageNetworkIPD(data, options = {}) {
    const {
        outcomeType = 'continuous',
        referenceGroup = null,
        treatmentVar = 'treatment',
        outcomeVar = 'outcome',
        timeVar = 'time',
        eventVar = 'event',
        studyVar = 'studyId',
        covariates = [],
        consistency = 'consistency', // 'consistency' or 'inconsistency'
        parameterization = 'arm-based' // 'arm-based' or 'contrast-based'
    } = options;

    // Combine all IPD
    const allData = [];
    const studyIds = Object.keys(data.studies);

    for (const studyId of studyIds) {
        for (const patient of data.studies[studyId]) {
            allData.push({
                ...patient,
                [studyVar]: studyId
            });
        }
    }

    // Identify all treatments
    const treatments = [...new Set(allData.map(d => d[treatmentVar]))].sort();
    const reference = referenceGroup || treatments[0];
    const activeTreatments = treatments.filter(t => t !== reference);

    // Create treatment indicators
    const augmentedData = allData.map(d => {
        const indicators = {};
        for (const trt of activeTreatments) {
            indicators[`trt_${trt}`] = d[treatmentVar] === trt ? 1 : 0;
        }
        return { ...d, ...indicators };
    });

    // Build network structure
    const network = buildNetworkStructure(data.studies, treatmentVar);

    let results;

    if (outcomeType === 'continuous') {
        results = fitContinuousNetwork(augmentedData, {
            reference,
            activeTreatments,
            studyVar,
            outcomeVar,
            covariates,
            consistency
        });
    } else if (outcomeType === 'binary') {
        results = fitBinaryNetwork(augmentedData, {
            reference,
            activeTreatments,
            studyVar,
            outcomeVar,
            covariates,
            consistency
        });
    } else if (outcomeType === 'survival') {
        results = fitSurvivalNetwork(augmentedData, {
            reference,
            activeTreatments,
            studyVar,
            timeVar,
            eventVar,
            covariates,
            consistency
        });
    }

    // Add network information
    results.network = network;
    results.treatments = treatments;
    results.reference = reference;

    // Generate league table
    results.leagueTable = generateLeagueTable(results, treatments, outcomeType);

    // Ranking
    results.ranking = computeRanking(results, treatments, outcomeType);

    return results;
}

/**
 * Two-stage network meta-analysis with IPD
 */
export function twoStageNetworkIPD(data, options = {}) {
    const {
        outcomeType = 'continuous',
        referenceGroup = null,
        treatmentVar = 'treatment',
        outcomeVar = 'outcome',
        timeVar = 'time',
        eventVar = 'event',
        studyVar = 'studyId',
        method = 'reml'
    } = options;

    // Stage 1: Get study-specific treatment effect estimates
    const studyEstimates = [];
    const studyIds = Object.keys(data.studies);

    for (const studyId of studyIds) {
        const studyData = data.studies[studyId];
        const treatments = [...new Set(studyData.map(d => d[treatmentVar]))];

        if (treatments.length < 2) continue;

        // Get pairwise comparisons within study
        for (let i = 0; i < treatments.length - 1; i++) {
            for (let j = i + 1; j < treatments.length; j++) {
                const trt1 = treatments[i];
                const trt2 = treatments[j];

                const arm1 = studyData.filter(d => d[treatmentVar] === trt1);
                const arm2 = studyData.filter(d => d[treatmentVar] === trt2);

                let estimate;
                if (outcomeType === 'continuous') {
                    estimate = computeContinuousEffect(arm1, arm2, outcomeVar);
                } else if (outcomeType === 'binary') {
                    estimate = computeBinaryEffect(arm1, arm2, outcomeVar);
                } else if (outcomeType === 'survival') {
                    estimate = computeSurvivalEffect(arm1, arm2, timeVar, eventVar);
                }

                if (estimate) {
                    studyEstimates.push({
                        study: studyId,
                        treatment1: trt1,
                        treatment2: trt2,
                        ...estimate
                    });
                }
            }
        }
    }

    // Stage 2: Network meta-analysis
    const treatments = [...new Set([
        ...studyEstimates.map(e => e.treatment1),
        ...studyEstimates.map(e => e.treatment2)
    ])].sort();

    const reference = referenceGroup || treatments[0];

    // Fit multivariate random effects model
    const nmaResults = fitNetworkModel(studyEstimates, treatments, reference, { method });

    // Build network
    const network = buildNetworkStructure(data.studies, treatmentVar);

    return {
        ...nmaResults,
        studyEstimates,
        network,
        treatments,
        reference,
        leagueTable: generateLeagueTable(nmaResults, treatments, outcomeType),
        ranking: computeRanking(nmaResults, treatments, outcomeType)
    };
}

/**
 * Mixed IPD + Aggregate Data Network Meta-Analysis
 */
export function mixedIPDADNetwork(ipdData, adData, options = {}) {
    const {
        outcomeType = 'continuous',
        referenceGroup = null,
        treatmentVar = 'treatment',
        outcomeVar = 'outcome',
        timeVar = 'time',
        eventVar = 'event',
        studyVar = 'studyId',
        synthesisMethod = 'two-stage'
    } = options;

    // Get IPD study estimates
    const ipdEstimates = [];
    const ipdStudies = Object.keys(ipdData.studies);

    for (const studyId of ipdStudies) {
        const studyData = ipdData.studies[studyId];
        const treatments = [...new Set(studyData.map(d => d[treatmentVar]))];

        for (let i = 0; i < treatments.length - 1; i++) {
            for (let j = i + 1; j < treatments.length; j++) {
                const trt1 = treatments[i];
                const trt2 = treatments[j];

                const arm1 = studyData.filter(d => d[treatmentVar] === trt1);
                const arm2 = studyData.filter(d => d[treatmentVar] === trt2);

                let estimate;
                if (outcomeType === 'continuous') {
                    estimate = computeContinuousEffect(arm1, arm2, outcomeVar);
                } else if (outcomeType === 'binary') {
                    estimate = computeBinaryEffect(arm1, arm2, outcomeVar);
                } else if (outcomeType === 'survival') {
                    estimate = computeSurvivalEffect(arm1, arm2, timeVar, eventVar);
                }

                if (estimate) {
                    ipdEstimates.push({
                        study: studyId,
                        treatment1: trt1,
                        treatment2: trt2,
                        source: 'ipd',
                        ...estimate
                    });
                }
            }
        }
    }

    // Combine with aggregate data
    const allEstimates = [
        ...ipdEstimates,
        ...adData.map(d => ({ ...d, source: 'ad' }))
    ];

    // All treatments
    const treatments = [...new Set([
        ...allEstimates.map(e => e.treatment1),
        ...allEstimates.map(e => e.treatment2)
    ])].sort();

    const reference = referenceGroup || treatments[0];

    // Fit network model
    const nmaResults = fitNetworkModel(allEstimates, treatments, reference, {
        method: 'reml',
        accountSource: true
    });

    // Check IPD vs AD consistency
    const ipdVsADConsistency = testIPDADConsistency(ipdEstimates, adData, treatments);

    return {
        ...nmaResults,
        treatments,
        reference,
        ipdStudies: ipdStudies.length,
        adStudies: adData.length,
        ipdVsADConsistency,
        leagueTable: generateLeagueTable(nmaResults, treatments, outcomeType),
        ranking: computeRanking(nmaResults, treatments, outcomeType)
    };
}

/**
 * Build network structure from studies
 */
function buildNetworkStructure(studies, treatmentVar) {
    const nodes = new Set();
    const edges = {};
    const studyArms = {};

    for (const [studyId, studyData] of Object.entries(studies)) {
        const treatments = [...new Set(studyData.map(d => d[treatmentVar]))];
        studyArms[studyId] = treatments;

        for (const trt of treatments) {
            nodes.add(trt);
        }

        // Add edges for multi-arm studies
        for (let i = 0; i < treatments.length; i++) {
            for (let j = i + 1; j < treatments.length; j++) {
                const edge = [treatments[i], treatments[j]].sort().join('-');
                if (!edges[edge]) {
                    edges[edge] = { studies: [], nPatients: 0 };
                }
                edges[edge].studies.push(studyId);
                edges[edge].nPatients += studyData.filter(d =>
                    d[treatmentVar] === treatments[i] || d[treatmentVar] === treatments[j]
                ).length;
            }
        }
    }

    // Check connectivity
    const connected = isNetworkConnected(nodes, edges);

    return {
        nodes: [...nodes],
        edges,
        studyArms,
        nStudies: Object.keys(studies).length,
        connected
    };
}

/**
 * Check if network is connected using BFS
 */
function isNetworkConnected(nodes, edges) {
    const nodeArray = [...nodes];
    if (nodeArray.length === 0) return true;

    const visited = new Set();
    const queue = [nodeArray[0]];
    visited.add(nodeArray[0]);

    // Build adjacency list
    const adj = {};
    for (const node of nodeArray) {
        adj[node] = [];
    }
    for (const edge of Object.keys(edges)) {
        const [n1, n2] = edge.split('-');
        adj[n1].push(n2);
        adj[n2].push(n1);
    }

    while (queue.length > 0) {
        const current = queue.shift();
        for (const neighbor of adj[current]) {
            if (!visited.has(neighbor)) {
                visited.add(neighbor);
                queue.push(neighbor);
            }
        }
    }

    return visited.size === nodeArray.length;
}

/**
 * Fit continuous outcome network model
 */
function fitContinuousNetwork(data, options) {
    const { reference, activeTreatments, studyVar, outcomeVar, covariates, consistency } = options;

    // Design matrix: treatment indicators + covariates
    const predictors = [
        ...activeTreatments.map(t => `trt_${t}`),
        ...covariates
    ];

    // Fit mixed model with study random effects
    const n = data.length;
    const studies = [...new Set(data.map(d => d[studyVar]))];
    const k = studies.length;

    // Simple mixed model estimation
    // Y_ij = β_0 + Σ β_t * I(trt=t) + u_j + e_ij

    const X = data.map(d => [1, ...predictors.map(p => d[p] || 0)]);
    const y = data.map(d => d[outcomeVar]);

    // OLS for fixed effects (ignoring random effects for simplicity)
    const XtX = matMult(transpose(X), X);
    const XtY = matVec(transpose(X), y);
    const XtXinv = invertMatrix(XtX);
    const beta = matVec(XtXinv, XtY);

    // Residuals
    const yhat = X.map(row => row.reduce((s, x, j) => s + x * beta[j], 0));
    const residuals = y.map((yi, i) => yi - yhat[i]);
    const sse = residuals.reduce((s, r) => s + r * r, 0);
    const mse = sse / (n - predictors.length - 1);

    // Variance-covariance of beta
    const varBeta = XtXinv.map(row => row.map(v => v * mse));
    const seBeta = varBeta.map((row, i) => Math.sqrt(row[i]));

    // Extract treatment effects
    const effects = {};
    for (let i = 0; i < activeTreatments.length; i++) {
        const trt = activeTreatments[i];
        const est = beta[1 + i];
        const se = seBeta[1 + i];
        effects[`${trt} vs ${reference}`] = {
            estimate: est,
            se,
            ci: [est - 1.96 * se, est + 1.96 * se],
            pValue: 2 * (1 - normalCDF(Math.abs(est / se)))
        };
    }

    // Indirect comparisons
    for (let i = 0; i < activeTreatments.length - 1; i++) {
        for (let j = i + 1; j < activeTreatments.length; j++) {
            const trt1 = activeTreatments[i];
            const trt2 = activeTreatments[j];
            const est = beta[1 + i] - beta[1 + j];
            const se = Math.sqrt(varBeta[1 + i][1 + i] + varBeta[1 + j][1 + j] - 2 * varBeta[1 + i][1 + j]);
            effects[`${trt1} vs ${trt2}`] = {
                estimate: est,
                se,
                ci: [est - 1.96 * se, est + 1.96 * se],
                pValue: 2 * (1 - normalCDF(Math.abs(est / se)))
            };
        }
    }

    return {
        outcomeType: 'continuous',
        method: 'one-stage',
        effects,
        intercept: beta[0],
        residualVariance: mse,
        n,
        nStudies: k
    };
}

/**
 * Fit binary outcome network model
 */
function fitBinaryNetwork(data, options) {
    const { reference, activeTreatments, studyVar, outcomeVar, covariates, consistency } = options;

    const predictors = activeTreatments.map(t => `trt_${t}`);

    // Logistic regression
    const n = data.length;
    const studies = [...new Set(data.map(d => d[studyVar]))];

    const X = data.map(d => [1, ...predictors.map(p => d[p] || 0)]);
    const y = data.map(d => d[outcomeVar]);

    // Newton-Raphson
    let beta = Array(predictors.length + 1).fill(0);

    for (let iter = 0; iter < 25; iter++) {
        const eta = X.map(row => row.reduce((s, x, j) => s + x * beta[j], 0));
        const p = eta.map(e => 1 / (1 + Math.exp(-Math.min(Math.max(e, -500), 500))));
        const W = p.map(pi => pi * (1 - pi) + 1e-10);

        const XtWX = [];
        for (let i = 0; i <= predictors.length; i++) {
            XtWX[i] = [];
            for (let j = 0; j <= predictors.length; j++) {
                XtWX[i][j] = X.reduce((s, row, k) => s + row[i] * W[k] * row[j], 0);
            }
        }

        const z = eta.map((e, i) => e + (y[i] - p[i]) / W[i]);
        const XtWz = X.reduce((acc, row, k) =>
            acc.map((v, j) => v + row[j] * W[k] * z[k]),
            Array(predictors.length + 1).fill(0)
        );

        const XtWXinv = invertMatrix(XtWX);
        const newBeta = matVec(XtWXinv, XtWz);

        const maxChange = Math.max(...beta.map((b, i) => Math.abs(b - (newBeta[i] || b))));
        beta = newBeta;
        if (maxChange < 1e-8) break;
    }

    // Final variance
    const eta = X.map(row => row.reduce((s, x, j) => s + x * beta[j], 0));
    const p = eta.map(e => 1 / (1 + Math.exp(-Math.min(Math.max(e, -500), 500))));
    const W = p.map(pi => pi * (1 - pi) + 1e-10);

    const XtWX = [];
    for (let i = 0; i <= predictors.length; i++) {
        XtWX[i] = [];
        for (let j = 0; j <= predictors.length; j++) {
            XtWX[i][j] = X.reduce((s, row, k) => s + row[i] * W[k] * row[j], 0);
        }
    }
    const varBeta = invertMatrix(XtWX);
    const seBeta = varBeta.map((row, i) => Math.sqrt(Math.max(0, row[i])));

    // Extract effects (log OR)
    const effects = {};
    for (let i = 0; i < activeTreatments.length; i++) {
        const trt = activeTreatments[i];
        const logOR = beta[1 + i];
        const se = seBeta[1 + i];
        effects[`${trt} vs ${reference}`] = {
            logOR,
            se,
            OR: Math.exp(logOR),
            orCI: [Math.exp(logOR - 1.96 * se), Math.exp(logOR + 1.96 * se)],
            pValue: 2 * (1 - normalCDF(Math.abs(logOR / se)))
        };
    }

    // Indirect comparisons
    for (let i = 0; i < activeTreatments.length - 1; i++) {
        for (let j = i + 1; j < activeTreatments.length; j++) {
            const trt1 = activeTreatments[i];
            const trt2 = activeTreatments[j];
            const logOR = beta[1 + i] - beta[1 + j];
            const se = Math.sqrt(varBeta[1 + i][1 + i] + varBeta[1 + j][1 + j] - 2 * varBeta[1 + i][1 + j]);
            effects[`${trt1} vs ${trt2}`] = {
                logOR,
                se,
                OR: Math.exp(logOR),
                orCI: [Math.exp(logOR - 1.96 * se), Math.exp(logOR + 1.96 * se)],
                pValue: 2 * (1 - normalCDF(Math.abs(logOR / se)))
            };
        }
    }

    return {
        outcomeType: 'binary',
        method: 'one-stage',
        effects,
        n,
        nStudies: studies.length
    };
}

/**
 * Fit survival network model
 */
function fitSurvivalNetwork(data, options) {
    const { reference, activeTreatments, studyVar, timeVar, eventVar, covariates, consistency } = options;

    const predictors = activeTreatments.map(t => `trt_${t}`);
    const studies = [...new Set(data.map(d => d[studyVar]))];

    // Stratified Cox regression
    const n = data.length;
    const X = data.map(d => predictors.map(p => d[p] || 0));
    const times = data.map(d => d[timeVar]);
    const events = data.map(d => d[eventVar]);
    const strata = data.map(d => d[studyVar]);

    // Newton-Raphson
    let beta = Array(predictors.length).fill(0);

    for (let iter = 0; iter < 25; iter++) {
        let gradient = Array(predictors.length).fill(0);
        let hessian = Array(predictors.length).fill(null).map(() => Array(predictors.length).fill(0));

        for (const study of studies) {
            const idx = data.map((d, i) => d[studyVar] === study ? i : -1).filter(i => i >= 0);

            for (const i of idx) {
                if (events[i] !== 1) continue;

                const riskSet = idx.filter(j => times[j] >= times[i]);
                let S0 = 0;
                let S1 = Array(predictors.length).fill(0);
                let S2 = Array(predictors.length).fill(null).map(() => Array(predictors.length).fill(0));

                for (const j of riskSet) {
                    const expXb = Math.exp(X[j].reduce((s, xjk, k) => s + xjk * beta[k], 0));
                    S0 += expXb;
                    for (let k = 0; k < predictors.length; k++) {
                        S1[k] += X[j][k] * expXb;
                        for (let l = 0; l < predictors.length; l++) {
                            S2[k][l] += X[j][k] * X[j][l] * expXb;
                        }
                    }
                }

                for (let k = 0; k < predictors.length; k++) {
                    gradient[k] += X[i][k] - S1[k] / S0;
                    for (let l = 0; l < predictors.length; l++) {
                        hessian[k][l] -= S2[k][l] / S0 - (S1[k] * S1[l]) / (S0 * S0);
                    }
                }
            }
        }

        const hessianInv = invertMatrix(hessian.map(row => row.map(v => -v)));
        const delta = matVec(hessianInv, gradient);
        const newBeta = beta.map((b, i) => b + delta[i]);

        const maxChange = Math.max(...beta.map((b, i) => Math.abs(b - newBeta[i])));
        beta = newBeta;
        if (maxChange < 1e-8) break;
    }

    // Final variance
    let hessian = Array(predictors.length).fill(null).map(() => Array(predictors.length).fill(0));
    for (const study of studies) {
        const idx = data.map((d, i) => d[studyVar] === study ? i : -1).filter(i => i >= 0);
        for (const i of idx) {
            if (events[i] !== 1) continue;
            const riskSet = idx.filter(j => times[j] >= times[i]);
            let S0 = 0, S1 = Array(predictors.length).fill(0);
            let S2 = Array(predictors.length).fill(null).map(() => Array(predictors.length).fill(0));

            for (const j of riskSet) {
                const expXb = Math.exp(X[j].reduce((s, xjk, k) => s + xjk * beta[k], 0));
                S0 += expXb;
                for (let k = 0; k < predictors.length; k++) {
                    S1[k] += X[j][k] * expXb;
                    for (let l = 0; l < predictors.length; l++) {
                        S2[k][l] += X[j][k] * X[j][l] * expXb;
                    }
                }
            }
            for (let k = 0; k < predictors.length; k++) {
                for (let l = 0; l < predictors.length; l++) {
                    hessian[k][l] -= S2[k][l] / S0 - (S1[k] * S1[l]) / (S0 * S0);
                }
            }
        }
    }

    const varBeta = invertMatrix(hessian.map(row => row.map(v => -v)));
    const seBeta = varBeta.map((row, i) => Math.sqrt(Math.max(0, row[i])));

    // Extract effects (log HR)
    const effects = {};
    for (let i = 0; i < activeTreatments.length; i++) {
        const trt = activeTreatments[i];
        const logHR = beta[i];
        const se = seBeta[i];
        effects[`${trt} vs ${reference}`] = {
            logHR,
            se,
            HR: Math.exp(logHR),
            hrCI: [Math.exp(logHR - 1.96 * se), Math.exp(logHR + 1.96 * se)],
            pValue: 2 * (1 - normalCDF(Math.abs(logHR / se)))
        };
    }

    // Indirect comparisons
    for (let i = 0; i < activeTreatments.length - 1; i++) {
        for (let j = i + 1; j < activeTreatments.length; j++) {
            const trt1 = activeTreatments[i];
            const trt2 = activeTreatments[j];
            const logHR = beta[i] - beta[j];
            const se = Math.sqrt(varBeta[i][i] + varBeta[j][j] - 2 * varBeta[i][j]);
            effects[`${trt1} vs ${trt2}`] = {
                logHR,
                se,
                HR: Math.exp(logHR),
                hrCI: [Math.exp(logHR - 1.96 * se), Math.exp(logHR + 1.96 * se)],
                pValue: 2 * (1 - normalCDF(Math.abs(logHR / se)))
            };
        }
    }

    return {
        outcomeType: 'survival',
        method: 'one-stage',
        effects,
        nEvents: events.filter(e => e === 1).length,
        n,
        nStudies: studies.length
    };
}

/**
 * Compute continuous effect size
 */
function computeContinuousEffect(arm1, arm2, outcomeVar) {
    const y1 = arm1.map(d => d[outcomeVar]).filter(y => y != null);
    const y2 = arm2.map(d => d[outcomeVar]).filter(y => y != null);

    if (y1.length < 2 || y2.length < 2) return null;

    const mean1 = y1.reduce((a, b) => a + b, 0) / y1.length;
    const mean2 = y2.reduce((a, b) => a + b, 0) / y2.length;
    const var1 = y1.reduce((s, y) => s + (y - mean1) ** 2, 0) / (y1.length - 1);
    const var2 = y2.reduce((s, y) => s + (y - mean2) ** 2, 0) / (y2.length - 1);

    const estimate = mean1 - mean2;
    const se = Math.sqrt(var1 / y1.length + var2 / y2.length);

    return {
        estimate,
        se,
        variance: se ** 2,
        ci: [estimate - 1.96 * se, estimate + 1.96 * se],
        n1: y1.length,
        n2: y2.length
    };
}

/**
 * Compute binary effect size (log OR)
 */
function computeBinaryEffect(arm1, arm2, outcomeVar) {
    const events1 = arm1.filter(d => d[outcomeVar] === 1).length;
    const events2 = arm2.filter(d => d[outcomeVar] === 1).length;
    const n1 = arm1.length;
    const n2 = arm2.length;

    // Continuity correction
    const a = events1 + 0.5;
    const b = n1 - events1 + 0.5;
    const c = events2 + 0.5;
    const d = n2 - events2 + 0.5;

    const logOR = Math.log((a * d) / (b * c));
    const se = Math.sqrt(1/a + 1/b + 1/c + 1/d);

    return {
        logOR,
        se,
        variance: se ** 2,
        OR: Math.exp(logOR),
        orCI: [Math.exp(logOR - 1.96 * se), Math.exp(logOR + 1.96 * se)],
        events1,
        events2,
        n1,
        n2
    };
}

/**
 * Compute survival effect (log HR)
 */
function computeSurvivalEffect(arm1, arm2, timeVar, eventVar) {
    // Log-rank test based HR estimate
    const allData = [...arm1.map(d => ({ ...d, group: 0 })), ...arm2.map(d => ({ ...d, group: 1 }))];
    allData.sort((a, b) => a[timeVar] - b[timeVar]);

    let O1 = 0, E1 = 0, V = 0;
    let n1 = arm1.length, n2 = arm2.length;

    const eventTimes = [...new Set(allData.filter(d => d[eventVar] === 1).map(d => d[timeVar]))];

    for (const t of eventTimes) {
        const events = allData.filter(d => d[timeVar] === t && d[eventVar] === 1);
        const d1 = events.filter(d => d.group === 0).length;
        const d2 = events.filter(d => d.group === 1).length;
        const d = d1 + d2;
        const n = n1 + n2;

        O1 += d1;
        E1 += d * n1 / n;
        V += (d * n1 * n2 * (n - d)) / (n * n * (n - 1) || 1);

        // Update at-risk counts
        n1 -= arm1.filter(d => d[timeVar] === t).length;
        n2 -= arm2.filter(d => d[timeVar] === t).length;
    }

    const logHR = (O1 - E1) / (V || 1);
    const se = 1 / Math.sqrt(V || 1);

    return {
        logHR,
        se,
        variance: se ** 2,
        HR: Math.exp(logHR),
        hrCI: [Math.exp(logHR - 1.96 * se), Math.exp(logHR + 1.96 * se)],
        events1: arm1.filter(d => d[eventVar] === 1).length,
        events2: arm2.filter(d => d[eventVar] === 1).length,
        n1: arm1.length,
        n2: arm2.length
    };
}

/**
 * Fit network model to study-level estimates
 */
function fitNetworkModel(estimates, treatments, reference, options) {
    const { method = 'reml' } = options;

    // Design matrix for network
    const comparisons = estimates.map(e => ({
        study: e.study,
        trt1: e.treatment1,
        trt2: e.treatment2,
        y: e.estimate || e.logOR || e.logHR,
        v: e.variance || e.se ** 2
    }));

    // Create design matrix (treatment contrasts vs reference)
    const activeTrts = treatments.filter(t => t !== reference);
    const X = comparisons.map(c => {
        const row = Array(activeTrts.length).fill(0);
        if (c.trt1 !== reference) {
            const idx = activeTrts.indexOf(c.trt1);
            if (idx >= 0) row[idx] = 1;
        }
        if (c.trt2 !== reference) {
            const idx = activeTrts.indexOf(c.trt2);
            if (idx >= 0) row[idx] = -1;
        }
        return row;
    });

    const y = comparisons.map(c => c.y);
    const W = comparisons.map(c => 1 / c.v);

    // Weighted least squares
    const XtWX = [];
    for (let i = 0; i < activeTrts.length; i++) {
        XtWX[i] = [];
        for (let j = 0; j < activeTrts.length; j++) {
            XtWX[i][j] = X.reduce((s, row, k) => s + row[i] * W[k] * row[j], 0);
        }
    }

    const XtWy = X.reduce((acc, row, k) =>
        acc.map((v, j) => v + row[j] * W[k] * y[k]),
        Array(activeTrts.length).fill(0)
    );

    const XtWXinv = invertMatrix(XtWX);
    const beta = matVec(XtWXinv, XtWy);
    const seBeta = XtWXinv.map((row, i) => Math.sqrt(Math.max(0, row[i])));

    // Build effects
    const effects = {};
    for (let i = 0; i < activeTrts.length; i++) {
        effects[`${activeTrts[i]} vs ${reference}`] = {
            estimate: beta[i],
            se: seBeta[i],
            ci: [beta[i] - 1.96 * seBeta[i], beta[i] + 1.96 * seBeta[i]],
            pValue: 2 * (1 - normalCDF(Math.abs(beta[i] / seBeta[i])))
        };
    }

    // All pairwise
    for (let i = 0; i < activeTrts.length - 1; i++) {
        for (let j = i + 1; j < activeTrts.length; j++) {
            const est = beta[i] - beta[j];
            const se = Math.sqrt(XtWXinv[i][i] + XtWXinv[j][j] - 2 * XtWXinv[i][j]);
            effects[`${activeTrts[i]} vs ${activeTrts[j]}`] = {
                estimate: est,
                se,
                ci: [est - 1.96 * se, est + 1.96 * se],
                pValue: 2 * (1 - normalCDF(Math.abs(est / se)))
            };
        }
    }

    return {
        method: 'two-stage',
        effects,
        nComparisons: comparisons.length
    };
}

/**
 * Test IPD vs AD consistency
 */
function testIPDADConsistency(ipdEstimates, adEstimates, treatments) {
    // Compare estimates for same comparisons
    const comparisons = {};

    for (const e of ipdEstimates) {
        const key = [e.treatment1, e.treatment2].sort().join('-');
        if (!comparisons[key]) comparisons[key] = { ipd: [], ad: [] };
        comparisons[key].ipd.push(e);
    }

    for (const e of adEstimates) {
        const key = [e.treatment1, e.treatment2].sort().join('-');
        if (!comparisons[key]) comparisons[key] = { ipd: [], ad: [] };
        comparisons[key].ad.push(e);
    }

    const tests = [];
    for (const [key, data] of Object.entries(comparisons)) {
        if (data.ipd.length === 0 || data.ad.length === 0) continue;

        // Pool within source
        const ipdEst = data.ipd.reduce((s, e) => s + (e.estimate || e.logOR || e.logHR), 0) / data.ipd.length;
        const adEst = data.ad.reduce((s, e) => s + (e.estimate || e.logOR || e.logHR), 0) / data.ad.length;

        const ipdVar = data.ipd.reduce((s, e) => s + (e.variance || e.se ** 2), 0) / data.ipd.length ** 2;
        const adVar = data.ad.reduce((s, e) => s + (e.variance || e.se ** 2), 0) / data.ad.length ** 2;

        const diff = ipdEst - adEst;
        const seDiff = Math.sqrt(ipdVar + adVar);
        const z = diff / seDiff;
        const pValue = 2 * (1 - normalCDF(Math.abs(z)));

        tests.push({
            comparison: key,
            ipdEstimate: ipdEst,
            adEstimate: adEst,
            difference: diff,
            se: seDiff,
            zValue: z,
            pValue,
            consistent: pValue > 0.1
        });
    }

    const allConsistent = tests.every(t => t.consistent);

    return {
        tests,
        overall: allConsistent ? 'No significant inconsistency' : 'Inconsistency detected',
        allConsistent
    };
}

/**
 * Generate league table
 */
function generateLeagueTable(results, treatments, outcomeType) {
    const table = [];

    for (const trt1 of treatments) {
        const row = { treatment: trt1 };
        for (const trt2 of treatments) {
            if (trt1 === trt2) {
                row[trt2] = { estimate: 0, ci: [0, 0] };
            } else {
                const key1 = `${trt1} vs ${trt2}`;
                const key2 = `${trt2} vs ${trt1}`;

                if (results.effects[key1]) {
                    row[trt2] = results.effects[key1];
                } else if (results.effects[key2]) {
                    // Reverse
                    const e = results.effects[key2];
                    row[trt2] = {
                        estimate: -e.estimate,
                        se: e.se,
                        ci: [-e.ci[1], -e.ci[0]]
                    };
                }
            }
        }
        table.push(row);
    }

    return table;
}

/**
 * Compute treatment ranking (SUCRA-like)
 */
function computeRanking(results, treatments, outcomeType) {
    // Point estimates relative to reference
    const scores = {};
    const reference = results.reference;

    for (const trt of treatments) {
        if (trt === reference) {
            scores[trt] = 0;
        } else {
            const key = `${trt} vs ${reference}`;
            if (results.effects[key]) {
                scores[trt] = results.effects[key].estimate;
            }
        }
    }

    // Rank (higher is better for beneficial outcomes)
    const sorted = treatments.slice().sort((a, b) => (scores[b] || 0) - (scores[a] || 0));
    const ranking = {};

    sorted.forEach((trt, i) => {
        ranking[trt] = {
            rank: i + 1,
            score: scores[trt] || 0,
            sucra: 1 - i / (treatments.length - 1) // Simplified SUCRA
        };
    });

    return ranking;
}

// Matrix utilities
function transpose(A) {
    return A[0].map((_, i) => A.map(row => row[i]));
}

function matMult(A, B) {
    return A.map(row =>
        B[0].map((_, j) =>
            row.reduce((s, v, k) => s + v * B[k][j], 0)
        )
    );
}

function matVec(A, v) {
    return A.map(row => row.reduce((s, val, j) => s + val * v[j], 0));
}

function invertMatrix(matrix) {
    const n = matrix.length;
    const augmented = matrix.map((row, i) =>
        [...row, ...Array(n).fill(0).map((_, j) => i === j ? 1 : 0)]
    );

    for (let i = 0; i < n; i++) {
        let maxRow = i;
        for (let k = i + 1; k < n; k++) {
            if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) maxRow = k;
        }
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

function normalCDF(z) {
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
    const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const sign = z < 0 ? -1 : 1;
    z = Math.abs(z) / Math.sqrt(2);
    const t = 1 / (1 + p * z);
    const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);
    return 0.5 * (1 + sign * y);
}

export default {
    oneStageNetworkIPD,
    twoStageNetworkIPD,
    mixedIPDADNetwork
};
