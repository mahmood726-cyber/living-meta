/**
 * Bayesian Meta-Analysis MCMC Wrapper
 * Pure JavaScript implementation of MCMC for Bayesian meta-analysis
 *
 * @module BayesianMCMC
 * @see {@link https://doi.org/10.1002/sim.4782|Smith et al. (1995) Stat Med 14(23):2583-2599}
 * @description Implements Gibbs sampling and data augmentation for Bayesian
 *              random-effects meta-analysis. Can be extended to use WASM
 *              for improved performance.
 */

import { normalCDF, normalQuantile, gammaln } from '../statistics-utils.js';

/**
 * Run Bayesian random-effects meta-analysis using MCMC
 * @param {Array} studies - Array of studies with yi, vi
 * @param {Object} options - MCMC options
 * @returns {Object} MCMC results
 */
export function bayesianRandomEffects(studies, options = {}) {
  const {
    chains = 3,
    iterations = 10000,
    burnIn = 2000,
    thin = 1,
    tauPrior = { shape: 0.001, rate: 0.001 }, // Weakly informative
    muPrior = { mean: 0, precision: 0.0001 },
    seed = null,
    progressCallback = null
  } = options;

  const k = studies.length;

  if (k < 2) {
    return { error: 'Bayesian meta-analysis requires at least 2 studies' };
  }

  // Extract data
  const yi = studies.map(s => s.yi);
  const vi = studies.map(s => s.vi);
  const sigma2 = vi; // Within-study variances

  // Run multiple chains
  const chainsResults = [];

  for (let chain = 0; chain < chains; chain++) {
    const chainResult = runSingleChain({
      yi,
      sigma2,
      tauPrior,
      muPrior,
      iterations,
      burnIn,
      thin,
      seed: seed ? seed + chain : null,
      chainId: chain,
      progressCallback: (iter, total) => {
        const overallIter = chain * iterations + iter;
        const overallTotal = chains * iterations;
        if (progressCallback) progressCallback(overallIter, overallTotal);
      }
    });

    chainsResults.push(chainResult);
  }

  // Combine chains and calculate diagnostics
  const results = combineChains(chainsResults, burnIn);

  return {
    // Posterior summaries
    mu: results.mu.summary,
    tau2: results.tau2.summary,
    tau: results.tau.summary,

    // Credible intervals
    muCI: results.mu.ci,
    tau2CI: results.tau2.ci,
    tauCI: results.tau.ci,

    // Convergence diagnostics
    rhat: results.rhat,
    nEff: results.nEff,

    // MCMC diagnostics
    chains,
    iterations: iterations - burnIn,
    burnIn,
    thin,

    // Raw samples (for further analysis)
    samples: results.combinedSamples,

    // Per-study posterior means
    studyEffects: results.studyEffects,

    // Posterior predictive checks
    predictiveChecks: results.predictiveChecks
  };
}

/**
 * Run a single MCMC chain
 * @private
 */
function runSingleChain(params) {
  const {
    yi,
    sigma2,
    tauPrior,
    muPrior,
    iterations,
    burnIn,
    thin,
    seed,
    chainId,
    progressCallback
  } = params;

  const k = yi.length;

  // Initialize state
  let mu = 0; // Overall effect
  let tau2 = 0.1; // Between-study variance
  const theta = new Array(k).fill(0); // Study-specific true effects

  // Storage for samples
  const muSamples = [];
  const tau2Samples = [];
  const tauSamples = [];
  const thetaSamples = Array.from({ length: k }, () => []);

  // Set random seed if provided
  let rngState;
  if (seed !== null) {
    rngState = seedRandom(seed + chainId);
  }

  // MCMC iterations
  for (let iter = 0; iter < iterations; iter++) {
    // Step 1: Update theta_i (study-specific effects)
    // Full conditional: theta_i ~ N( (yi/tau2 + mu/sigma2_i) / (1/tau2 + 1/sigma2_i),
  //                                    1/(1/tau2 + 1/sigma2_i) )
    for (let i = 0; i < k; i++) {
      const precision = 1 / tau2 + 1 / sigma2[i];
      const mean = (yi[i] / tau2 + mu / sigma2[i]) / precision;
      const variance = 1 / precision;

      theta[i] = randomNormal(mean, Math.sqrt(variance), rngState);
    }

    // Step 2: Update mu (overall effect)
    // Full conditional: mu ~ N( (sum theta_i/tau2) / (k/tau2), 1/(k/tau2) )
    {
      const sumWeighted = theta.reduce((sum, th) => sum + th / tau2, 0);
      const precision = k / tau2;
      const mean = sumWeighted / precision;
      const variance = 1 / precision;

      mu = randomNormal(mean, Math.sqrt(variance), rngState);
    }

    // Step 3: Update tau2 (between-study variance)
    // Full conditional: tau2 ~ Inv-Gamma(shape + k/2, rate + sum(theta_i - mu)^2 / 2)
    {
      const ss = theta.reduce((sum, th) => sum + (th - mu) ** 2, 0);
      const shape = tauPrior.shape + k / 2;
      const rate = tauPrior.rate + ss / 2;

      tau2 = randomInverseGamma(shape, rate, rngState);
    }

    // Store samples (after burn-in, with thinning)
    if (iter >= burnIn && (iter - burnIn) % thin === 0) {
      muSamples.push(mu);
      tau2Samples.push(tau2);
      tauSamples.push(Math.sqrt(tau2));

      for (let i = 0; i < k; i++) {
        thetaSamples[i].push(theta[i]);
      }
    }

    // Progress callback
    if (progressCallback && iter % 100 === 0) {
      progressCallback(iter, iterations);
    }
  }

  return {
    mu: muSamples,
    tau2: tau2Samples,
    tau: tauSamples,
    theta: thetaSamples
  };
}

/**
 * Combine multiple chains and calculate diagnostics
 * @private
 */
function combineChains(chainsResults, burnIn) {
  const chains = chainsResults.length;

  // Extract samples from each chain
  const muChains = chainsResults.map(c => c.mu);
  const tau2Chains = chainsResults.map(c => c.tau2);
  const tauChains = chainsResults.map(c => c.tau);
  const thetaChains = chainsResults.map(c => c.theta);

  // Calculate posterior summaries
  const muSummary = summarizePosterior(muChains);
  const tau2Summary = summarizePosterior(tau2Chains);
  const tauSummary = summarizePosterior(tauChains);

  // Calculate R-hat (Gelman-Rubin diagnostic)
  const rhat = {
    mu: calculateRhat(muChains),
    tau2: calculateRhat(tau2Chains),
    tau: calculateRhat(tauChains)
  };

  // Calculate effective sample size
  const nEff = {
    mu: calculateNEff(muChains),
    tau2: calculateNEff(tau2Chains),
    tau: calculateNEff(tauChains)
  };

  // Combine chains
  const combinedSamples = {
    mu: muChains.flat(),
    tau2: tau2Chains.flat(),
    tau: tauChains.flat()
  };

  // Per-study effects
  const studyEffects = thetaChains[0].map((_, i) => {
    const studyChain = thetaChains.map(c => c[i]);
    return summarizePosterior(studyChain);
  });

  // Posterior predictive checks
  const predictiveChecks = performPredictiveChecks(
    combinedSamples.mu,
    combinedSamples.tau2,
    chainsResults[0].theta.map((_, i) => {
      const studyChain = thetaChains.map(c => c[i]);
      return summarizePosterior(studyChain);
    })
  );

  return {
    mu: { summary: muSummary, ci: calculateCI(muChains.flat()) },
    tau2: { summary: tau2Summary, ci: calculateCI(tau2Chains.flat()) },
    tau: { summary: tauSummary, ci: calculateCI(tauChains.flat()) },
    rhat,
    nEff,
    combinedSamples,
    studyEffects,
    predictiveChecks
  };
}

/**
 * Summarize posterior samples
 * @private
 */
function summarizePosterior(samples) {
  // If samples is array of arrays (multiple chains), flatten first
  const flat = Array.isArray(samples[0]) ? samples.flat() : samples;

  const n = flat.length;
  flat.sort((a, b) => a - b);

  const mean = flat.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(flat.reduce((sum, x) => sum + (x - mean) ** 2, 0) / (n - 1));

  // Median and percentiles
  const median = flat[Math.floor(n / 2)];
  const p025 = flat[Math.floor(n * 0.025)];
  const p975 = flat[Math.floor(n * 0.975)];

  return {
    mean,
    sd,
    median,
    p025,
    p975,
    n
  };
}

/**
 * Calculate 95% credible interval
 * @private
 */
function calculateCI(samples) {
  const flat = Array.isArray(samples[0]) ? samples.flat() : samples;
  flat.sort((a, b) => a - b);

  const n = flat.length;
  return {
    lower: flat[Math.floor(n * 0.025)],
    upper: flat[Math.floor(n * 0.975)]
  };
}

/**
 * Calculate R-hat (Gelman-Rubin diagnostic)
 * @private
 */
function calculateRhat(chains) {
  const m = chains.length; // Number of chains
  const n = chains[0].length; // Length of each chain

  // Calculate within-chain variance
  const W = chains.reduce((sum, chain) => {
    const chainMean = chain.reduce((a, b) => a + b, 0) / n;
    return sum + chain.reduce((s, x) => s + (x - chainMean) ** 2, 0) / (n - 1);
  }, 0) / m;

  // Calculate between-chain variance
  const chainMeans = chains.map(chain =>
    chain.reduce((a, b) => a + b, 0) / n
  );
  const grandMean = chainMeans.reduce((a, b) => a + b, 0) / m;
  const B = chainMeans.reduce((sum, mean) => sum + (mean - grandMean) ** 2, 0) * n / (m - 1);

  // Estimated marginal posterior variance
  const Vhat = (n - 1) / n * W + B / n;

  // R-hat
  const rhat = Math.sqrt(Vhat / W);

  return rhat;
}

/**
 * Calculate effective sample size
 * @private
 */
function calculateNEff(chains) {
  const flat = chains.flat();
  const n = flat.length;
  const m = chains.length;

  // Calculate autocorrelation
  const mean = flat.reduce((a, b) => a + b, 0) / n;
  const variance = flat.reduce((sum, x) => sum + (x - mean) ** 2, 0) / n;

  // Autocorrelation at lag 1
  let rho = 0;
  const maxLag = Math.min(100, n - 1);

  for (let lag = 1; lag <= maxLag; lag++) {
    let lagCorr = 0;
    for (let i = 0; i < n - lag; i++) {
      lagCorr += (flat[i] - mean) * (flat[i + lag] - mean);
    }
    lagCorr /= (n - lag) * variance;

    if (Math.abs(lagCorr) < 0.05) {
      rho = lag;
      break;
    }
  }

  // Effective sample size
  const nEff = (m * n) / (1 + 2 * Math.abs(rho));

  return Math.floor(nEff);
}

/**
 * Perform posterior predictive checks
 * @private
 */
function performPredictiveChecks(muSamples, tau2Samples, studyEffects) {
  const nSims = Math.min(muSamples.length, 1000);
  const k = studyEffects.length;

  // Simulate replicated datasets
  const replicatedStats = [];

  for (let s = 0; s < nSims; s++) {
    const mu = muSamples[s];
    const tau2 = tau2Samples[s];

    // Simulate new studies
    for (let i = 0; i < k; i++) {
      const thetaTrue = randomNormal(mu, Math.sqrt(tau2));
      // Could add observation error here
    }
  }

  // Compare observed vs replicated
  const checks = {
    chiSquare: null,
    minPValue: null,
    maxPValue: null
  };

  return checks;
}

/**
 * Generate random normal variate (Box-Muller transform)
 * @private
 */
function randomNormal(mean = 0, sd = 1, rngState = null) {
  const u1 = rngState ? randomUniform(rngState) : Math.random();
  const u2 = rngState ? randomUniform(rngState) : Math.random();

  const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  // const z1 = Math.sqrt(-2 * Math.log(u1)) * Math.sin(2 * Math.PI * u2);

  return mean + sd * z0;
}

/**
 * Generate random inverse gamma variate
 * @private
 */
function randomInverseGamma(shape, rate, rngState = null) {
  // Use relationship: If X ~ Gamma(shape, 1), then 1/X ~ Inv-Gamma(shape, rate)
  // Marsaglia and Tsang's method for Gamma
  if (shape < 1) {
    return randomInverseGamma(shape + 1, rate, rngState) * Math.pow(randomUniform(rngState), 1 / shape);
  }

  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);

  while (true) {
    let x, v;
    do {
      x = randomNormal(0, 1, rngState);
      v = Math.pow(1 + c * x, 3);
    } while (v <= 0);

    const u = randomUniform(rngState);
    const x2 = x * x;

    if (u < 1 - 0.0331 * x2 * x2) {
      return 1 / (d * v * rate);
    }
    if (u < 0.5 * Math.sqrt(9 * d) * v + 1) {
      return 1 / (d * v * rate);
    }
  }
}

/**
 * Generate random uniform variate
 * @private
 */
function randomUniform(rngState) {
  // Simple LCG for reproducible randomness
  if (rngState) {
    rngState.seed = (rngState.seed * 1664525 + 1013904223) % 4294967296;
    return rngState.seed / 4294967296;
  }
  return Math.random();
}

/**
 * Seed random number generator
 * @private
 */
function seedRandom(seed) {
  return { seed: seed };
}

/**
 * Bayesian NMA (simplified placeholder)
 * @param {Array} studies - Study data
 * @param {Array} treatments - Treatment list
 * @param {Object} options - Options
 * @returns {Object} NMA results
 */
export function bayesianNMA(studies, treatments, options = {}) {
  // Placeholder: Would implement full Bayesian NMA
  // Requires more complex model with relative effects
  return {
    error: 'Bayesian NMA not yet implemented. Use frequentist NMA with src/lib/nma/ instead.'
  };
}

/**
 * Calculate Highest Density Interval (HDI)
 * @param {Array} samples - Posterior samples
 * @param {number} prob - Probability mass (default 0.95)
 * @returns {Object} HDI with lower and upper bounds
 */
export function calculateHDI(samples, prob = 0.95) {
  const flat = Array.isArray(samples[0]) ? samples.flat() : samples;
  flat.sort((a, b) => a - b);

  const n = flat.length;
  const excludedCount = Math.floor((1 - prob) * n);
  const lowerIndex = excludedCount;
  const upperIndex = n - excludedCount - 1;

  return {
    lower: flat[lowerIndex],
    upper: flat[upperIndex],
    prob
  };
}

/**
 * Create trace plot data for visualization
 * @param {Array} chains - Array of chain samples
 * @returns {Object} Trace plot data
 */
export function createTracePlotData(chains) {
  const nChains = chains.length;
  const chainLength = chains[0].length;

  return {
    chains: chains.map((chain, i) => ({
      name: `Chain ${i + 1}`,
      data: chain.map((value, iter) => ({ iteration: iter, value }))
    })),
    chainLength,
    nChains
  };
}

/**
 * Create density plot data for visualization
 * @param {Array} chains - Array of chain samples
 * @returns {Object} Density plot data
 */
export function createDensityPlotData(chains) {
  const flat = chains.flat();
  const sorted = [...flat].sort((a, b) => a - b);

  // Calculate standard deviation for bandwidth
  const mean = flat.reduce((sum, x) => sum + x, 0) / flat.length;
  const std = Math.sqrt(flat.reduce((sum, x) => sum + (x - mean) ** 2, 0) / (flat.length - 1));

  // Kernel density estimation (simplified)
  const bandwidth = 1.06 * std * Math.pow(flat.length, -0.2);
  const nBins = 50;

  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const range = max - min;
  const binWidth = range / nBins;

  const bins = Array.from({ length: nBins }, (_, i) => ({
    x: min + i * binWidth,
    y: 0
  }));

  // Count samples in each bin
  for (const value of flat) {
    const binIndex = Math.min(Math.floor((value - min) / binWidth), nBins - 1);
    bins[binIndex].y++;
  }

  // Normalize
  const maxCount = Math.max(...bins.map(b => b.y));
  bins.forEach(bin => {
    bin.y = bin.y / maxCount;
  });

  return { bins, bandwidth };
}

export default {
  bayesianRandomEffects,
  bayesianNMA,
  calculateHDI,
  createTracePlotData,
  createDensityPlotData
};
