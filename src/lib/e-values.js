/**
 * E-Value Calculations for Unmeasured Confounding
 *
 * Reference: VanderWeele & Ding (2017) Ann Intern Med
 *
 * E-value: The minimum strength of association on the risk ratio scale
 * that an unmeasured confounder would need to have with both the treatment
 * and outcome to fully explain away the observed effect.
 */

/**
 * Calculate E-value for a relative measure (RR, OR, HR)
 *
 * @param {number} estimate - Point estimate (RR scale)
 * @param {number} ci_lower - Lower CI bound (optional)
 * @param {number} ci_upper - Upper CI bound (optional)
 * @param {string} type - 'RR', 'OR', 'HR'
 * @param {number} baselineRisk - For OR to RR conversion (optional, default 0.1)
 * @returns {object} E-value results
 */
export function calculateEValue(estimate, ci_lower = null, ci_upper = null, type = 'RR', baselineRisk = 0.1) {
  // Convert to RR scale if needed
  let rr = estimate;
  let rrCILower = ci_lower;
  let rrCIUpper = ci_upper;

  if (type.toUpperCase() === 'OR') {
    // Convert OR to RR (approximate)
    rr = orToRR(estimate, baselineRisk);
    if (ci_lower !== null) rrCILower = orToRR(ci_lower, baselineRisk);
    if (ci_upper !== null) rrCIUpper = orToRR(ci_upper, baselineRisk);
  } else if (type.toUpperCase() === 'HR') {
    // HR ≈ RR for rare outcomes; use as-is for common assumption
    rr = estimate;
    rrCILower = ci_lower;
    rrCIUpper = ci_upper;
  }

  // For effects < 1, we invert (E-value is symmetric)
  const effectProtective = rr < 1;
  if (effectProtective) {
    const temp = rrCILower;
    rrCILower = rrCIUpper !== null ? 1 / rrCIUpper : null;
    rrCIUpper = temp !== null ? 1 / temp : null;
    rr = 1 / rr;
  }

  // Calculate E-value for point estimate
  const eValuePoint = computeEValue(rr);

  // Calculate E-value for CI bound closest to null (1)
  let eValueCI = null;
  let ciBoundUsed = null;

  if (rrCILower !== null && rrCIUpper !== null) {
    // For RR > 1, use lower bound; for RR < 1 (inverted), use upper
    const boundClosestTo1 = rr > 1 ? Math.max(rrCILower, 1) : Math.min(rrCIUpper, 1);

    if (boundClosestTo1 > 1) {
      eValueCI = computeEValue(boundClosestTo1);
      ciBoundUsed = effectProtective ? 'upper' : 'lower';
    } else {
      // CI crosses null - E-value for CI is 1
      eValueCI = 1;
      ciBoundUsed = 'null';
    }
  }

  return {
    type,
    originalEstimate: estimate,
    originalCILower: ci_lower,
    originalCIUpper: ci_upper,
    rrEquivalent: effectProtective ? 1 / rr : rr,
    effectDirection: effectProtective ? 'protective' : 'harmful',
    eValuePoint,
    eValueCI,
    ciBoundUsed,
    interpretation: interpretEValue(eValuePoint, eValueCI)
  };
}

/**
 * Core E-value formula
 * E = RR + sqrt(RR * (RR - 1))
 */
function computeEValue(rr) {
  if (rr <= 1) return 1;
  return rr + Math.sqrt(rr * (rr - 1));
}

/**
 * Convert OR to RR given baseline risk
 * RR = OR / (1 - p0 + p0 * OR)
 */
function orToRR(or, p0) {
  return or / (1 - p0 + p0 * or);
}

/**
 * Calculate E-value for SMD (standardized mean difference)
 * Uses conversion: RR ≈ exp(0.91 × SMD)
 *
 * @param {number} smd - Standardized mean difference
 * @param {number} smdCILower - Lower CI
 * @param {number} smdCIUpper - Upper CI
 */
export function calculateEValueSMD(smd, smdCILower = null, smdCIUpper = null) {
  // Convert SMD to RR scale using VanderWeele approximation
  const rr = Math.exp(0.91 * smd);
  const rrCILower = smdCILower !== null ? Math.exp(0.91 * smdCILower) : null;
  const rrCIUpper = smdCIUpper !== null ? Math.exp(0.91 * smdCIUpper) : null;

  const result = calculateEValue(rr, rrCILower, rrCIUpper, 'RR');

  return {
    ...result,
    originalSMD: smd,
    originalSMDCILower: smdCILower,
    originalSMDCIUpper: smdCIUpper,
    conversion: 'RR ≈ exp(0.91 × SMD)'
  };
}

/**
 * Calculate E-value for risk difference
 * Requires baseline risk to convert to RR
 *
 * Note: This conversion is only valid when:
 * - Baseline risk (p0) is between 0 and 1
 * - Resulting risk (p1 = p0 + RD) is between 0 and 1
 */
export function calculateEValueRD(rd, rdCILower, rdCIUpper, baselineRisk) {
  // Validate baseline risk
  if (baselineRisk <= 0 || baselineRisk >= 1) {
    return {
      error: 'Baseline risk must be between 0 and 1 (exclusive)',
      valid: false
    };
  }

  // Check if RD is within valid bounds for the given baseline
  const minValidRD = -baselineRisk;
  const maxValidRD = 1 - baselineRisk;

  if (rd < minValidRD || rd > maxValidRD) {
    return {
      error: 'Risk difference outside valid bounds for baseline risk',
      valid: false,
      validBounds: { min: minValidRD, max: maxValidRD }
    };
  }

  // Convert RD to RR: p1 = p0 + RD, so RR = p1/p0 = 1 + RD/p0
  const rr = 1 + rd / baselineRisk;
  
  // For CI bounds, clamp to valid range
  let rrCILower = null;
  let rrCIUpper = null;
  let boundsTruncated = false;

  if (rdCILower !== null) {
    const clampedLower = Math.max(rdCILower, minValidRD);
    rrCILower = 1 + clampedLower / baselineRisk;
    if (clampedLower !== rdCILower) boundsTruncated = true;
  }

  if (rdCIUpper !== null) {
    const clampedUpper = Math.min(rdCIUpper, maxValidRD);
    rrCIUpper = 1 + clampedUpper / baselineRisk;
    if (clampedUpper !== rdCIUpper) boundsTruncated = true;
  }

  const result = calculateEValue(rr, rrCILower, rrCIUpper, 'RR');

  return {
    ...result,
    valid: true,
    originalRD: rd,
    baselineRisk,
    validBounds: { min: minValidRD, max: maxValidRD },
    boundsTruncated
  };
}

/**
 * Calculate minimum confounding strength needed
 * Given observed RR and true RR (e.g., null = 1)
 */
export function minimumConfoundingStrength(observedRR, trueRR = 1) {
  if (observedRR === trueRR) return 1;

  const ratio = observedRR / trueRR;
  return computeEValue(ratio > 1 ? ratio : 1 / ratio);
}

/**
 * Calculate bias factor given confounder-exposure and confounder-outcome associations
 *
 * @param {number} rrXU - RR for confounder-exposure association
 * @param {number} rrUY - RR for confounder-outcome association
 */
export function biasFactor(rrXU, rrUY) {
  // Bias factor B = (RRxu × RRuy) / (RRxu + RRuy - 1)
  return (rrXU * rrUY) / (rrXU + rrUY - 1);
}

/**
 * Maximum bias factor (when both associations equal E-value)
 */
export function maxBiasFactor(eValue) {
  return biasFactor(eValue, eValue);
}

/**
 * Sensitivity analysis: what true effect remains after accounting for confounding
 *
 * @param {number} observedRR - Observed effect estimate
 * @param {number} rrXU - Assumed confounder-exposure association
 * @param {number} rrUY - Assumed confounder-outcome association
 */
export function adjustedEffect(observedRR, rrXU, rrUY) {
  const B = biasFactor(rrXU, rrUY);
  return observedRR / B;
}

/**
 * Generate sensitivity contour data
 * For plotting sensitivity of conclusions to unmeasured confounding
 */
export function sensitivityContour(observedRR, gridSize = 20, maxStrength = 5) {
  const contours = [];
  const step = (maxStrength - 1) / gridSize;

  for (let rrXU = 1; rrXU <= maxStrength; rrXU += step) {
    for (let rrUY = 1; rrUY <= maxStrength; rrUY += step) {
      const adjusted = adjustedEffect(observedRR, rrXU, rrUY);
      contours.push({
        rrXU,
        rrUY,
        adjustedRR: adjusted,
        crossesNull: adjusted <= 1
      });
    }
  }

  return contours;
}

/**
 * Interpretation of E-value
 */
function interpretEValue(eValuePoint, eValueCI) {
  const interpretations = [];

  // Point estimate interpretation
  if (eValuePoint < 1.5) {
    interpretations.push('Very weak robustness: A weak unmeasured confounder could explain the observed effect.');
  } else if (eValuePoint < 2) {
    interpretations.push('Weak robustness: A moderate unmeasured confounder could explain the observed effect.');
  } else if (eValuePoint < 3) {
    interpretations.push('Moderate robustness: A fairly strong unmeasured confounder would be needed to explain the effect.');
  } else if (eValuePoint < 4) {
    interpretations.push('Good robustness: A strong unmeasured confounder would be needed to explain the effect.');
  } else {
    interpretations.push('Strong robustness: A very strong unmeasured confounder would be needed to explain the effect.');
  }

  // CI interpretation
  if (eValueCI !== null) {
    if (eValueCI === 1) {
      interpretations.push('Caution: The confidence interval includes the null, so even without unmeasured confounding the effect may be null.');
    } else if (eValueCI < 1.5) {
      interpretations.push('CI E-value suggests the statistical significance is not robust to even weak confounding.');
    } else if (eValueCI >= 2) {
      interpretations.push('CI E-value suggests the statistical significance is reasonably robust to confounding.');
    }
  }

  return interpretations.join(' ');
}

/**
 * Compare E-value to known confounder associations
 * Reference values from literature
 */
export const referenceEValues = {
  // Smoking associations
  smoking_lung_cancer: { rrUY: 10, description: 'Smoking → Lung cancer' },
  smoking_cardiovascular: { rrUY: 2.5, description: 'Smoking → Cardiovascular disease' },

  // Socioeconomic status
  ses_mortality: { rrUY: 2.0, description: 'Low SES → All-cause mortality' },

  // Obesity
  obesity_diabetes: { rrUY: 7.0, description: 'Obesity → Type 2 diabetes' },
  obesity_mortality: { rrUY: 1.5, description: 'Obesity → All-cause mortality' },

  // General guidance
  weak: { rrUY: 1.5, description: 'Weak association' },
  moderate: { rrUY: 2.0, description: 'Moderate association' },
  strong: { rrUY: 3.0, description: 'Strong association' },
  very_strong: { rrUY: 5.0, description: 'Very strong association' }
};

/**
 * Check if E-value exceeds known confounder strengths
 */
export function compareToReference(eValue, references = ['smoking_cardiovascular', 'obesity_mortality']) {
  return references.map(ref => {
    const refData = referenceEValues[ref];
    if (!refData) return null;

    return {
      reference: ref,
      description: refData.description,
      referenceStrength: refData.rrUY,
      exceeds: eValue > refData.rrUY,
      interpretation: eValue > refData.rrUY
        ? `E-value exceeds ${refData.description} strength`
        : `E-value does not exceed ${refData.description} strength`
    };
  }).filter(Boolean);
}

export default {
  calculateEValue,
  calculateEValueSMD,
  calculateEValueRD,
  minimumConfoundingStrength,
  biasFactor,
  maxBiasFactor,
  adjustedEffect,
  sensitivityContour,
  referenceEValues,
  compareToReference
};
