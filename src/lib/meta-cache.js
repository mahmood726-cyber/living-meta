/**
 * meta-cache.js - Optimized Meta-Analysis Calculations
 *
 * Performance-optimized utilities that cache common calculations
 * to avoid redundant computation across methods.
 */

/**
 * Pre-computed meta-analysis state
 * Calculates weights, pooled estimates, and heterogeneity in a single pass
 *
 * @param {Array} studies - [{yi, vi}]
 * @returns {Object} Cached calculations
 */
export function computeMAState(studies) {
  const k = studies.length;
  if (k === 0) return null;

  // Use typed arrays for numerical performance
  const yi = new Float64Array(k);
  const vi = new Float64Array(k);
  const weights = new Float64Array(k);

  let totalWeight = 0;
  let sumWY = 0;
  let sumW2 = 0;

  // Single pass for FE calculations
  for (let i = 0; i < k; i++) {
    yi[i] = studies[i].yi;
    vi[i] = studies[i].vi;
    weights[i] = 1 / vi[i];
    totalWeight += weights[i];
    sumWY += weights[i] * yi[i];
    sumW2 += weights[i] * weights[i];
  }

  const thetaFE = sumWY / totalWeight;

  // Q statistic in single pass
  let Q = 0;
  for (let i = 0; i < k; i++) {
    const diff = yi[i] - thetaFE;
    Q += weights[i] * diff * diff;
  }

  // tau² estimation (DL method)
  const c = totalWeight - sumW2 / totalWeight;
  const tau2 = Math.max(0, (Q - (k - 1)) / c);
  const tau = Math.sqrt(tau2);

  // RE weights and estimate
  const reWeights = new Float64Array(k);
  let reTotalWeight = 0;
  let reSumWY = 0;

  for (let i = 0; i < k; i++) {
    reWeights[i] = 1 / (vi[i] + tau2);
    reTotalWeight += reWeights[i];
    reSumWY += reWeights[i] * yi[i];
  }

  const thetaRE = reSumWY / reTotalWeight;
  const seRE = Math.sqrt(1 / reTotalWeight);
  const seFE = Math.sqrt(1 / totalWeight);

  // I² calculation
  const I2 = Q > k - 1 ? ((Q - (k - 1)) / Q) * 100 : 0;

  return {
    k,
    yi,
    vi,
    // FE results
    weights,
    totalWeight,
    thetaFE,
    seFE,
    // RE results
    reWeights,
    reTotalWeight,
    thetaRE,
    seRE,
    // Heterogeneity
    Q,
    tau2,
    tau,
    I2,
    c
  };
}

/**
 * Fast weighted mean using pre-computed weights
 */
export function fastWeightedMean(values, weights, totalWeight) {
  const n = values.length;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += weights[i] * values[i];
  }
  return sum / totalWeight;
}

/**
 * Fast Kendall's tau using O(n log n) algorithm
 * Based on Knight's algorithm with merge sort
 */
export function fastKendallTau(x, y) {
  const n = x.length;
  if (n < 2) return 0;

  // Create index pairs and sort by x
  const pairs = new Array(n);
  for (let i = 0; i < n; i++) {
    pairs[i] = { x: x[i], y: y[i], idx: i };
  }
  pairs.sort((a, b) => a.x - b.x || a.idx - b.idx);

  // Extract y values in x-sorted order
  const yRanked = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    yRanked[i] = pairs[i].y;
  }

  // Count inversions using merge sort - O(n log n)
  const inversions = mergeCountInversions(yRanked);

  // Kendall's tau = (concordant - discordant) / n(n-1)/2
  // concordant = total_pairs - discordant - ties
  const totalPairs = n * (n - 1) / 2;
  const discordant = inversions;
  const concordant = totalPairs - discordant;

  return (concordant - discordant) / totalPairs;
}

// Merge sort with inversion counting
function mergeCountInversions(arr) {
  const n = arr.length;
  if (n < 2) return 0;

  const temp = new Float64Array(n);
  return mergeSortCount(arr, temp, 0, n - 1);
}

function mergeSortCount(arr, temp, left, right) {
  let inversions = 0;
  if (left < right) {
    const mid = Math.floor((left + right) / 2);
    inversions += mergeSortCount(arr, temp, left, mid);
    inversions += mergeSortCount(arr, temp, mid + 1, right);
    inversions += mergeCount(arr, temp, left, mid, right);
  }
  return inversions;
}

function mergeCount(arr, temp, left, mid, right) {
  let i = left, j = mid + 1, k = left;
  let inversions = 0;

  while (i <= mid && j <= right) {
    if (arr[i] <= arr[j]) {
      temp[k++] = arr[i++];
    } else {
      temp[k++] = arr[j++];
      inversions += (mid - i + 1);
    }
  }

  while (i <= mid) temp[k++] = arr[i++];
  while (j <= right) temp[k++] = arr[j++];

  for (let i = left; i <= right; i++) {
    arr[i] = temp[i];
  }

  return inversions;
}

/**
 * Fast Pearson correlation - single pass algorithm
 */
export function fastPearsonCorr(x, y) {
  const n = x.length;
  if (n < 2) return 0;

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;

  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
    sumXY += x[i] * y[i];
    sumX2 += x[i] * x[i];
    sumY2 += y[i] * y[i];
  }

  const num = n * sumXY - sumX * sumY;
  const den = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

  return den > 1e-10 ? num / den : 0;
}

/**
 * Pre-allocated bootstrap resampling
 * Reuses arrays to avoid garbage collection
 */
export class BootstrapResampler {
  constructor(k, nBoot = 500) {
    this.k = k;
    this.nBoot = nBoot;
    // Pre-allocate index arrays
    this.indices = new Int32Array(k);
    this.bootWeights = new Float64Array(k);
    this.bootYi = new Float64Array(k);
  }

  // Generate bootstrap sample indices (in-place)
  resampleIndices() {
    for (let i = 0; i < this.k; i++) {
      this.indices[i] = Math.floor(Math.random() * this.k);
    }
    return this.indices;
  }

  // Bootstrap a meta-analysis
  bootstrapMA(yi, vi, tau2) {
    const indices = this.resampleIndices();

    let totalW = 0, sumWY = 0;
    for (let i = 0; i < this.k; i++) {
      const idx = indices[i];
      const w = 1 / (vi[idx] + tau2);
      this.bootWeights[i] = w;
      this.bootYi[i] = yi[idx];
      totalW += w;
      sumWY += w * yi[idx];
    }

    return sumWY / totalW;
  }
}

/**
 * Chunked simulation runner for large simulations
 * Prevents UI blocking by yielding periodically
 */
export async function chunkedSimulation(nSim, chunkSize, simulationFn) {
  const results = new Float64Array(nSim);

  for (let start = 0; start < nSim; start += chunkSize) {
    const end = Math.min(start + chunkSize, nSim);

    for (let i = start; i < end; i++) {
      results[i] = simulationFn(i);
    }

    // Yield to event loop every chunk
    if (end < nSim) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  return results;
}

/**
 * Fast normal quantile (inverse CDF) - Rational approximation
 * Accurate to ~1e-9 for most of the range
 */
export function fastNormalQuantile(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;

  // Rational approximation coefficients
  const a = [
    -3.969683028665376e+01,  2.209460984245205e+02,
    -2.759285104469687e+02,  1.383577518672690e+02,
    -3.066479806614716e+01,  2.506628277459239e+00
  ];
  const b = [
    -5.447609879822406e+01,  1.615858368580409e+02,
    -1.556989798598866e+02,  6.680131188771972e+01,
    -1.328068155288572e+01
  ];
  const c = [
    -7.784894002430293e-03, -3.223964580411365e-01,
    -2.400758277161838e+00, -2.549732539343734e+00,
     4.374664141464968e+00,  2.938163982698783e+00
  ];
  const d = [
     7.784695709041462e-03,  3.224671290700398e-01,
     2.445134137142996e+00,  3.754408661907416e+00
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

/**
 * Fast normal CDF using error function approximation
 */
export function fastNormalCDF(x) {
  const a1 =  0.254829592;
  const a2 = -0.284496736;
  const a3 =  1.421413741;
  const a4 = -1.453152027;
  const a5 =  1.061405429;
  const p  =  0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.SQRT2;

  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1 + sign * y);
}

/**
 * Box-Muller transform for normal random numbers
 * Pre-generates pairs for efficiency
 */
export class FastRandom {
  constructor() {
    this.hasSpare = false;
    this.spare = 0;
  }

  normal() {
    if (this.hasSpare) {
      this.hasSpare = false;
      return this.spare;
    }

    let u, v, s;
    do {
      u = Math.random() * 2 - 1;
      v = Math.random() * 2 - 1;
      s = u * u + v * v;
    } while (s >= 1 || s === 0);

    const mul = Math.sqrt(-2 * Math.log(s) / s);
    this.spare = v * mul;
    this.hasSpare = true;
    return u * mul;
  }
}

export default {
  computeMAState,
  fastWeightedMean,
  fastKendallTau,
  fastPearsonCorr,
  BootstrapResampler,
  chunkedSimulation,
  fastNormalQuantile,
  fastNormalCDF,
  FastRandom
};
