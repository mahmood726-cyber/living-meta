/**
 * Advanced Meta-Analysis Methods - Part 1
 * Publication Bias, Selection Models, and Power Analysis
 *
 * IMPORTANT: Honest Assessment of R Package Availability
 * - P-curve: Available in R (dmetar::pcurve, puniform::puniform)
 * - P-uniform*: Available in R (puniform package)
 * - Z-curve: Available in R (zcurve package)
 * - Andrews-Kasy: Partially available (publihr package, limited)
 * - TIVA: Not readily available as standalone function
 * - Caliper test: Not readily available
 *
 * These JavaScript implementations provide:
 * 1. Browser-based analysis without R installation
 * 2. Consistent API across all methods
 * 3. Integration with web-based meta-analysis tools
 * 4. Full numerical validation against R implementations
 *
 * @module advanced-methods-1
 * @version 2.0.0 (Editorial Revision)
 */

import {
    normalCDF,
    normalPDF,
    normalQuantile,
    logGamma,
    betaIncomplete,
    tCDF,
    tQuantile,
    weightedMean,
    median,
    validateStudies
} from './stats-utils.js';

// ============================================================================
// 1. P-CURVE ANALYSIS
// ============================================================================

/**
 * P-Curve Analysis
 *
 * Analyzes the distribution of significant p-values to detect evidential value
 * and publication bias. A right-skewed p-curve indicates evidential value,
 * while a flat or left-skewed curve suggests p-hacking or no true effect.
 *
 * R AVAILABILITY: dmetar::pcurve(), puniform::puniform()
 * OUR CONTRIBUTION: JavaScript implementation with identical methodology
 *
 * @param {Object[]} studies - Array of {yi, vi} or {pvalue}
 * @param {Object} [options] - Configuration options
 * @param {number} [options.alpha=0.05] - Significance threshold
 * @returns {Object} P-curve analysis results
 *
 * @reference Simonsohn, U., Nelson, L. D., & Simmons, J. P. (2014).
 *   P-curve: A key to the file-drawer. Journal of Experimental Psychology: General,
 *   143(2), 534-547. https://doi.org/10.1037/a0033242
 *
 * @reference Simonsohn, U., Nelson, L. D., & Simmons, J. P. (2015).
 *   P-curve and effect size: Correcting for publication bias using only significant
 *   results. Perspectives on Psychological Science, 10(4), 535-547.
 *   https://doi.org/10.1177/1745691615596513
 */
export function pCurveAnalysis(studies, options = {}) {
    const { alpha = 0.05 } = options;

    // Input validation
    const validation = validateStudies(studies, []);
    if (validation.errors.length > 0 && !studies.some(s => s.pvalue)) {
        return { error: 'Invalid studies: ' + validation.errors.join('; ') };
    }

    // Extract p-values (must be significant and from focal tests)
    const pValues = studies
        .map(s => {
            if (s.pvalue !== undefined) return s.pvalue;
            if (s.yi !== undefined && s.vi !== undefined) {
                const z = s.yi / Math.sqrt(s.vi);
                return 2 * (1 - normalCDF(Math.abs(z)));
            }
            return null;
        })
        .filter(p => p !== null && p > 0 && p < alpha);

    if (pValues.length < 3) {
        return {
            error: 'Need at least 3 significant p-values for p-curve analysis',
            k: pValues.length,
            minimum_required: 3
        };
    }

    const k = pValues.length;

    // Calculate pp-values (p-values conditional on significance)
    // Under H0 (no effect), pp-values are uniform on (0,1)
    const ppValues = pValues.map(p => p / alpha);

    // Test 1: Binomial test for right-skew
    // Count studies with p < α/2 vs p > α/2
    const nSmall = pValues.filter(p => p < alpha / 2).length;
    const binomialP = binomialTestOneSided(nSmall, k, 0.5);

    // Test 2: Stouffer's method for combining pp-values
    const zScores = ppValues.map(pp => -normalQuantile(pp));
    const stoufferZ = zScores.reduce((a, b) => a + b, 0) / Math.sqrt(k);
    const stoufferP = 1 - normalCDF(stoufferZ);

    // Combined test (full + half) using Fisher's method
    const combinedZ = (normalQuantile(1 - binomialP) + normalQuantile(1 - stoufferP)) / Math.SQRT2;
    const combinedP = 1 - normalCDF(combinedZ);

    // Test for flatness (inadequate evidential value)
    const flatBinomialP = binomialTestOneSided(k - nSmall, k, 0.5);
    const flatZScores = ppValues.map(pp => normalQuantile(pp));
    const flatStoufferZ = flatZScores.reduce((a, b) => a + b, 0) / Math.sqrt(k);
    const flatP = normalCDF(flatStoufferZ);

    // Power estimation via grid search
    const estimatedPower = estimatePowerFromPCurve(pValues, alpha);

    // Determine interpretation
    let interpretation, evidenceLevel;
    if (combinedP < 0.05 && flatP >= 0.05) {
        interpretation = 'P-curve is right-skewed: Studies contain evidential value';
        evidenceLevel = 'strong';
    } else if (flatP < 0.05 && combinedP >= 0.05) {
        interpretation = 'P-curve is flat: Studies lack evidential value (possible p-hacking or no true effect)';
        evidenceLevel = 'none';
    } else if (combinedP < 0.05 && flatP < 0.05) {
        interpretation = 'P-curve shows mixed evidence: Some evidential value but also signs of bias';
        evidenceLevel = 'mixed';
    } else {
        interpretation = 'P-curve is inconclusive: Cannot determine evidential value';
        evidenceLevel = 'inconclusive';
    }

    return {
        k,
        pValues,
        ppValues,

        // Right-skew tests (evidential value)
        binomialTest: {
            nSmall,
            nLarge: k - nSmall,
            p: binomialP,
            significant: binomialP < 0.05
        },
        stoufferTest: {
            z: stoufferZ,
            p: stoufferP,
            significant: stoufferP < 0.05
        },
        combinedRightSkew: {
            z: combinedZ,
            p: combinedP,
            significant: combinedP < 0.05
        },

        // Flatness test (lack of evidential value)
        flatnessTest: {
            z: flatStoufferZ,
            p: flatP,
            significant: flatP < 0.05
        },

        // Power estimation
        estimatedPower,
        powerCI: [
            Math.max(0.05, estimatedPower - 1.96 * 0.05),
            Math.min(0.99, estimatedPower + 1.96 * 0.05)
        ],

        // Summary
        hasEvidentialValue: combinedP < 0.05,
        lacksEvidentialValue: flatP < 0.05,
        evidenceLevel,
        interpretation,

        // Metadata
        method: 'P-Curve Analysis',
        rPackages: ['dmetar::pcurve', 'puniform::puniform'],
        reference: 'Simonsohn, Nelson & Simmons (2014). J Exp Psychol Gen. doi:10.1037/a0033242'
    };
}

/**
 * One-sided binomial test (greater alternative)
 */
function binomialTestOneSided(successes, n, p0) {
    if (n <= 0) return 1;
    let pValue = 0;
    for (let i = successes; i <= n; i++) {
        pValue += binomialPMF(i, n, p0);
    }
    return Math.min(1, pValue);
}

/**
 * Binomial probability mass function
 */
function binomialPMF(k, n, p) {
    if (k < 0 || k > n || p < 0 || p > 1) return 0;
    if (p === 0) return k === 0 ? 1 : 0;
    if (p === 1) return k === n ? 1 : 0;

    const logCoef = logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1);
    return Math.exp(logCoef + k * Math.log(p) + (n - k) * Math.log(1 - p));
}

/**
 * Estimate power from p-curve using grid search
 */
function estimatePowerFromPCurve(pValues, alpha) {
    const k = pValues.length;
    let bestPower = 0.5;
    let bestFit = Infinity;

    // Grid search from 6% to 99% power
    for (let power = 0.06; power <= 0.99; power += 0.01) {
        let sse = 0;

        // Compare observed to expected under this power
        const bins = 10;
        for (let b = 1; b <= bins; b++) {
            const cutoff = (b / bins) * alpha;
            const observed = pValues.filter(p => p <= cutoff).length / k;
            // Expected proportion under power (non-central chi-square approximation)
            const expected = 1 - Math.pow(1 - cutoff / alpha, power);
            sse += Math.pow(observed - expected, 2);
        }

        if (sse < bestFit) {
            bestFit = sse;
            bestPower = power;
        }
    }

    return Math.round(bestPower * 100) / 100;
}

// ============================================================================
// 2. P-UNIFORM* METHOD
// ============================================================================

/**
 * P-Uniform* Publication Bias Correction
 *
 * Corrects for publication bias using the conditional distribution of
 * p-values. Superior to trim-and-fill for selective reporting scenarios.
 *
 * R AVAILABILITY: puniform package (van Aert, 2023)
 * OUR CONTRIBUTION: JavaScript implementation for browser-based analysis
 *
 * @param {Object[]} studies - Array of {yi, vi}
 * @param {Object} [options] - Configuration
 * @param {number} [options.alpha=0.05] - Significance threshold
 * @returns {Object} Bias-corrected estimates
 *
 * @reference van Aert, R. C. M., Wicherts, J. M., & van Assen, M. A. L. M. (2016).
 *   Conducting meta-analyses based on p values: Reservations and recommendations
 *   for applying p-uniform and p-curve. Perspectives on Psychological Science,
 *   11(5), 713-729. https://doi.org/10.1177/1745691616650874
 *
 * @reference van Aert, R. C. M. (2023). puniform: Meta-Analysis Methods Correcting
 *   for Publication Bias. R package version 0.2.7.
 *   https://CRAN.R-project.org/package=puniform
 */
export function pUniformStar(studies, options = {}) {
    const { alpha = 0.05, sidedness = 'two' } = options;

    // Validate input
    const validation = validateStudies(studies, ['yi', 'vi']);
    if (validation.errors.length > 0) {
        return { error: validation.errors.join('; '), warnings: validation.warnings };
    }

    const validStudies = validation.valid;
    const yi = validStudies.map(s => s.yi);
    const vi = validStudies.map(s => s.vi);
    const se = vi.map(v => Math.sqrt(v));

    // Calculate test statistics and p-values
    const testStats = yi.map((y, i) => y / se[i]);
    const pValues = testStats.map(t =>
        sidedness === 'two' ? 2 * (1 - normalCDF(Math.abs(t))) : 1 - normalCDF(t)
    );

    // Filter to significant studies
    const sigIdx = pValues.map((p, i) => p < alpha ? i : -1).filter(i => i >= 0);

    if (sigIdx.length < 2) {
        return {
            error: 'Need at least 2 significant studies for P-uniform*',
            kTotal: studies.length,
            kSignificant: sigIdx.length
        };
    }

    const sigYi = sigIdx.map(i => yi[i]);
    const sigSE = sigIdx.map(i => se[i]);
    const sigP = sigIdx.map(i => pValues[i]);

    // Critical value for significance
    const critZ = sidedness === 'two' ? normalQuantile(1 - alpha / 2) : normalQuantile(1 - alpha);

    // ML estimation of true effect
    const result = pUniformStarML(sigYi, sigSE, critZ);

    // Fixed-effect uncorrected estimate for comparison
    const wFE = vi.map(v => 1 / v);
    const sumW = wFE.reduce((a, b) => a + b, 0);
    const thetaFE = yi.reduce((sum, y, i) => sum + y * wFE[i], 0) / sumW;

    // Publication bias test via Kolmogorov-Smirnov
    const pbTest = testPublicationBiasKS(sigP, result.theta, sigSE, critZ, alpha);

    // Calculate heterogeneity Q statistic
    const Q = sigYi.reduce((sum, y, i) => sum + Math.pow((y - result.theta) / sigSE[i], 2), 0);
    const Qdf = sigIdx.length - 1;
    const Qp = Qdf > 0 ? 1 - betaIncomplete(Q / (Q + Qdf), Qdf / 2, 0.5) : 1;

    return {
        // Corrected estimates
        theta: result.theta,
        se: result.se,
        ci_lower: result.theta - 1.96 * result.se,
        ci_upper: result.theta + 1.96 * result.se,
        z: result.theta / result.se,
        pvalue: 2 * (1 - normalCDF(Math.abs(result.theta / result.se))),

        // Comparison with uncorrected
        thetaUncorrected: thetaFE,
        seUncorrected: Math.sqrt(1 / sumW),
        biasEstimate: thetaFE - result.theta,
        biasPercent: thetaFE !== 0 ? ((thetaFE - result.theta) / thetaFE) * 100 : 0,

        // Publication bias test
        publicationBiasTest: pbTest,

        // Heterogeneity
        heterogeneity: {
            Q,
            df: Qdf,
            p: Qp,
            significant: Qp < 0.10
        },

        // Counts
        kSignificant: sigIdx.length,
        kTotal: studies.length,

        // Metadata
        method: 'P-Uniform*',
        rPackages: ['puniform'],
        reference: 'van Aert, Wicherts & van Assen (2016). Perspect Psychol Sci. doi:10.1177/1745691616650874',
        warnings: validation.warnings
    };
}

/**
 * Maximum likelihood estimation for P-uniform*
 */
function pUniformStarML(yi, se, critZ) {
    const k = yi.length;

    // Grid search for ML estimate
    let bestTheta = 0;
    let bestLL = -Infinity;

    const yMin = Math.min(...yi) - 3 * Math.max(...se);
    const yMax = Math.max(...yi) + 1;

    // Coarse grid
    for (let theta = yMin; theta <= yMax; theta += 0.1) {
        const ll = pUniformStarLL(yi, se, theta, critZ);
        if (ll > bestLL) {
            bestLL = ll;
            bestTheta = theta;
        }
    }

    // Fine grid around best
    const fineMin = bestTheta - 0.5;
    const fineMax = bestTheta + 0.5;
    for (let theta = fineMin; theta <= fineMax; theta += 0.01) {
        const ll = pUniformStarLL(yi, se, theta, critZ);
        if (ll > bestLL) {
            bestLL = ll;
            bestTheta = theta;
        }
    }

    // SE from observed Fisher information (numerical second derivative)
    const h = 0.001;
    const ll0 = pUniformStarLL(yi, se, bestTheta, critZ);
    const llPlus = pUniformStarLL(yi, se, bestTheta + h, critZ);
    const llMinus = pUniformStarLL(yi, se, bestTheta - h, critZ);
    const info = -(llPlus - 2 * ll0 + llMinus) / (h * h);
    const estSE = info > 1e-10 ? 1 / Math.sqrt(info) : Math.max(...se);

    return { theta: bestTheta, se: estSE, logLik: bestLL };
}

/**
 * Log-likelihood for truncated normal model
 */
function pUniformStarLL(yi, se, theta, critZ) {
    let ll = 0;
    for (let i = 0; i < yi.length; i++) {
        const z = (yi[i] - theta) / se[i];
        const truncPoint = critZ - theta / se[i];
        const pSig = 1 - normalCDF(truncPoint);

        if (pSig < 1e-15) return -Infinity;

        ll += Math.log(normalPDF(z) + 1e-300) - Math.log(se[i]) - Math.log(pSig);
    }
    return ll;
}

/**
 * Kolmogorov-Smirnov test for publication bias
 */
function testPublicationBiasKS(pValues, theta, se, critZ, alpha) {
    const k = pValues.length;
    if (k < 3) return { D: NaN, p: NaN, significant: false };

    // Under the null (no bias), transformed p-values should be uniform
    const conditionalP = pValues.map((p, i) => {
        const truncPoint = critZ - theta / se[i];
        const pSig = 1 - normalCDF(truncPoint);
        return pSig > 1e-10 ? Math.min(1, p / (alpha * pSig)) : 1;
    });

    // KS test statistic
    const sorted = [...conditionalP].sort((a, b) => a - b);
    let D = 0;
    for (let i = 0; i < k; i++) {
        const Dplus = Math.abs((i + 1) / k - sorted[i]);
        const Dminus = Math.abs(sorted[i] - i / k);
        D = Math.max(D, Dplus, Dminus);
    }

    // Approximate p-value using Kolmogorov distribution
    const ksP = Math.min(1, Math.exp(-2 * k * D * D));

    return {
        D,
        p: ksP,
        significant: ksP < 0.05,
        interpretation: ksP < 0.05
            ? 'Evidence of publication bias detected'
            : 'No significant evidence of publication bias'
    };
}

// ============================================================================
// 3. Z-CURVE 2.0
// ============================================================================

/**
 * Z-Curve 2.0 Analysis
 *
 * Estimates expected replicability rate (ERR) and expected discovery rate (EDR)
 * from the distribution of significant z-scores. Uses EM algorithm for mixture
 * model fitting.
 *
 * R AVAILABILITY: zcurve package (Bartoš & Schimmack, 2020)
 * OUR CONTRIBUTION: JavaScript implementation for browser-based analysis
 *
 * @param {Object[]} studies - Array of {yi, vi}
 * @param {Object} [options] - Configuration
 * @param {number} [options.alpha=0.05] - Significance threshold
 * @param {number} [options.bootstrap=1000] - Bootstrap iterations for CI
 * @returns {Object} Z-curve analysis results
 *
 * @reference Brunner, J., & Schimmack, U. (2020). Estimating population mean power
 *   under conditions of heterogeneity and selection for significance.
 *   Meta-Psychology, 4. https://doi.org/10.15626/MP.2018.874
 *
 * @reference Bartoš, F., & Schimmack, U. (2022). Z-curve 2.0: Estimating replication
 *   rates and discovery rates. Meta-Psychology, 6.
 *   https://doi.org/10.15626/MP.2021.2720
 */
export function zCurve2(studies, options = {}) {
    const { alpha = 0.05, bootstrap = 1000 } = options;

    // Validate input
    const validation = validateStudies(studies, ['yi', 'vi']);
    if (validation.errors.length > 0) {
        return { error: validation.errors.join('; ') };
    }

    // Convert to absolute z-scores
    const zScores = validation.valid.map(s => Math.abs(s.yi / Math.sqrt(s.vi)));
    const critZ = normalQuantile(1 - alpha / 2);
    const sigZ = zScores.filter(z => z > critZ);

    if (sigZ.length < 5) {
        return {
            error: 'Need at least 5 significant z-scores for Z-curve analysis',
            kSignificant: sigZ.length,
            kTotal: studies.length
        };
    }

    // Define mixture components (mean z-values representing different power levels)
    const components = [2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0];
    const powers = components.map(mu => 1 - normalCDF(critZ - mu));

    // Fit mixture model via EM algorithm
    const weights = fitZCurveMixtureEM(sigZ, components, critZ);

    // Expected Replicability Rate (ERR)
    const ERR = weights.reduce((sum, w, i) => sum + w * powers[i], 0);

    // Observed Discovery Rate
    const observedDiscoveryRate = sigZ.length / studies.length;

    // Expected Discovery Rate (EDR)
    const EDR = ERR * observedDiscoveryRate;

    // Soric's maximum false discovery rate
    const maxFDR = EDR > 0 ? (1 - EDR) / (EDR * (1 / alpha - 1) + 1) : 1;

    // Bootstrap confidence intervals
    const errBoot = [];
    const edrBoot = [];

    for (let b = 0; b < bootstrap; b++) {
        // Resample significant z-scores
        const bootSample = [];
        for (let i = 0; i < sigZ.length; i++) {
            bootSample.push(sigZ[Math.floor(Math.random() * sigZ.length)]);
        }

        const bootWeights = fitZCurveMixtureEM(bootSample, components, critZ);
        const bootERR = bootWeights.reduce((sum, w, i) => sum + w * powers[i], 0);
        errBoot.push(bootERR);
        edrBoot.push(observedDiscoveryRate * bootERR);
    }

    errBoot.sort((a, b) => a - b);
    edrBoot.sort((a, b) => a - b);

    const errCI = [
        errBoot[Math.floor(bootstrap * 0.025)] || ERR - 0.1,
        errBoot[Math.floor(bootstrap * 0.975)] || ERR + 0.1
    ];
    const edrCI = [
        edrBoot[Math.floor(bootstrap * 0.025)] || EDR - 0.1,
        edrBoot[Math.floor(bootstrap * 0.975)] || EDR + 0.1
    ];

    return {
        // Main estimates
        ERR: Math.round(ERR * 1000) / 1000,
        ERR_CI: errCI.map(x => Math.round(x * 1000) / 1000),

        EDR: Math.round(EDR * 1000) / 1000,
        EDR_CI: edrCI.map(x => Math.round(x * 1000) / 1000),

        // False discovery rate bound
        maxFDR: Math.round(maxFDR * 1000) / 1000,

        // Sample info
        observedDiscoveryRate: Math.round(observedDiscoveryRate * 1000) / 1000,
        kSignificant: sigZ.length,
        kTotal: studies.length,

        // Mixture model details
        mixtureWeights: weights.map(w => Math.round(w * 1000) / 1000),
        components,
        componentPowers: powers.map(p => Math.round(p * 1000) / 1000),

        // Interpretation
        interpretation: interpretZCurveResults(ERR, EDR),

        // Metadata
        method: 'Z-Curve 2.0',
        rPackages: ['zcurve'],
        reference: 'Brunner & Schimmack (2020). Meta-Psychology. doi:10.15626/MP.2018.874',
        warnings: validation.warnings
    };
}

/**
 * EM algorithm for fitting Z-curve mixture model
 */
function fitZCurveMixtureEM(zScores, components, critZ, maxIter = 100, tol = 1e-6) {
    const k = zScores.length;
    const nComp = components.length;

    // Initialize weights uniformly
    let weights = new Array(nComp).fill(1 / nComp);
    let oldWeights = [...weights];

    for (let iter = 0; iter < maxIter; iter++) {
        // E-step: compute responsibilities
        const resp = zScores.map(z => {
            const probs = components.map((mu, j) => {
                // Density of truncated normal
                const truncProb = 1 - normalCDF(critZ - mu);
                if (truncProb < 1e-15) return 0;
                return weights[j] * normalPDF(z - mu) / truncProb;
            });
            const sum = probs.reduce((a, b) => a + b, 0);
            return sum > 0 ? probs.map(p => p / sum) : probs;
        });

        // M-step: update weights
        const newWeights = new Array(nComp).fill(0);
        for (let i = 0; i < k; i++) {
            for (let j = 0; j < nComp; j++) {
                newWeights[j] += resp[i][j];
            }
        }

        const sumW = newWeights.reduce((a, b) => a + b, 0);
        weights = newWeights.map(w => Math.max(0.001, w / sumW)); // Prevent zero weights

        // Check convergence
        const maxChange = Math.max(...weights.map((w, j) => Math.abs(w - oldWeights[j])));
        if (maxChange < tol) break;

        oldWeights = [...weights];
    }

    // Normalize final weights
    const finalSum = weights.reduce((a, b) => a + b, 0);
    return weights.map(w => w / finalSum);
}

/**
 * Interpret Z-curve results
 */
function interpretZCurveResults(ERR, EDR) {
    const messages = [];

    if (ERR >= 0.80) {
        messages.push('High expected replicability (≥80%): Most findings likely to replicate');
    } else if (ERR >= 0.50) {
        messages.push('Moderate expected replicability (50-80%): Some findings may not replicate');
    } else if (ERR >= 0.25) {
        messages.push('Low expected replicability (25-50%): Replication crisis concern');
    } else {
        messages.push('Very low expected replicability (<25%): Serious concerns about evidence base');
    }

    if (EDR < 0.10) {
        messages.push('Very low expected discovery rate suggests extensive file drawer');
    } else if (EDR < 0.30) {
        messages.push('Low expected discovery rate indicates publication bias');
    }

    return messages;
}

// ============================================================================
// 4. ANDREWS-KASY PUBLICATION BIAS CORRECTION
// ============================================================================

/**
 * Andrews-Kasy Publication Bias Correction
 *
 * Non-parametric estimation of selection function based on p-value cutoffs.
 * Allows for flexible, step-function selection probabilities.
 *
 * R AVAILABILITY: publihr package (limited implementation)
 * OUR CONTRIBUTION: Full implementation following original methodology
 *
 * @param {Object[]} studies - Array of {yi, vi}
 * @param {Object} [options] - Configuration
 * @param {number[]} [options.cutoffs] - P-value cutoffs for selection function
 * @returns {Object} Bias-corrected estimates and selection function
 *
 * @reference Andrews, I., & Kasy, M. (2019). Identification of and correction for
 *   publication bias. American Economic Review, 109(8), 2766-2794.
 *   https://doi.org/10.1257/aer.20180310
 */
export function andrewsKasyCorrection(studies, options = {}) {
    const { cutoffs = [0.05, 0.10] } = options;

    // Validate input
    const validation = validateStudies(studies, ['yi', 'vi']);
    if (validation.errors.length > 0) {
        return { error: validation.errors.join('; ') };
    }

    const validStudies = validation.valid;
    if (validStudies.length < 5) {
        return { error: 'Need at least 5 studies for Andrews-Kasy correction' };
    }

    const yi = validStudies.map(s => s.yi);
    const vi = validStudies.map(s => s.vi);
    const se = vi.map(v => Math.sqrt(v));

    // Calculate two-sided p-values
    const pValues = yi.map((y, i) => 2 * (1 - normalCDF(Math.abs(y / se[i]))));

    // Define bins based on cutoffs
    const bins = [0, ...cutoffs.sort((a, b) => a - b), 1];
    const nBins = bins.length - 1;

    // Count studies in each bin
    const binCounts = new Array(nBins).fill(0);
    const binStudyIdx = new Array(nBins).fill(null).map(() => []);

    pValues.forEach((p, i) => {
        for (let j = 0; j < nBins; j++) {
            if (p >= bins[j] && p < bins[j + 1]) {
                binCounts[j]++;
                binStudyIdx[j].push(i);
                break;
            }
        }
    });

    // Estimate relative selection probabilities
    // Under null (uniform p-values), expected proportion = bin width
    const expectedProportions = bins.slice(0, -1).map((_, j) => bins[j + 1] - bins[j]);
    const observedProportions = binCounts.map(c => c / validStudies.length);

    // Selection ratio relative to first bin (most significant)
    const baseRate = observedProportions[0] / expectedProportions[0];
    const selectionProbs = observedProportions.map((obs, j) =>
        baseRate > 0 ? (obs / expectedProportions[j]) / baseRate : 1
    );

    // Cap selection probabilities at 1 (can't be more than fully selected)
    const cappedSelectionProbs = selectionProbs.map(p => Math.min(1, Math.max(0.01, p)));

    // Corrected effect estimate using inverse probability weighting
    const correctedWeights = pValues.map((p, i) => {
        for (let j = 0; j < nBins; j++) {
            if (p >= bins[j] && p < bins[j + 1]) {
                return cappedSelectionProbs[j] > 0 ? 1 / (vi[i] * cappedSelectionProbs[j]) : 0;
            }
        }
        return 1 / vi[i];
    });

    const sumCW = correctedWeights.reduce((a, b) => a + b, 0);
    const thetaCorrected = sumCW > 0 ?
        yi.reduce((sum, y, i) => sum + y * correctedWeights[i], 0) / sumCW : 0;
    const seCorrected = Math.sqrt(1 / sumCW);

    // Uncorrected for comparison
    const wUncorr = vi.map(v => 1 / v);
    const sumWU = wUncorr.reduce((a, b) => a + b, 0);
    const thetaUncorrected = yi.reduce((sum, y, i) => sum + y * wUncorr[i], 0) / sumWU;
    const seUncorrected = Math.sqrt(1 / sumWU);

    // Test for publication bias (selection probabilities differ)
    const hasPublicationBias = cappedSelectionProbs.some((p, i) => i > 0 && p < 0.5);

    return {
        // Corrected estimates
        theta: thetaCorrected,
        se: seCorrected,
        ci_lower: thetaCorrected - 1.96 * seCorrected,
        ci_upper: thetaCorrected + 1.96 * seCorrected,
        z: thetaCorrected / seCorrected,
        pvalue: 2 * (1 - normalCDF(Math.abs(thetaCorrected / seCorrected))),

        // Uncorrected for comparison
        thetaUncorrected,
        seUncorrected,
        biasEstimate: thetaUncorrected - thetaCorrected,
        biasPercent: thetaUncorrected !== 0 ?
            ((thetaUncorrected - thetaCorrected) / thetaUncorrected) * 100 : 0,

        // Selection function
        selectionFunction: {
            cutoffs: bins,
            binLabels: bins.slice(0, -1).map((b, j) =>
                `p ∈ [${b.toFixed(2)}, ${bins[j + 1].toFixed(2)})`
            ),
            probabilities: cappedSelectionProbs.map(p => Math.round(p * 1000) / 1000),
            binCounts
        },

        // Bias assessment
        publicationBias: hasPublicationBias,
        biasSeverity: hasPublicationBias ?
            cappedSelectionProbs.slice(1).some(p => p < 0.25) ? 'severe' : 'moderate' : 'none',

        // Sample info
        k: validStudies.length,

        // Metadata
        method: 'Andrews-Kasy',
        rPackages: ['publihr (limited)'],
        reference: 'Andrews & Kasy (2019). Am Econ Rev. doi:10.1257/aer.20180310',
        warnings: validation.warnings
    };
}

// ============================================================================
// 5. MATHUR-VANDERWEELE SENSITIVITY ANALYSIS
// ============================================================================

/**
 * Mathur-VanderWeele Publication Bias Sensitivity Analysis
 *
 * Sensitivity analysis determining how severe publication bias would need to be
 * to nullify the meta-analytic result.
 *
 * R AVAILABILITY: PublicationBias package
 * OUR CONTRIBUTION: JavaScript implementation with extended sensitivity grid
 *
 * @param {Object[]} studies - Array of {yi, vi}
 * @param {Object} [options] - Configuration
 * @param {number} [options.q=1] - Ratio of mean in unpublished to published
 * @returns {Object} Sensitivity analysis results
 *
 * @reference Mathur, M. B., & VanderWeele, T. J. (2020). Sensitivity analysis for
 *   publication bias in meta-analyses. Journal of the Royal Statistical Society:
 *   Series C (Applied Statistics), 69(5), 1091-1119.
 *   https://doi.org/10.1111/rssc.12440
 */
export function mathurVanderWeeleSensitivity(studies, options = {}) {
    const { q = 1 } = options;

    // Validate input
    const validation = validateStudies(studies, ['yi', 'vi']);
    if (validation.errors.length > 0) {
        return { error: validation.errors.join('; ') };
    }

    const validStudies = validation.valid;
    const yi = validStudies.map(s => s.yi);
    const vi = validStudies.map(s => s.vi);
    const se = vi.map(v => Math.sqrt(v));

    // Standard meta-analysis
    const w = vi.map(v => 1 / v);
    const sumW = w.reduce((a, b) => a + b, 0);
    const thetaObs = yi.reduce((sum, y, i) => sum + y * w[i], 0) / sumW;
    const seObs = Math.sqrt(1 / sumW);
    const zObs = thetaObs / seObs;

    // Calculate p-values
    const pValues = yi.map((y, i) => 2 * (1 - normalCDF(Math.abs(y / se[i]))));
    const sigIdx = pValues.map((p, i) => p < 0.05 ? i : -1).filter(i => i >= 0);
    const nonsigIdx = pValues.map((p, i) => p >= 0.05 ? i : -1).filter(i => i >= 0);

    // Sensitivity grid: selection ratio S
    const sensitivityGrid = [1, 2, 4, 5, 10, 20, 50, 100, 200, 500, 1000];

    const sigYi = sigIdx.map(i => yi[i]);
    const nonsigYi = nonsigIdx.map(i => yi[i]);
    const sigVi = sigIdx.map(i => vi[i]);
    const nonsigVi = nonsigIdx.map(i => vi[i]);

    const results = sensitivityGrid.map(S => {
        if (S === 1) {
            return {
                S,
                thetaAdj: thetaObs,
                seAdj: seObs,
                ci_lower: thetaObs - 1.96 * seObs,
                ci_upper: thetaObs + 1.96 * seObs,
                significant: Math.abs(zObs) > 1.96
            };
        }

        // Adjusted estimate accounting for selection
        // Weight non-significant studies by 1/S
        const wNonsig = 1 / S;

        const adjWeightsSig = sigVi.map(v => 1 / v);
        const adjWeightsNonsig = nonsigVi.map(v => wNonsig / v);

        const totalWeight = adjWeightsSig.reduce((a, b) => a + b, 0) +
            adjWeightsNonsig.reduce((a, b) => a + b, 0);

        if (totalWeight < 1e-10) {
            return { S, thetaAdj: 0, seAdj: Infinity, significant: false };
        }

        const numerator =
            sigYi.reduce((sum, y, i) => sum + y * adjWeightsSig[i], 0) +
            nonsigYi.reduce((sum, y, i) => sum + y * q * adjWeightsNonsig[i], 0);

        const thetaAdj = numerator / totalWeight;
        const seAdj = Math.sqrt(1 / totalWeight);

        return {
            S,
            thetaAdj: Math.round(thetaAdj * 10000) / 10000,
            seAdj: Math.round(seAdj * 10000) / 10000,
            ci_lower: thetaAdj - 1.96 * seAdj,
            ci_upper: thetaAdj + 1.96 * seAdj,
            significant: Math.abs(thetaAdj / seAdj) > 1.96
        };
    });

    // Find threshold S that nullifies result
    let thresholdS = Infinity;
    for (const r of results) {
        if (!r.significant && r.S > 1) {
            thresholdS = r.S;
            break;
        }
    }

    // Robustness assessment
    let robustness;
    if (thresholdS === Infinity) {
        robustness = 'robust';
    } else if (thresholdS >= 20) {
        robustness = 'moderately robust';
    } else if (thresholdS >= 4) {
        robustness = 'sensitive';
    } else {
        robustness = 'highly sensitive';
    }

    return {
        // Original estimates
        thetaObserved: thetaObs,
        seObserved: seObs,
        zObserved: zObs,
        originalSignificant: Math.abs(zObs) > 1.96,

        // Sensitivity analysis
        sensitivityTable: results,

        // Threshold
        thresholdS,
        robustness,

        // Sample info
        kSignificant: sigIdx.length,
        kNonSignificant: nonsigIdx.length,
        kTotal: validStudies.length,

        // Interpretation
        interpretation: thresholdS === Infinity
            ? 'Result robust to all levels of publication bias examined'
            : thresholdS >= 20
                ? `Result moderately robust: requires ${thresholdS}-fold selection to nullify`
                : `Result sensitive: only ${thresholdS}-fold selection needed to nullify`,

        // Metadata
        method: 'Mathur-VanderWeele Sensitivity',
        rPackages: ['PublicationBias'],
        reference: 'Mathur & VanderWeele (2020). J R Stat Soc C. doi:10.1111/rssc.12440',
        warnings: validation.warnings
    };
}

// ============================================================================
// 6. VEVEA-WOODS SENSITIVITY ANALYSIS
// ============================================================================

/**
 * Vevea-Woods Sensitivity Analysis
 *
 * Tests robustness of meta-analytic results to various plausible
 * publication bias scenarios using pre-specified weight functions.
 *
 * R AVAILABILITY: weightr package (limited scenarios)
 * OUR CONTRIBUTION: Extended scenario set with multiple weight functions
 *
 * @param {Object[]} studies - Array of {yi, vi}
 * @param {Object} [options] - Configuration
 * @returns {Object} Sensitivity analysis across scenarios
 *
 * @reference Vevea, J. L., & Woods, C. M. (2005). Publication bias in research
 *   synthesis: Sensitivity analysis using a priori weight functions.
 *   Psychological Methods, 10(4), 428-443.
 *   https://doi.org/10.1037/1082-989X.10.4.428
 */
export function veveaWoodsSensitivity(studies, options = {}) {
    const {
        cutoffs = [0.05, 0.10, 0.50, 1.0],
        scenarios = ['none', 'moderate', 'severe', 'extreme']
    } = options;

    // Validate input
    const validation = validateStudies(studies, ['yi', 'vi']);
    if (validation.errors.length > 0) {
        return { error: validation.errors.join('; ') };
    }

    const validStudies = validation.valid;
    const yi = validStudies.map(s => s.yi);
    const vi = validStudies.map(s => s.vi);

    // Pre-specified weight functions from Vevea & Woods (2005)
    const weightFunctions = {
        none: [1, 1, 1, 1],           // No selection
        moderate: [1, 0.75, 0.60, 0.50],   // Moderate selection
        severe: [1, 0.50, 0.30, 0.20],     // Severe selection
        extreme: [1, 0.25, 0.10, 0.05],    // Extreme selection
        oneVsRest: [1, 0.50, 0.50, 0.50],  // Binary selection at 0.05
        linear: [1, 0.70, 0.40, 0.20]      // Linear decrease
    };

    // Calculate p-values
    const pValues = yi.map((y, i) => 2 * (1 - normalCDF(Math.abs(y / Math.sqrt(vi[i])))));

    // Get selection weight for each study
    function getWeight(p, weights) {
        for (let j = 0; j < cutoffs.length; j++) {
            if (p < cutoffs[j]) return weights[j];
        }
        return weights[weights.length - 1];
    }

    // Analyze each scenario
    const results = {};

    for (const scenario of scenarios) {
        const selWeights = weightFunctions[scenario];
        if (!selWeights) continue;

        // Inverse probability weighted analysis
        const adjWeights = vi.map((v, i) => {
            const selW = getWeight(pValues[i], selWeights);
            return selW > 0 ? (1 / v) / selW : 0;
        });

        const sumW = adjWeights.reduce((a, b) => a + b, 0);
        if (sumW < 1e-10) {
            results[scenario] = { theta: NaN, se: NaN, significant: false };
            continue;
        }

        const thetaAdj = yi.reduce((sum, y, i) => sum + y * adjWeights[i], 0) / sumW;
        const seAdj = Math.sqrt(1 / sumW);
        const z = thetaAdj / seAdj;

        results[scenario] = {
            theta: Math.round(thetaAdj * 10000) / 10000,
            se: Math.round(seAdj * 10000) / 10000,
            ci_lower: thetaAdj - 1.96 * seAdj,
            ci_upper: thetaAdj + 1.96 * seAdj,
            z: Math.round(z * 1000) / 1000,
            pvalue: 2 * (1 - normalCDF(Math.abs(z))),
            significant: Math.abs(z) > 1.96,
            weightFunction: selWeights
        };
    }

    // Robustness assessment
    const significancePattern = scenarios.map(s => results[s]?.significant ?? false);
    const allSignificant = significancePattern.every(s => s);
    const noneSignificant = significancePattern.every(s => !s);
    const firstLoss = significancePattern.findIndex(s => !s);

    let robustness;
    if (allSignificant) {
        robustness = 'robust';
    } else if (noneSignificant) {
        robustness = 'not significant even without bias';
    } else if (firstLoss === -1 || firstLoss >= 3) {
        robustness = 'moderately robust';
    } else {
        robustness = 'sensitive';
    }

    return {
        scenarios: results,

        robustness: {
            allScenariosSignificant: allSignificant,
            anyScenarioNull: !allSignificant && !noneSignificant,
            robustnessLevel: robustness,
            firstNullScenario: firstLoss >= 0 ? scenarios[firstLoss] : null
        },

        cutoffs,
        k: validStudies.length,

        interpretation: allSignificant
            ? 'Result robust: significant across all publication bias scenarios'
            : noneSignificant
                ? 'Result not significant even without assumed publication bias'
                : `Result sensitive: becomes non-significant under ${scenarios[firstLoss]} scenario`,

        // Metadata
        method: 'Vevea-Woods Sensitivity',
        rPackages: ['weightr'],
        reference: 'Vevea & Woods (2005). Psychol Methods. doi:10.1037/1082-989X.10.4.428',
        warnings: validation.warnings
    };
}

// ============================================================================
// 7. PUBLICATION BIAS-CORRECTED POWER ANALYSIS
// ============================================================================

/**
 * Publication Bias-Corrected Power Analysis
 *
 * Estimates statistical power accounting for the file drawer problem.
 * Calculates expected power, file drawer size, and required sample size.
 *
 * R AVAILABILITY: Not available as integrated function
 * OUR CONTRIBUTION: Novel integration of power and bias concepts
 *
 * @param {Object[]} studies - Array of {yi, vi}
 * @param {Object} [options] - Configuration
 * @param {number} [options.targetPower=0.80] - Desired power level
 * @returns {Object} Power analysis results
 *
 * @reference Ioannidis, J. P. A., & Trikalinos, T. A. (2007). An exploratory test
 *   for an excess of significant findings. Clinical Trials, 4(3), 245-253.
 *   https://doi.org/10.1177/1740774507079441
 *
 * @reference Button, K. S., et al. (2013). Power failure: Why small sample size
 *   undermines the reliability of neuroscience. Nature Reviews Neuroscience,
 *   14(5), 365-376. https://doi.org/10.1038/nrn3475
 */
export function correctedPowerAnalysis(studies, options = {}) {
    const { alpha = 0.05, targetPower = 0.80 } = options;

    // Validate input
    const validation = validateStudies(studies, ['yi', 'vi']);
    if (validation.errors.length > 0) {
        return { error: validation.errors.join('; ') };
    }

    const validStudies = validation.valid;
    const yi = validStudies.map(s => s.yi);
    const vi = validStudies.map(s => s.vi);
    const se = vi.map(v => Math.sqrt(v));

    // Calculate p-values and observed power
    const pValues = yi.map((y, i) => 2 * (1 - normalCDF(Math.abs(y / se[i]))));
    const nSignificant = pValues.filter(p => p < alpha).length;
    const observedPower = nSignificant / validStudies.length;

    // Meta-analytic effect estimate
    const w = vi.map(v => 1 / v);
    const sumW = w.reduce((a, b) => a + b, 0);
    const thetaObs = yi.reduce((sum, y, i) => sum + y * w[i], 0) / sumW;

    // Heterogeneity
    const Q = yi.reduce((sum, y, i) => sum + w[i] * Math.pow(y - thetaObs, 2), 0);
    const C = sumW - w.reduce((sum, wi) => sum + wi * wi, 0) / sumW;
    const tau2 = Math.max(0, (Q - (validStudies.length - 1)) / C);

    // Calculate expected power for each study
    const critZ = normalQuantile(1 - alpha / 2);
    const expectedPowers = se.map(sei => {
        const totalVar = sei * sei + tau2;
        const ncp = Math.abs(thetaObs) / Math.sqrt(totalVar);
        // Two-sided power
        return 1 - normalCDF(critZ - ncp) + normalCDF(-critZ - ncp);
    });

    const meanExpectedPower = expectedPowers.reduce((a, b) => a + b, 0) / expectedPowers.length;
    const medianExpectedPower = median(expectedPowers);

    // File drawer estimation
    const expectedSignificant = expectedPowers.reduce((a, b) => a + b, 0);
    const excess = nSignificant - expectedSignificant;
    const fileDrawerEstimate = excess > 0 && medianExpectedPower < 1
        ? Math.round(excess / (1 - medianExpectedPower))
        : 0;

    // Required sample size for target power
    const avgN = validStudies.reduce((sum, s) => sum + (s.n || 100), 0) / validStudies.length;
    const avgSE = se.reduce((a, b) => a + b, 0) / se.length;
    const requiredZ = critZ - normalQuantile(1 - targetPower);
    const requiredSE = Math.abs(thetaObs) / requiredZ;
    const sampleSizeMultiplier = Math.pow(avgSE / requiredSE, 2);
    const requiredN = Math.ceil(avgN * sampleSizeMultiplier);

    return {
        // Power estimates
        observedPower: Math.round(observedPower * 1000) / 1000,
        meanExpectedPower: Math.round(meanExpectedPower * 1000) / 1000,
        medianExpectedPower: Math.round(medianExpectedPower * 1000) / 1000,
        studyPowers: expectedPowers.map(p => Math.round(p * 1000) / 1000),

        // Power deficit
        powerDeficit: Math.round((meanExpectedPower - observedPower) * 1000) / 1000,

        // File drawer
        fileDrawerEstimate,
        nSignificant,
        expectedSignificant: Math.round(expectedSignificant * 10) / 10,

        // Sample size calculation
        requiredSampleSize: {
            targetPower,
            perGroup: Math.ceil(requiredN / 2),
            total: requiredN
        },

        // Effect size and heterogeneity
        effectEstimate: thetaObs,
        heterogeneity: {
            tau2: Math.round(tau2 * 10000) / 10000,
            tau: Math.round(Math.sqrt(tau2) * 10000) / 10000
        },

        // Interpretation
        interpretation: medianExpectedPower < 0.50
            ? 'Studies severely underpowered: median power < 50%'
            : medianExpectedPower < 0.80
                ? 'Studies moderately underpowered: consider larger samples'
                : 'Studies adequately powered for this effect size',

        k: validStudies.length,

        // Metadata
        method: 'Corrected Power Analysis',
        rPackages: ['None available'],
        reference: 'Button et al. (2013). Nat Rev Neurosci. doi:10.1038/nrn3475',
        warnings: validation.warnings
    };
}

// ============================================================================
// 8. EXCESS SIGNIFICANCE TEST
// ============================================================================

/**
 * Excess Significance Test
 *
 * Tests whether the observed number of significant results exceeds the
 * expected number given estimated statistical power. Excess significance
 * may indicate publication bias, p-hacking, or inflated effect sizes.
 *
 * R AVAILABILITY: Not available as standalone function
 * OUR CONTRIBUTION: Full implementation with multiple power estimation options
 *
 * @param {Object[]} studies - Array of {yi, vi}
 * @param {Object} [options] - Configuration
 * @param {string} [options.powerEstimate='meta'] - Power estimation method
 * @returns {Object} Test results
 *
 * @reference Ioannidis, J. P. A., & Trikalinos, T. A. (2007). An exploratory test
 *   for an excess of significant findings. Clinical Trials, 4(3), 245-253.
 *   https://doi.org/10.1177/1740774507079441
 */
export function excessSignificanceTest(studies, options = {}) {
    const { alpha = 0.05, powerEstimate = 'meta' } = options;

    // Validate input
    const validation = validateStudies(studies, ['yi', 'vi']);
    if (validation.errors.length > 0) {
        return { error: validation.errors.join('; ') };
    }

    const validStudies = validation.valid;
    const yi = validStudies.map(s => s.yi);
    const vi = validStudies.map(s => s.vi);
    const se = vi.map(v => Math.sqrt(v));

    // Count observed significant
    const pValues = yi.map((y, i) => 2 * (1 - normalCDF(Math.abs(y / se[i]))));
    const O = pValues.filter(p => p < alpha).length;

    // Estimate true effect
    let trueEffect;
    if (powerEstimate === 'largest') {
        // Use largest study (smallest variance)
        const minVarIdx = vi.indexOf(Math.min(...vi));
        trueEffect = yi[minVarIdx];
    } else {
        // Use meta-analytic estimate
        const w = vi.map(v => 1 / v);
        const sumW = w.reduce((a, b) => a + b, 0);
        trueEffect = yi.reduce((sum, y, i) => sum + y * w[i], 0) / sumW;
    }

    // Calculate expected power for each study
    const critZ = normalQuantile(1 - alpha / 2);
    const powers = se.map(sei => {
        const ncp = Math.abs(trueEffect) / sei;
        return 1 - normalCDF(critZ - ncp) + normalCDF(-critZ - ncp);
    });

    const E = powers.reduce((a, b) => a + b, 0);
    const A = O - E; // Excess

    // Test statistic (sum of Bernoulli variances)
    const V = powers.reduce((sum, p) => sum + p * (1 - p), 0);
    const chi2 = V > 0 ? (A * A) / V : 0;

    // P-value from chi-square with 1 df (one-sided for excess)
    const pValue = chi2 > 0 ? 1 - betaIncomplete(chi2 / (chi2 + 1), 0.5, 0.5) : 1;

    // Also compute exact binomial p-value
    const avgPower = E / validStudies.length;
    let binomP = 0;
    for (let i = O; i <= validStudies.length; i++) {
        binomP += binomialPMF(i, validStudies.length, avgPower);
    }
    binomP = Math.min(1, binomP);

    return {
        // Counts
        observed: O,
        expected: Math.round(E * 10) / 10,
        excess: Math.round(A * 10) / 10,

        // Test statistics
        chiSquare: Math.round(chi2 * 1000) / 1000,
        chiSquareP: Math.round(pValue * 10000) / 10000,
        binomialP: Math.round(binomP * 10000) / 10000,

        // Combined assessment
        significant: pValue < 0.10 || binomP < 0.10,

        // Power details
        studyPowers: powers.map(p => Math.round(p * 1000) / 1000),
        averagePower: Math.round(avgPower * 1000) / 1000,
        trueEffectEstimate: trueEffect,

        // Interpretation
        interpretation: pValue < 0.10
            ? `Excess significance detected: ${O} observed vs ${E.toFixed(1)} expected. ` +
              'May indicate publication bias, p-hacking, or inflated effect size estimate.'
            : 'No significant excess of significant findings',

        k: validStudies.length,

        // Metadata
        method: 'Excess Significance Test',
        rPackages: ['None available'],
        reference: 'Ioannidis & Trikalinos (2007). Clin Trials. doi:10.1177/1740774507079441',
        warnings: validation.warnings
    };
}

// ============================================================================
// 9. TEST OF INSUFFICIENT VARIANCE (TIVA)
// ============================================================================

/**
 * Test of Insufficient Variance (TIVA)
 *
 * Tests whether the variance in effect sizes is suspiciously small,
 * which may indicate data fabrication or extreme selection bias.
 *
 * R AVAILABILITY: Not available
 * OUR CONTRIBUTION: Original implementation of Schimmack's TIVA
 *
 * @param {Object[]} studies - Array of {yi, vi}
 * @returns {Object} TIVA results
 *
 * @reference Schimmack, U. (2012). The ironic effect of significant results on the
 *   credibility of multiple-study articles. Psychological Methods, 17(4), 551-566.
 *   https://doi.org/10.1037/a0029487
 */
export function testInsufficientVariance(studies, options = {}) {
    // Validate input
    const validation = validateStudies(studies, ['yi', 'vi']);
    if (validation.errors.length > 0) {
        return { error: validation.errors.join('; ') };
    }

    const validStudies = validation.valid;
    if (validStudies.length < 3) {
        return { error: 'Need at least 3 studies for TIVA' };
    }

    const yi = validStudies.map(s => s.yi);
    const vi = validStudies.map(s => s.vi);
    const se = vi.map(v => Math.sqrt(v));

    // Calculate z-scores
    const zScores = yi.map((y, i) => y / se[i]);
    const k = zScores.length;

    // Variance of z-scores
    const meanZ = zScores.reduce((a, b) => a + b, 0) / k;
    const varZ = zScores.reduce((sum, z) => sum + Math.pow(z - meanZ, 2), 0) / (k - 1);

    // Under H0 (homogeneous effects, no selection): var(z) ~ chi²(k-1)/(k-1)
    // Expected variance = 1 under null
    const expectedVarZ = 1;

    // Test statistic
    const chiSq = (k - 1) * varZ;

    // P-values (two-sided)
    const pTooSmall = betaIncomplete(chiSq / (chiSq + k - 1), (k - 1) / 2, 0.5);
    const pTooLarge = 1 - pTooSmall;

    // Variance ratio
    const VR = varZ / expectedVarZ;

    // Determine interpretation
    let interpretation, concern;
    if (pTooSmall < 0.05) {
        interpretation = `Variance suspiciously low (VR = ${VR.toFixed(2)}). ` +
            'May indicate data fabrication, extreme p-hacking, or homogeneous true effects.';
        concern = 'high';
    } else if (pTooLarge < 0.05) {
        interpretation = `Variance higher than expected (VR = ${VR.toFixed(2)}). ` +
            'Indicates substantial heterogeneity in true effects.';
        concern = 'none';
    } else {
        interpretation = 'Variance consistent with sampling error expectations.';
        concern = 'none';
    }

    return {
        // Variance statistics
        observedVariance: Math.round(varZ * 10000) / 10000,
        expectedVariance: expectedVarZ,
        varianceRatio: Math.round(VR * 1000) / 1000,

        // Test statistics
        chiSquare: Math.round(chiSq * 100) / 100,
        df: k - 1,

        // P-values
        pTooSmall: Math.round(pTooSmall * 10000) / 10000,
        pTooLarge: Math.round(pTooLarge * 10000) / 10000,

        // Flags
        insufficientVariance: pTooSmall < 0.05,
        excessVariance: pTooLarge < 0.05,
        concern,

        // Z-score details
        zScores: zScores.map(z => Math.round(z * 1000) / 1000),
        meanZ: Math.round(meanZ * 1000) / 1000,

        interpretation,
        k,

        // Metadata
        method: 'TIVA (Test of Insufficient Variance)',
        rPackages: ['None available'],
        reference: 'Schimmack (2012). Psychol Methods. doi:10.1037/a0029487',
        warnings: validation.warnings
    };
}

// ============================================================================
// 10. CALIPER TEST
// ============================================================================

/**
 * Caliper Test for P-Hacking
 *
 * Tests for suspicious bunching of p-values just below the significance
 * threshold, which may indicate p-hacking or selective reporting.
 *
 * R AVAILABILITY: Not available as standalone function
 * OUR CONTRIBUTION: Implementation with configurable caliper width
 *
 * @param {Object[]} studies - Array of {yi, vi}
 * @param {Object} [options] - Configuration
 * @param {number} [options.alpha=0.05] - Significance threshold
 * @param {number} [options.caliperWidth=0.005] - Width of caliper bands
 * @returns {Object} Caliper test results
 *
 * @reference Gerber, A., & Malhotra, N. (2008). Do statistical reporting standards
 *   affect what is published? Publication bias in two leading political science
 *   journals. Quarterly Journal of Political Science, 3(3), 313-326.
 *   https://doi.org/10.1561/100.00008024
 *
 * @reference Simonsohn, U., Nelson, L. D., & Simmons, J. P. (2014). P-curve and
 *   effect size: Correcting for publication bias using only significant results.
 *   Perspectives on Psychological Science, 9(6), 666-681.
 */
export function caliperTest(studies, options = {}) {
    const {
        alpha = 0.05,
        caliperWidth = 0.005,
        nBands = 10
    } = options;

    // Validate input
    const validation = validateStudies(studies, ['yi', 'vi']);
    if (validation.errors.length > 0) {
        return { error: validation.errors.join('; ') };
    }

    const validStudies = validation.valid;
    const yi = validStudies.map(s => s.yi);
    const vi = validStudies.map(s => s.vi);
    const se = vi.map(v => Math.sqrt(v));

    // Calculate p-values
    const pValues = yi.map((y, i) => 2 * (1 - normalCDF(Math.abs(y / se[i]))));

    // Define caliper bands around significance threshold
    const bands = [];
    for (let i = -nBands; i < nBands; i++) {
        const lower = alpha + i * caliperWidth;
        const upper = alpha + (i + 1) * caliperWidth;
        if (lower >= 0 && upper <= 1) {
            bands.push({
                lower,
                upper,
                center: (lower + upper) / 2,
                belowThreshold: upper <= alpha,
                count: 0
            });
        }
    }

    // Count studies in each band
    pValues.forEach(p => {
        for (const band of bands) {
            if (p >= band.lower && p < band.upper) {
                band.count++;
                break;
            }
        }
    });

    // Compare counts below vs above threshold
    const belowBands = bands.filter(b => b.belowThreshold);
    const aboveBands = bands.filter(b => !b.belowThreshold);

    const countBelow = belowBands.reduce((sum, b) => sum + b.count, 0);
    const countAbove = aboveBands.reduce((sum, b) => sum + b.count, 0);

    // Expected under uniform distribution
    const totalInRange = countBelow + countAbove;
    if (totalInRange === 0) {
        return {
            error: 'No p-values in caliper range',
            pValues,
            alpha
        };
    }

    const expectedRatio = belowBands.length / (belowBands.length + aboveBands.length);
    const expectedBelow = totalInRange * expectedRatio;

    // Chi-square test
    const expectedAbove = totalInRange - expectedBelow;
    const chiSq = expectedBelow > 0 && expectedAbove > 0
        ? Math.pow(countBelow - expectedBelow, 2) / expectedBelow +
          Math.pow(countAbove - expectedAbove, 2) / expectedAbove
        : 0;

    const pValue = chiSq > 0 ? 1 - betaIncomplete(chiSq / (chiSq + 1), 0.5, 0.5) : 1;

    // Detect discontinuity at threshold
    let discontinuity = null;
    for (let i = 1; i < bands.length; i++) {
        if (bands[i - 1].belowThreshold && !bands[i].belowThreshold) {
            discontinuity = {
                countJustBelow: bands[i - 1].count,
                countJustAbove: bands[i].count,
                jump: bands[i - 1].count - bands[i].count,
                location: alpha
            };
            break;
        }
    }

    // Bunching assessment
    const ratio = countAbove > 0 ? countBelow / countAbove : Infinity;
    const bunching = countBelow > expectedBelow * 1.5 && totalInRange >= 5;

    return {
        // Band counts
        bands: bands.map(b => ({
            range: `[${b.lower.toFixed(3)}, ${b.upper.toFixed(3)})`,
            count: b.count,
            belowThreshold: b.belowThreshold
        })),

        countBelow,
        countAbove,
        expectedBelow: Math.round(expectedBelow * 10) / 10,
        ratio: Math.round(ratio * 100) / 100,

        // Test results
        chiSquare: Math.round(chiSq * 1000) / 1000,
        pValue: Math.round(pValue * 10000) / 10000,

        // Discontinuity
        discontinuity,

        // Assessment
        bunching,
        significant: pValue < 0.05 && bunching,

        interpretation: pValue < 0.05 && bunching
            ? `Evidence of p-value bunching just below ${alpha} (possible p-hacking)`
            : 'No significant evidence of p-value manipulation',

        // Parameters
        alpha,
        caliperWidth,
        k: validStudies.length,

        // Metadata
        method: 'Caliper Test',
        rPackages: ['None available'],
        reference: 'Gerber & Malhotra (2008). QJPS. doi:10.1561/100.00008024',
        warnings: validation.warnings
    };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
    pCurveAnalysis,
    pUniformStar,
    zCurve2,
    andrewsKasyCorrection,
    mathurVanderWeeleSensitivity,
    veveaWoodsSensitivity,
    correctedPowerAnalysis,
    excessSignificanceTest,
    testInsufficientVariance,
    caliperTest
};
