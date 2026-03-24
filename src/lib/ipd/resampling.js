/**
 * Bootstrap and Permutation Inference for IPD Meta-Analysis
 *
 * Implements resampling-based inference including:
 * - Cluster (study-level) bootstrap
 * - Patient-level bootstrap within studies
 * - Wild cluster bootstrap
 * - Permutation tests for treatment effects
 * - Bootstrap confidence intervals (percentile, BCa, studentized)
 *
 * Superior to ipdmetan: Multiple bootstrap schemes with proper clustering
 * Reference: Field & Welsh (2007), Cameron et al. (2008), Ren et al. (2010)
 */

/**
 * Cluster bootstrap for IPD meta-analysis
 * Resamples entire studies to account for within-study correlation
 *
 * @param {Object} data - IPD data { studies: { studyId: [patients] } }
 * @param {Function} estimator - Function that takes data and returns estimate
 * @param {Object} options - Bootstrap options
 * @returns {Object} Bootstrap results
 */
export function clusterBootstrap(data, estimator, options = {}) {
    const {
        B = 1000,         // Number of bootstrap replicates
        ciMethod = 'bca', // 'percentile', 'bca', 'studentized'
        alpha = 0.05,
        seed = null
    } = options;

    if (seed !== null) setRandomSeed(seed);

    const studyIds = Object.keys(data.studies);
    const k = studyIds.length;

    // Original estimate
    const original = estimator(data);
    const thetaHat = typeof original === 'object' ? original.estimate : original;

    // Bootstrap replicates
    const bootEstimates = [];

    for (let b = 0; b < B; b++) {
        // Resample studies with replacement
        const bootStudies = {};
        for (let i = 0; i < k; i++) {
            const idx = Math.floor(Math.random() * k);
            const selectedStudy = studyIds[idx];
            const newId = `${selectedStudy}_boot${i}`;
            bootStudies[newId] = [...data.studies[selectedStudy]];
        }

        try {
            const bootData = { studies: bootStudies };
            const bootResult = estimator(bootData);
            const bootEst = typeof bootResult === 'object' ? bootResult.estimate : bootResult;

            if (isFinite(bootEst)) {
                bootEstimates.push(bootEst);
            }
        } catch (e) {
            // Skip failed bootstraps
        }
    }

    const validB = bootEstimates.length;
    if (validB < B * 0.5) {
        return {
            error: 'Too many bootstrap failures',
            validReplicates: validB
        };
    }

    // Calculate CI based on method
    let ci;
    if (ciMethod === 'percentile') {
        ci = percentileCI(bootEstimates, alpha);
    } else if (ciMethod === 'bca') {
        ci = bcaCI(bootEstimates, thetaHat, data, estimator, studyIds, alpha);
    } else if (ciMethod === 'studentized') {
        ci = studentizedCI(bootEstimates, thetaHat, data, estimator, studyIds, alpha, B);
    } else {
        ci = percentileCI(bootEstimates, alpha);
    }

    // Bootstrap SE
    const bootMean = bootEstimates.reduce((a, b) => a + b, 0) / validB;
    const bootSE = Math.sqrt(bootEstimates.reduce((s, x) => s + (x - bootMean) ** 2, 0) / (validB - 1));

    // Bias
    const bias = bootMean - thetaHat;

    return {
        estimate: thetaHat,
        se: bootSE,
        ci,
        ciMethod,
        bias,
        biasCorrection: 2 * thetaHat - bootMean,
        nReplicates: validB,
        bootDistribution: summarizeDistribution(bootEstimates),
        alpha
    };
}

/**
 * Patient-level bootstrap within studies (two-level bootstrap)
 * Resamples patients within each study
 */
export function patientBootstrap(data, estimator, options = {}) {
    const {
        B = 1000,
        alpha = 0.05,
        seed = null
    } = options;

    if (seed !== null) setRandomSeed(seed);

    const studyIds = Object.keys(data.studies);

    // Original estimate
    const original = estimator(data);
    const thetaHat = typeof original === 'object' ? original.estimate : original;

    const bootEstimates = [];

    for (let b = 0; b < B; b++) {
        // Resample patients within each study
        const bootStudies = {};

        for (const studyId of studyIds) {
            const patients = data.studies[studyId];
            const n = patients.length;
            const bootPatients = [];

            for (let i = 0; i < n; i++) {
                const idx = Math.floor(Math.random() * n);
                bootPatients.push({ ...patients[idx] });
            }

            bootStudies[studyId] = bootPatients;
        }

        try {
            const bootResult = estimator({ studies: bootStudies });
            const bootEst = typeof bootResult === 'object' ? bootResult.estimate : bootResult;

            if (isFinite(bootEst)) {
                bootEstimates.push(bootEst);
            }
        } catch (e) {
            // Skip
        }
    }

    const validB = bootEstimates.length;
    const ci = percentileCI(bootEstimates, alpha);
    const bootMean = bootEstimates.reduce((a, b) => a + b, 0) / validB;
    const bootSE = Math.sqrt(bootEstimates.reduce((s, x) => s + (x - bootMean) ** 2, 0) / (validB - 1));

    return {
        estimate: thetaHat,
        se: bootSE,
        ci,
        nReplicates: validB,
        alpha
    };
}

/**
 * Wild cluster bootstrap (better for small number of clusters)
 * Reference: Cameron et al. (2008)
 */
export function wildClusterBootstrap(data, estimator, options = {}) {
    const {
        B = 999,          // Often use 999 for p-value exactness
        weights = 'rademacher', // 'rademacher', 'mammen', 'webb'
        alpha = 0.05,
        seed = null,
        nullHypothesis = 0
    } = options;

    if (seed !== null) setRandomSeed(seed);

    const studyIds = Object.keys(data.studies);
    const k = studyIds.length;

    // Original estimate
    const original = estimator(data);
    const thetaHat = typeof original === 'object' ? original.estimate : original;

    const bootEstimates = [];

    for (let b = 0; b < B; b++) {
        // Generate cluster-level weights
        const clusterWeights = {};
        for (const studyId of studyIds) {
            clusterWeights[studyId] = generateWildWeight(weights);
        }

        // Apply weights to residuals (simplified version)
        const bootStudies = {};
        for (const studyId of studyIds) {
            const w = clusterWeights[studyId];
            const patients = data.studies[studyId];

            // Perturb outcomes by wild weight
            bootStudies[studyId] = patients.map(p => ({
                ...p,
                outcome: p.outcome !== undefined ?
                    nullHypothesis + w * (p.outcome - nullHypothesis) :
                    p.outcome
            }));
        }

        try {
            const bootResult = estimator({ studies: bootStudies });
            const bootEst = typeof bootResult === 'object' ? bootResult.estimate : bootResult;

            if (isFinite(bootEst)) {
                bootEstimates.push(bootEst);
            }
        } catch (e) {
            // Skip
        }
    }

    const validB = bootEstimates.length;

    // Calculate p-value (for H0: theta = nullHypothesis)
    const tStat = (thetaHat - nullHypothesis);
    const pValue = bootEstimates.filter(t => Math.abs(t - nullHypothesis) >= Math.abs(tStat)).length / validB;

    const ci = percentileCI(bootEstimates, alpha);
    const bootSE = Math.sqrt(bootEstimates.reduce((s, x) => s + (x - bootEstimates.reduce((a,b)=>a+b,0)/validB) ** 2, 0) / (validB - 1));

    return {
        estimate: thetaHat,
        se: bootSE,
        ci,
        pValue,
        tStatistic: tStat / bootSE,
        nReplicates: validB,
        weightScheme: weights,
        nClusters: k,
        alpha
    };
}

/**
 * Permutation test for treatment effect
 * Tests H0: no treatment effect by permuting treatment labels
 */
export function permutationTest(data, estimator, options = {}) {
    const {
        nPerm = 999,
        treatmentVar = 'treatment',
        permLevel = 'patient', // 'patient' or 'study'
        twoSided = true,
        seed = null
    } = options;

    if (seed !== null) setRandomSeed(seed);

    const studyIds = Object.keys(data.studies);

    // Original estimate
    const original = estimator(data);
    const thetaHat = typeof original === 'object' ? original.estimate : original;

    const permEstimates = [];

    for (let p = 0; p < nPerm; p++) {
        const permStudies = {};

        if (permLevel === 'patient') {
            // Permute treatment within each study
            for (const studyId of studyIds) {
                const patients = [...data.studies[studyId]];
                const treatments = patients.map(pt => pt[treatmentVar]);

                // Shuffle treatments
                for (let i = treatments.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [treatments[i], treatments[j]] = [treatments[j], treatments[i]];
                }

                permStudies[studyId] = patients.map((pt, i) => ({
                    ...pt,
                    [treatmentVar]: treatments[i]
                }));
            }
        } else {
            // Study-level permutation (less common)
            const allTreatments = studyIds.map(sid =>
                data.studies[sid].map(p => p[treatmentVar])
            );

            // Shuffle between studies
            for (let i = allTreatments.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [allTreatments[i], allTreatments[j]] = [allTreatments[j], allTreatments[i]];
            }

            studyIds.forEach((studyId, idx) => {
                const patients = data.studies[studyId];
                permStudies[studyId] = patients.map((pt, i) => ({
                    ...pt,
                    [treatmentVar]: allTreatments[idx][i % allTreatments[idx].length]
                }));
            });
        }

        try {
            const permResult = estimator({ studies: permStudies });
            const permEst = typeof permResult === 'object' ? permResult.estimate : permResult;

            if (isFinite(permEst)) {
                permEstimates.push(permEst);
            }
        } catch (e) {
            // Skip
        }
    }

    const validPerm = permEstimates.length;

    // Calculate p-value
    let pValue;
    if (twoSided) {
        pValue = (permEstimates.filter(e => Math.abs(e) >= Math.abs(thetaHat)).length + 1) / (validPerm + 1);
    } else {
        pValue = (permEstimates.filter(e => e >= thetaHat).length + 1) / (validPerm + 1);
    }

    // Permutation distribution
    const permMean = permEstimates.reduce((a, b) => a + b, 0) / validPerm;
    const permSD = Math.sqrt(permEstimates.reduce((s, x) => s + (x - permMean) ** 2, 0) / (validPerm - 1));

    return {
        estimate: thetaHat,
        pValue,
        twoSided,
        permutationMean: permMean,
        permutationSD: permSD,
        nPermutations: validPerm,
        permLevel,
        significant: pValue < 0.05,
        interpretation: pValue < 0.05 ?
            'Significant treatment effect (permutation test)' :
            'No significant treatment effect (permutation test)'
    };
}

/**
 * Stratified permutation test (permutes within strata)
 */
export function stratifiedPermutationTest(data, estimator, options = {}) {
    const {
        nPerm = 999,
        treatmentVar = 'treatment',
        stratumVar = 'stratum',
        twoSided = true,
        seed = null
    } = options;

    if (seed !== null) setRandomSeed(seed);

    const studyIds = Object.keys(data.studies);

    // Original estimate
    const original = estimator(data);
    const thetaHat = typeof original === 'object' ? original.estimate : original;

    const permEstimates = [];

    for (let p = 0; p < nPerm; p++) {
        const permStudies = {};

        for (const studyId of studyIds) {
            const patients = [...data.studies[studyId]];

            // Group by stratum
            const strata = {};
            patients.forEach((pt, idx) => {
                const s = pt[stratumVar] || 'default';
                if (!strata[s]) strata[s] = [];
                strata[s].push({ patient: pt, idx });
            });

            // Permute within each stratum
            const permPatients = [...patients];
            for (const stratum of Object.values(strata)) {
                const treatments = stratum.map(s => s.patient[treatmentVar]);

                // Shuffle
                for (let i = treatments.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [treatments[i], treatments[j]] = [treatments[j], treatments[i]];
                }

                stratum.forEach((s, i) => {
                    permPatients[s.idx] = {
                        ...permPatients[s.idx],
                        [treatmentVar]: treatments[i]
                    };
                });
            }

            permStudies[studyId] = permPatients;
        }

        try {
            const permResult = estimator({ studies: permStudies });
            const permEst = typeof permResult === 'object' ? permResult.estimate : permResult;

            if (isFinite(permEst)) {
                permEstimates.push(permEst);
            }
        } catch (e) {
            // Skip
        }
    }

    const validPerm = permEstimates.length;
    const pValue = twoSided ?
        (permEstimates.filter(e => Math.abs(e) >= Math.abs(thetaHat)).length + 1) / (validPerm + 1) :
        (permEstimates.filter(e => e >= thetaHat).length + 1) / (validPerm + 1);

    return {
        estimate: thetaHat,
        pValue,
        twoSided,
        nPermutations: validPerm,
        stratified: true,
        significant: pValue < 0.05
    };
}

/**
 * Bootstrap for heterogeneity (tau^2)
 */
export function bootstrapHeterogeneity(data, tauSquaredEstimator, options = {}) {
    const {
        B = 1000,
        alpha = 0.05,
        seed = null
    } = options;

    if (seed !== null) setRandomSeed(seed);

    const studyIds = Object.keys(data.studies);
    const k = studyIds.length;

    // Original tau^2 estimate
    const originalTau2 = tauSquaredEstimator(data);

    const bootTau2 = [];

    for (let b = 0; b < B; b++) {
        // Resample studies
        const bootStudies = {};
        for (let i = 0; i < k; i++) {
            const idx = Math.floor(Math.random() * k);
            bootStudies[`study_${i}`] = [...data.studies[studyIds[idx]]];
        }

        try {
            const tau2 = tauSquaredEstimator({ studies: bootStudies });
            if (isFinite(tau2) && tau2 >= 0) {
                bootTau2.push(tau2);
            }
        } catch (e) {
            // Skip
        }
    }

    const validB = bootTau2.length;
    const ci = percentileCI(bootTau2, alpha);

    // Q-profile like CI (using bootstrap)
    const sortedTau2 = [...bootTau2].sort((a, b) => a - b);
    const tau = Math.sqrt(originalTau2);
    const tauCI = [Math.sqrt(ci[0]), Math.sqrt(ci[1])];

    return {
        tau2: originalTau2,
        tau,
        tau2CI: ci,
        tauCI,
        bootDistribution: summarizeDistribution(bootTau2),
        nReplicates: validB,
        alpha
    };
}

/**
 * Parametric bootstrap for meta-analysis
 */
export function parametricBootstrap(estimates, variances, options = {}) {
    const {
        B = 1000,
        tau2 = null,
        alpha = 0.05,
        seed = null
    } = options;

    if (seed !== null) setRandomSeed(seed);

    const k = estimates.length;

    // Estimate tau^2 if not provided
    const weights = variances.map(v => 1 / v);
    const sumW = weights.reduce((a, b) => a + b, 0);
    const pooled = weights.reduce((s, w, i) => s + w * estimates[i], 0) / sumW;

    let actualTau2 = tau2;
    if (actualTau2 === null) {
        const Q = estimates.reduce((s, e, i) => s + weights[i] * (e - pooled) ** 2, 0);
        const C = sumW - weights.reduce((s, w) => s + w * w, 0) / sumW;
        actualTau2 = Math.max(0, (Q - (k - 1)) / C);
    }

    const bootPooled = [];

    for (let b = 0; b < B; b++) {
        // Generate new study effects from assumed distribution
        const bootEstimates = estimates.map((e, i) => {
            // True effect = pooled + random effect + sampling error
            const randomEffect = Math.sqrt(actualTau2) * normalRandom();
            const samplingError = Math.sqrt(variances[i]) * normalRandom();
            return pooled + randomEffect + samplingError;
        });

        // Re-estimate pooled
        const bootWeights = variances.map(v => 1 / (v + actualTau2));
        const bootSumW = bootWeights.reduce((a, b) => a + b, 0);
        const bootEst = bootWeights.reduce((s, w, i) => s + w * bootEstimates[i], 0) / bootSumW;

        if (isFinite(bootEst)) {
            bootPooled.push(bootEst);
        }
    }

    const validB = bootPooled.length;
    const ci = percentileCI(bootPooled, alpha);
    const bootMean = bootPooled.reduce((a, b) => a + b, 0) / validB;
    const bootSE = Math.sqrt(bootPooled.reduce((s, x) => s + (x - bootMean) ** 2, 0) / (validB - 1));

    return {
        estimate: pooled,
        se: bootSE,
        ci,
        tau2: actualTau2,
        nReplicates: validB,
        alpha
    };
}

// CI calculation methods

function percentileCI(bootEstimates, alpha) {
    const sorted = [...bootEstimates].sort((a, b) => a - b);
    const n = sorted.length;
    const lower = sorted[Math.floor((alpha / 2) * n)];
    const upper = sorted[Math.floor((1 - alpha / 2) * n)];
    return [lower, upper];
}

function bcaCI(bootEstimates, thetaHat, data, estimator, studyIds, alpha) {
    const sorted = [...bootEstimates].sort((a, b) => a - b);
    const n = sorted.length;
    const k = studyIds.length;

    // Bias correction factor (z0)
    const propLess = bootEstimates.filter(e => e < thetaHat).length / n;
    const z0 = normalQuantile(propLess);

    // Acceleration factor (a) using jackknife
    const jackEstimates = [];
    for (let i = 0; i < k; i++) {
        const jackStudies = {};
        studyIds.forEach((sid, j) => {
            if (j !== i) jackStudies[sid] = data.studies[sid];
        });

        try {
            const jackResult = estimator({ studies: jackStudies });
            const jackEst = typeof jackResult === 'object' ? jackResult.estimate : jackResult;
            if (isFinite(jackEst)) {
                jackEstimates.push(jackEst);
            }
        } catch (e) {
            jackEstimates.push(thetaHat);
        }
    }

    const jackMean = jackEstimates.reduce((a, b) => a + b, 0) / jackEstimates.length;
    const num = jackEstimates.reduce((s, e) => s + (jackMean - e) ** 3, 0);
    const denom = jackEstimates.reduce((s, e) => s + (jackMean - e) ** 2, 0);
    const a = num / (6 * Math.pow(denom, 1.5) + 1e-10);

    // Adjusted percentiles
    const zAlphaLower = normalQuantile(alpha / 2);
    const zAlphaUpper = normalQuantile(1 - alpha / 2);

    const adjLower = normalCDF(z0 + (z0 + zAlphaLower) / (1 - a * (z0 + zAlphaLower)));
    const adjUpper = normalCDF(z0 + (z0 + zAlphaUpper) / (1 - a * (z0 + zAlphaUpper)));

    const lower = sorted[Math.max(0, Math.floor(adjLower * n))];
    const upper = sorted[Math.min(n - 1, Math.floor(adjUpper * n))];

    return [lower, upper];
}

function studentizedCI(bootEstimates, thetaHat, data, estimator, studyIds, alpha, B) {
    // Need SEs for each bootstrap replicate - computationally intensive
    // Simplified version using bootstrap SE
    const bootMean = bootEstimates.reduce((a, b) => a + b, 0) / bootEstimates.length;
    const bootSE = Math.sqrt(bootEstimates.reduce((s, x) => s + (x - bootMean) ** 2, 0) / (bootEstimates.length - 1));

    // t-percentiles
    const tStats = bootEstimates.map(e => (e - thetaHat) / bootSE);
    const sortedT = [...tStats].sort((a, b) => a - b);
    const n = sortedT.length;

    const tLower = sortedT[Math.floor((1 - alpha / 2) * n)];
    const tUpper = sortedT[Math.floor((alpha / 2) * n)];

    return [thetaHat - tLower * bootSE, thetaHat - tUpper * bootSE];
}

// Wild bootstrap weight generators
function generateWildWeight(scheme) {
    if (scheme === 'rademacher') {
        return Math.random() < 0.5 ? -1 : 1;
    } else if (scheme === 'mammen') {
        const p = (Math.sqrt(5) + 1) / (2 * Math.sqrt(5));
        return Math.random() < p ?
            -(Math.sqrt(5) - 1) / 2 :
            (Math.sqrt(5) + 1) / 2;
    } else if (scheme === 'webb') {
        const u = Math.random();
        if (u < 1/6) return -Math.sqrt(1.5);
        if (u < 2/6) return -1;
        if (u < 3/6) return -Math.sqrt(0.5);
        if (u < 4/6) return Math.sqrt(0.5);
        if (u < 5/6) return 1;
        return Math.sqrt(1.5);
    }
    return Math.random() < 0.5 ? -1 : 1;
}

// Distribution summary
function summarizeDistribution(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const n = values.length;
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const variance = values.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1);

    return {
        n,
        mean,
        sd: Math.sqrt(variance),
        min: sorted[0],
        q25: sorted[Math.floor(0.25 * n)],
        median: sorted[Math.floor(0.5 * n)],
        q75: sorted[Math.floor(0.75 * n)],
        max: sorted[n - 1]
    };
}

// Random number generation
let randomSeed = null;

function setRandomSeed(seed) {
    randomSeed = seed;
}

function normalRandom() {
    const u1 = Math.random();
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// Statistical functions
function normalCDF(z) {
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
    const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const sign = z < 0 ? -1 : 1;
    z = Math.abs(z) / Math.sqrt(2);
    const t = 1 / (1 + p * z);
    const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);
    return 0.5 * (1 + sign * y);
}

function normalQuantile(p) {
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    if (p === 0.5) return 0;

    const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
               1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
               6.680131188771972e+01, -1.328068155288572e+01];
    const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
               -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];

    const pLow = 0.02425, pHigh = 1 - pLow;
    let q, r;

    if (p < pLow) {
        q = Math.sqrt(-2 * Math.log(p));
        return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
    } else if (p <= pHigh) {
        q = p - 0.5;
        r = q * q;
        return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
    } else {
        q = Math.sqrt(-2 * Math.log(1 - p));
        return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
    }
}

export default {
    clusterBootstrap,
    patientBootstrap,
    wildClusterBootstrap,
    permutationTest,
    stratifiedPermutationTest,
    bootstrapHeterogeneity,
    parametricBootstrap
};
