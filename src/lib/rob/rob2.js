/**
 * ROB 2.0 - Revised Cochrane Risk of Bias Tool for Randomized Trials
 *
 * Reference: Sterne JAC, et al. RoB 2: a revised tool for assessing risk of bias
 * in randomised trials. BMJ 2019; 366: l4898
 *
 * This implementation covers all 5 domains with signaling questions and
 * algorithmic judgment derivation.
 */

// Response options for signaling questions
export const RESPONSE_OPTIONS = {
  YES: 'Y',
  PROBABLY_YES: 'PY',
  NO: 'N',
  PROBABLY_NO: 'PN',
  NO_INFORMATION: 'NI',
  NOT_APPLICABLE: 'NA'
};

// Risk of bias judgments
export const JUDGMENT = {
  LOW: 'Low',
  SOME_CONCERNS: 'Some concerns',
  HIGH: 'High'
};

// Domain definitions with signaling questions
export const ROB2_DOMAINS = {
  D1: {
    id: 'D1',
    name: 'Randomization process',
    description: 'Risk of bias arising from the randomization process',
    questions: [
      {
        id: '1.1',
        text: 'Was the allocation sequence random?',
        guidance: 'Consider whether the method used to generate the allocation sequence was truly random (e.g., computer-generated random numbers, random number tables).'
      },
      {
        id: '1.2',
        text: 'Was the allocation sequence concealed until participants were enrolled and assigned to interventions?',
        guidance: 'Consider whether the allocation sequence was concealed from those enrolling participants.'
      },
      {
        id: '1.3',
        text: 'Did baseline differences between intervention groups suggest a problem with the randomization process?',
        guidance: 'Consider whether there are baseline imbalances that suggest problems with randomization.'
      }
    ],
    algorithm: (responses) => {
      const q1 = responses['1.1'];
      const q2 = responses['1.2'];
      const q3 = responses['1.3'];

      // If there are baseline imbalances suggesting problems
      if (q3 === RESPONSE_OPTIONS.YES || q3 === RESPONSE_OPTIONS.PROBABLY_YES) {
        return JUDGMENT.HIGH;
      }

      // If allocation was random AND concealed
      if ((q1 === RESPONSE_OPTIONS.YES || q1 === RESPONSE_OPTIONS.PROBABLY_YES) &&
          (q2 === RESPONSE_OPTIONS.YES || q2 === RESPONSE_OPTIONS.PROBABLY_YES)) {
        return JUDGMENT.LOW;
      }

      // If no information on key aspects
      if (q1 === RESPONSE_OPTIONS.NO_INFORMATION || q2 === RESPONSE_OPTIONS.NO_INFORMATION) {
        return JUDGMENT.SOME_CONCERNS;
      }

      // If allocation was not random or not concealed
      if (q1 === RESPONSE_OPTIONS.NO || q1 === RESPONSE_OPTIONS.PROBABLY_NO ||
          q2 === RESPONSE_OPTIONS.NO || q2 === RESPONSE_OPTIONS.PROBABLY_NO) {
        return JUDGMENT.HIGH;
      }

      return JUDGMENT.SOME_CONCERNS;
    }
  },

  D2: {
    id: 'D2',
    name: 'Deviations from intended interventions',
    description: 'Risk of bias due to deviations from the intended interventions (effect of assignment)',
    questions: [
      {
        id: '2.1',
        text: 'Were participants aware of their assigned intervention during the trial?',
        guidance: 'Consider whether blinding of participants was used.'
      },
      {
        id: '2.2',
        text: 'Were carers and people delivering the interventions aware of participants\' assigned intervention during the trial?',
        guidance: 'Consider whether those delivering the intervention were blinded.'
      },
      {
        id: '2.3',
        text: 'If Y/PY/NI to 2.1 or 2.2: Were there deviations from the intended intervention that arose because of the trial context?',
        guidance: 'Consider protocol deviations that occurred due to awareness of intervention assignment.'
      },
      {
        id: '2.4',
        text: 'If Y/PY to 2.3: Were these deviations likely to have affected the outcome?',
        guidance: 'Consider whether deviations could plausibly affect the outcome.'
      },
      {
        id: '2.5',
        text: 'If Y/PY/NI to 2.4: Were these deviations from intended intervention balanced between groups?',
        guidance: 'Consider whether deviations occurred similarly in both groups.'
      },
      {
        id: '2.6',
        text: 'Was an appropriate analysis used to estimate the effect of assignment to intervention?',
        guidance: 'For effect of assignment, intention-to-treat analysis is typically appropriate.'
      },
      {
        id: '2.7',
        text: 'If N/PN/NI to 2.6: Was there potential for a substantial impact (on the result) of the failure to analyse participants in the group to which they were randomized?',
        guidance: 'Consider the impact of per-protocol or other analyses that excluded randomized participants.'
      }
    ],
    algorithm: (responses) => {
      const q21 = responses['2.1'];
      const q22 = responses['2.2'];
      const q23 = responses['2.3'];
      const q24 = responses['2.4'];
      const q25 = responses['2.5'];
      const q26 = responses['2.6'];
      const q27 = responses['2.7'];

      // Check blinding first
      const participantsBlinded = q21 === RESPONSE_OPTIONS.NO || q21 === RESPONSE_OPTIONS.PROBABLY_NO;
      const carersBlinded = q22 === RESPONSE_OPTIONS.NO || q22 === RESPONSE_OPTIONS.PROBABLY_NO;

      // If both blinded and ITT analysis used
      if (participantsBlinded && carersBlinded &&
          (q26 === RESPONSE_OPTIONS.YES || q26 === RESPONSE_OPTIONS.PROBABLY_YES)) {
        return JUDGMENT.LOW;
      }

      // If there were deviations that affected outcome and were unbalanced
      if ((q24 === RESPONSE_OPTIONS.YES || q24 === RESPONSE_OPTIONS.PROBABLY_YES) &&
          (q25 === RESPONSE_OPTIONS.NO || q25 === RESPONSE_OPTIONS.PROBABLY_NO)) {
        return JUDGMENT.HIGH;
      }

      // If inappropriate analysis with substantial impact
      if ((q26 === RESPONSE_OPTIONS.NO || q26 === RESPONSE_OPTIONS.PROBABLY_NO) &&
          (q27 === RESPONSE_OPTIONS.YES || q27 === RESPONSE_OPTIONS.PROBABLY_YES)) {
        return JUDGMENT.HIGH;
      }

      // No deviations or appropriate analysis
      if ((q23 === RESPONSE_OPTIONS.NO || q23 === RESPONSE_OPTIONS.PROBABLY_NO) &&
          (q26 === RESPONSE_OPTIONS.YES || q26 === RESPONSE_OPTIONS.PROBABLY_YES)) {
        return JUDGMENT.LOW;
      }

      return JUDGMENT.SOME_CONCERNS;
    }
  },

  D3: {
    id: 'D3',
    name: 'Missing outcome data',
    description: 'Risk of bias due to missing outcome data',
    questions: [
      {
        id: '3.1',
        text: 'Were data for this outcome available for all, or nearly all, participants randomized?',
        guidance: 'Consider whether outcome data were available for >95% of participants.'
      },
      {
        id: '3.2',
        text: 'If N/PN/NI to 3.1: Is there evidence that the result was not biased by missing outcome data?',
        guidance: 'Consider sensitivity analyses or other evidence that missing data did not bias results.'
      },
      {
        id: '3.3',
        text: 'If N/PN to 3.2: Could missingness in the outcome depend on its true value?',
        guidance: 'Consider whether the reason for missing data could be related to the outcome.'
      },
      {
        id: '3.4',
        text: 'If Y/PY/NI to 3.3: Is it likely that missingness in the outcome depended on its true value?',
        guidance: 'Consider the plausibility of missingness being related to outcome.'
      }
    ],
    algorithm: (responses) => {
      const q31 = responses['3.1'];
      const q32 = responses['3.2'];
      const q33 = responses['3.3'];
      const q34 = responses['3.4'];

      // Data available for (nearly) all participants
      if (q31 === RESPONSE_OPTIONS.YES || q31 === RESPONSE_OPTIONS.PROBABLY_YES) {
        return JUDGMENT.LOW;
      }

      // Evidence that result not biased
      if (q32 === RESPONSE_OPTIONS.YES || q32 === RESPONSE_OPTIONS.PROBABLY_YES) {
        return JUDGMENT.LOW;
      }

      // Missingness unlikely to depend on true value
      if (q33 === RESPONSE_OPTIONS.NO || q33 === RESPONSE_OPTIONS.PROBABLY_NO) {
        return JUDGMENT.LOW;
      }

      // Missingness likely depends on true value
      if (q34 === RESPONSE_OPTIONS.YES || q34 === RESPONSE_OPTIONS.PROBABLY_YES) {
        return JUDGMENT.HIGH;
      }

      return JUDGMENT.SOME_CONCERNS;
    }
  },

  D4: {
    id: 'D4',
    name: 'Measurement of the outcome',
    description: 'Risk of bias in measurement of the outcome',
    questions: [
      {
        id: '4.1',
        text: 'Was the method of measuring the outcome inappropriate?',
        guidance: 'Consider whether the outcome measure used was valid and reliable.'
      },
      {
        id: '4.2',
        text: 'Could measurement or ascertainment of the outcome have differed between intervention groups?',
        guidance: 'Consider whether the same methods were used in all groups.'
      },
      {
        id: '4.3',
        text: 'If N/PN/NI to 4.1 and 4.2: Were outcome assessors aware of the intervention received by study participants?',
        guidance: 'Consider whether those measuring outcomes were blinded.'
      },
      {
        id: '4.4',
        text: 'If Y/PY/NI to 4.3: Could assessment of the outcome have been influenced by knowledge of intervention received?',
        guidance: 'Consider whether awareness could have influenced measurement (more likely for subjective outcomes).'
      },
      {
        id: '4.5',
        text: 'If Y/PY/NI to 4.4: Is it likely that assessment of the outcome was influenced by knowledge of intervention received?',
        guidance: 'Consider the plausibility of such influence occurring.'
      }
    ],
    algorithm: (responses) => {
      const q41 = responses['4.1'];
      const q42 = responses['4.2'];
      const q43 = responses['4.3'];
      const q44 = responses['4.4'];
      const q45 = responses['4.5'];

      // Inappropriate measurement method
      if (q41 === RESPONSE_OPTIONS.YES || q41 === RESPONSE_OPTIONS.PROBABLY_YES) {
        return JUDGMENT.HIGH;
      }

      // Measurement differed between groups
      if (q42 === RESPONSE_OPTIONS.YES || q42 === RESPONSE_OPTIONS.PROBABLY_YES) {
        return JUDGMENT.HIGH;
      }

      // Assessors blinded or couldn't influence assessment
      if ((q43 === RESPONSE_OPTIONS.NO || q43 === RESPONSE_OPTIONS.PROBABLY_NO) ||
          (q44 === RESPONSE_OPTIONS.NO || q44 === RESPONSE_OPTIONS.PROBABLY_NO)) {
        return JUDGMENT.LOW;
      }

      // Assessment likely influenced
      if (q45 === RESPONSE_OPTIONS.YES || q45 === RESPONSE_OPTIONS.PROBABLY_YES) {
        return JUDGMENT.HIGH;
      }

      // Assessment unlikely influenced
      if (q45 === RESPONSE_OPTIONS.NO || q45 === RESPONSE_OPTIONS.PROBABLY_NO) {
        return JUDGMENT.LOW;
      }

      return JUDGMENT.SOME_CONCERNS;
    }
  },

  D5: {
    id: 'D5',
    name: 'Selection of the reported result',
    description: 'Risk of bias in selection of the reported result',
    questions: [
      {
        id: '5.1',
        text: 'Were the data that produced this result analysed in accordance with a pre-specified analysis plan that was finalized before unblinded outcome data were available for analysis?',
        guidance: 'Consider whether there was a pre-registered analysis plan (e.g., in protocol or statistical analysis plan).'
      },
      {
        id: '5.2',
        text: 'Is the numerical result being assessed likely to have been selected, on the basis of the results, from multiple eligible outcome measurements (e.g. scales, definitions, time points) within the outcome domain?',
        guidance: 'Consider whether the specific measurement could have been selected from multiple options.'
      },
      {
        id: '5.3',
        text: 'Is the numerical result being assessed likely to have been selected, on the basis of the results, from multiple eligible analyses of the data?',
        guidance: 'Consider whether the specific analysis could have been selected from multiple options.'
      }
    ],
    algorithm: (responses) => {
      const q51 = responses['5.1'];
      const q52 = responses['5.2'];
      const q53 = responses['5.3'];

      // Pre-specified analysis and no selection
      if ((q51 === RESPONSE_OPTIONS.YES || q51 === RESPONSE_OPTIONS.PROBABLY_YES) &&
          (q52 === RESPONSE_OPTIONS.NO || q52 === RESPONSE_OPTIONS.PROBABLY_NO) &&
          (q53 === RESPONSE_OPTIONS.NO || q53 === RESPONSE_OPTIONS.PROBABLY_NO)) {
        return JUDGMENT.LOW;
      }

      // Likely selection from multiple measurements or analyses
      if ((q52 === RESPONSE_OPTIONS.YES || q52 === RESPONSE_OPTIONS.PROBABLY_YES) ||
          (q53 === RESPONSE_OPTIONS.YES || q53 === RESPONSE_OPTIONS.PROBABLY_YES)) {
        return JUDGMENT.HIGH;
      }

      // No pre-specified plan
      if (q51 === RESPONSE_OPTIONS.NO || q51 === RESPONSE_OPTIONS.PROBABLY_NO ||
          q51 === RESPONSE_OPTIONS.NO_INFORMATION) {
        return JUDGMENT.SOME_CONCERNS;
      }

      return JUDGMENT.SOME_CONCERNS;
    }
  }
};

/**
 * Calculate overall risk of bias judgment
 * @param {Object} domainJudgments - Object with domain IDs as keys and judgments as values
 * @returns {string} Overall judgment
 */
export function calculateOverallJudgment(domainJudgments) {
  const judgments = Object.values(domainJudgments);

  // If any domain is high risk, overall is high risk
  if (judgments.includes(JUDGMENT.HIGH)) {
    return JUDGMENT.HIGH;
  }

  // If multiple domains have some concerns, overall is high risk
  const someConcernsCount = judgments.filter(j => j === JUDGMENT.SOME_CONCERNS).length;
  if (someConcernsCount > 1) {
    return JUDGMENT.HIGH;
  }

  // If one domain has some concerns
  if (someConcernsCount === 1) {
    return JUDGMENT.SOME_CONCERNS;
  }

  // All domains low risk
  return JUDGMENT.LOW;
}

/**
 * Get domain judgment based on signaling question responses
 * @param {string} domainId - Domain ID (D1-D5)
 * @param {Object} responses - Object with question IDs as keys and responses as values
 * @returns {string} Domain judgment
 */
export function getDomainJudgment(domainId, responses) {
  const domain = ROB2_DOMAINS[domainId];
  if (!domain) {
    throw new Error(`Unknown domain: ${domainId}`);
  }
  return domain.algorithm(responses);
}

/**
 * Create a new ROB 2.0 assessment
 * @param {string} studyId - Study identifier
 * @param {string} outcomeId - Outcome identifier
 * @returns {Object} Empty assessment object
 */
export function createAssessment(studyId, outcomeId) {
  const responses = {};
  const supportingText = {};

  // Initialize all questions with null responses
  Object.values(ROB2_DOMAINS).forEach(domain => {
    domain.questions.forEach(q => {
      responses[q.id] = null;
      supportingText[q.id] = '';
    });
  });

  return {
    studyId,
    outcomeId,
    responses,
    supportingText,
    domainJudgments: {
      D1: null,
      D2: null,
      D3: null,
      D4: null,
      D5: null
    },
    overallJudgment: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: null,
    assessorId: null,
    notes: ''
  };
}

/**
 * Update assessment with new responses
 * @param {Object} assessment - Existing assessment
 * @param {Object} newResponses - New responses to merge
 * @returns {Object} Updated assessment with recalculated judgments
 */
export function updateAssessment(assessment, newResponses) {
  const updated = {
    ...assessment,
    responses: { ...assessment.responses, ...newResponses },
    updatedAt: new Date().toISOString()
  };

  // Recalculate domain judgments
  Object.keys(ROB2_DOMAINS).forEach(domainId => {
    try {
      updated.domainJudgments[domainId] = getDomainJudgment(domainId, updated.responses);
    } catch (e) {
      updated.domainJudgments[domainId] = null;
    }
  });

  // Calculate overall judgment if all domains have judgments
  const allDomainsComplete = Object.values(updated.domainJudgments).every(j => j !== null);
  if (allDomainsComplete) {
    updated.overallJudgment = calculateOverallJudgment(updated.domainJudgments);
    updated.completedAt = new Date().toISOString();
  }

  return updated;
}

/**
 * Generate traffic light summary for visualization
 * @param {Object} assessment - ROB 2.0 assessment
 * @returns {Array} Array of domain summaries with colors
 */
export function getTrafficLightSummary(assessment) {
  const colorMap = {
    [JUDGMENT.LOW]: '#4ade80', // green
    [JUDGMENT.SOME_CONCERNS]: '#fbbf24', // yellow
    [JUDGMENT.HIGH]: '#f87171', // red
    null: '#9ca3af' // gray for incomplete
  };

  return Object.entries(ROB2_DOMAINS).map(([id, domain]) => ({
    id,
    name: domain.name,
    judgment: assessment.domainJudgments[id],
    color: colorMap[assessment.domainJudgments[id]]
  }));
}

/**
 * Export assessment as structured data
 * @param {Object} assessment - ROB 2.0 assessment
 * @returns {Object} Exportable data structure
 */
export function exportAssessment(assessment) {
  return {
    studyId: assessment.studyId,
    outcomeId: assessment.outcomeId,
    tool: 'ROB 2.0',
    version: '2019',
    domains: Object.entries(ROB2_DOMAINS).map(([id, domain]) => ({
      id,
      name: domain.name,
      judgment: assessment.domainJudgments[id],
      questions: domain.questions.map(q => ({
        id: q.id,
        text: q.text,
        response: assessment.responses[q.id],
        supportingText: assessment.supportingText[q.id]
      }))
    })),
    overallJudgment: assessment.overallJudgment,
    assessorId: assessment.assessorId,
    notes: assessment.notes,
    completedAt: assessment.completedAt
  };
}

export default {
  RESPONSE_OPTIONS,
  JUDGMENT,
  ROB2_DOMAINS,
  createAssessment,
  updateAssessment,
  getDomainJudgment,
  calculateOverallJudgment,
  getTrafficLightSummary,
  exportAssessment
};
