/**
 * Rules Engine for Automated Screening
 * Deterministic rules-based screening with configurable criteria
 */

/**
 * Rule types
 */
export const RULE_TYPES = {
  INCLUDE: 'include',
  EXCLUDE: 'exclude',
  MAYBE: 'maybe'
};

/**
 * Rule operators
 */
export const OPERATORS = {
  CONTAINS: 'contains',
  NOT_CONTAINS: 'not_contains',
  EQUALS: 'equals',
  NOT_EQUALS: 'not_equals',
  STARTS_WITH: 'starts_with',
  ENDS_WITH: 'ends_with',
  REGEX: 'regex',
  GREATER_THAN: 'greater_than',
  LESS_THAN: 'less_than',
  BETWEEN: 'between',
  IN_LIST: 'in_list',
  NOT_IN_LIST: 'not_in_list',
  IS_EMPTY: 'is_empty',
  IS_NOT_EMPTY: 'is_not_empty'
};

/**
 * Default screening rules for clinical trials
 */
export const DEFAULT_RULES = [
  // Phase rules
  {
    id: 'phase_early',
    name: 'Early Phase Studies',
    field: 'phase',
    operator: OPERATORS.IN_LIST,
    value: ['Early Phase 1', 'Phase 1'],
    action: RULE_TYPES.EXCLUDE,
    reason: 'Early phase study',
    priority: 10,
    enabled: true
  },

  // Status rules
  {
    id: 'status_withdrawn',
    name: 'Withdrawn Studies',
    field: 'overallStatus',
    operator: OPERATORS.EQUALS,
    value: 'Withdrawn',
    action: RULE_TYPES.EXCLUDE,
    reason: 'Study withdrawn',
    priority: 20,
    enabled: true
  },
  {
    id: 'status_terminated',
    name: 'Terminated Studies',
    field: 'overallStatus',
    operator: OPERATORS.EQUALS,
    value: 'Terminated',
    action: RULE_TYPES.MAYBE,
    reason: 'Study terminated - manual review needed',
    priority: 21,
    enabled: true
  },

  // Study type rules
  {
    id: 'type_observational',
    name: 'Observational Studies',
    field: 'studyType',
    operator: OPERATORS.EQUALS,
    value: 'Observational',
    action: RULE_TYPES.EXCLUDE,
    reason: 'Observational study design',
    priority: 30,
    enabled: true
  },

  // Sample size rules
  {
    id: 'small_sample',
    name: 'Very Small Studies',
    field: 'enrollmentCount',
    operator: OPERATORS.LESS_THAN,
    value: 10,
    action: RULE_TYPES.MAYBE,
    reason: 'Very small sample size (n < 10)',
    priority: 40,
    enabled: true
  },

  // Results availability
  {
    id: 'has_results',
    name: 'Results Posted',
    field: 'hasResults',
    operator: OPERATORS.EQUALS,
    value: true,
    action: RULE_TYPES.INCLUDE,
    reason: 'Results available',
    priority: 5,
    enabled: false // Optional boost
  }
];

/**
 * Evaluate a single rule against a record
 * @param {object} rule - Rule to evaluate
 * @param {object} record - CT.gov record
 * @returns {boolean} - Whether rule matches
 */
export function evaluateRule(rule, record) {
  const fieldValue = getFieldValue(record, rule.field);

  switch (rule.operator) {
    case OPERATORS.CONTAINS:
      return stringContains(fieldValue, rule.value);

    case OPERATORS.NOT_CONTAINS:
      return !stringContains(fieldValue, rule.value);

    case OPERATORS.EQUALS:
      return fieldValue === rule.value;

    case OPERATORS.NOT_EQUALS:
      return fieldValue !== rule.value;

    case OPERATORS.STARTS_WITH:
      return String(fieldValue || '').toLowerCase().startsWith(String(rule.value).toLowerCase());

    case OPERATORS.ENDS_WITH:
      return String(fieldValue || '').toLowerCase().endsWith(String(rule.value).toLowerCase());

    case OPERATORS.REGEX:
      try {
        const regex = new RegExp(rule.value, 'i');
        return regex.test(String(fieldValue || ''));
      } catch {
        return false;
      }

    case OPERATORS.GREATER_THAN:
      return Number(fieldValue) > Number(rule.value);

    case OPERATORS.LESS_THAN:
      return Number(fieldValue) < Number(rule.value);

    case OPERATORS.BETWEEN:
      const num = Number(fieldValue);
      return num >= rule.value[0] && num <= rule.value[1];

    case OPERATORS.IN_LIST:
      return Array.isArray(rule.value) && rule.value.includes(fieldValue);

    case OPERATORS.NOT_IN_LIST:
      return Array.isArray(rule.value) && !rule.value.includes(fieldValue);

    case OPERATORS.IS_EMPTY:
      return fieldValue === null || fieldValue === undefined || fieldValue === '';

    case OPERATORS.IS_NOT_EMPTY:
      return fieldValue !== null && fieldValue !== undefined && fieldValue !== '';

    default:
      return false;
  }
}

/**
 * Get nested field value from record
 */
function getFieldValue(record, fieldPath) {
  const parts = fieldPath.split('.');
  let value = record;

  for (const part of parts) {
    if (value === null || value === undefined) return null;
    value = value[part];
  }

  return value;
}

/**
 * Case-insensitive string contains check
 */
function stringContains(haystack, needle) {
  if (haystack === null || haystack === undefined) return false;
  return String(haystack).toLowerCase().includes(String(needle).toLowerCase());
}

/**
 * Rules Engine class
 */
export class RulesEngine {
  constructor(rules = DEFAULT_RULES) {
    this.rules = [...rules].sort((a, b) => a.priority - b.priority);
  }

  /**
   * Add a rule
   */
  addRule(rule) {
    this.rules.push(rule);
    this.rules.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Remove a rule by ID
   */
  removeRule(ruleId) {
    this.rules = this.rules.filter(r => r.id !== ruleId);
  }

  /**
   * Enable/disable a rule
   */
  toggleRule(ruleId, enabled) {
    const rule = this.rules.find(r => r.id === ruleId);
    if (rule) rule.enabled = enabled;
  }

  /**
   * Evaluate all rules against a record
   * @param {object} record - CT.gov record
   * @returns {object} - Screening result
   */
  evaluate(record) {
    const matchedRules = [];
    const reasons = [];
    let score = 50; // Base score

    // Evaluate each enabled rule
    for (const rule of this.rules) {
      if (!rule.enabled) continue;

      const matches = evaluateRule(rule, record);

      if (matches) {
        matchedRules.push(rule);
        reasons.push(rule.reason);

        // Adjust score based on action
        if (rule.action === RULE_TYPES.INCLUDE) {
          score += 20;
        } else if (rule.action === RULE_TYPES.EXCLUDE) {
          score -= 30;
        } else if (rule.action === RULE_TYPES.MAYBE) {
          score -= 10;
        }
      }
    }

    // Clamp score
    score = Math.max(0, Math.min(100, score));

    // Determine decision
    let decision;
    if (matchedRules.some(r => r.action === RULE_TYPES.EXCLUDE)) {
      decision = 'exclude';
    } else if (matchedRules.every(r => r.action === RULE_TYPES.INCLUDE) && matchedRules.length > 0) {
      decision = 'include';
    } else {
      decision = 'maybe';
    }

    return {
      decision,
      score,
      matchedRules,
      reasons,
      autoScreened: matchedRules.length > 0
    };
  }

  /**
   * Batch evaluate records
   */
  evaluateAll(records) {
    return records.map(record => ({
      record,
      result: this.evaluate(record)
    }));
  }

  /**
   * Get enabled rules
   */
  getEnabledRules() {
    return this.rules.filter(r => r.enabled);
  }

  /**
   * Export rules configuration
   */
  exportRules() {
    return JSON.stringify(this.rules, null, 2);
  }

  /**
   * Import rules configuration
   */
  importRules(json) {
    try {
      const rules = JSON.parse(json);
      if (Array.isArray(rules)) {
        this.rules = rules.sort((a, b) => a.priority - b.priority);
        return true;
      }
    } catch (e) {
      console.error('Failed to import rules:', e);
    }
    return false;
  }
}

/**
 * Create default rules engine instance
 */
export function createRulesEngine(customRules = []) {
  const allRules = [...DEFAULT_RULES, ...customRules];
  return new RulesEngine(allRules);
}

/**
 * PICO-based rule templates
 */
export const PICO_RULE_TEMPLATES = {
  population: {
    ageAdult: {
      name: 'Adult Population',
      field: 'eligibilityCriteria',
      operator: OPERATORS.CONTAINS,
      value: 'age 18',
      action: RULE_TYPES.INCLUDE,
      reason: 'Adult population'
    },
    agePediatric: {
      name: 'Pediatric Population',
      field: 'eligibilityCriteria',
      operator: OPERATORS.CONTAINS,
      value: 'under 18',
      action: RULE_TYPES.MAYBE,
      reason: 'Pediatric population - verify inclusion'
    }
  },
  intervention: {
    drug: (drugName) => ({
      name: `Drug: ${drugName}`,
      field: 'interventions',
      operator: OPERATORS.REGEX,
      value: `\\b${drugName}\\b`,
      action: RULE_TYPES.INCLUDE,
      reason: `Contains intervention: ${drugName}`
    })
  },
  comparator: {
    placebo: {
      name: 'Placebo Controlled',
      field: 'interventions',
      operator: OPERATORS.CONTAINS,
      value: 'placebo',
      action: RULE_TYPES.INCLUDE,
      reason: 'Placebo controlled'
    }
  },
  outcome: {
    mortality: {
      name: 'Mortality Outcome',
      field: 'primaryOutcomes',
      operator: OPERATORS.REGEX,
      value: 'mortality|death|survival',
      action: RULE_TYPES.INCLUDE,
      reason: 'Mortality outcome'
    }
  }
};

/**
 * Generate PICO-based rules from criteria
 */
export function generatePICORules(pico) {
  const rules = [];
  let priority = 100;

  // Population rules
  if (pico.population) {
    pico.population.forEach(term => {
      rules.push({
        id: `pico_pop_${priority}`,
        name: `Population: ${term}`,
        field: 'eligibilityCriteria',
        operator: OPERATORS.CONTAINS,
        value: term,
        action: RULE_TYPES.INCLUDE,
        reason: `Matches population: ${term}`,
        priority: priority++,
        enabled: true
      });
    });
  }

  // Intervention rules
  if (pico.intervention) {
    pico.intervention.forEach(term => {
      rules.push({
        id: `pico_int_${priority}`,
        name: `Intervention: ${term}`,
        field: 'interventions',
        operator: OPERATORS.REGEX,
        value: `\\b${term}\\b`,
        action: RULE_TYPES.INCLUDE,
        reason: `Contains intervention: ${term}`,
        priority: priority++,
        enabled: true
      });
    });
  }

  // Comparator rules
  if (pico.comparator) {
    pico.comparator.forEach(term => {
      rules.push({
        id: `pico_comp_${priority}`,
        name: `Comparator: ${term}`,
        field: 'interventions',
        operator: OPERATORS.CONTAINS,
        value: term,
        action: RULE_TYPES.INCLUDE,
        reason: `Contains comparator: ${term}`,
        priority: priority++,
        enabled: true
      });
    });
  }

  // Outcome rules
  if (pico.outcome) {
    pico.outcome.forEach(term => {
      rules.push({
        id: `pico_out_${priority}`,
        name: `Outcome: ${term}`,
        field: 'primaryOutcomes',
        operator: OPERATORS.REGEX,
        value: term,
        action: RULE_TYPES.INCLUDE,
        reason: `Matches outcome: ${term}`,
        priority: priority++,
        enabled: true
      });
    });
  }

  return rules;
}

export default {
  RulesEngine,
  createRulesEngine,
  evaluateRule,
  generatePICORules,
  DEFAULT_RULES,
  RULE_TYPES,
  OPERATORS,
  PICO_RULE_TEMPLATES
};
