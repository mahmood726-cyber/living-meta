/**
 * Outcome Matching Library
 * Matches registered outcomes to posted results using fuzzy matching and synonyms
 */

/**
 * Medical outcome synonyms and related terms
 */
export const OUTCOME_SYNONYMS = {
  // Mortality outcomes
  mortality: ['death', 'survival', 'fatality', 'died', 'deceased', 'all-cause mortality', 'mortality rate'],
  survival: ['alive', 'living', 'survival rate', 'overall survival', 'os'],

  // Cardiovascular outcomes
  'myocardial infarction': ['mi', 'heart attack', 'ami', 'acute mi', 'stemi', 'nstemi'],
  'stroke': ['cva', 'cerebrovascular accident', 'cerebral infarction', 'ischemic stroke', 'hemorrhagic stroke'],
  'heart failure': ['hf', 'chf', 'cardiac failure', 'congestive heart failure'],
  'cardiovascular events': ['cv events', 'mace', 'major adverse cardiac events', 'cardiovascular outcomes'],

  // Response/remission outcomes
  'response': ['responder', 'response rate', 'orr', 'overall response', 'treatment response'],
  'complete response': ['cr', 'complete remission'],
  'partial response': ['pr', 'partial remission'],
  'remission': ['disease-free', 'in remission'],
  'progression': ['disease progression', 'pd', 'progressive disease', 'tumor progression'],

  // Pain and quality of life
  'pain': ['pain score', 'pain intensity', 'analgesic', 'vas', 'nrs', 'pain relief'],
  'quality of life': ['qol', 'hrqol', 'health-related quality of life', 'sf-36', 'eq-5d'],

  // Laboratory measures
  'blood pressure': ['bp', 'systolic', 'diastolic', 'sbp', 'dbp', 'hypertension'],
  'hemoglobin a1c': ['hba1c', 'a1c', 'glycated hemoglobin', 'glycosylated hemoglobin'],
  'cholesterol': ['ldl', 'hdl', 'total cholesterol', 'lipid', 'triglycerides'],
  'creatinine': ['serum creatinine', 'creatinine clearance', 'egfr', 'renal function'],

  // Safety outcomes
  'adverse events': ['ae', 'aes', 'side effects', 'adverse effects', 'safety'],
  'serious adverse events': ['sae', 'saes', 'serious ae'],

  // Time-to-event
  'time to event': ['tte', 'event-free', 'failure-free', 'time to failure'],
  'progression-free survival': ['pfs'],
  'disease-free survival': ['dfs', 'relapse-free survival', 'rfs'],
  'time to progression': ['ttp'],

  // General measures
  'change from baseline': ['delta', 'difference', 'change', 'cfb'],
  'proportion': ['percentage', 'rate', 'incidence', 'prevalence'],
  'duration': ['time', 'length', 'days', 'weeks', 'months']
};

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1, str2) {
  const m = str1.length;
  const n = str2.length;
  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

/**
 * Calculate similarity score between two strings (0-1)
 */
function stringSimilarity(str1, str2) {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;

  const distance = levenshteinDistance(s1, s2);
  const maxLength = Math.max(s1.length, s2.length);

  return 1 - distance / maxLength;
}

/**
 * Check if a term matches any synonym
 */
function matchesSynonym(term, target) {
  const normalizedTerm = term.toLowerCase().trim();
  const normalizedTarget = target.toLowerCase().trim();

  // Direct match
  if (normalizedTerm === normalizedTarget) return { matched: true, score: 1 };

  // Check synonyms
  for (const [key, synonyms] of Object.entries(OUTCOME_SYNONYMS)) {
    const allTerms = [key, ...synonyms];

    if (allTerms.some(s => s.toLowerCase() === normalizedTerm)) {
      if (allTerms.some(s => s.toLowerCase() === normalizedTarget)) {
        return { matched: true, score: 0.95, synonym: key };
      }
    }
  }

  return { matched: false };
}

/**
 * Tokenize and normalize outcome text
 */
function tokenize(text) {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1);
}

/**
 * Calculate Jaccard similarity between token sets
 */
function jaccardSimilarity(tokens1, tokens2) {
  const set1 = new Set(tokens1);
  const set2 = new Set(tokens2);

  const intersection = [...set1].filter(x => set2.has(x)).length;
  const union = new Set([...set1, ...set2]).size;

  return union > 0 ? intersection / union : 0;
}

/**
 * Match a registered outcome to posted results
 *
 * @param {object} registered - { title, description, timeframe, measure }
 * @param {Array} posted - Array of posted outcomes
 * @returns {object} Match results with scores
 */
export function matchOutcome(registered, posted) {
  if (!registered || !posted || posted.length === 0) {
    return { matched: false, error: 'Invalid input' };
  }

  const regText = [
    registered.title || '',
    registered.description || '',
    registered.measure || ''
  ].join(' ').toLowerCase();

  const regTokens = tokenize(regText);

  const matches = posted.map((p, index) => {
    const postText = [
      p.title || '',
      p.description || '',
      p.measure || ''
    ].join(' ').toLowerCase();

    const postTokens = tokenize(postText);

    // Calculate various similarity scores
    const titleSimilarity = stringSimilarity(registered.title || '', p.title || '');
    const jaccardScore = jaccardSimilarity(regTokens, postTokens);

    // Check for synonym matches
    const synonymMatch = matchesSynonym(registered.title || '', p.title || '');

    // Timeframe matching
    let timeframeSimilarity = 0;
    if (registered.timeframe && p.timeframe) {
      timeframeSimilarity = stringSimilarity(registered.timeframe, p.timeframe);
    }

    // Composite score
    let compositeScore = (
      titleSimilarity * 0.4 +
      jaccardScore * 0.3 +
      (synonymMatch.matched ? 0.2 : 0) +
      timeframeSimilarity * 0.1
    );

    // Boost for primary outcome matching
    if (registered.primary && p.primary) {
      compositeScore *= 1.1;
    }

    return {
      index,
      posted: p,
      scores: {
        title: titleSimilarity,
        jaccard: jaccardScore,
        synonym: synonymMatch.matched,
        synonymGroup: synonymMatch.synonym,
        timeframe: timeframeSimilarity,
        composite: Math.min(1, compositeScore)
      }
    };
  });

  // Sort by composite score
  matches.sort((a, b) => b.scores.composite - a.scores.composite);

  // Determine match quality
  const bestMatch = matches[0];
  const matchQuality = classifyMatchQuality(bestMatch.scores.composite);

  return {
    matched: bestMatch.scores.composite >= 0.3,
    bestMatch: bestMatch.posted,
    bestMatchIndex: bestMatch.index,
    score: bestMatch.scores.composite,
    quality: matchQuality,
    allMatches: matches.filter(m => m.scores.composite >= 0.2),
    registered
  };
}

/**
 * Match all registered outcomes to posted results
 */
export function matchAllOutcomes(registeredOutcomes, postedOutcomes) {
  const results = {
    matched: [],
    unmatched: [],
    potentialMissing: [],
    summary: {
      totalRegistered: registeredOutcomes.length,
      totalPosted: postedOutcomes.length,
      matched: 0,
      unmatched: 0,
      primaryMatched: 0,
      primaryMissing: 0
    }
  };

  const usedPostedIndices = new Set();

  // Match each registered outcome
  registeredOutcomes.forEach((reg, regIndex) => {
    const availablePosted = postedOutcomes.filter((_, i) => !usedPostedIndices.has(i));
    const match = matchOutcome(reg, availablePosted);

    if (match.matched && match.score >= 0.5) {
      results.matched.push({
        registered: reg,
        registeredIndex: regIndex,
        posted: match.bestMatch,
        postedIndex: match.bestMatchIndex,
        score: match.score,
        quality: match.quality
      });
      usedPostedIndices.add(match.bestMatchIndex);
      results.summary.matched++;

      if (reg.primary) results.summary.primaryMatched++;
    } else {
      results.unmatched.push({
        registered: reg,
        registeredIndex: regIndex,
        bestCandidate: match.bestMatch,
        bestScore: match.score,
        reason: match.score < 0.3 ? 'no_similar_outcome' : 'low_confidence_match'
      });
      results.summary.unmatched++;

      if (reg.primary) results.summary.primaryMissing++;
    }
  });

  // Identify posted outcomes that don't match any registered
  postedOutcomes.forEach((posted, index) => {
    if (!usedPostedIndices.has(index)) {
      results.potentialMissing.push({
        posted,
        index,
        note: 'Posted outcome not matching any registered outcome'
      });
    }
  });

  return results;
}

/**
 * Detect outcome reporting bias indicators
 */
export function detectOutcomeReportingBias(registeredOutcomes, postedOutcomes) {
  const matchResult = matchAllOutcomes(registeredOutcomes, postedOutcomes);

  const flags = [];

  // Primary outcome not reported
  const primaryRegistered = registeredOutcomes.filter(o => o.primary);
  const primaryMatched = matchResult.matched.filter(m => m.registered.primary);

  if (primaryRegistered.length > 0 && primaryMatched.length === 0) {
    flags.push({
      flag: 'primary_outcome_missing',
      severity: 'high',
      description: 'Registered primary outcome not found in posted results',
      details: primaryRegistered.map(p => p.title)
    });
  }

  // Many unmatched registered outcomes
  const unmatchedRate = matchResult.summary.unmatched / matchResult.summary.totalRegistered;
  if (unmatchedRate > 0.5) {
    flags.push({
      flag: 'high_unmatched_rate',
      severity: 'moderate',
      description: `${Math.round(unmatchedRate * 100)}% of registered outcomes not found in results`,
      rate: unmatchedRate
    });
  }

  // New outcomes in results not in registration
  if (matchResult.potentialMissing.length > 0) {
    flags.push({
      flag: 'additional_outcomes',
      severity: 'low',
      description: `${matchResult.potentialMissing.length} outcomes in results not found in registration`,
      outcomes: matchResult.potentialMissing.map(p => p.posted.title)
    });
  }

  // Timeframe switching
  const timeframeMismatches = matchResult.matched.filter(m => {
    if (!m.registered.timeframe || !m.posted.timeframe) return false;
    const regTime = parseTimeframe(m.registered.timeframe);
    const postTime = parseTimeframe(m.posted.timeframe);
    return regTime && postTime && Math.abs(regTime - postTime) > regTime * 0.2;
  });

  if (timeframeMismatches.length > 0) {
    flags.push({
      flag: 'timeframe_switching',
      severity: 'moderate',
      description: 'Reported timeframe differs from registered timeframe',
      outcomes: timeframeMismatches.map(m => ({
        outcome: m.registered.title,
        registered: m.registered.timeframe,
        posted: m.posted.timeframe
      }))
    });
  }

  return {
    matchSummary: matchResult.summary,
    flags,
    hasHighSeverityFlags: flags.some(f => f.severity === 'high'),
    overallRisk: calculateOverallRisk(flags)
  };
}

/**
 * Parse timeframe string to weeks
 */
function parseTimeframe(timeframe) {
  if (!timeframe) return null;

  const lower = timeframe.toLowerCase();
  let value = null;

  // Extract number
  const numMatch = lower.match(/(\d+(?:\.\d+)?)/);
  if (!numMatch) return null;
  const num = parseFloat(numMatch[1]);

  // Determine unit
  if (lower.includes('week')) {
    value = num;
  } else if (lower.includes('month')) {
    value = num * 4.33;
  } else if (lower.includes('year')) {
    value = num * 52;
  } else if (lower.includes('day')) {
    value = num / 7;
  }

  return value;
}

/**
 * Classify match quality
 */
function classifyMatchQuality(score) {
  if (score >= 0.9) return 'exact';
  if (score >= 0.7) return 'high';
  if (score >= 0.5) return 'moderate';
  if (score >= 0.3) return 'low';
  return 'none';
}

/**
 * Calculate overall outcome reporting bias risk
 */
function calculateOverallRisk(flags) {
  const severityWeights = { high: 3, moderate: 2, low: 1 };
  const totalWeight = flags.reduce((sum, f) => sum + (severityWeights[f.severity] || 0), 0);

  if (totalWeight >= 5) return 'high';
  if (totalWeight >= 3) return 'moderate';
  if (totalWeight >= 1) return 'low';
  return 'none';
}

/**
 * Suggest potential matches for manual review
 */
export function suggestMatches(unmatched, posted, threshold = 0.2) {
  return unmatched.map(u => {
    const suggestions = posted.map((p, i) => {
      const sim = stringSimilarity(u.title || '', p.title || '');
      const synMatch = matchesSynonym(u.title || '', p.title || '');
      return {
        posted: p,
        index: i,
        similarity: sim,
        synonymMatch: synMatch.matched,
        score: synMatch.matched ? Math.max(sim, 0.6) : sim
      };
    })
    .filter(s => s.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

    return {
      registered: u,
      suggestions
    };
  });
}

export default {
  OUTCOME_SYNONYMS,
  matchOutcome,
  matchAllOutcomes,
  detectOutcomeReportingBias,
  suggestMatches,
  stringSimilarity,
  tokenize
};
