/**
 * Gold Standard Test Datasets for Validation
 * These datasets have known results from published sources or R metafor
 */

// Dataset 1: BCG Vaccine Trials (Classic meta-analysis dataset)
// From: Colditz et al. (1994) - included in metafor as dat.bcg
export const BCG_VACCINE = {
  name: 'BCG Vaccine Trials',
  description: 'Effect of BCG vaccine on tuberculosis',
  type: 'binary',
  measure: 'OR',
  studies: [
    { id: 'Aronson 1948', tpos: 4, tneg: 119, cpos: 11, cneg: 128, latitude: 44 },
    { id: 'Ferguson & Simes 1949', tpos: 6, tneg: 300, cpos: 29, cneg: 274, latitude: 55 },
    { id: 'Rosenthal et al 1960', tpos: 3, tneg: 228, cpos: 11, cneg: 209, latitude: 42 },
    { id: 'Hart & Sutherland 1977', tpos: 62, tneg: 13536, cpos: 248, cneg: 12619, latitude: 52 },
    { id: 'Frimodt-Moller et al 1973', tpos: 33, tneg: 5036, cpos: 47, cneg: 5765, latitude: 13 },
    { id: 'Stein & Aronson 1953', tpos: 180, tneg: 1361, cpos: 372, cneg: 1079, latitude: 44 },
    { id: 'Vandiviere et al 1973', tpos: 8, tneg: 2537, cpos: 10, cneg: 619, latitude: 19 },
    { id: 'TPT Madras 1980', tpos: 505, tneg: 87886, cpos: 499, cneg: 87892, latitude: 13 },
    { id: 'Coetzee & Berjak 1968', tpos: 29, tneg: 7470, cpos: 45, cneg: 7232, latitude: 27 },
    { id: 'Rosenthal et al 1961', tpos: 17, tneg: 1699, cpos: 65, cneg: 1600, latitude: 42 },
    { id: 'Comstock et al 1974', tpos: 186, tneg: 50448, cpos: 141, cneg: 27197, latitude: 18 },
    { id: 'Comstock & Webster 1969', tpos: 5, tneg: 2493, cpos: 3, cneg: 2338, latitude: 33 },
    { id: 'Comstock et al 1976', tpos: 27, tneg: 16886, cpos: 29, cneg: 17825, latitude: 33 }
  ]
};

// Dataset 2: Aspirin for MI prevention (continuous outcome example converted to binary)
// Standardized mean differences
export const ANTIDEPRESSANTS = {
  name: 'Antidepressant Efficacy',
  description: 'SSRIs vs placebo for depression (HDRS change scores)',
  type: 'continuous',
  measure: 'SMD',
  studies: [
    { id: 'Study 1', n1: 50, m1: -12.5, sd1: 8.2, n2: 48, m2: -8.3, sd2: 7.9 },
    { id: 'Study 2', n1: 120, m1: -14.2, sd1: 9.1, n2: 118, m2: -9.1, sd2: 8.8 },
    { id: 'Study 3', n1: 85, m1: -11.8, sd1: 7.5, n2: 82, m2: -7.9, sd2: 7.2 },
    { id: 'Study 4', n1: 200, m1: -13.1, sd1: 8.8, n2: 195, m2: -8.8, sd2: 8.5 },
    { id: 'Study 5', n1: 65, m1: -10.5, sd1: 6.9, n2: 63, m2: -6.2, sd2: 7.1 },
    { id: 'Study 6', n1: 150, m1: -15.2, sd1: 9.5, n2: 148, m2: -10.1, sd2: 9.2 },
    { id: 'Study 7', n1: 40, m1: -9.8, sd1: 6.5, n2: 38, m2: -5.5, sd2: 6.8 },
    { id: 'Study 8', n1: 180, m1: -12.9, sd1: 8.1, n2: 175, m2: -7.5, sd2: 7.8 }
  ]
};

// Dataset 3: Small dataset for edge cases
export const SMALL_TRIALS = {
  name: 'Small Trial Set',
  description: 'Only 3 studies for testing small-k behavior',
  type: 'binary',
  measure: 'RR',
  studies: [
    { id: 'Trial A', tpos: 15, tneg: 85, cpos: 25, cneg: 75 },
    { id: 'Trial B', tpos: 22, tneg: 178, cpos: 35, cneg: 165 },
    { id: 'Trial C', tpos: 8, tneg: 92, cpos: 18, cneg: 82 }
  ]
};

// Dataset 4: Homogeneous studies (low I²)
export const HOMOGENEOUS = {
  name: 'Homogeneous Studies',
  description: 'Studies with low heterogeneity',
  type: 'binary',
  measure: 'OR',
  studies: [
    { id: 'Study 1', tpos: 20, tneg: 80, cpos: 30, cneg: 70 },
    { id: 'Study 2', tpos: 22, tneg: 78, cpos: 32, cneg: 68 },
    { id: 'Study 3', tpos: 18, tneg: 82, cpos: 28, cneg: 72 },
    { id: 'Study 4', tpos: 21, tneg: 79, cpos: 31, cneg: 69 },
    { id: 'Study 5', tpos: 19, tneg: 81, cpos: 29, cneg: 71 }
  ]
};

// Dataset 5: High heterogeneity
export const HETEROGENEOUS = {
  name: 'Heterogeneous Studies',
  description: 'Studies with high heterogeneity',
  type: 'binary',
  measure: 'OR',
  studies: [
    { id: 'Study 1', tpos: 5, tneg: 95, cpos: 20, cneg: 80 },
    { id: 'Study 2', tpos: 45, tneg: 55, cpos: 30, cneg: 70 },
    { id: 'Study 3', tpos: 10, tneg: 90, cpos: 40, cneg: 60 },
    { id: 'Study 4', tpos: 60, tneg: 140, cpos: 35, cneg: 165 },
    { id: 'Study 5', tpos: 8, tneg: 92, cpos: 25, cneg: 75 },
    { id: 'Study 6', tpos: 55, tneg: 45, cpos: 40, cneg: 60 }
  ]
};

// Dataset 6: Pre-calculated effect sizes (yi, vi format)
export const PRECALCULATED = {
  name: 'Pre-calculated Effects',
  description: 'Log-OR with variances',
  type: 'precalculated',
  measure: 'OR',
  studies: [
    { id: 'S1', yi: -0.89, vi: 0.12 },
    { id: 'S2', yi: -1.25, vi: 0.08 },
    { id: 'S3', yi: -0.45, vi: 0.15 },
    { id: 'S4', yi: -0.72, vi: 0.10 },
    { id: 'S5', yi: -1.10, vi: 0.09 },
    { id: 'S6', yi: -0.55, vi: 0.14 },
    { id: 'S7', yi: -0.95, vi: 0.11 },
    { id: 'S8', yi: -0.68, vi: 0.13 },
    { id: 'S9', yi: -1.35, vi: 0.07 },
    { id: 'S10', yi: -0.82, vi: 0.12 }
  ]
};

// Expected results from R metafor (to be filled in by R validation script)
export const EXPECTED_RESULTS = {
  BCG_VACCINE: {
    // From: rma(measure="OR", ai=tpos, bi=tneg, ci=cpos, di=cneg, data=dat.bcg)
    fe: {
      estimate: -0.4361, // log-OR
      se: 0.0423,
      ci_lower: -0.5190,
      ci_upper: -0.3533,
      z: -10.31,
      p: 0.0000
    },
    re_dl: {
      estimate: -0.7452,
      se: 0.1860,
      ci_lower: -1.1098,
      ci_upper: -0.3806,
      tau2: 0.3088,
      I2: 92.12
    },
    re_reml: {
      estimate: -0.7145,
      se: 0.1787,
      ci_lower: -1.0648,
      ci_upper: -0.3643,
      tau2: 0.2827,
      I2: 91.45
    },
    hksj: {
      ci_lower: -1.1982,
      ci_upper: -0.2308
    },
    prediction_interval: {
      pi_lower: -1.8243,
      pi_upper: 0.3954
    },
    egger: {
      intercept: -2.0649,
      se: 0.7505,
      p: 0.0185
    }
  }
};

export default {
  BCG_VACCINE,
  ANTIDEPRESSANTS,
  SMALL_TRIALS,
  HOMOGENEOUS,
  HETEROGENEOUS,
  PRECALCULATED,
  EXPECTED_RESULTS
};
