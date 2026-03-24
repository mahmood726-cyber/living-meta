/**
 * ClinicalTrials.gov API v2 Client
 * With rate limiting, retry logic, and caching
 */

import { retry, sleep } from './utils.js';

// API Configuration (from spec addendum)
export const CTGOV_API_CONFIG = {
  base_url: 'https://clinicaltrials.gov/api/v2',

  rate_limit: {
    requests_per_minute: 10,
    burst_limit: 3
  },

  retry: {
    max_attempts: 3,
    initial_delay_ms: 1000,
    backoff_multiplier: 2,
    max_delay_ms: 30000
  },

  timeout_ms: 30000,

  pagination: {
    page_size: 100,
    max_pages: 100
  }
};

// Rate limiter state
const rateLimiter = {
  tokens: CTGOV_API_CONFIG.rate_limit.burst_limit,
  lastRefill: Date.now(),
  queue: []
};

/**
 * Token bucket rate limiter
 */
async function acquireToken() {
  const now = Date.now();
  const elapsed = now - rateLimiter.lastRefill;
  const refillAmount = (elapsed / 60000) * CTGOV_API_CONFIG.rate_limit.requests_per_minute;

  rateLimiter.tokens = Math.min(
    CTGOV_API_CONFIG.rate_limit.burst_limit,
    rateLimiter.tokens + refillAmount
  );
  rateLimiter.lastRefill = now;

  if (rateLimiter.tokens >= 1) {
    rateLimiter.tokens--;
    return;
  }

  // Wait for token to become available
  const waitTime = ((1 - rateLimiter.tokens) / CTGOV_API_CONFIG.rate_limit.requests_per_minute) * 60000;
  await sleep(waitTime);
  rateLimiter.tokens = 0;
}

/**
 * Make a rate-limited API request with retry
 */
async function apiRequest(endpoint, options = {}) {
  await acquireToken();

  const url = `${CTGOV_API_CONFIG.base_url}${endpoint}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CTGOV_API_CONFIG.timeout_ms);

  try {
    const response = await retry(
      async () => {
        const res = await fetch(url, {
          ...options,
          signal: controller.signal,
          headers: {
            'Accept': 'application/json',
            ...options.headers
          }
        });

        if (!res.ok) {
          if (res.status === 429) {
            // Rate limited - wait and retry
            const retryAfter = parseInt(res.headers.get('Retry-After') || '60', 10);
            await sleep(retryAfter * 1000);
            throw new Error('Rate limited');
          }
          throw new Error(`API error: ${res.status} ${res.statusText}`);
        }

        return res;
      },
      CTGOV_API_CONFIG.retry
    );

    clearTimeout(timeoutId);

    const data = await response.json();
    return {
      data,
      headers: {
        etag: response.headers.get('ETag'),
        lastModified: response.headers.get('Last-Modified')
      }
    };

  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('Request timeout');
    }
    throw err;
  }
}

/**
 * Build query string from search parameters
 */
export function buildQueryString(params) {
  const queryParts = [];

  // Main search query
  if (params.query) {
    queryParts.push(`query.term=${encodeURIComponent(params.query)}`);
  }

  // Condition/disease
  if (params.condition) {
    queryParts.push(`query.cond=${encodeURIComponent(params.condition)}`);
  }

  // Intervention/treatment
  if (params.intervention) {
    queryParts.push(`query.intr=${encodeURIComponent(params.intervention)}`);
  }

  // Study type filter
  if (params.studyType) {
    queryParts.push(`filter.overallStatus=${encodeURIComponent(params.studyType)}`);
  }

  // Status filter (can be array)
  if (params.status) {
    const statuses = Array.isArray(params.status) ? params.status : [params.status];
    queryParts.push(`filter.overallStatus=${statuses.join(',')}`);
  }

  // Phase filter
  if (params.phase) {
    const phases = Array.isArray(params.phase) ? params.phase : [params.phase];
    queryParts.push(`filter.phase=${phases.join(',')}`);
  }

  // Has results filter
  if (params.hasResults !== undefined) {
    queryParts.push(`filter.resultsFirstPostDate=${params.hasResults ? 'MIN,MAX' : ''}`);
  }

  // Date range filters
  if (params.startDateFrom || params.startDateTo) {
    const from = params.startDateFrom || 'MIN';
    const to = params.startDateTo || 'MAX';
    queryParts.push(`filter.start=${from},${to}`);
  }

  if (params.completionDateFrom || params.completionDateTo) {
    const from = params.completionDateFrom || 'MIN';
    const to = params.completionDateTo || 'MAX';
    queryParts.push(`filter.completion=${from},${to}`);
  }

  // Pagination
  queryParts.push(`pageSize=${params.pageSize || CTGOV_API_CONFIG.pagination.page_size}`);
  if (params.pageToken) {
    queryParts.push(`pageToken=${params.pageToken}`);
  }

  // Count total
  queryParts.push('countTotal=true');

  return queryParts.join('&');
}

/**
 * Search studies on CT.gov
 */
export async function searchStudies(params, onProgress) {
  const results = [];
  let pageToken = null;
  let totalCount = 0;
  let page = 0;

  do {
    const queryString = buildQueryString({ ...params, pageToken });
    const { data } = await apiRequest(`/studies?${queryString}`);

    if (page === 0) {
      totalCount = data.totalCount || 0;
    }

    const studies = data.studies || [];
    results.push(...studies);

    pageToken = data.nextPageToken || null;
    page++;

    // Progress callback
    if (onProgress) {
      onProgress({
        page,
        totalPages: Math.ceil(totalCount / CTGOV_API_CONFIG.pagination.page_size),
        fetched: results.length,
        total: totalCount
      });
    }

    // Safety limit
    if (page >= CTGOV_API_CONFIG.pagination.max_pages) {
      console.warn('Reached maximum page limit');
      break;
    }

  } while (pageToken);

  return {
    studies: results,
    totalCount
  };
}

/**
 * Get a single study by NCT ID
 */
export async function getStudy(nctId) {
  const { data } = await apiRequest(`/studies/${nctId}`);
  return data;
}

/**
 * Get multiple studies by NCT IDs (batched)
 */
export async function getStudiesBatch(nctIds, onProgress) {
  const results = [];
  const batchSize = 20; // CT.gov doesn't have a batch endpoint, so we parallelize

  for (let i = 0; i < nctIds.length; i += batchSize) {
    const batch = nctIds.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(id => getStudy(id).catch(err => ({ nctId: id, error: err.message })))
    );
    results.push(...batchResults);

    if (onProgress) {
      onProgress({
        fetched: results.length,
        total: nctIds.length
      });
    }
  }

  return results;
}

/**
 * Parse raw CT.gov study JSON into normalized format
 */
export function parseStudy(raw) {
  const protocol = raw.protocolSection || {};
  const results = raw.resultsSection || {};
  const derived = raw.derivedSection || {};

  const identification = protocol.identificationModule || {};
  const status = protocol.statusModule || {};
  const sponsor = protocol.sponsorCollaboratorsModule || {};
  const description = protocol.descriptionModule || {};
  const conditions = protocol.conditionsModule || {};
  const design = protocol.designModule || {};
  const arms = protocol.armsInterventionsModule || {};
  const outcomes = protocol.outcomesModule || {};
  const eligibility = protocol.eligibilityModule || {};
  const contacts = protocol.contactsLocationsModule || {};

  // Results modules
  const baseline = results.baselineCharacteristicsModule || {};
  const outcomeMeasures = results.outcomeMeasuresModule || {};
  const adverseEvents = results.adverseEventsModule || {};
  const participantFlow = results.participantFlowModule || {};

  return {
    // Identification
    nctId: identification.nctId,
    orgStudyId: identification.orgStudyIdInfo?.id,
    briefTitle: identification.briefTitle,
    officialTitle: identification.officialTitle,
    acronym: identification.acronym,

    // Status
    overallStatus: status.overallStatus,
    expandedAccessInfo: status.expandedAccessInfo,
    startDate: status.startDateStruct?.date,
    completionDate: status.completionDateStruct?.date,
    primaryCompletionDate: status.primaryCompletionDateStruct?.date,
    studyFirstSubmitDate: status.studyFirstSubmitDate,
    studyFirstPostDate: status.studyFirstPostDateStruct?.date,
    lastUpdatePostDate: status.lastUpdatePostDateStruct?.date,
    resultsFirstPostDate: status.resultsFirstPostDateStruct?.date,

    // Has results
    hasResults: !!raw.hasResults || !!results.outcomeMeasuresModule,

    // Sponsor
    leadSponsor: sponsor.leadSponsor?.name,
    leadSponsorClass: sponsor.leadSponsor?.class,
    collaborators: sponsor.collaborators?.map(c => c.name) || [],

    // Description
    briefSummary: description.briefSummary,
    detailedDescription: description.detailedDescription,

    // Conditions
    conditions: conditions.conditions || [],
    keywords: conditions.keywords || [],

    // Design
    studyType: design.studyType,
    phases: design.phases || [],
    designInfo: {
      allocation: design.designInfo?.allocation,
      interventionModel: design.designInfo?.interventionModel,
      primaryPurpose: design.designInfo?.primaryPurpose,
      masking: design.designInfo?.maskingInfo?.masking,
      whoMasked: design.designInfo?.maskingInfo?.whoMasked || []
    },
    enrollmentInfo: {
      count: design.enrollmentInfo?.count,
      type: design.enrollmentInfo?.type
    },

    // Arms and interventions
    armGroups: arms.armGroups?.map(a => ({
      label: a.label,
      type: a.type,
      description: a.description,
      interventionNames: a.interventionNames || []
    })) || [],
    interventions: arms.interventions?.map(i => ({
      type: i.type,
      name: i.name,
      description: i.description,
      armGroupLabels: i.armGroupLabels || []
    })) || [],

    // Registered outcomes
    primaryOutcomes: outcomes.primaryOutcomes?.map(o => ({
      measure: o.measure,
      description: o.description,
      timeFrame: o.timeFrame
    })) || [],
    secondaryOutcomes: outcomes.secondaryOutcomes?.map(o => ({
      measure: o.measure,
      description: o.description,
      timeFrame: o.timeFrame
    })) || [],

    // Eligibility
    eligibility: {
      criteria: eligibility.eligibilityCriteria,
      healthyVolunteers: eligibility.healthyVolunteers,
      sex: eligibility.sex,
      genderBased: eligibility.genderBased,
      minimumAge: eligibility.minimumAge,
      maximumAge: eligibility.maximumAge,
      stdAges: eligibility.stdAges || []
    },

    // Location info
    locationCount: contacts.locations?.length || 0,
    countries: [...new Set(contacts.locations?.map(l => l.country) || [])],

    // Derived info
    conditionBrowse: derived.conditionBrowseModule?.browseLeaves || [],
    interventionBrowse: derived.interventionBrowseModule?.browseLeaves || [],

    // Results data (if available)
    resultsData: raw.hasResults ? {
      // Participant flow
      participantFlow: participantFlow.flowGroups?.map(g => ({
        id: g.id,
        title: g.title,
        description: g.description
      })) || [],

      // Baseline characteristics
      baselineGroups: baseline.baselineGroups?.map(g => ({
        id: g.id,
        title: g.title,
        description: g.description
      })) || [],
      baselineMeasures: baseline.baselineMeasures?.map(m => ({
        title: m.title,
        paramType: m.paramType,
        unitOfMeasure: m.unitOfMeasure,
        classes: m.classes?.map(c => ({
          title: c.title,
          categories: c.categories?.map(cat => ({
            title: cat.title,
            measurements: cat.measurements
          }))
        }))
      })) || [],

      // Outcome measures (posted results)
      outcomeMeasures: outcomeMeasures.outcomeMeasures?.map(o => ({
        type: o.type,
        title: o.title,
        description: o.description,
        populationDescription: o.populationDescription,
        reportingStatus: o.reportingStatus,
        timeFrame: o.timeFrame,
        paramType: o.paramType,
        dispersionType: o.dispersionType,
        unitOfMeasure: o.unitOfMeasure,
        groups: o.groups?.map(g => ({
          id: g.id,
          title: g.title,
          description: g.description
        })) || [],
        classes: o.classes?.map(c => ({
          title: c.title,
          categories: c.categories?.map(cat => ({
            title: cat.title,
            measurements: cat.measurements?.map(m => ({
              groupId: m.groupId,
              value: m.value,
              spread: m.spread,
              lowerLimit: m.lowerLimit,
              upperLimit: m.upperLimit,
              comment: m.comment
            }))
          }))
        })) || []
      })) || [],

      // Adverse events
      adverseEvents: {
        frequencyThreshold: adverseEvents.frequencyThreshold,
        timeFrame: adverseEvents.timeFrame,
        description: adverseEvents.description,
        groups: adverseEvents.eventGroups?.map(g => ({
          id: g.id,
          title: g.title,
          description: g.description,
          seriousNumAffected: g.seriousNumAffected,
          seriousNumAtRisk: g.seriousNumAtRisk,
          otherNumAffected: g.otherNumAffected,
          otherNumAtRisk: g.otherNumAtRisk
        })) || []
      }
    } : null,

    // Raw JSON for full provenance
    _raw: raw,

    // Metadata
    _parsedAt: new Date().toISOString()
  };
}

/**
 * Calculate diff between two search snapshots
 */
export function calculateDiff(previousNctIds, currentStudies) {
  const previousSet = new Set(previousNctIds);
  const currentMap = new Map(currentStudies.map(s => [s.nctId, s]));

  const newStudies = [];
  const removedNctIds = [];
  const updatedStudies = [];
  const unchanged = [];

  // Find new and potentially updated
  for (const [nctId, study] of currentMap) {
    if (!previousSet.has(nctId)) {
      newStudies.push(study);
    } else {
      // Could be updated - check lastUpdatePostDate later
      unchanged.push(study);
    }
  }

  // Find removed
  for (const nctId of previousNctIds) {
    if (!currentMap.has(nctId)) {
      removedNctIds.push(nctId);
    }
  }

  return {
    new: newStudies,
    removed: removedNctIds,
    unchanged,
    updated: updatedStudies, // Will be populated after comparing dates
    summary: {
      totalPrevious: previousNctIds.length,
      totalCurrent: currentStudies.length,
      newCount: newStudies.length,
      removedCount: removedNctIds.length
    }
  };
}

/**
 * Check if study has been updated since a reference date
 */
export function hasStudyChanged(study, referenceDate) {
  if (!referenceDate) return true;

  const lastUpdate = new Date(study.lastUpdatePostDate || study._parsedAt);
  const ref = new Date(referenceDate);

  return lastUpdate > ref;
}

/**
 * Detect if study has new results since reference
 */
export function hasNewResults(study, previousHadResults) {
  return study.hasResults && !previousHadResults;
}

export default {
  searchStudies,
  getStudy,
  getStudiesBatch,
  parseStudy,
  calculateDiff,
  hasStudyChanged,
  hasNewResults,
  buildQueryString,
  CTGOV_API_CONFIG
};
