/**
 * Duplicate Study Detection Module
 * Identifies potential duplicate studies in meta-analyses
 *
 * @module DuplicateDetection
 */

/**
 * Calculate Levenshtein distance between two strings
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} Edit distance
 */
function levenshteinDistance(a, b) {
  const matrix = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculate normalized similarity score between two strings
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} Similarity score (0-1)
 */
function stringSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;

  const maxLength = Math.max(a.length, b.length);
  if (maxLength === 0) return 1;

  const distance = levenshteinDistance(a.toLowerCase(), b.toLowerCase());
  return 1 - distance / maxLength;
}

/**
 * Calculate Jaccard similarity between two sets
 * @param {Array} setA - First set
 * @param {Array} setB - Second set
 * @returns {number} Jaccard similarity (0-1)
 */
function jaccardSimilarity(setA, setB) {
  if (!setA || !setB || setA.length === 0 || setB.length === 0) return 0;

  const a = new Set(setA.map(s => s.toLowerCase()));
  const b = new Set(setB.map(s => s.toLowerCase()));

  const intersection = new Set([...a].filter(x => b.has(x)));
  const union = new Set([...a, ...b]);

  return intersection.size / union.size;
}

/**
 * Extract words from a string (for comparison)
 * @param {string} str - Input string
 * @returns {Array} Array of words
 */
function extractWords(str) {
  if (!str) return [];
  return str
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2);
}

/**
 * Compare two studies for potential duplication
 * @param {Object} studyA - First study
 * @param {Object} studyB - Second study
 * @param {Object} options - Comparison options
 * @returns {Object} Comparison result
 */
function compareStudies(studyA, studyB, options = {}) {
  const {
    titleThreshold = 0.85,
    conditionThreshold = 0.9,
    interventionThreshold = 0.85,
    sponsorThreshold = 0.8
  } = options;

  const reasons = [];
  let similarity = 0;
  let totalWeight = 0;

  // Compare titles
  const titleSimilarity = stringSimilarity(studyA.briefTitle || '', studyB.briefTitle || '');
  if (titleSimilarity >= titleThreshold) {
    similarity += titleSimilarity * 0.4;
    totalWeight += 0.4;
    reasons.push(`Title similarity: ${(titleSimilarity * 100).toFixed(1)}%`);
  }

  // Compare official titles
  if (studyA.officialTitle && studyB.officialTitle) {
    const officialTitleSimilarity = stringSimilarity(studyA.officialTitle, studyB.officialTitle);
    if (officialTitleSimilarity >= titleThreshold) {
      similarity += officialTitleSimilarity * 0.3;
      totalWeight += 0.3;
      reasons.push(`Official title similarity: ${(officialTitleSimilarity * 100).toFixed(1)}%`);
    }
  }

  // Compare conditions
  const conditionSimilarity = jaccardSimilarity(
    studyA.conditions || [],
    studyB.conditions || []
  );
  if (conditionSimilarity >= conditionThreshold && (studyA.conditions?.length > 0 || studyB.conditions?.length > 0)) {
    similarity += conditionSimilarity * 0.2;
    totalWeight += 0.2;
    reasons.push(`Condition overlap: ${(conditionSimilarity * 100).toFixed(1)}%`);
  }

  // Compare interventions
  const interventionsA = (studyA.interventions || []).map(i => i.name).filter(Boolean);
  const interventionsB = (studyB.interventions || []).map(i => i.name).filter(Boolean);
  const interventionSimilarity = jaccardSimilarity(interventionsA, interventionsB);
  if (interventionSimilarity >= interventionThreshold && (interventionsA.length > 0 || interventionsB.length > 0)) {
    similarity += interventionSimilarity * 0.15;
    totalWeight += 0.15;
    reasons.push(`Intervention overlap: ${(interventionSimilarity * 100).toFixed(1)}%`);
  }

  // Compare sponsors
  if (studyA.leadSponsor && studyB.leadSponsor) {
    const sponsorSimilarity = stringSimilarity(studyA.leadSponsor, studyB.leadSponsor);
    if (sponsorSimilarity >= sponsorThreshold) {
      similarity += sponsorSimilarity * 0.1;
      totalWeight += 0.1;
      reasons.push(`Sponsor match: ${(sponsorSimilarity * 100).toFixed(1)}%`);
    }
  }

  // Compare phases
  if (studyA.phases && studyB.phases && studyA.phases.length > 0 && studyB.phases.length > 0) {
    const phaseOverlap = jaccardSimilarity(studyA.phases, studyB.phases);
    if (phaseOverlap > 0) {
      similarity += phaseOverlap * 0.05;
      totalWeight += 0.05;
      reasons.push(`Phase match: ${(phaseOverlap * 100).toFixed(1)}%`);
    }
  }

  // Check for same org study ID
  if (studyA.orgStudyId && studyB.orgStudyId && studyA.orgStudyId === studyB.orgStudyId) {
    similarity = 1.0;
    totalWeight = 1.0;
    reasons.push('Identical org study ID');
  }

  // Normalize similarity
  const normalizedSimilarity = totalWeight > 0 ? similarity / totalWeight : 0;

  return {
    studyA: studyA.nctId,
    studyB: studyB.nctId,
    similarity: normalizedSimilarity,
    reasons: reasons.length > 0 ? reasons : ['No significant similarities found'],
    isDuplicate: normalizedSimilarity >= 0.75
  };
}

/**
 * Detect duplicate studies in a list
 * @param {Array} studies - Array of studies
 * @param {Object} options - Detection options
 * @returns {Object} Detection result with groups
 */
export function detectDuplicates(studies, options = {}) {
  const {
    minSimilarity = 0.75,
    groupSize = 2
  } = options;

  const comparisons = [];
  const groups = [];
  const processed = new Set();

  // Compare each study with each other
  for (let i = 0; i < studies.length; i++) {
    for (let j = i + 1; j < studies.length; j++) {
      const comparison = compareStudies(studies[i], studies[j], options);
      comparisons.push(comparison);

      if (comparison.similarity >= minSimilarity) {
        // Find existing group or create new one
        let group = groups.find(g =>
          g.primaryNctId === comparison.studyA ||
          g.duplicateNctIds.includes(comparison.studyA) ||
          g.duplicateNctIds.includes(comparison.studyB)
        );

        if (!group) {
          group = {
            id: crypto.randomUUID(),
            primaryNctId: comparison.studyA,
            duplicateNctIds: [],
            similarity: comparison.similarity,
            reason: comparison.reasons.join('; ')
          };
          groups.push(group);
        }

        // Add to group
        if (!group.duplicateNctIds.includes(comparison.studyB) && group.primaryNctId !== comparison.studyB) {
          group.duplicateNctIds.push(comparison.studyB);
        }

        // Update similarity to maximum in group
        group.similarity = Math.max(group.similarity, comparison.similarity);
        if (comparison.reasons.length > 0) {
          group.reason = comparison.reasons.join('; ');
        }
      }
    }
  }

  // Filter groups by minimum size
  const filteredGroups = groups.filter(g =>
    1 + g.duplicateNctIds.length >= groupSize
  );

  // Count total duplicates
  const totalDuplicates = filteredGroups.reduce(
    (sum, g) => sum + g.duplicateNctIds.length,
    0
  );

  return {
    groups: filteredGroups,
    totalDuplicates,
    comparisons,
    timestamp: new Date().toISOString()
  };
}

/**
 * Find duplicates for a specific study
 * @param {Object} targetStudy - The study to check
 * @param {Array} studies - Array of studies to compare against
 * @param {Object} options - Comparison options
 * @returns {Array} Array of potential duplicates
 */
export function findDuplicatesForStudy(targetStudy, studies, options = {}) {
  const duplicates = [];

  for (const study of studies) {
    if (study.nctId === targetStudy.nctId) continue;

    const comparison = compareStudies(targetStudy, study, options);
    if (comparison.isDuplicate) {
      duplicates.push({
        nctId: study.nctId,
        similarity: comparison.similarity,
        reasons: comparison.reasons,
        study: study
      });
    }
  }

  // Sort by similarity (descending)
  duplicates.sort((a, b) => b.similarity - a.similarity);

  return duplicates;
}

/**
 * Create a deduplicated list of studies
 * @param {Array} studies - Array of studies
 * @param {Object} options - Deduplication options
 * @returns {Object} Deduplication result
 */
export function deduplicateStudies(studies, options = {}) {
  const { keep = 'recent' } = options; // 'recent' or 'oldest'

  const detection = detectDuplicates(studies, options);
  const toRemove = new Set();
  const toKeep = new Set();

  for (const group of detection.groups) {
    const groupStudies = [
      group.primaryNctId,
      ...group.duplicateNctIds
    ];

    // Find the study objects
    const studyObjects = groupStudies
      .map(nctId => studies.find(s => s.nctId === nctId))
      .filter(Boolean);

    if (studyObjects.length === 0) continue;

    // Select which to keep
    let keeper;
    if (keep === 'recent') {
      keeper = studyObjects.reduce((a, b) =>
        new Date(a.lastUpdatePostDate || '0') > new Date(b.lastUpdatePostDate || '0') ? a : b
      );
    } else {
      keeper = studyObjects.reduce((a, b) =>
        new Date(a.studyFirstSubmitDate || '0') < new Date(b.studyFirstSubmitDate || '0') ? a : b
      );
    }

    toKeep.add(keeper.nctId);

    // Mark others for removal
    for (const study of studyObjects) {
      if (study.nctId !== keeper.nctId) {
        toRemove.add(study.nctId);
      }
    }
  }

  // Create deduplicated list
  const deduplicated = studies.filter(s => !toRemove.has(s.nctId));
  const removed = studies.filter(s => toRemove.has(s.nctId));

  return {
    deduplicated,
    removed,
    kept: toKeep.size,
    duplicates: detection.totalDuplicates,
    groups: detection.groups
  };
}

/**
 * Generate a duplicate detection report
 * @param {Object} detection - Detection result
 * @returns {string} HTML report
 */
export function generateDuplicateReport(detection) {
  let html = `
    <div class="duplicate-report p-6">
      <h2 class="text-xl font-bold mb-4">Duplicate Study Detection Report</h2>
      <div class="mb-4">
        <p class="text-gray-600">Generated: ${new Date().toLocaleString()}</p>
        <p class="text-gray-600">Total duplicate groups found: ${detection.groups.length}</p>
        <p class="text-gray-600">Total duplicate studies: ${detection.totalDuplicates}</p>
      </div>
  `;

  if (detection.groups.length === 0) {
    html += `
      <div class="bg-green-50 border border-green-200 rounded-lg p-4">
        <p class="text-green-800">No duplicate studies detected.</p>
      </div>
    `;
  } else {
    html += `<div class="space-y-4">`;

    for (const group of detection.groups) {
      html += `
        <div class="border border-yellow-200 bg-yellow-50 rounded-lg p-4">
          <div class="flex justify-between items-start mb-2">
            <h3 class="font-semibold text-yellow-800">
              Duplicate Group (similarity: ${(group.similarity * 100).toFixed(1)}%)
            </h3>
            <button class="text-sm text-blue-600 hover:text-blue-800" data-action="resolve-group" data-group-id="${group.id}">
              Resolve
            </button>
          </div>
          <p class="text-sm text-gray-600 mb-2">${group.reason}</p>
          <div class="text-sm">
            <p><strong>Primary:</strong> <code class="bg-white px-1 rounded">${group.primaryNctId}</code></p>
            <p><strong>Duplicates:</strong> ${group.duplicateNctIds.map(id => `<code class="bg-white px-1 rounded">${id}</code>`).join(', ')}</p>
          </div>
        </div>
      `;
    }

    html += `</div>`;
  }

  html += `</div>`;
  return html;
}

/**
 * Export duplicates to CSV
 * @param {Object} detection - Detection result
 * @returns {string} CSV content
 */
export function exportDuplicatesToCSV(detection) {
  let csv = 'Group ID,Primary Study,Duplicate Studies,Similarity,Reason\n';

  for (const group of detection.groups) {
    const duplicates = group.duplicateNctIds.join('; ');
    const reason = group.reason.replace(/,/g, ';');
    csv += `"${group.id}","${group.primaryNctId}","${duplicates}","${(group.similarity * 100).toFixed(2)}","${reason}"\n`;
  }

  return csv;
}

/**
 * Download duplicate detection report
 * @param {Object} detection - Detection result
 * @param {string} format - Format ('csv' or 'html')
 */
export function downloadDuplicateReport(detection, format = 'csv') {
  let content, filename, mimeType;

  if (format === 'csv') {
    content = exportDuplicatesToCSV(detection);
    filename = `duplicate_report_${Date.now()}.csv`;
    mimeType = 'text/csv';
  } else {
    content = generateDuplicateReport(detection);
    filename = `duplicate_report_${Date.now()}.html`;
    mimeType = 'text/html';
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default {
  detectDuplicates,
  findDuplicatesForStudy,
  deduplicateStudies,
  generateDuplicateReport,
  exportDuplicatesToCSV,
  downloadDuplicateReport
};
