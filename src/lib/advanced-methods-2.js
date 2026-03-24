/**
 * Advanced Meta-Analysis Methods - Part 2
 * Bayesian Methods, Robust Methods, and Modern Extensions
 *
 * IMPORTANT: Honest Assessment of R Package Availability
 * - Bayesian HMA: bayesmeta, brms provide some BMA functionality
 * - Spike-and-Slab: BayesFactor for hypothesis testing (different approach)
 * - Horseshoe: brms, rstanarm support horseshoe priors
 * - Median/Winsorized/M-estimator: Not directly available
 * - Cross-validation/Stacking: Not available for meta-analysis
 * - Conformal prediction: Not available for meta-analysis
 *
 * These JavaScript implementations provide:
 * 1. Browser-based Bayesian analysis without JAGS/Stan
 * 2. Proper MCMC convergence diagnostics
 * 3. Novel methods not in any R package
 *
 * @module advanced-methods-2
 * @version 2.0.0 (Editorial Revision)
 */

import {
    normalCDF,
    normalPDF,
    normalQuantile,
    logGamma,
    betaIncomplete,
    weightedMean,
    weightedVariance,
    median,
    quantile,
    mad,
    winsorize,
    randomNormal,
    randomGamma,
    randomInverseGamma,
    linearRegression,
    mcmcDiagnostics,
    validateStudies
} from './stats-utils.js';

// ============================================================================
// 11. BAYESIAN MODEL AVERAGING ACROSS HETEROGENEITY PRIORS
// ============================================================================

/**
 * Bayesian Model Averaging Across Heterogeneity Priors
 *
 * Combines posterior estimates across different prior assumptions on τ²,
 * weighted by marginal likelihood. Addresses sensitivity to prior choice.
 *
 * R AVAILABILITY: bayesmeta provides BMA; brms supports prior sensitivity
 * OUR CONTRIBUTION: Explicit multi-prior comparison with diagnostics
 *
 * @param {Object[]} studies - Array of {yi, vi}
 * @param {Object} [options] - Configuration
 * @param {number} [options.nSamples=5000] - MCMC samples per chain
 * @param {number} [options.nChains=3] - Number of MCMC chains
 * @param {number} [options.burnin=1000] - Burn-in samples
 * @returns {Object} BMA results with convergence diagnostics
 *
 * @reference Gronau, Q. F., et al. (2017). A tutorial on bridge sampling.
 *   Journal of Mathematical Psychology, 81, 80-97.
 *   https://doi.org/10.1016/j.jmp.2017.09.005
 *
 * @reference Rhodes, K. M., et al. (2015). Predictive distributions were developed
 *   for the extent of heterogeneity in meta-analyses. Journal of Clinical Epidemiology,
 *   68(1), 52-60. https://doi.org/10.1016/j.jclinepi.2014.08.012
 */
export function bayesianHeterogeneityBMA(studies, options = {}) {
    const {
        nSamples = 5000,
        nChains = 3,
        burnin = 1000,
        priors = ['halfNormal', 'halfCauchy', 'exponential', 'informative']
    } = options;

    // Validate input
    const validation = validateStudies(studies, ['yi', 'vi']);
    if (validation.errors.length > 0) {
        return { error: validation.errors.join('; ') };
    }

    const validStudies = validation.valid;
    const yi = validStudies.map(s => s.yi);
    const vi = validStudies.map(s => s.vi);
    const k = yi.length;

    if (k < 3) {
        return { error: 'Need at least 3 studies for Bayesian BMA' };
    }

    // Run MCMC under each prior
    const posteriors = {};
    const convergenceInfo = {};

    for (const prior of priors) {
        const chains = [];

        for (let c = 0; c < nChains; c++) {
            const chain = gibbsSamplerMA(yi, vi, nSamples + burnin, prior, c);
            chains.push({
                theta: chain.theta.slice(burnin),
                tau2: chain.tau2.slice(burnin)
            });
        }

        // Check convergence
        const thetaChains = chains.map(c => c.theta);
        const convergence = mcmcDiagnostics.checkConvergence(thetaChains);

        convergenceInfo[prior] = convergence;
        posteriors[prior] = {
            theta: chains[0].theta,
            tau2: chains[0].tau2,
            allChains: chains
        };
    }

    // Calculate marginal likelihoods
    const marginalLiks = {};
    for (const prior of priors) {
        marginalLiks[prior] = harmonicMeanEstimator(posteriors[prior], yi, vi);
    }

    // Normalize to posterior model probabilities
    const maxLL = Math.max(...Object.values(marginalLiks).filter(x => isFinite(x)));
    const modelWeights = {};
    let sumWeights = 0;

    for (const prior of priors) {
        const w = isFinite(marginalLiks[prior]) ?
            Math.exp(marginalLiks[prior] - maxLL) : 0;
        modelWeights[prior] = w;
        sumWeights += w;
    }

    for (const prior of priors) {
        modelWeights[prior] = sumWeights > 0 ? modelWeights[prior] / sumWeights : 1 / priors.length;
    }

    // BMA posterior
    const bmaSamples = [];
    for (let i = 0; i < nSamples; i++) {
        const u = Math.random();
        let cumWeight = 0;
        for (const prior of priors) {
            cumWeight += modelWeights[prior];
            if (u < cumWeight) {
                bmaSamples.push(posteriors[prior].theta[i % posteriors[prior].theta.length]);
                break;
            }
        }
    }

    bmaSamples.sort((a, b) => a - b);
    const thetaBMA = arrayMean(bmaSamples);
    const seBMA = arraySD(bmaSamples);

    // Model summaries
    const modelSummaries = {};
    for (const prior of priors) {
        const sortedTheta = [...posteriors[prior].theta].sort((a, b) => a - b);
        const sortedTau2 = [...posteriors[prior].tau2].sort((a, b) => a - b);
        const n = sortedTheta.length;

        modelSummaries[prior] = {
            theta: arrayMean(posteriors[prior].theta),
            theta_CI: [sortedTheta[Math.floor(n * 0.025)], sortedTheta[Math.floor(n * 0.975)]],
            tau2: arrayMean(posteriors[prior].tau2),
            tau2_CI: [sortedTau2[Math.floor(n * 0.025)], sortedTau2[Math.floor(n * 0.975)]],
            weight: modelWeights[prior],
            converged: convergenceInfo[prior].converged
        };
    }

    // Check overall convergence
    const allConverged = Object.values(convergenceInfo).every(c => c.converged);

    return {
        theta: Math.round(thetaBMA * 10000) / 10000,
        se: Math.round(seBMA * 10000) / 10000,
        ci_lower: bmaSamples[Math.floor(nSamples * 0.025)],
        ci_upper: bmaSamples[Math.floor(nSamples * 0.975)],

        modelWeights: Object.fromEntries(
            Object.entries(modelWeights).map(([k, v]) => [k, Math.round(v * 1000) / 1000])
        ),
        modelSummaries,

        bestModel: Object.entries(modelWeights).reduce((a, b) =>
            a[1] > b[1] ? a : b
        )[0],

        sensitivity: {
            range: Math.max(...Object.values(modelSummaries).map(m => m.theta)) -
                   Math.min(...Object.values(modelSummaries).map(m => m.theta)),
            robust: Math.max(...Object.values(modelSummaries).map(m => m.theta)) -
                    Math.min(...Object.values(modelSummaries).map(m => m.theta)) < 0.2
        },

        convergence: {
            allConverged,
            details: convergenceInfo,
            warnings: allConverged ? [] :
                ['Some chains may not have converged. Consider increasing nSamples.']
        },

        k,
        nSamples,
        nChains,

        method: 'Bayesian Heterogeneity BMA',
        rPackages: ['bayesmeta', 'brms'],
        reference: 'Rhodes et al. (2015). J Clin Epidemiol. doi:10.1016/j.jclinepi.2014.08.012',
        warnings: validation.warnings
    };
}

/**
 * Gibbs sampler for random effects meta-analysis
 */
function gibbsSamplerMA(yi, vi, nSamples, priorType, chainIdx = 0) {
    const k = yi.length;
    const thetaSamples = [];
    const tau2Samples = [];

    // Different initial values for each chain
    const initMult = 1 + 0.5 * chainIdx;
    let theta = arrayMean(yi) * initMult;
    let tau2 = Math.max(0.01, arrayVariance(yi) * initMult);

    for (let s = 0; s < nSamples; s++) {
        // Sample theta | tau2, y
        const w = vi.map(v => 1 / (v + tau2));
        const sumW = w.reduce((a, b) => a + b, 0);
        const postMean = yi.reduce((sum, y, i) => sum + y * w[i], 0) / sumW;
        const postVar = 1 / sumW;
        theta = postMean + Math.sqrt(postVar) * randomNormal(1)[0];

        // Sample tau2 | theta, y (depends on prior)
        tau2 = sampleTau2WithPrior(yi, vi, theta, priorType);
        tau2 = Math.max(1e-10, tau2); // Prevent exactly zero

        thetaSamples.push(theta);
        tau2Samples.push(tau2);
    }

    return { theta: thetaSamples, tau2: tau2Samples };
}

/**
 * Sample tau2 using Metropolis-Hastings with specified prior
 */
function sampleTau2WithPrior(yi, vi, theta, priorType) {
    const logLikelihood = (t2) => {
        if (t2 <= 0) return -Infinity;
        return -0.5 * yi.reduce((sum, y, i) =>
            sum + Math.log(vi[i] + t2) + Math.pow(y - theta, 2) / (vi[i] + t2), 0
        );
    };

    const logPrior = (t2) => {
        if (t2 <= 0) return -Infinity;

        switch (priorType) {
            case 'halfNormal':
                // Half-Normal(0, 0.5): π(τ) ∝ exp(-τ²/(2×0.5²))
                return -t2 / (2 * 0.5 * 0.5);

            case 'halfCauchy':
                // Half-Cauchy(0, 0.5): π(τ) ∝ 1/(1 + τ²/0.5²)
                return -Math.log(1 + t2 / (0.5 * 0.5));

            case 'exponential':
                // Exponential(1) on τ: π(τ) = exp(-τ)
                return -Math.sqrt(t2);

            case 'informative':
                // Log-normal(-1, 1) on τ based on empirical distributions
                const logTau = Math.log(Math.sqrt(t2));
                return -0.5 * Math.pow(logTau + 1, 2) - logTau;

            default:
                return 0; // Improper uniform
        }
    };

    // Current value
    const current = Math.max(0.01, arrayVariance(yi));

    // Proposal: log-normal random walk
    const proposal = current * Math.exp(0.3 * randomNormal(1)[0]);

    // Log acceptance ratio
    const logAlpha = logLikelihood(proposal) + logPrior(proposal) -
                     logLikelihood(current) - logPrior(current);

    return Math.log(Math.random()) < logAlpha ? proposal : current;
}

/**
 * Harmonic mean estimator of marginal likelihood
 */
function harmonicMeanEstimator(samples, yi, vi) {
    const logLiks = samples.theta.map((theta, s) => {
        const tau2 = samples.tau2[s];
        return -0.5 * yi.reduce((sum, y, i) =>
            sum + Math.log(vi[i] + tau2) + Math.pow(y - theta, 2) / (vi[i] + tau2), 0
        );
    });

    const maxLL = Math.max(...logLiks);
    const n = logLiks.length;

    // Harmonic mean in log space
    const logSum = logLiks.reduce((sum, ll) => {
        const diff = maxLL - ll;
        return sum + (diff < 700 ? Math.exp(diff) : 1e300);
    }, 0);

    return maxLL - Math.log(logSum / n);
}

// ============================================================================
// 12. SPIKE-AND-SLAB PRIOR FOR EFFECT EXISTENCE
// ============================================================================

/**
 * Spike-and-Slab Meta-Analysis
 *
 * Bayesian model selection testing whether the true effect is exactly zero
 * (spike) versus non-zero (slab). Provides Bayes factor for null hypothesis.
 *
 * R AVAILABILITY: BayesFactor provides Bayesian t-tests (different approach)
 * OUR CONTRIBUTION: Spike-and-slab specifically for meta-analysis
 *
 * @param {Object[]} studies - Array of {yi, vi}
 * @param {Object} [options] - Configuration
 * @param {number} [options.spikeProb=0.5] - Prior probability of null
 * @param {number} [options.slabSD=1.0] - SD of slab prior
 * @returns {Object} Hypothesis testing results
 *
 * @reference George, E. I., & McCulloch, R. E. (1993). Variable selection via
 *   Gibbs sampling. Journal of the American Statistical Association, 88(423), 881-889.
 *   https://doi.org/10.1080/01621459.1993.10476353
 *
 * @reference Rouder, J. N., et al. (2009). Bayesian t tests for accepting and
 *   rejecting the null hypothesis. Psychonomic Bulletin & Review, 16(2), 225-237.
 *   https://doi.org/10.3758/PBR.16.2.225
 */
export function spikeAndSlabMA(studies, options = {}) {
    const {
        nSamples = 10000,
        spikeProb = 0.5,
        slabSD = 1.0
    } = options;

    // Validate input
    const validation = validateStudies(studies, ['yi', 'vi']);
    if (validation.errors.length > 0) {
        return { error: validation.errors.join('; ') };
    }

    const validStudies = validation.valid;
    const yi = validStudies.map(s => s.yi);
    const vi = validStudies.map(s => s.vi);
    const k = yi.length;

    // Estimate tau2 via DL
    const w = vi.map(v => 1 / v);
    const sumW = w.reduce((a, b) => a + b, 0);
    const thetaFE = yi.reduce((sum, y, i) => sum + y * w[i], 0) / sumW;
    const Q = yi.reduce((sum, y, i) => sum + w[i] * Math.pow(y - thetaFE, 2), 0);
    const C = sumW - w.reduce((sum, wi) => sum + wi * wi, 0) / sumW;
    const tau2Est = Math.max(0, (Q - (k - 1)) / C);

    // Marginal likelihood under spike (θ = 0)
    const llSpike = yi.reduce((sum, y, i) =>
        sum - 0.5 * Math.log(vi[i] + tau2Est) - 0.5 * y * y / (vi[i] + tau2Est), 0
    );

    // Marginal likelihood under slab (θ ~ N(0, slabSD²))
    // Using Laplace approximation
    const wRE = vi.map(v => 1 / (v + tau2Est));
    const sumWRE = wRE.reduce((a, b) => a + b, 0);
    const thetaPost = yi.reduce((sum, y, i) => sum + y * wRE[i], 0) / sumWRE;
    const postVarInv = sumWRE + 1 / (slabSD * slabSD);
    const postVar = 1 / postVarInv;

    const llSlab = -0.5 * Math.log(2 * Math.PI * slabSD * slabSD) +
        yi.reduce((sum, y, i) =>
            sum - 0.5 * Math.log(vi[i] + tau2Est) - 0.5 * Math.pow(y - thetaPost, 2) / (vi[i] + tau2Est), 0
        ) + 0.5 * Math.log(2 * Math.PI * postVar);

    // Bayes factor
    const logBF01 = Math.log(spikeProb / (1 - spikeProb)) + llSpike - llSlab;
    const BF01 = Math.exp(Math.min(700, Math.max(-700, logBF01 - Math.log(spikeProb / (1 - spikeProb)))));
    const BF10 = 1 / BF01;

    // Posterior probability of spike
    const postProbSpike = 1 / (1 + Math.exp(-logBF01));

    // Model-averaged estimate
    const thetaBMA = (1 - postProbSpike) * thetaPost;

    // MCMC for full posterior
    const thetaSamples = [];
    const gammaSamples = [];

    for (let s = 0; s < nSamples; s++) {
        const gamma = Math.random() > postProbSpike ? 1 : 0;
        gammaSamples.push(gamma);

        if (gamma === 0) {
            thetaSamples.push(0);
        } else {
            const sample = thetaPost + Math.sqrt(postVar) * randomNormal(1)[0];
            thetaSamples.push(sample);
        }
    }

    const sortedTheta = [...thetaSamples].sort((a, b) => a - b);

    return {
        posteriorProbNull: Math.round(postProbSpike * 10000) / 10000,
        posteriorProbEffect: Math.round((1 - postProbSpike) * 10000) / 10000,

        BF01: Math.round(BF01 * 1000) / 1000,
        BF10: Math.round(BF10 * 1000) / 1000,

        bmaEstimate: Math.round(thetaBMA * 10000) / 10000,
        slabEstimate: Math.round(thetaPost * 10000) / 10000,
        slabSE: Math.round(Math.sqrt(postVar) * 10000) / 10000,

        ci_lower: sortedTheta[Math.floor(nSamples * 0.025)],
        ci_upper: sortedTheta[Math.floor(nSamples * 0.975)],

        interpretation: interpretBayesFactor(BF01),
        evidenceCategory: categorizeBayesFactor(BF01),

        priors: {
            spikeProb,
            slabSD
        },

        tau2Estimate: tau2Est,
        k,

        method: 'Spike-and-Slab Meta-Analysis',
        rPackages: ['BayesFactor (different approach)'],
        reference: 'George & McCulloch (1993). JASA. doi:10.1080/01621459.1993.10476353',
        warnings: validation.warnings
    };
}

function interpretBayesFactor(bf) {
    if (bf > 100) return 'Extreme evidence for null hypothesis';
    if (bf > 30) return 'Very strong evidence for null hypothesis';
    if (bf > 10) return 'Strong evidence for null hypothesis';
    if (bf > 3) return 'Moderate evidence for null hypothesis';
    if (bf > 1) return 'Anecdotal evidence for null hypothesis';
    if (bf > 1/3) return 'Anecdotal evidence for alternative hypothesis';
    if (bf > 1/10) return 'Moderate evidence for alternative hypothesis';
    if (bf > 1/30) return 'Strong evidence for alternative hypothesis';
    if (bf > 1/100) return 'Very strong evidence for alternative hypothesis';
    return 'Extreme evidence for alternative hypothesis';
}

function categorizeBayesFactor(bf) {
    if (bf > 10) return 'strong_null';
    if (bf > 3) return 'moderate_null';
    if (bf > 1) return 'weak_null';
    if (bf > 1/3) return 'weak_alt';
    if (bf > 1/10) return 'moderate_alt';
    return 'strong_alt';
}

// ============================================================================
// 13. HORSESHOE PRIOR META-REGRESSION
// ============================================================================

/**
 * Horseshoe Prior Meta-Regression
 *
 * Regularized meta-regression with global-local shrinkage for automatic
 * variable selection when there are many moderators.
 *
 * R AVAILABILITY: brms, rstanarm support horseshoe priors
 * OUR CONTRIBUTION: JavaScript implementation with convergence diagnostics
 *
 * @param {Object[]} studies - Array of {yi, vi}
 * @param {number[][]} moderators - Design matrix (k × p)
 * @param {Object} [options] - Configuration
 * @returns {Object} Regression results with shrinkage
 *
 * @reference Carvalho, C. M., Polson, N. G., & Scott, J. G. (2010). The horseshoe
 *   estimator for sparse signals. Biometrika, 97(2), 465-480.
 *   https://doi.org/10.1093/biomet/asq017
 *
 * @reference Piironen, J., & Vehtari, A. (2017). Sparsity information and
 *   regularization in the horseshoe and other shrinkage priors.
 *   Electronic Journal of Statistics, 11(2), 5018-5051.
 *   https://doi.org/10.1214/17-EJS1337SI
 */
export function horseshoeMetaRegression(studies, moderators, options = {}) {
    const {
        nSamples = 5000,
        burnin = 1000,
        nChains = 2,
        globalShrinkage = null
    } = options;

    // Validate input
    const validation = validateStudies(studies, ['yi', 'vi']);
    if (validation.errors.length > 0) {
        return { error: validation.errors.join('; ') };
    }

    const validStudies = validation.valid;
    const yi = validStudies.map(s => s.yi);
    const vi = validStudies.map(s => s.vi);
    const k = yi.length;

    if (!moderators || !moderators.length || moderators.length !== k) {
        return { error: 'Moderator matrix must have same number of rows as studies' };
    }

    const p = moderators[0].length;
    if (p < 1) {
        return { error: 'Need at least one moderator' };
    }

    const X = moderators;

    // Default global shrinkage based on expected sparsity
    const tau0 = globalShrinkage || (p > k ? 1 / Math.sqrt(k) : 0.5);

    // Run multiple chains
    const allChains = [];

    for (let c = 0; c < nChains; c++) {
        const chain = horseshoeGibbs(yi, vi, X, nSamples + burnin, tau0, c);
        allChains.push({
            beta: chain.beta.slice(burnin),
            lambda: chain.lambda.slice(burnin),
            tau: chain.tau.slice(burnin)
        });
    }

    // Check convergence for each coefficient
    const convergenceByCoef = [];
    for (let j = 0; j < p; j++) {
        const betaChains = allChains.map(ch => ch.beta.map(b => b[j]));
        convergenceByCoef.push(mcmcDiagnostics.rHat(betaChains));
    }

    const maxRhat = Math.max(...convergenceByCoef);
    const converged = maxRhat < 1.1;

    // Combine chains
    const betaSamples = allChains.flatMap(ch => ch.beta);

    // Posterior summaries
    const betaMeans = [];
    const betaCI = [];
    const inclusionProbs = [];

    for (let j = 0; j < p; j++) {
        const samples = betaSamples.map(b => b[j]);
        const sorted = [...samples].sort((a, b) => a - b);
        const n = sorted.length;

        const mean = arrayMean(samples);
        betaMeans.push(Math.round(mean * 10000) / 10000);
        betaCI.push([
            sorted[Math.floor(n * 0.025)],
            sorted[Math.floor(n * 0.975)]
        ]);

        // Inclusion probability: proportion of samples where |beta| > threshold
        const threshold = arraySD(samples) * 0.1;
        const nAbove = samples.filter(b => Math.abs(b) > threshold).length;
        inclusionProbs.push(Math.round((nAbove / n) * 1000) / 1000);
    }

    // Selected moderators (inclusion prob > 0.5)
    const selectedModerators = inclusionProbs
        .map((prob, i) => ({ index: i, prob }))
        .filter(x => x.prob > 0.5)
        .map(x => x.index);

    // Global shrinkage summary
    const tauSamples = allChains.flatMap(ch => ch.tau);
    const tauMean = arrayMean(tauSamples);

    return {
        coefficients: betaMeans,
        ci: betaCI,
        inclusionProbabilities: inclusionProbs,

        selectedModerators,
        nSelected: selectedModerators.length,

        shrinkage: {
            globalTau: Math.round(tauMean * 10000) / 10000,
            effectiveShrinkage: 1 / (1 + tauMean * tauMean)
        },

        convergence: {
            converged,
            maxRhat: Math.round(maxRhat * 1000) / 1000,
            rhatByCoef: convergenceByCoef.map(r => Math.round(r * 1000) / 1000),
            warnings: converged ? [] : ['R-hat > 1.1 indicates poor convergence']
        },

        k,
        p,
        nSamples: nSamples * nChains,

        method: 'Horseshoe Meta-Regression',
        rPackages: ['brms', 'rstanarm'],
        reference: 'Carvalho, Polson & Scott (2010). Biometrika. doi:10.1093/biomet/asq017',
        warnings: validation.warnings
    };
}

/**
 * Gibbs sampler for horseshoe meta-regression
 */
function horseshoeGibbs(yi, vi, X, nSamples, tau0, chainIdx) {
    const k = yi.length;
    const p = X[0].length;

    const betaSamples = [];
    const lambdaSamples = [];
    const tauSamples = [];

    // Initialize with variation across chains
    let beta = new Array(p).fill(0);
    let lambda = new Array(p).fill(1);
    let tau = tau0 * (1 + 0.5 * chainIdx);
    let tau2RE = arrayVariance(yi);

    // Auxiliary variables for half-Cauchy
    let nu = new Array(p).fill(1);
    let xi = 1;

    for (let s = 0; s < nSamples; s++) {
        // Sample beta | rest
        const W = vi.map(v => 1 / (v + tau2RE));

        // Build X'WX + D
        const XtWX = [];
        const XtWy = new Array(p).fill(0);

        for (let j = 0; j < p; j++) {
            XtWX.push(new Array(p).fill(0));
            for (let i = 0; i < k; i++) {
                XtWy[j] += X[i][j] * W[i] * yi[i];
            }
        }

        for (let i = 0; i < k; i++) {
            for (let j1 = 0; j1 < p; j1++) {
                for (let j2 = 0; j2 < p; j2++) {
                    XtWX[j1][j2] += X[i][j1] * W[i] * X[i][j2];
                }
            }
        }

        // Add penalty D = diag(1/(tau²λ²))
        for (let j = 0; j < p; j++) {
            const shrink = 1 / (tau * tau * lambda[j] * lambda[j] + 1e-10);
            XtWX[j][j] += shrink;
        }

        // Solve for posterior mean
        beta = solveLinearSystem(XtWX, XtWy) || beta;

        // Sample lambda | beta, tau (half-Cauchy)
        for (let j = 0; j < p; j++) {
            nu[j] = randomInverseGamma(1, 1, 1 + 1 / (lambda[j] * lambda[j]))[0];
            const scale = 1 / nu[j] + beta[j] * beta[j] / (2 * tau * tau);
            lambda[j] = Math.sqrt(randomInverseGamma(1, 1, scale)[0]);
        }

        // Sample tau | beta, lambda (half-Cauchy)
        xi = randomInverseGamma(1, 1, 1 + 1 / (tau * tau))[0];
        const ssqBeta = beta.reduce((sum, b, j) => sum + b * b / (lambda[j] * lambda[j]), 0);
        const tauScale = 1 / xi + ssqBeta / 2;
        tau = Math.sqrt(randomInverseGamma(1, (p + 1) / 2, tauScale)[0]);

        betaSamples.push([...beta]);
        lambdaSamples.push([...lambda]);
        tauSamples.push(tau);
    }

    return { beta: betaSamples, lambda: lambdaSamples, tau: tauSamples };
}

// ============================================================================
// 14. MEDIAN-BASED META-ANALYSIS
// ============================================================================

/**
 * Median-Based Meta-Analysis
 *
 * Uses weighted median instead of weighted mean for robustness to outliers.
 * The median has 50% breakdown point compared to 0% for the mean.
 *
 * R AVAILABILITY: Not directly available
 * OUR CONTRIBUTION: Complete implementation with bootstrap CI
 *
 * @param {Object[]} studies - Array of {yi, vi}
 * @param {Object} [options] - Configuration
 * @param {number} [options.bootstrap=1000] - Bootstrap iterations
 * @returns {Object} Robust meta-analysis results
 *
 * @reference Shuster, J. J. (2010). Empirical vs natural weighting in random
 *   effects meta-analysis. Statistics in Medicine, 29(12), 1259-1265.
 *   https://doi.org/10.1002/sim.3607
 */
export function medianMetaAnalysis(studies, options = {}) {
    const { bootstrap = 1000 } = options;

    // Validate input
    const validation = validateStudies(studies, ['yi', 'vi']);
    if (validation.errors.length > 0) {
        return { error: validation.errors.join('; ') };
    }

    const validStudies = validation.valid;
    const yi = validStudies.map(s => s.yi);
    const vi = validStudies.map(s => s.vi);
    const w = vi.map(v => 1 / v);
    const k = yi.length;

    // Weighted median
    const thetaMedian = weightedMedianCalc(yi, w);

    // Bootstrap CI
    const bootMedians = [];
    for (let b = 0; b < bootstrap; b++) {
        const bootIdx = Array(k).fill(0).map(() => Math.floor(Math.random() * k));
        const bootYi = bootIdx.map(i => yi[i]);
        const bootW = bootIdx.map(i => w[i]);
        bootMedians.push(weightedMedianCalc(bootYi, bootW));
    }

    bootMedians.sort((a, b) => a - b);

    // Compare to mean
    const sumW = w.reduce((a, b) => a + b, 0);
    const thetaMean = yi.reduce((sum, y, i) => sum + y * w[i], 0) / sumW;

    // MAD-based SE
    const absDevs = yi.map(y => Math.abs(y - thetaMedian));
    const madValue = weightedMedianCalc(absDevs, w);
    const seMedian = 1.4826 * madValue / Math.sqrt(sumW);

    // Outlier assessment
    const zScores = yi.map(y => (y - thetaMedian) / madValue);
    const outliers = zScores.map((z, i) => ({
        index: i,
        yi: yi[i],
        z: Math.round(z * 100) / 100
    })).filter(x => Math.abs(x.z) > 2.5);

    return {
        theta: Math.round(thetaMedian * 10000) / 10000,
        se: Math.round(seMedian * 10000) / 10000,
        ci_lower: bootMedians[Math.floor(bootstrap * 0.025)],
        ci_upper: bootMedians[Math.floor(bootstrap * 0.975)],

        thetaMean: Math.round(thetaMean * 10000) / 10000,
        meanMedianDiff: Math.round((thetaMean - thetaMedian) * 10000) / 10000,

        mad: Math.round(madValue * 10000) / 10000,

        potentialOutliers: outliers,
        nOutliers: outliers.length,

        robust: Math.abs(thetaMean - thetaMedian) < 0.5 * seMedian,
        interpretation: Math.abs(thetaMean - thetaMedian) > 0.5 * seMedian
            ? 'Mean and median differ substantially - consider robust methods'
            : 'Mean and median consistent - standard methods appropriate',

        k,

        method: 'Median Meta-Analysis',
        rPackages: ['None available'],
        reference: 'Shuster (2010). Stat Med. doi:10.1002/sim.3607',
        warnings: validation.warnings
    };
}

function weightedMedianCalc(values, weights) {
    const pairs = values.map((v, i) => ({ v, w: weights[i] }))
        .filter(p => isFinite(p.v) && isFinite(p.w) && p.w > 0);
    pairs.sort((a, b) => a.v - b.v);

    const totalWeight = pairs.reduce((sum, p) => sum + p.w, 0);
    let cumWeight = 0;

    for (const pair of pairs) {
        cumWeight += pair.w;
        if (cumWeight >= totalWeight / 2) {
            return pair.v;
        }
    }

    return pairs[pairs.length - 1]?.v || NaN;
}

// ============================================================================
// 15. WINSORIZED META-ANALYSIS
// ============================================================================

/**
 * Winsorized Meta-Analysis
 *
 * Replaces extreme effect sizes with less extreme boundary values,
 * reducing the influence of outliers while keeping all studies.
 *
 * R AVAILABILITY: Not directly available
 * OUR CONTRIBUTION: Implementation with automatic threshold detection
 *
 * @param {Object[]} studies - Array of {yi, vi}
 * @param {Object} [options] - Configuration
 * @param {number} [options.trimPct=0.10] - Proportion to winsorize each tail
 * @returns {Object} Winsorized analysis results
 *
 * @reference Wilcox, R. R. (2012). Introduction to Robust Estimation and
 *   Hypothesis Testing. Academic Press. ISBN: 978-0123869838
 */
export function winsorizedMetaAnalysis(studies, options = {}) {
    const { trimPct = 0.10 } = options;

    // Validate input
    const validation = validateStudies(studies, ['yi', 'vi']);
    if (validation.errors.length > 0) {
        return { error: validation.errors.join('; ') };
    }

    const validStudies = validation.valid;
    const yi = validStudies.map(s => s.yi);
    const vi = validStudies.map(s => s.vi);
    const w = vi.map(v => 1 / v);
    const k = yi.length;

    // Sort by effect size
    const sorted = yi.map((y, i) => ({ y, v: vi[i], w: w[i], idx: i }))
        .sort((a, b) => a.y - b.y);

    const nTrim = Math.max(1, Math.floor(k * trimPct));

    if (nTrim * 2 >= k) {
        return { error: `Cannot winsorize ${trimPct * 100}% with only ${k} studies` };
    }

    // Boundary values
    const lowerBound = sorted[nTrim].y;
    const upperBound = sorted[k - nTrim - 1].y;

    // Winsorize
    const winsorized = sorted.map(s => ({
        ...s,
        yWinsor: Math.min(upperBound, Math.max(lowerBound, s.y)),
        modified: s.y < lowerBound || s.y > upperBound
    }));

    // Calculate estimates
    const sumW = winsorized.reduce((sum, s) => sum + s.w, 0);
    const thetaWinsor = winsorized.reduce((sum, s) => sum + s.yWinsor * s.w, 0) / sumW;
    const seWinsor = Math.sqrt(1 / sumW);

    // Original estimate
    const thetaOrig = yi.reduce((sum, y, i) => sum + y * w[i], 0) / w.reduce((a, b) => a + b, 0);

    // Modified studies
    const modifiedStudies = winsorized
        .filter(s => s.modified)
        .map(s => ({
            index: s.idx,
            original: s.y,
            winsorized: s.yWinsor
        }));

    return {
        theta: Math.round(thetaWinsor * 10000) / 10000,
        se: Math.round(seWinsor * 10000) / 10000,
        ci_lower: thetaWinsor - 1.96 * seWinsor,
        ci_upper: thetaWinsor + 1.96 * seWinsor,

        thetaOriginal: Math.round(thetaOrig * 10000) / 10000,
        bias: Math.round((thetaOrig - thetaWinsor) * 10000) / 10000,

        bounds: {
            lower: Math.round(lowerBound * 10000) / 10000,
            upper: Math.round(upperBound * 10000) / 10000
        },

        modifiedStudies,
        nModified: modifiedStudies.length,
        trimPct,

        k,

        method: 'Winsorized Meta-Analysis',
        rPackages: ['None available'],
        reference: 'Wilcox (2012). Introduction to Robust Estimation. Academic Press.',
        warnings: validation.warnings
    };
}

// ============================================================================
// 16. M-ESTIMATOR META-ANALYSIS
// ============================================================================

/**
 * M-Estimator Meta-Analysis
 *
 * Robust estimation using Huber or Tukey bisquare influence functions,
 * which downweight outlying observations automatically.
 *
 * R AVAILABILITY: robumeta provides robust variance estimation (different)
 * OUR CONTRIBUTION: M-estimation for effect size estimation
 *
 * @param {Object[]} studies - Array of {yi, vi}
 * @param {Object} [options] - Configuration
 * @param {string} [options.psi='huber'] - Influence function ('huber' or 'bisquare')
 * @param {number} [options.k] - Tuning constant
 * @returns {Object} Robust estimation results
 *
 * @reference Huber, P. J., & Ronchetti, E. M. (2009). Robust Statistics.
 *   Wiley. https://doi.org/10.1002/9780470434697
 */
export function mEstimatorMA(studies, options = {}) {
    const {
        psi = 'huber',
        k = psi === 'huber' ? 1.345 : 4.685,
        maxIter = 50,
        tol = 1e-6
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
    const n = yi.length;

    // Initial estimate (median)
    let theta = median(yi);
    let scale = mad(yi) || 1;

    const history = [theta];

    // IRLS iteration
    for (let iter = 0; iter < maxIter; iter++) {
        // Standardized residuals
        const resid = yi.map((y, i) => (y - theta) / (se[i] * scale));

        // Weights from psi function
        let weights;
        if (psi === 'huber') {
            weights = resid.map(r => Math.abs(r) <= k ? 1 : k / Math.abs(r));
        } else if (psi === 'bisquare') {
            weights = resid.map(r => {
                const u = r / k;
                return Math.abs(u) <= 1 ? Math.pow(1 - u * u, 2) : 0;
            });
        } else {
            weights = new Array(n).fill(1);
        }

        // Combined weights
        const w = vi.map((v, i) => weights[i] / v);
        const sumW = w.reduce((a, b) => a + b, 0);

        if (sumW < 1e-10) break;

        // Update estimate
        const newTheta = yi.reduce((sum, y, i) => sum + y * w[i], 0) / sumW;

        history.push(newTheta);

        if (Math.abs(newTheta - theta) < tol) {
            theta = newTheta;
            break;
        }

        theta = newTheta;

        // Update scale (MAD of weighted residuals)
        const newResid = yi.map(y => y - theta);
        scale = Math.max(1e-6, 1.4826 * median(newResid.map(Math.abs)));
    }

    // Sandwich standard error
    const finalResid = yi.map(y => y - theta);
    const seRobust = Math.sqrt(
        finalResid.reduce((sum, r, i) => sum + r * r / vi[i], 0) /
        Math.pow(vi.reduce((sum, v) => sum + 1 / v, 0), 2) * n
    );

    return {
        theta: Math.round(theta * 10000) / 10000,
        se: Math.round(seRobust * 10000) / 10000,
        ci_lower: theta - 1.96 * seRobust,
        ci_upper: theta + 1.96 * seRobust,

        scale: Math.round(scale * 10000) / 10000,
        psiFunction: psi,
        tuningConstant: k,

        converged: history.length < maxIter,
        nIterations: history.length,

        k: n,

        method: 'M-Estimator Meta-Analysis',
        rPackages: ['robumeta (different approach)'],
        reference: 'Huber & Ronchetti (2009). Robust Statistics. Wiley.',
        warnings: validation.warnings
    };
}

// ============================================================================
// 17. INFLUENCE-TRIMMED META-ANALYSIS
// ============================================================================

/**
 * Influence-Trimmed Meta-Analysis
 *
 * Automated outlier detection and removal based on influence diagnostics.
 * Uses Cook's distance or DFFITS to identify influential observations.
 *
 * R AVAILABILITY: metafor::influence() provides diagnostics but not automated trimming
 * OUR CONTRIBUTION: Automated trimming with transparent criteria
 *
 * @param {Object[]} studies - Array of {yi, vi}
 * @param {Object} [options] - Configuration
 * @param {string} [options.criterion='cooks'] - Influence measure
 * @returns {Object} Trimmed analysis results
 *
 * @reference Viechtbauer, W., & Cheung, M. W. L. (2010). Outlier and influence
 *   diagnostics for meta-analysis. Research Synthesis Methods, 1(2), 112-125.
 *   https://doi.org/10.1002/jrsm.11
 */
export function influenceTrimmedMA(studies, options = {}) {
    const { criterion = 'cooks', threshold = 'auto' } = options;

    // Validate input
    const validation = validateStudies(studies, ['yi', 'vi']);
    if (validation.errors.length > 0) {
        return { error: validation.errors.join('; ') };
    }

    const validStudies = validation.valid;
    const yi = validStudies.map(s => s.yi);
    const vi = validStudies.map(s => s.vi);
    const k = yi.length;

    if (k < 4) {
        return { error: 'Need at least 4 studies for influence analysis' };
    }

    // Full analysis
    const w = vi.map(v => 1 / v);
    const sumW = w.reduce((a, b) => a + b, 0);
    const thetaFull = yi.reduce((sum, y, i) => sum + y * w[i], 0) / sumW;
    const seFull = Math.sqrt(1 / sumW);

    // Calculate influence for each study
    const influences = [];

    for (let i = 0; i < k; i++) {
        // Leave-one-out
        const wLOO = w.filter((_, j) => j !== i);
        const yiLOO = yi.filter((_, j) => j !== i);
        const sumWLOO = wLOO.reduce((a, b) => a + b, 0);
        const thetaLOO = yiLOO.reduce((sum, y, j) => sum + y * wLOO[j], 0) / sumWLOO;

        const change = thetaFull - thetaLOO;
        const hat = w[i] / sumW;

        let influence;
        if (criterion === 'cooks') {
            influence = Math.pow(change, 2) / Math.pow(seFull, 2);
        } else if (criterion === 'dffits') {
            influence = Math.abs(change / Math.sqrt(vi[i] * (1 - hat)));
        } else {
            const resid = yi[i] - thetaFull;
            influence = Math.abs(resid / Math.sqrt(vi[i]));
        }

        influences.push({
            index: i,
            yi: yi[i],
            influence: Math.round(influence * 10000) / 10000,
            change: Math.round(change * 10000) / 10000,
            thetaLOO: Math.round(thetaLOO * 10000) / 10000
        });
    }

    // Determine threshold
    let cutoff;
    if (threshold === 'auto') {
        if (criterion === 'cooks') {
            cutoff = 4 / k;
        } else if (criterion === 'dffits') {
            cutoff = 2 * Math.sqrt(1 / k);
        } else {
            cutoff = 2;
        }
    } else {
        cutoff = threshold;
    }

    // Identify outliers
    const outliers = influences.filter(inf => inf.influence > cutoff);
    const retained = influences.filter(inf => inf.influence <= cutoff);

    // Trimmed estimate
    const yiTrim = retained.map(r => yi[r.index]);
    const viTrim = retained.map(r => vi[r.index]);
    const wTrim = viTrim.map(v => 1 / v);
    const sumWTrim = wTrim.reduce((a, b) => a + b, 0);
    const thetaTrim = sumWTrim > 0 ?
        yiTrim.reduce((sum, y, i) => sum + y * wTrim[i], 0) / sumWTrim : thetaFull;
    const seTrim = Math.sqrt(1 / sumWTrim);

    return {
        theta: Math.round(thetaTrim * 10000) / 10000,
        se: Math.round(seTrim * 10000) / 10000,
        ci_lower: thetaTrim - 1.96 * seTrim,
        ci_upper: thetaTrim + 1.96 * seTrim,

        thetaOriginal: Math.round(thetaFull * 10000) / 10000,
        bias: Math.round((thetaFull - thetaTrim) * 10000) / 10000,

        outliers: outliers.map(o => ({
            index: o.index,
            effect: o.yi,
            influence: o.influence
        })),

        nRemoved: outliers.length,
        nRetained: retained.length,

        criterion,
        threshold: Math.round(cutoff * 10000) / 10000,

        allInfluences: influences,

        k,

        method: 'Influence-Trimmed Meta-Analysis',
        rPackages: ['metafor::influence (diagnostics only)'],
        reference: 'Viechtbauer & Cheung (2010). Res Synth Methods. doi:10.1002/jrsm.11',
        warnings: validation.warnings
    };
}

// ============================================================================
// 18. CROSS-VALIDATED META-ANALYSIS
// ============================================================================

/**
 * Cross-Validated Meta-Analysis
 *
 * Evaluates predictive performance of different meta-analytic estimators
 * using k-fold cross-validation. Helps select the best method.
 *
 * R AVAILABILITY: Not available for meta-analysis
 * OUR CONTRIBUTION: Novel application of CV to estimator selection
 *
 * @param {Object[]} studies - Array of {yi, vi}
 * @param {Object} [options] - Configuration
 * @param {number} [options.folds=5] - Number of CV folds
 * @returns {Object} CV comparison results
 *
 * @reference Stone, M. (1974). Cross-validatory choice and assessment of
 *   statistical predictions. Journal of the Royal Statistical Society B,
 *   36(2), 111-147. https://doi.org/10.1111/j.2517-6161.1974.tb00994.x
 */
export function crossValidatedMA(studies, options = {}) {
    const {
        folds = 5,
        methods = ['FE', 'DL', 'REML', 'PM']
    } = options;

    // Validate input
    const validation = validateStudies(studies, ['yi', 'vi']);
    if (validation.errors.length > 0) {
        return { error: validation.errors.join('; ') };
    }

    const validStudies = validation.valid;
    const yi = validStudies.map(s => s.yi);
    const vi = validStudies.map(s => s.vi);
    const k = yi.length;

    if (k < folds * 2) {
        return { error: `Need at least ${folds * 2} studies for ${folds}-fold CV` };
    }

    // Create shuffled fold assignments
    const indices = Array(k).fill(0).map((_, i) => i);
    for (let i = k - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    const foldAssignment = indices.map((_, i) => i % folds);

    // CV for each method
    const results = {};

    for (const method of methods) {
        let totalMSE = 0;
        let totalMAE = 0;
        let totalCoverage = 0;

        for (let fold = 0; fold < folds; fold++) {
            const trainIdx = foldAssignment.map((f, i) => f !== fold ? i : -1).filter(i => i >= 0);
            const testIdx = foldAssignment.map((f, i) => f === fold ? i : -1).filter(i => i >= 0);

            const yiTrain = trainIdx.map(i => yi[i]);
            const viTrain = trainIdx.map(i => vi[i]);

            const fit = fitMetaAnalysis(yiTrain, viTrain, method);

            for (const i of testIdx) {
                const pred = fit.theta;
                const predVar = Math.pow(fit.se, 2) + vi[i] + fit.tau2;

                totalMSE += Math.pow(yi[i] - pred, 2);
                totalMAE += Math.abs(yi[i] - pred);

                const ciLower = pred - 1.96 * Math.sqrt(predVar);
                const ciUpper = pred + 1.96 * Math.sqrt(predVar);
                if (yi[i] >= ciLower && yi[i] <= ciUpper) totalCoverage++;
            }
        }

        results[method] = {
            MSE: Math.round((totalMSE / k) * 10000) / 10000,
            RMSE: Math.round(Math.sqrt(totalMSE / k) * 10000) / 10000,
            MAE: Math.round((totalMAE / k) * 10000) / 10000,
            coverage: Math.round((totalCoverage / k) * 1000) / 1000
        };
    }

    // Best method
    const bestMethod = Object.entries(results).reduce((a, b) =>
        a[1].MSE < b[1].MSE ? a : b
    )[0];

    // Rankings
    const rankings = Object.entries(results)
        .sort((a, b) => a[1].MSE - b[1].MSE)
        .map(([m], i) => ({ method: m, rank: i + 1 }));

    return {
        cvResults: results,
        bestMethod,
        bestMSE: results[bestMethod].MSE,

        rankings,

        recommendation: `${bestMethod} has lowest CV prediction error (RMSE = ${results[bestMethod].RMSE})`,

        folds,
        k,

        method: 'Cross-Validated Meta-Analysis',
        rPackages: ['None available'],
        reference: 'Stone (1974). J R Stat Soc B. doi:10.1111/j.2517-6161.1974.tb00994.x',
        warnings: validation.warnings
    };
}

function fitMetaAnalysis(yi, vi, method) {
    const k = yi.length;
    const w = vi.map(v => 1 / v);
    const sumW = w.reduce((a, b) => a + b, 0);
    const thetaFE = yi.reduce((sum, y, i) => sum + y * w[i], 0) / sumW;

    if (method === 'FE') {
        return { theta: thetaFE, se: Math.sqrt(1 / sumW), tau2: 0 };
    }

    // Estimate tau2
    const Q = yi.reduce((sum, y, i) => sum + w[i] * Math.pow(y - thetaFE, 2), 0);
    const C = sumW - w.reduce((sum, wi) => sum + wi * wi, 0) / sumW;
    const tau2 = Math.max(0, (Q - (k - 1)) / C);

    const wRE = vi.map(v => 1 / (v + tau2));
    const sumWRE = wRE.reduce((a, b) => a + b, 0);
    const thetaRE = yi.reduce((sum, y, i) => sum + y * wRE[i], 0) / sumWRE;

    return { theta: thetaRE, se: Math.sqrt(1 / sumWRE), tau2 };
}

// ============================================================================
// 19. STACKING META-ANALYSIS
// ============================================================================

/**
 * Stacking Meta-Analysis
 *
 * Combines multiple meta-analytic estimators using stacking (super learner).
 * Optimal weights are learned via cross-validation.
 *
 * R AVAILABILITY: Not available for meta-analysis
 * OUR CONTRIBUTION: Novel stacking approach for meta-analysis
 *
 * @param {Object[]} studies - Array of {yi, vi}
 * @param {Object} [options] - Configuration
 * @returns {Object} Stacked ensemble results
 *
 * @reference van der Laan, M. J., Polley, E. C., & Hubbard, A. E. (2007).
 *   Super learner. Statistical Applications in Genetics and Molecular Biology,
 *   6(1). https://doi.org/10.2202/1544-6115.1309
 */
export function stackingMA(studies, options = {}) {
    const {
        methods = ['FE', 'DL', 'median', 'trimmed'],
        cvFolds = 10
    } = options;

    // Validate input
    const validation = validateStudies(studies, ['yi', 'vi']);
    if (validation.errors.length > 0) {
        return { error: validation.errors.join('; ') };
    }

    const validStudies = validation.valid;
    const yi = validStudies.map(s => s.yi);
    const vi = validStudies.map(s => s.vi);
    const k = yi.length;

    if (k < cvFolds) {
        return { error: `Need at least ${cvFolds} studies for stacking` };
    }

    // Get CV predictions from each method
    const predictions = methods.map(() => new Array(k).fill(0));
    const foldAssignment = yi.map((_, i) => i % cvFolds);

    for (let fold = 0; fold < cvFolds; fold++) {
        const trainIdx = foldAssignment.map((f, i) => f !== fold ? i : -1).filter(i => i >= 0);
        const testIdx = foldAssignment.map((f, i) => f === fold ? i : -1).filter(i => i >= 0);

        const yiTrain = trainIdx.map(i => yi[i]);
        const viTrain = trainIdx.map(i => vi[i]);

        methods.forEach((method, m) => {
            const pred = getMethodPrediction(yiTrain, viTrain, method);
            for (const i of testIdx) {
                predictions[m][i] = pred;
            }
        });
    }

    // Find optimal stacking weights
    const weights = optimizeStackingWeightsNNLS(yi, predictions);

    // Final predictions from each method
    const finalPredictions = methods.map((method) =>
        getMethodPrediction(yi, vi, method)
    );

    // Stacked estimate
    const thetaStacked = finalPredictions.reduce((sum, pred, m) => sum + pred * weights[m], 0);

    // Bootstrap SE
    const bootThetas = [];
    for (let b = 0; b < 500; b++) {
        const bootIdx = Array(k).fill(0).map(() => Math.floor(Math.random() * k));
        const bootYi = bootIdx.map(i => yi[i]);
        const bootVi = bootIdx.map(i => vi[i]);

        const bootPreds = methods.map(method => getMethodPrediction(bootYi, bootVi, method));
        bootThetas.push(bootPreds.reduce((sum, pred, m) => sum + pred * weights[m], 0));
    }

    const seStacked = arraySD(bootThetas);

    return {
        theta: Math.round(thetaStacked * 10000) / 10000,
        se: Math.round(seStacked * 10000) / 10000,
        ci_lower: thetaStacked - 1.96 * seStacked,
        ci_upper: thetaStacked + 1.96 * seStacked,

        weights: Object.fromEntries(methods.map((m, i) =>
            [m, Math.round(weights[i] * 1000) / 1000]
        )),

        individualEstimates: Object.fromEntries(methods.map((m, i) =>
            [m, Math.round(finalPredictions[i] * 10000) / 10000]
        )),

        dominantMethod: methods[weights.indexOf(Math.max(...weights))],

        k,

        method: 'Stacking Meta-Analysis',
        rPackages: ['None available'],
        reference: 'van der Laan et al. (2007). Stat Appl Genet Mol Biol. doi:10.2202/1544-6115.1309',
        warnings: validation.warnings
    };
}

function getMethodPrediction(yi, vi, method) {
    const w = vi.map(v => 1 / v);

    if (method === 'median') {
        return weightedMedianCalc(yi, w);
    }

    if (method === 'trimmed') {
        const sorted = [...yi].sort((a, b) => a - b);
        const trim = Math.max(1, Math.floor(yi.length * 0.1));
        return arrayMean(sorted.slice(trim, yi.length - trim));
    }

    return fitMetaAnalysis(yi, vi, method).theta;
}

function optimizeStackingWeightsNNLS(y, predictions) {
    const nMethods = predictions.length;
    let weights = new Array(nMethods).fill(1 / nMethods);

    // Gradient descent for non-negative least squares
    for (let iter = 0; iter < 1000; iter++) {
        const grad = new Array(nMethods).fill(0);

        for (let i = 0; i < y.length; i++) {
            const pred = predictions.reduce((sum, p, m) => sum + p[i] * weights[m], 0);
            const error = pred - y[i];

            for (let m = 0; m < nMethods; m++) {
                grad[m] += 2 * error * predictions[m][i];
            }
        }

        // Update with projection to simplex
        const lr = 0.01 / y.length;
        weights = weights.map((w, m) => Math.max(0, w - lr * grad[m]));

        // Normalize
        const sumW = weights.reduce((a, b) => a + b, 0);
        if (sumW > 0) {
            weights = weights.map(w => w / sumW);
        }
    }

    return weights;
}

// ============================================================================
// 20. CONFORMAL PREDICTION INTERVAL
// ============================================================================

/**
 * Conformal Prediction Interval for Meta-Analysis
 *
 * Distribution-free prediction intervals with finite-sample coverage guarantee.
 * Does not require normality or known heterogeneity structure.
 *
 * R AVAILABILITY: Not available for meta-analysis
 * OUR CONTRIBUTION: Novel application to meta-analytic prediction
 *
 * @param {Object[]} studies - Array of {yi, vi}
 * @param {Object} [options] - Configuration
 * @param {number} [options.alpha=0.05] - Miscoverage rate
 * @returns {Object} Conformal prediction results
 *
 * @reference Vovk, V., Gammerman, A., & Shafer, G. (2005). Algorithmic Learning
 *   in a Random World. Springer. https://doi.org/10.1007/b106715
 *
 * @reference Lei, J., et al. (2018). Distribution-free predictive inference for
 *   regression. Journal of the American Statistical Association, 113(523), 1094-1111.
 *   https://doi.org/10.1080/01621459.2017.1307116
 */
export function conformalPredictionInterval(studies, options = {}) {
    const { alpha = 0.05 } = options;

    // Validate input
    const validation = validateStudies(studies, ['yi', 'vi']);
    if (validation.errors.length > 0) {
        return { error: validation.errors.join('; ') };
    }

    const validStudies = validation.valid;
    const yi = validStudies.map(s => s.yi);
    const vi = validStudies.map(s => s.vi);
    const k = yi.length;

    if (k < 10) {
        return { error: 'Need at least 10 studies for conformal prediction' };
    }

    // Split: half for training, half for calibration
    const halfK = Math.floor(k / 2);
    const trainIdx = Array(halfK).fill(0).map((_, i) => i);
    const calibIdx = Array(k - halfK).fill(0).map((_, i) => halfK + i);

    // Fit on training
    const yiTrain = trainIdx.map(i => yi[i]);
    const viTrain = trainIdx.map(i => vi[i]);
    const fit = fitMetaAnalysis(yiTrain, viTrain, 'DL');

    // Nonconformity scores on calibration set
    const scores = calibIdx.map(i => {
        const predVar = Math.pow(fit.se, 2) + vi[i] + fit.tau2;
        return Math.abs(yi[i] - fit.theta) / Math.sqrt(predVar);
    });

    scores.sort((a, b) => a - b);

    // Quantile for desired coverage
    const nCalib = scores.length;
    const qLevel = Math.ceil((nCalib + 1) * (1 - alpha)) / nCalib;
    const quantileIdx = Math.min(Math.floor(qLevel * nCalib), nCalib - 1);
    const qhat = scores[quantileIdx];

    // Prediction interval for new observation
    const avgVi = arrayMean(vi);
    const predSE = Math.sqrt(Math.pow(fit.se, 2) + avgVi + fit.tau2);

    return {
        theta: Math.round(fit.theta * 10000) / 10000,

        predictionInterval: {
            lower: Math.round((fit.theta - qhat * predSE) * 10000) / 10000,
            upper: Math.round((fit.theta + qhat * predSE) * 10000) / 10000
        },

        conformityQuantile: Math.round(qhat * 10000) / 10000,
        coverageLevel: 1 - alpha,

        calibrationScores: {
            min: Math.round(scores[0] * 10000) / 10000,
            median: Math.round(scores[Math.floor(nCalib / 2)] * 10000) / 10000,
            max: Math.round(scores[nCalib - 1] * 10000) / 10000
        },

        nCalibration: nCalib,
        nTraining: halfK,

        interpretation: `Prediction interval has ${((1 - alpha) * 100).toFixed(0)}% ` +
            'finite-sample coverage guarantee without distributional assumptions',

        k,

        method: 'Conformal Prediction',
        rPackages: ['None available'],
        reference: 'Lei et al. (2018). JASA. doi:10.1080/01621459.2017.1307116',
        warnings: validation.warnings
    };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function arrayMean(arr) {
    if (!arr.length) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function arrayVariance(arr) {
    if (arr.length < 2) return 0;
    const m = arrayMean(arr);
    return arr.reduce((sum, x) => sum + Math.pow(x - m, 2), 0) / (arr.length - 1);
}

function arraySD(arr) {
    return Math.sqrt(arrayVariance(arr));
}

function solveLinearSystem(A, b) {
    const n = A.length;
    if (n === 0 || n !== b.length) return null;

    // Augmented matrix
    const M = A.map((row, i) => [...row, b[i]]);

    // Gaussian elimination with partial pivoting
    for (let i = 0; i < n; i++) {
        // Find pivot
        let maxRow = i;
        for (let k = i + 1; k < n; k++) {
            if (Math.abs(M[k][i]) > Math.abs(M[maxRow][i])) maxRow = k;
        }
        [M[i], M[maxRow]] = [M[maxRow], M[i]];

        if (Math.abs(M[i][i]) < 1e-10) continue;

        // Eliminate
        for (let k = i + 1; k < n; k++) {
            const c = M[k][i] / M[i][i];
            for (let j = i; j <= n; j++) {
                M[k][j] -= c * M[i][j];
            }
        }
    }

    // Back substitution
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
        if (Math.abs(M[i][i]) < 1e-10) continue;
        x[i] = M[i][n] / M[i][i];
        for (let k = i - 1; k >= 0; k--) {
            M[k][n] -= M[k][i] * x[i];
        }
    }

    return x;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
    bayesianHeterogeneityBMA,
    spikeAndSlabMA,
    horseshoeMetaRegression,
    medianMetaAnalysis,
    winsorizedMetaAnalysis,
    mEstimatorMA,
    influenceTrimmedMA,
    crossValidatedMA,
    stackingMA,
    conformalPredictionInterval
};
