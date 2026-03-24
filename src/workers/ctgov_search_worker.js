/**
 * CT.gov Search Worker
 * Handles background API requests, caching, and diff computation
 */

import {
  searchStudies,
  getStudy,
  parseStudy,
  calculateDiff,
  hasStudyChanged,
  CTGOV_API_CONFIG
} from '../lib/ctgov-api.js';

// Worker state
let isSearching = false;

/**
 * Handle incoming messages from main thread
 */
self.onmessage = async function(event) {
  const { type, payload, requestId } = event.data;

  try {
    switch (type) {
      case 'SEARCH':
        await handleSearch(payload, requestId);
        break;

      case 'CHECK_UPDATES':
        await handleCheckUpdates(payload, requestId);
        break;

      case 'FETCH_STUDY':
        await handleFetchStudy(payload, requestId);
        break;

      case 'FETCH_BATCH':
        await handleFetchBatch(payload, requestId);
        break;

      case 'CANCEL':
        isSearching = false;
        break;

      default:
        console.warn('Unknown message type:', type);
    }
  } catch (error) {
    self.postMessage({
      type: 'ERROR',
      error: error.message,
      requestId
    });
  }
};

/**
 * Handle search request
 */
async function handleSearch(payload, requestId) {
  if (isSearching) {
    self.postMessage({
      type: 'SEARCH_ERROR',
      error: 'Search already in progress',
      requestId
    });
    return;
  }

  isSearching = true;
  const { projectId, query, previousNctIds = [] } = payload;

  try {
    // Notify search started
    self.postMessage({
      type: 'SEARCH_STARTED',
      payload: { projectId },
      requestId
    });

    // Execute search with progress callback
    const { studies: rawStudies, totalCount } = await searchStudies(
      query,
      (progress) => {
        if (!isSearching) return; // Check for cancellation
        self.postMessage({
          type: 'SEARCH_PROGRESS',
          payload: progress,
          requestId
        });
      }
    );

    if (!isSearching) {
      self.postMessage({
        type: 'SEARCH_CANCELLED',
        requestId
      });
      return;
    }

    // Parse all studies
    const parsedStudies = rawStudies.map(parseStudy);

    // Calculate diff if previous snapshot exists
    let diff = null;
    if (previousNctIds.length > 0) {
      diff = calculateDiff(previousNctIds, parsedStudies);
    }

    // Create search run record
    const searchRun = {
      id: crypto.randomUUID(),
      projectId,
      query,
      timestamp: new Date().toISOString(),
      totalCount,
      nctIds: parsedStudies.map(s => s.nctId),
      diff: diff ? {
        newTrials: diff.new.length,
        removedTrials: diff.removed.length,
        newNctIds: diff.new.map(s => s.nctId),
        removedNctIds: diff.removed
      } : null
    };

    // Send complete response
    self.postMessage({
      type: 'SEARCH_COMPLETE',
      payload: {
        searchRun,
        studies: parsedStudies,
        totalResults: totalCount,
        diff
      },
      requestId
    });

  } catch (error) {
    self.postMessage({
      type: 'SEARCH_ERROR',
      error: error.message,
      requestId
    });
  } finally {
    isSearching = false;
  }
}

/**
 * Handle living mode update check
 */
async function handleCheckUpdates(payload, requestId) {
  const { projectId, query, lastRunId, previousNctIds, lastRunTimestamp } = payload;

  if (!query) {
    self.postMessage({
      type: 'CHECK_UPDATES_SKIP',
      payload: { projectId, reason: 'No query defined' },
      requestId
    });
    return;
  }

  try {
    // Notify update check started
    self.postMessage({
      type: 'UPDATE_CHECK_STARTED',
      payload: { projectId },
      requestId
    });

    // Run search
    const { studies: rawStudies, totalCount } = await searchStudies(
      query,
      (progress) => {
        self.postMessage({
          type: 'UPDATE_CHECK_PROGRESS',
          payload: { projectId, ...progress },
          requestId
        });
      }
    );

    // Parse studies
    const parsedStudies = rawStudies.map(parseStudy);

    // Calculate diff
    const diff = calculateDiff(previousNctIds || [], parsedStudies);

    // Check for updates to existing studies
    const updatedStudies = [];
    if (lastRunTimestamp) {
      for (const study of diff.unchanged) {
        if (hasStudyChanged(study, lastRunTimestamp)) {
          updatedStudies.push(study);
        }
      }
    }

    const hasChanges = diff.new.length > 0 ||
      diff.removed.length > 0 ||
      updatedStudies.length > 0;

    // Create search run if changes detected
    let searchRun = null;
    if (hasChanges) {
      searchRun = {
        id: crypto.randomUUID(),
        projectId,
        query,
        timestamp: new Date().toISOString(),
        totalCount,
        nctIds: parsedStudies.map(s => s.nctId),
        isLivingUpdate: true,
        previousRunId: lastRunId,
        diff: {
          newTrials: diff.new.length,
          removedTrials: diff.removed.length,
          updatedTrials: updatedStudies.length,
          newNctIds: diff.new.map(s => s.nctId),
          removedNctIds: diff.removed,
          updatedNctIds: updatedStudies.map(s => s.nctId)
        }
      };
    }

    self.postMessage({
      type: 'DIFF_COMPLETE',
      payload: {
        projectId,
        hasChanges,
        searchRun,
        studies: hasChanges ? parsedStudies : null,
        newTrials: diff.new.length,
        removedTrials: diff.removed.length,
        updatedTrials: updatedStudies.length,
        newStudies: diff.new,
        updatedStudies,
        removedNctIds: diff.removed
      },
      requestId
    });

  } catch (error) {
    self.postMessage({
      type: 'UPDATE_CHECK_ERROR',
      error: error.message,
      payload: { projectId },
      requestId
    });
  }
}

/**
 * Handle single study fetch
 */
async function handleFetchStudy(payload, requestId) {
  const { nctId } = payload;

  try {
    const rawStudy = await getStudy(nctId);
    const parsedStudy = parseStudy(rawStudy);

    self.postMessage({
      type: 'STUDY_FETCHED',
      payload: { study: parsedStudy },
      requestId
    });
  } catch (error) {
    self.postMessage({
      type: 'STUDY_FETCH_ERROR',
      error: error.message,
      payload: { nctId },
      requestId
    });
  }
}

/**
 * Handle batch study fetch
 */
async function handleFetchBatch(payload, requestId) {
  const { nctIds } = payload;

  try {
    self.postMessage({
      type: 'BATCH_FETCH_STARTED',
      payload: { total: nctIds.length },
      requestId
    });

    const results = [];
    const errors = [];
    const batchSize = 5; // Parallel batch size

    for (let i = 0; i < nctIds.length; i += batchSize) {
      const batch = nctIds.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(
        batch.map(async (nctId) => {
          const raw = await getStudy(nctId);
          return parseStudy(raw);
        })
      );

      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          errors.push({
            nctId: batch[j],
            error: result.reason?.message || 'Unknown error'
          });
        }
      }

      // Progress update
      self.postMessage({
        type: 'BATCH_FETCH_PROGRESS',
        payload: {
          fetched: results.length + errors.length,
          total: nctIds.length,
          successful: results.length,
          failed: errors.length
        },
        requestId
      });
    }

    self.postMessage({
      type: 'BATCH_FETCH_COMPLETE',
      payload: {
        studies: results,
        errors,
        successful: results.length,
        failed: errors.length
      },
      requestId
    });

  } catch (error) {
    self.postMessage({
      type: 'BATCH_FETCH_ERROR',
      error: error.message,
      requestId
    });
  }
}

// Worker initialized
