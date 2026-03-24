/**
 * Kaplan-Meier Curve Digitizer with Wasserstein Distance Optimization
 *
 * Implements KM curve reconstruction from digitized points using:
 * - Wasserstein (Earth Mover's) distance for curve matching
 * - Guyot et al. (2012) algorithm for IPD reconstruction
 * - Numbers at risk integration for improved accuracy
 *
 * Reference:
 * - Guyot P, et al. (2012). Enhanced secondary analysis of survival data. BMC Med Res Methodol.
 * - Villani C (2009). Optimal Transport: Old and New. Springer.
 */

/**
 * Calculate 1D Wasserstein distance between two survival curves
 * Uses the closed-form solution for 1D distributions
 *
 * W_1(S1, S2) = integral |S1(t) - S2(t)| dt
 *
 * @param {Array} curve1 - [{time, survival}, ...] first curve
 * @param {Array} curve2 - [{time, survival}, ...] second curve
 * @param {number} maxTime - maximum time to consider
 * @returns {number} Wasserstein distance
 */
export function wassersteinDistance(curve1, curve2, maxTime = null) {
  // Merge time points from both curves
  const times = new Set();
  curve1.forEach(p => times.add(p.time));
  curve2.forEach(p => times.add(p.time));

  const sortedTimes = [...times].sort((a, b) => a - b);

  if (maxTime) {
    sortedTimes.push(maxTime);
  }

  // Calculate area between curves (L1 integral)
  let distance = 0;
  let prevTime = 0;

  for (let i = 0; i < sortedTimes.length; i++) {
    const t = sortedTimes[i];
    if (maxTime && t > maxTime) break;

    const s1 = interpolateSurvival(curve1, (prevTime + t) / 2);
    const s2 = interpolateSurvival(curve2, (prevTime + t) / 2);

    const dt = t - prevTime;
    distance += Math.abs(s1 - s2) * dt;
    prevTime = t;
  }

  return distance;
}

/**
 * Interpolate survival probability at given time
 * Uses step function (right-continuous)
 */
function interpolateSurvival(curve, time) {
  if (curve.length === 0) return 1;
  if (time <= curve[0].time) return 1;
  if (time >= curve[curve.length - 1].time) return curve[curve.length - 1].survival;

  for (let i = curve.length - 1; i >= 0; i--) {
    if (curve[i].time <= time) {
      return curve[i].survival;
    }
  }
  return 1;
}

/**
 * Digitize KM curve from image coordinates
 * Converts pixel coordinates to time-survival pairs
 *
 * @param {Array} points - [{x, y}, ...] raw pixel coordinates
 * @param {object} axes - { xMin, xMax, yMin, yMax, pixelXMin, pixelXMax, pixelYMin, pixelYMax }
 * @returns {Array} [{time, survival}, ...]
 */
export function digitizePoints(points, axes) {
  const {
    xMin = 0, xMax, yMin = 0, yMax = 1,
    pixelXMin, pixelXMax, pixelYMin, pixelYMax
  } = axes;

  const xScale = (xMax - xMin) / (pixelXMax - pixelXMin);
  const yScale = (yMax - yMin) / (pixelYMax - pixelYMin);

  return points.map(p => ({
    time: xMin + (p.x - pixelXMin) * xScale,
    survival: yMax - (p.y - pixelYMin) * yScale  // Y-axis is inverted in images
  })).sort((a, b) => a.time - b.time);
}

/**
 * Clean and validate digitized curve
 * - Remove duplicates
 * - Ensure monotonic decrease
 * - Cap at 0-1 range
 */
export function cleanCurve(curve) {
  const cleaned = [];
  let lastSurvival = 1;

  for (const point of curve) {
    let survival = Math.max(0, Math.min(1, point.survival));
    survival = Math.min(survival, lastSurvival); // Ensure monotonic

    if (cleaned.length === 0 || point.time > cleaned[cleaned.length - 1].time) {
      cleaned.push({ time: point.time, survival });
      lastSurvival = survival;
    }
  }

  return cleaned;
}

/**
 * Reconstruct Individual Patient Data from digitized KM curve
 * Implements Guyot et al. (2012) algorithm
 *
 * @param {Array} curve - [{time, survival}, ...] digitized curve
 * @param {Array} nRisk - [{time, n}, ...] numbers at risk (optional but improves accuracy)
 * @param {number} totalN - total initial sample size
 * @returns {Array} [{time, event, censor}, ...] reconstructed IPD
 */
export function reconstructIPD(curve, nRisk = null, totalN = null) {
  if (!curve || curve.length < 2) {
    return { error: 'Need at least 2 points on curve' };
  }

  // Estimate total N if not provided
  if (!totalN && nRisk && nRisk.length > 0) {
    totalN = nRisk[0].n;
  }
  if (!totalN) {
    // Rough estimate based on curve smoothness
    totalN = estimateSampleSize(curve);
  }

  const ipd = [];
  let nRemaining = totalN;

  // Process intervals between curve points
  for (let i = 0; i < curve.length - 1; i++) {
    const t1 = curve[i].time;
    const t2 = curve[i + 1].time;
    const s1 = curve[i].survival;
    const s2 = curve[i + 1].survival;

    // Get number at risk at start of interval
    const nAtRisk = nRisk
      ? interpolateNRisk(nRisk, t1)
      : Math.round(nRemaining);

    if (nAtRisk <= 0) continue;

    // Number of events in interval
    // d = n * (1 - S(t2)/S(t1)) when no censoring in interval
    const survRatio = s1 > 0 ? s2 / s1 : 0;
    const nEvents = Math.round(nAtRisk * (1 - survRatio));

    // Number of censored
    const nAtRiskEnd = nRisk
      ? interpolateNRisk(nRisk, t2)
      : Math.round(nAtRisk * survRatio);

    const nCensored = Math.max(0, nAtRisk - nEvents - nAtRiskEnd);

    // Distribute events uniformly in interval
    for (let j = 0; j < nEvents; j++) {
      const eventTime = t1 + (t2 - t1) * (j + 0.5) / nEvents;
      ipd.push({ time: eventTime, event: 1, censor: 0 });
    }

    // Distribute censoring uniformly in interval (after events)
    for (let j = 0; j < nCensored; j++) {
      const censorTime = t1 + (t2 - t1) * (j + 0.5 + nEvents) / (nEvents + nCensored);
      ipd.push({ time: censorTime, event: 0, censor: 1 });
    }

    nRemaining = nAtRiskEnd;
  }

  // Add final censoring at end of follow-up
  const lastPoint = curve[curve.length - 1];
  const nFinalCensored = Math.round(totalN * lastPoint.survival);
  for (let j = 0; j < nFinalCensored; j++) {
    ipd.push({ time: lastPoint.time, event: 0, censor: 1 });
  }

  return ipd.sort((a, b) => a.time - b.time);
}

/**
 * Interpolate number at risk at given time
 */
function interpolateNRisk(nRisk, time) {
  if (!nRisk || nRisk.length === 0) return null;

  // Find bracketing points
  let lower = null, upper = null;
  for (const nr of nRisk) {
    if (nr.time <= time) lower = nr;
    if (nr.time >= time && !upper) upper = nr;
  }

  if (!lower && upper) return upper.n;
  if (lower && !upper) return lower.n;
  if (!lower && !upper) return null;
  if (lower.time === upper.time) return lower.n;

  // Linear interpolation
  const ratio = (time - lower.time) / (upper.time - lower.time);
  return Math.round(lower.n + ratio * (upper.n - lower.n));
}

/**
 * Estimate sample size from curve smoothness
 * Heuristic based on step sizes
 */
function estimateSampleSize(curve) {
  const steps = [];
  for (let i = 0; i < curve.length - 1; i++) {
    const step = curve[i].survival - curve[i + 1].survival;
    if (step > 0.001) {
      steps.push(step);
    }
  }

  if (steps.length === 0) return 100;

  // Median step size approximates 1/N
  const sortedSteps = steps.sort((a, b) => a - b);
  const medianStep = sortedSteps[Math.floor(sortedSteps.length / 2)];

  return Math.round(1 / medianStep);
}

/**
 * Optimize curve fit using Wasserstein distance
 * Adjusts reconstructed IPD to minimize distance to original digitized curve
 *
 * @param {Array} digitizedCurve - original digitized points
 * @param {number} totalN - estimated sample size
 * @param {object} options - { maxIter: 50, tolerance: 0.001 }
 * @returns {object} { ipd, reconstructedCurve, distance, iterations }
 */
export function optimizeReconstruction(digitizedCurve, totalN, options = {}) {
  const { maxIter = 50, tolerance = 0.001 } = options;

  let bestIPD = reconstructIPD(digitizedCurve, null, totalN);
  let bestCurve = ipdToKM(bestIPD);
  let bestDistance = wassersteinDistance(digitizedCurve, bestCurve);

  // Try different sample sizes around the estimate
  for (let delta = -10; delta <= 10; delta++) {
    const n = totalN + delta;
    if (n < 10) continue;

    const ipd = reconstructIPD(digitizedCurve, null, n);
    const curve = ipdToKM(ipd);
    const distance = wassersteinDistance(digitizedCurve, curve);

    if (distance < bestDistance) {
      bestIPD = ipd;
      bestCurve = curve;
      bestDistance = distance;
    }
  }

  // Fine-tune by adjusting event times
  let improved = true;
  let iterations = 0;

  while (improved && iterations < maxIter) {
    improved = false;
    iterations++;

    for (let i = 0; i < bestIPD.length; i++) {
      if (bestIPD[i].event !== 1) continue;

      const originalTime = bestIPD[i].time;

      // Try small adjustments
      for (const adj of [-0.5, -0.1, 0.1, 0.5]) {
        const newTime = originalTime + adj;
        if (newTime <= 0) continue;

        bestIPD[i].time = newTime;
        const newCurve = ipdToKM(bestIPD);
        const newDistance = wassersteinDistance(digitizedCurve, newCurve);

        if (newDistance < bestDistance - tolerance) {
          bestCurve = newCurve;
          bestDistance = newDistance;
          improved = true;
        } else {
          bestIPD[i].time = originalTime;
        }
      }
    }
  }

  return {
    ipd: bestIPD,
    reconstructedCurve: bestCurve,
    distance: bestDistance,
    iterations,
    totalN: bestIPD.filter(p => p.event === 1 || p.censor === 1).length
  };
}

/**
 * Convert IPD to Kaplan-Meier curve
 * @param {Array} ipd - [{time, event, censor}, ...]
 * @returns {Array} [{time, survival}, ...]
 */
export function ipdToKM(ipd) {
  if (!ipd || ipd.length === 0) return [];

  // Sort by time
  const sorted = [...ipd].sort((a, b) => a.time - b.time);

  // Get unique event times
  const eventTimes = [...new Set(sorted.filter(p => p.event === 1).map(p => p.time))].sort((a, b) => a - b);

  const curve = [{ time: 0, survival: 1 }];
  let nRisk = sorted.length;
  let survival = 1;
  let processed = 0;

  for (const t of eventTimes) {
    // Count events and censored before/at this time
    let events = 0;
    let censored = 0;

    for (let i = processed; i < sorted.length && sorted[i].time <= t; i++) {
      if (sorted[i].event === 1) events++;
      else censored++;
      processed++;
    }

    // Kaplan-Meier estimate
    // Handle censoring that occurs at exactly event time: censor after event
    const nCensoredBefore = sorted.filter((p, idx) =>
      idx < processed && p.censor === 1 && p.time < t
    ).length;

    nRisk -= nCensoredBefore;

    if (nRisk > 0 && events > 0) {
      survival *= (nRisk - events) / nRisk;
      curve.push({ time: t, survival });
    }

    nRisk -= events;
  }

  return curve;
}

/**
 * Calculate log-rank test statistic between two IPD datasets
 * @param {Array} ipd1 - treatment group IPD
 * @param {Array} ipd2 - control group IPD
 * @returns {object} { statistic, variance, z, pValue }
 */
export function logRankTest(ipd1, ipd2) {
  // Merge and get unique event times
  const allIPD = [
    ...ipd1.map(p => ({ ...p, group: 1 })),
    ...ipd2.map(p => ({ ...p, group: 2 }))
  ].sort((a, b) => a.time - b.time);

  const eventTimes = [...new Set(allIPD.filter(p => p.event === 1).map(p => p.time))].sort((a, b) => a - b);

  let O1 = 0, E1 = 0, variance = 0;
  let nRisk1 = ipd1.length;
  let nRisk2 = ipd2.length;

  for (const t of eventTimes) {
    // Events and at-risk at this time
    const events1 = ipd1.filter(p => p.event === 1 && p.time === t).length;
    const events2 = ipd2.filter(p => p.event === 1 && p.time === t).length;
    const totalEvents = events1 + events2;
    const totalRisk = nRisk1 + nRisk2;

    if (totalRisk > 0 && totalEvents > 0) {
      const expected1 = (nRisk1 / totalRisk) * totalEvents;
      O1 += events1;
      E1 += expected1;

      // Variance contribution
      if (totalRisk > 1) {
        variance += (nRisk1 * nRisk2 * totalEvents * (totalRisk - totalEvents)) /
                   (totalRisk * totalRisk * (totalRisk - 1));
      }
    }

    // Update at-risk counts
    nRisk1 -= ipd1.filter(p => p.time === t).length;
    nRisk2 -= ipd2.filter(p => p.time === t).length;
  }

  const z = variance > 0 ? (O1 - E1) / Math.sqrt(variance) : 0;
  const pValue = 2 * (1 - normalCDF(Math.abs(z)));

  return {
    observed: O1,
    expected: E1,
    variance,
    statistic: (O1 - E1) * (O1 - E1) / variance,
    z,
    pValue
  };
}

/**
 * Estimate hazard ratio from IPD using Cox-like approach
 * @param {Array} ipd1 - treatment group
 * @param {Array} ipd2 - control group
 * @returns {object} { hr, logHR, se, ci_lower, ci_upper, pValue }
 */
export function estimateHR(ipd1, ipd2) {
  const logRank = logRankTest(ipd1, ipd2);

  // Estimate log(HR) from log-rank
  // Under proportional hazards, Z ≈ sqrt(D) * log(HR) / 2
  // where D is total events
  const totalEvents = ipd1.filter(p => p.event === 1).length +
                      ipd2.filter(p => p.event === 1).length;

  if (totalEvents === 0) {
    return { error: 'No events observed' };
  }

  // Estimate using O - E / variance
  const logHR = (logRank.observed - logRank.expected) / logRank.variance;
  const se = 1 / Math.sqrt(logRank.variance);

  return {
    hr: Math.exp(logHR),
    logHR,
    se,
    ci_lower: Math.exp(logHR - 1.96 * se),
    ci_upper: Math.exp(logHR + 1.96 * se),
    pValue: logRank.pValue,
    totalEvents,
    observed: logRank.observed,
    expected: logRank.expected
  };
}

// Helper: Normal CDF
function normalCDF(x) {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);

  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
}

export default {
  wassersteinDistance,
  digitizePoints,
  cleanCurve,
  reconstructIPD,
  optimizeReconstruction,
  ipdToKM,
  logRankTest,
  estimateHR
};
