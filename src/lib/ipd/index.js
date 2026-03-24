/**
 * IPD Meta-Analysis Module - THE WORLD'S MOST COMPREHENSIVE
 *
 * Complete suite for individual patient data meta-analysis including:
 * - KM curve digitization with Wasserstein distance optimization
 * - One-stage mixed-effects models
 * - Two-stage analysis
 * - IPD + aggregate data synthesis
 * - Time-to-event outcome analysis
 * - ADVANCED: Flexible parametric (Royston-Parmar) models
 * - ADVANCED: Cure fraction and competing risks models
 * - ADVANCED: Treatment-covariate interactions with ecological bias separation
 * - ADVANCED: Multiple imputation (MICE) for missing IPD
 * - ADVANCED: Network IPD meta-analysis (one-stage and two-stage)
 * - ADVANCED: IPD-specific publication bias tests
 * - ADVANCED: Bootstrap and permutation inference
 *
 * SUPERIOR TO IPDMETAN: Features not available in Stata ipdmetan:
 * - Wasserstein distance for KM curve matching
 * - Within-study vs across-study interaction decomposition
 * - Network meta-analysis with IPD
 * - Cure fraction models
 * - Competing risks analysis (Fine-Gray)
 * - Wild cluster bootstrap
 * - p-curve analysis for IPD
 *
 * References:
 * - Stewart LA, Tierney JF (2002). To IPD or not to IPD? BMJ.
 * - Riley RD, et al. (2010). Meta-analysis of individual participant data.
 * - Debray TPA, et al. (2015). Get real in individual patient data meta-analysis.
 * - Guyot P, et al. (2012). Enhanced secondary analysis of survival data.
 * - Royston P, Parmar MKB (2002). Flexible parametric proportional-hazards models.
 * - Fisher DJ, et al. (2017). Meta-analytical methods for examining treatment-covariate interactions.
 * - Resche-Rigon M, White IR (2018). Multiple imputation by chained equations for multilevel data.
 * - Debray TPA, et al. (2018). Individual participant data meta-analysis for a binary outcome.
 * - Cameron AC, et al. (2008). Bootstrap-based improvements for inference with clustered errors.
 */

// KM Curve Digitization
export {
  wassersteinDistance,
  digitizePoints,
  cleanCurve,
  reconstructIPD,
  optimizeReconstruction,
  ipdToKM,
  logRankTest as kmLogRankTest,
  estimateHR as kmEstimateHR
} from './km-digitizer.js';

// One-Stage Models
export {
  linearMixedModel,
  logisticMixedModel,
  survivalMixedModel
} from './one-stage.js';

// Two-Stage Models
export {
  twoStageContinuous,
  twoStageBinary,
  twoStageSurvival
} from './two-stage.js';

// IPD + AD Synthesis
export {
  synthesizeTwoStage,
  synthesizeHierarchical,
  synthesizeBayesian,
  testConsistency
} from './ipd-ad-synthesis.js';

// Survival Analysis
export {
  kaplanMeier,
  logRankTest,
  coxPH,
  restrictedMeanSurvivalTime,
  compareRMST,
  extractHR,
  exponentialModel
} from './survival.js';

// Advanced Survival Models
export {
  flexibleParametricModel,
  landmarkAnalysis,
  cureFractionModel,
  competingRisksAnalysis
} from './advanced-survival.js';

// Treatment-Covariate Interactions
export {
  analyzeInteraction,
  multipleInteractions
} from './interactions.js';

// Multiple Imputation
export {
  multipleImputation,
  rubinsRules,
  poolRegressionResults,
  poolHazardRatios
} from './multiple-imputation.js';

// Network IPD Meta-Analysis
export {
  oneStageNetworkIPD,
  twoStageNetworkIPD,
  mixedIPDADNetwork
} from './network-ipd.js';

// Publication Bias
export {
  assessPublicationBias,
  eggerTest,
  petersTest,
  beggTest,
  trimAndFill,
  pCurveAnalysis,
  copasSelectionModel
} from './publication-bias.js';

// Bootstrap and Permutation
export {
  clusterBootstrap,
  patientBootstrap,
  wildClusterBootstrap,
  permutationTest,
  stratifiedPermutationTest,
  bootstrapHeterogeneity,
  parametricBootstrap
} from './resampling.js';

// Convenience re-exports
import kmDigitizer from './km-digitizer.js';
import oneStage from './one-stage.js';
import twoStage from './two-stage.js';
import ipdAdSynthesis from './ipd-ad-synthesis.js';
import survival from './survival.js';
import advancedSurvival from './advanced-survival.js';
import interactions from './interactions.js';
import multipleImputation from './multiple-imputation.js';
import networkIPD from './network-ipd.js';
import publicationBias from './publication-bias.js';
import resampling from './resampling.js';

export const modules = {
  kmDigitizer,
  oneStage,
  twoStage,
  ipdAdSynthesis,
  survival,
  advancedSurvival,
  interactions,
  multipleImputation,
  networkIPD,
  publicationBias,
  resampling
};

/**
 * High-level IPD meta-analysis wrapper
 *
 * @param {object} input
 *   - ipd: Individual patient data [{studyId, ...}, ...]
 *   - ad: Aggregate data (optional) [{studyId, yi, vi, ...}, ...]
 * @param {object} options
 *   - outcomeType: 'continuous', 'binary', 'survival'
 *   - approach: 'one-stage', 'two-stage', 'hybrid'
 *   - method: 'DL', 'PM', 'REML'
 *   - hksj: true/false
 * @returns {object} Complete analysis results
 */
export function ipdMetaAnalysis(input, options = {}) {
  const {
    outcomeType = 'continuous',
    approach = 'two-stage',
    method = 'DL',
    hksj = true,
    outcomeVar = 'outcome',
    eventVar = 'event',
    timeVar = 'time',
    treatmentVar = 'treatment',
    studyVar = 'studyId',
    covariates = [],
    randomSlope = true,
    measure = 'OR'
  } = options;

  const { ipd = [], ad = [] } = input;

  if (ipd.length === 0 && ad.length === 0) {
    return { error: 'No data provided' };
  }

  const results = {
    input: {
      nIPDRecords: ipd.length,
      nIPDStudies: [...new Set(ipd.map(d => d[studyVar]))].length,
      nADStudies: ad.length,
      outcomeType,
      approach,
      method
    }
  };

  // Run appropriate analysis
  if (approach === 'one-stage' && ipd.length > 0) {
    // One-stage analysis (IPD only)
    if (outcomeType === 'continuous') {
      results.analysis = oneStage.linearMixedModel(ipd, {
        outcomeVar, treatmentVar, studyVar, covariates, randomSlope
      });
    } else if (outcomeType === 'binary') {
      results.analysis = oneStage.logisticMixedModel(ipd, {
        outcomeVar: eventVar, treatmentVar, studyVar, covariates, randomSlope
      });
    } else if (outcomeType === 'survival') {
      results.analysis = oneStage.survivalMixedModel(ipd, {
        timeVar, eventVar, treatmentVar, studyVar, covariates
      });
    }
  } else if (approach === 'two-stage') {
    if (ad.length > 0 && ipd.length > 0) {
      // Combined IPD + AD synthesis
      results.analysis = ipdAdSynthesis.synthesizeTwoStage(
        { ipd, ad },
        { outcomeType, outcomeVar, eventVar, timeVar, treatmentVar, studyVar, method, hksj, measure }
      );
    } else if (ipd.length > 0) {
      // IPD-only two-stage
      if (outcomeType === 'continuous') {
        results.analysis = twoStage.twoStageContinuous(ipd, {
          outcomeVar, treatmentVar, studyVar, covariates, method, hksj
        });
      } else if (outcomeType === 'binary') {
        results.analysis = twoStage.twoStageBinary(ipd, {
          outcomeVar: eventVar, treatmentVar, studyVar, measure, method, hksj
        });
      } else if (outcomeType === 'survival') {
        results.analysis = twoStage.twoStageSurvival(ipd, {
          timeVar, eventVar, treatmentVar, studyVar, method, hksj
        });
      }
    }
  } else if (approach === 'hybrid') {
    // Hierarchical synthesis
    results.analysis = ipdAdSynthesis.synthesizeHierarchical(
      { ipd, ad },
      { outcomeType, outcomeVar, treatmentVar, studyVar }
    );
  }

  // Add consistency test if both IPD and AD available
  if (ipd.length > 0 && ad.length > 0) {
    results.consistency = ipdAdSynthesis.testConsistency(
      { ipd, ad },
      { outcomeType, outcomeVar, treatmentVar, studyVar }
    );
  }

  return results;
}

export default {
  ipdMetaAnalysis,
  modules,
  // Direct access to submodules
  kmDigitizer,
  oneStage,
  twoStage,
  ipdAdSynthesis,
  survival,
  // Advanced modules - BETTER THAN IPDMETAN
  advancedSurvival,
  interactions,
  multipleImputation,
  networkIPD,
  publicationBias,
  resampling
};
