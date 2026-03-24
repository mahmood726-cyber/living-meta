/**
 * PRISMA 2020 Checklist Component
 * 27-item checklist for reporting systematic reviews
 * Reference: Page et al. (2021) BMJ
 */

/**
 * PRISMA 2020 checklist items with domains
 */
export const PRISMA_2020_ITEMS = [
  // Title
  {
    id: 1,
    domain: 'Title',
    item: 'Title',
    description: 'Identify the report as a systematic review.',
    guidance: 'Include "systematic review" and/or "meta-analysis" in the title.',
    ctgovRelevance: 'low'
  },

  // Abstract
  {
    id: 2,
    domain: 'Abstract',
    item: 'Abstract',
    description: 'See the PRISMA 2020 for Abstracts checklist.',
    guidance: 'Provide a structured summary including objectives, methods, results, and conclusions.',
    ctgovRelevance: 'low'
  },

  // Introduction
  {
    id: 3,
    domain: 'Introduction',
    item: 'Rationale',
    description: 'Describe the rationale for the review in the context of existing knowledge.',
    guidance: 'Explain why the review was needed given prior evidence.',
    ctgovRelevance: 'low'
  },
  {
    id: 4,
    domain: 'Introduction',
    item: 'Objectives',
    description: 'Provide an explicit statement of the objective(s) or question(s) the review addresses.',
    guidance: 'State the review question using PICO or similar framework.',
    ctgovRelevance: 'medium'
  },

  // Methods
  {
    id: 5,
    domain: 'Methods',
    item: 'Eligibility criteria',
    description: 'Specify the inclusion and exclusion criteria for the review and how studies were grouped for the syntheses.',
    guidance: 'Define PICO elements, study design, language, date restrictions.',
    ctgovRelevance: 'high'
  },
  {
    id: 6,
    domain: 'Methods',
    item: 'Information sources',
    description: 'Specify all databases, registers, websites, organisations, reference lists and other sources searched or consulted to identify studies.',
    guidance: 'For this tool: ClinicalTrials.gov is the primary source. Note limitations of registry-only search.',
    ctgovRelevance: 'high',
    autoFillable: true,
    autoFillSource: 'Registry search configuration'
  },
  {
    id: 7,
    domain: 'Methods',
    item: 'Search strategy',
    description: 'Present the full search strategies for all databases, registers and websites, including any filters and limits used.',
    guidance: 'The CT.gov query builder parameters constitute the search strategy.',
    ctgovRelevance: 'high',
    autoFillable: true,
    autoFillSource: 'Saved search queries'
  },
  {
    id: 8,
    domain: 'Methods',
    item: 'Selection process',
    description: 'Specify the methods used to decide whether a study met the inclusion criteria of the review.',
    guidance: 'Describe screening stages, number of reviewers, conflict resolution.',
    ctgovRelevance: 'high',
    autoFillable: true,
    autoFillSource: 'Screening workflow configuration'
  },
  {
    id: 9,
    domain: 'Methods',
    item: 'Data collection process',
    description: 'Specify the methods used to collect data from reports, including how many reviewers collected data from each report.',
    guidance: 'Describe auto-extraction from registry plus any manual verification.',
    ctgovRelevance: 'high',
    autoFillable: true,
    autoFillSource: 'Extraction settings'
  },
  {
    id: 10,
    domain: 'Methods',
    item: 'Data items',
    description: 'List and define all outcomes for which data were sought. List and define all other variables for which data were sought.',
    guidance: 'List primary and secondary outcomes, subgroup/moderator variables.',
    ctgovRelevance: 'high',
    autoFillable: true,
    autoFillSource: 'Outcome definitions'
  },
  {
    id: 11,
    domain: 'Methods',
    item: 'Study risk of bias assessment',
    description: 'Specify the methods used to assess risk of bias in the included studies.',
    guidance: 'Describe ROB 2.0 domains assessed using registry data. Note limitations.',
    ctgovRelevance: 'high',
    autoFillable: true,
    autoFillSource: 'ROB 2.0 configuration'
  },
  {
    id: 12,
    domain: 'Methods',
    item: 'Effect measures',
    description: 'Specify for each outcome the effect measure(s) (e.g., risk ratio, mean difference) used in the synthesis or presentation of results.',
    guidance: 'State effect measures (OR, RR, RD, MD, SMD, HR) with rationale.',
    ctgovRelevance: 'high',
    autoFillable: true,
    autoFillSource: 'Analysis specification'
  },
  {
    id: 13,
    domain: 'Methods',
    item: 'Synthesis methods',
    description: 'Describe the processes used to decide which studies were eligible for each synthesis.',
    guidance: 'Describe meta-analysis model (FE, RE-DL, RE-REML), HKSJ adjustment, etc.',
    ctgovRelevance: 'high',
    autoFillable: true,
    autoFillSource: 'Meta-analysis settings'
  },
  {
    id: 14,
    domain: 'Methods',
    item: 'Reporting bias assessment',
    description: 'Describe any methods used to assess risk of bias due to missing results in a synthesis.',
    guidance: 'Describe funnel plots, Egger/Peters/Harbord tests, EIM module.',
    ctgovRelevance: 'high',
    autoFillable: true,
    autoFillSource: 'Publication bias tests and EIM'
  },
  {
    id: 15,
    domain: 'Methods',
    item: 'Certainty assessment',
    description: 'Describe any methods used to assess certainty (or confidence) in the body of evidence for an outcome.',
    guidance: 'Describe GRADE or CINeMA assessment if performed.',
    ctgovRelevance: 'medium'
  },

  // Results
  {
    id: 16,
    domain: 'Results',
    item: 'Study selection',
    description: 'Describe the results of the search and selection process, ideally using a flow diagram.',
    guidance: 'PRISMA flow diagram with numbers at each stage.',
    ctgovRelevance: 'high',
    autoFillable: true,
    autoFillSource: 'PRISMA flow diagram'
  },
  {
    id: 17,
    domain: 'Results',
    item: 'Study characteristics',
    description: 'Cite each included study and present its characteristics.',
    guidance: 'Table of included studies with key characteristics.',
    ctgovRelevance: 'high',
    autoFillable: true,
    autoFillSource: 'Included studies table'
  },
  {
    id: 18,
    domain: 'Results',
    item: 'Risk of bias in studies',
    description: 'Present assessments of risk of bias for each included study.',
    guidance: 'ROB 2.0 summary table/traffic light plot.',
    ctgovRelevance: 'high',
    autoFillable: true,
    autoFillSource: 'ROB 2.0 assessments'
  },
  {
    id: 19,
    domain: 'Results',
    item: 'Results of individual studies',
    description: 'For all outcomes, present, for each study: (a) summary statistics for each group and (b) an effect estimate and its precision.',
    guidance: 'Forest plot and/or results table.',
    ctgovRelevance: 'high',
    autoFillable: true,
    autoFillSource: 'Forest plot data'
  },
  {
    id: 20,
    domain: 'Results',
    item: 'Results of syntheses',
    description: 'For each synthesis, briefly summarise the characteristics and risk of bias among contributing studies.',
    guidance: 'Present pooled estimates, heterogeneity (τ², I², PI), meta-regression if relevant.',
    ctgovRelevance: 'high',
    autoFillable: true,
    autoFillSource: 'Meta-analysis results'
  },
  {
    id: 21,
    domain: 'Results',
    item: 'Reporting biases',
    description: 'Present assessments of risk of bias due to missing results for each synthesis assessed.',
    guidance: 'Funnel plot, bias test results, EIM summary.',
    ctgovRelevance: 'high',
    autoFillable: true,
    autoFillSource: 'EIM and bias tests'
  },
  {
    id: 22,
    domain: 'Results',
    item: 'Certainty of evidence',
    description: 'Present assessments of certainty in the body of evidence for each outcome assessed.',
    guidance: 'GRADE/CINeMA summary of findings table.',
    ctgovRelevance: 'medium'
  },

  // Discussion
  {
    id: 23,
    domain: 'Discussion',
    item: 'Discussion',
    description: 'Provide a general interpretation of the results in the context of other evidence.',
    guidance: 'Discuss findings, compare to previous reviews, clinical implications.',
    ctgovRelevance: 'low'
  },
  {
    id: 24,
    domain: 'Discussion',
    item: 'Limitations',
    description: 'Discuss any limitations of the evidence included in the review and of the review processes used.',
    guidance: 'Address registry-only limitation, missing publication data, incomplete ROB assessment.',
    ctgovRelevance: 'high',
    autoFillable: true,
    autoFillSource: 'Standard limitations text'
  },

  // Other information
  {
    id: 25,
    domain: 'Other',
    item: 'Registration and protocol',
    description: 'Provide registration information for the review, including register name and registration number, or state that the review was not registered.',
    guidance: 'PROSPERO registration if applicable.',
    ctgovRelevance: 'low'
  },
  {
    id: 26,
    domain: 'Other',
    item: 'Support',
    description: 'Describe sources of financial or non-financial support for the review, and the role of the funders or sponsors in the review.',
    guidance: 'Funding sources and conflicts of interest.',
    ctgovRelevance: 'low'
  },
  {
    id: 27,
    domain: 'Other',
    item: 'Competing interests',
    description: 'Declare any competing interests of review authors.',
    guidance: 'Conflicts of interest statement.',
    ctgovRelevance: 'low'
  }
];

/**
 * Group items by domain
 */
export function getItemsByDomain() {
  const domains = {};
  PRISMA_2020_ITEMS.forEach(item => {
    if (!domains[item.domain]) {
      domains[item.domain] = [];
    }
    domains[item.domain].push(item);
  });
  return domains;
}

/**
 * Generate checklist status from project data
 * @param {object} project - Project data
 * @returns {object} Checklist with completion status
 */
export function generateChecklistStatus(project) {
  const status = {};

  PRISMA_2020_ITEMS.forEach(item => {
    status[item.id] = {
      ...item,
      completed: false,
      location: null,
      notes: '',
      autoFilled: false,
      autoFilledContent: null
    };

    // Auto-fill where possible
    if (item.autoFillable) {
      const autoFill = getAutoFillContent(item, project);
      if (autoFill) {
        status[item.id].autoFilled = true;
        status[item.id].autoFilledContent = autoFill;
        status[item.id].completed = true;
      }
    }
  });

  return status;
}

/**
 * Get auto-fill content for an item
 */
function getAutoFillContent(item, project) {
  switch (item.id) {
    case 6: // Information sources
      return `ClinicalTrials.gov registry (https://clinicaltrials.gov) was searched on ${project.lastSearchDate || '[date]'}. This review used registry data only and did not search bibliographic databases.`;

    case 7: // Search strategy
      if (project.searchQuery) {
        return `Search query: ${project.searchQuery}`;
      }
      break;

    case 8: // Selection process
      return project.screeningConfig ?
        `Studies were screened in ${project.screeningConfig.stages || 2} stages. ${project.screeningConfig.reviewers || 'Single reviewer'} screening.` :
        null;

    case 12: // Effect measures
      if (project.analysisSpec) {
        return `${project.analysisSpec.effectMeasure} was used as the effect measure. Binary outcomes analyzed as ${project.analysisSpec.binaryMeasure || 'OR'}; continuous outcomes as ${project.analysisSpec.continuousMeasure || 'SMD'}.`;
      }
      break;

    case 13: // Synthesis methods
      return `Random effects meta-analysis using restricted maximum likelihood (REML) estimation with Hartung-Knapp-Sidik-Jonkman adjustment for confidence intervals. Heterogeneity assessed using τ², I², and prediction intervals.`;

    case 14: // Reporting bias assessment
      return `Funnel plots were visually inspected. Egger's regression test was used for continuous outcomes, Peters' test for binary outcomes. The Evidence Integrity Module assessed non-publication risk based on trial completion dates and results posting status.`;

    case 16: // Study selection
      return project.prismaData ? 'PRISMA flow diagram generated from screening data.' : null;

    case 24: // Limitations
      return generateLimitationsText(project);

    default:
      return null;
  }
}

/**
 * Generate standard limitations text
 */
function generateLimitationsText(project) {
  const limitations = [
    'This review used ClinicalTrials.gov registry data only and did not include bibliographic database searches or grey literature.',
    'Outcome data were limited to aggregate statistics posted in the registry, which may not include all timepoints or subgroups reported in full publications.',
    'Risk of bias assessment using ROB 2.0 was partially informed by registry data; some domains (e.g., deviation from protocol) could not be fully assessed.',
  ];

  if (project.coverageRate && project.coverageRate < 0.7) {
    limitations.push(`Only ${Math.round(project.coverageRate * 100)}% of included trials had posted results, limiting the evidence base for meta-analysis.`);
  }

  return limitations.join(' ');
}

/**
 * Calculate completion percentage
 */
export function calculateCompletion(checklistStatus) {
  const items = Object.values(checklistStatus);
  const completed = items.filter(i => i.completed).length;
  return {
    completed,
    total: items.length,
    percentage: Math.round((completed / items.length) * 100)
  };
}

/**
 * Export checklist as CSV
 */
export function exportChecklistCSV(checklistStatus) {
  const headers = ['Item', 'Domain', 'Description', 'Completed', 'Location', 'Notes'];
  const rows = Object.values(checklistStatus).map(item => [
    item.id,
    item.domain,
    item.description,
    item.completed ? 'Yes' : 'No',
    item.location || '',
    item.notes || ''
  ]);

  const csv = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'prisma-2020-checklist.csv';
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Render checklist UI
 */
export function render(params = {}, query = {}) {
  const projectId = params.id;

  return `
    <div class="prisma-checklist">
      <div class="flex justify-between items-center mb-6">
        <div>
          <h1>PRISMA 2020 Checklist</h1>
          <p class="text-gray-600">27-item reporting guideline for systematic reviews</p>
        </div>
        <div class="flex gap-2">
          <button id="export-checklist" class="btn-secondary">
            Export CSV
          </button>
          <button id="auto-fill-all" class="btn-primary">
            Auto-fill from Project
          </button>
        </div>
      </div>

      <div class="card mb-4">
        <div class="flex items-center gap-4">
          <div class="flex-1">
            <div class="h-4 bg-gray-200 rounded-full overflow-hidden">
              <div id="completion-bar" class="h-full bg-primary-600 transition-all" style="width: 0%"></div>
            </div>
          </div>
          <div id="completion-text" class="text-sm font-medium">0/27 items completed</div>
        </div>
      </div>

      <div id="checklist-container">
        ${renderChecklistSections()}
      </div>

      <div class="mt-6 p-4 bg-blue-50 border border-blue-200 rounded">
        <h3 class="font-medium text-blue-900 mb-2">About this checklist</h3>
        <p class="text-sm text-blue-800">
          The PRISMA 2020 statement (Page et al., 2021) provides updated reporting guidance for systematic reviews.
          Items marked with ⚡ can be auto-filled from your project data. Items with 🏥 have high relevance when using
          ClinicalTrials.gov registry data.
        </p>
      </div>
    </div>
  `;
}

/**
 * Render checklist sections
 */
function renderChecklistSections() {
  const domains = getItemsByDomain();

  return Object.entries(domains).map(([domain, items]) => `
    <div class="card mb-4">
      <h3 class="font-semibold text-lg mb-4 pb-2 border-b">${domain}</h3>
      <div class="space-y-4">
        ${items.map(item => renderChecklistItem(item)).join('')}
      </div>
    </div>
  `).join('');
}

/**
 * Render single checklist item
 */
function renderChecklistItem(item) {
  const relevanceIcon = item.ctgovRelevance === 'high' ? '🏥' : '';
  const autoFillIcon = item.autoFillable ? '⚡' : '';

  return `
    <div class="checklist-item p-3 border rounded hover:bg-gray-50" data-item-id="${item.id}">
      <div class="flex items-start gap-3">
        <input type="checkbox" id="item-${item.id}" class="mt-1 item-checkbox"
               data-item-id="${item.id}">
        <div class="flex-1">
          <label for="item-${item.id}" class="font-medium cursor-pointer">
            ${item.id}. ${item.item}
            ${relevanceIcon} ${autoFillIcon}
          </label>
          <p class="text-sm text-gray-600 mt-1">${item.description}</p>
          <details class="mt-2">
            <summary class="text-xs text-primary-600 cursor-pointer">Guidance</summary>
            <p class="text-xs text-gray-500 mt-1 pl-2 border-l-2 border-gray-200">
              ${item.guidance}
            </p>
          </details>
          <div class="mt-2 flex gap-2">
            <input type="text" placeholder="Page/section location"
                   class="item-location text-sm px-2 py-1 border rounded w-40"
                   data-item-id="${item.id}">
            <input type="text" placeholder="Notes"
                   class="item-notes text-sm px-2 py-1 border rounded flex-1"
                   data-item-id="${item.id}">
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Initialize checklist interactions
 */
export function init(params = {}, query = {}) {
  const projectId = params.id;

  // Load saved checklist state
  loadChecklistState(projectId);

  // Checkbox handlers
  document.querySelectorAll('.item-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      saveItemState(projectId, e.target.dataset.itemId, 'completed', e.target.checked);
      updateCompletionBar(projectId);
    });
  });

  // Location input handlers
  document.querySelectorAll('.item-location').forEach(input => {
    input.addEventListener('change', (e) => {
      saveItemState(projectId, e.target.dataset.itemId, 'location', e.target.value);
    });
  });

  // Notes input handlers
  document.querySelectorAll('.item-notes').forEach(input => {
    input.addEventListener('change', (e) => {
      saveItemState(projectId, e.target.dataset.itemId, 'notes', e.target.value);
    });
  });

  // Export button
  document.getElementById('export-checklist')?.addEventListener('click', () => {
    const state = loadChecklistState(projectId);
    exportChecklistCSV(state);
  });

  // Auto-fill button
  document.getElementById('auto-fill-all')?.addEventListener('click', async () => {
    await autoFillFromProject(projectId);
  });

  updateCompletionBar(projectId);
}

/**
 * Load checklist state from localStorage
 */
function loadChecklistState(projectId) {
  const key = `prisma-checklist-${projectId}`;
  const saved = localStorage.getItem(key);

  if (saved) {
    const state = JSON.parse(saved);

    // Restore UI state
    Object.entries(state).forEach(([itemId, itemState]) => {
      const checkbox = document.querySelector(`#item-${itemId}`);
      const locationInput = document.querySelector(`.item-location[data-item-id="${itemId}"]`);
      const notesInput = document.querySelector(`.item-notes[data-item-id="${itemId}"]`);

      if (checkbox) checkbox.checked = itemState.completed;
      if (locationInput) locationInput.value = itemState.location || '';
      if (notesInput) notesInput.value = itemState.notes || '';
    });

    return state;
  }

  return {};
}

/**
 * Save item state
 */
function saveItemState(projectId, itemId, field, value) {
  const key = `prisma-checklist-${projectId}`;
  const state = JSON.parse(localStorage.getItem(key) || '{}');

  if (!state[itemId]) {
    state[itemId] = {};
  }
  state[itemId][field] = value;

  localStorage.setItem(key, JSON.stringify(state));
}

/**
 * Update completion bar
 */
function updateCompletionBar(projectId) {
  const checkboxes = document.querySelectorAll('.item-checkbox');
  const completed = Array.from(checkboxes).filter(cb => cb.checked).length;
  const total = checkboxes.length;
  const percentage = Math.round((completed / total) * 100);

  const bar = document.getElementById('completion-bar');
  const text = document.getElementById('completion-text');

  if (bar) bar.style.width = `${percentage}%`;
  if (text) text.textContent = `${completed}/${total} items completed (${percentage}%)`;
}

/**
 * Auto-fill from project data
 */
async function autoFillFromProject(projectId) {
  // This would load project data and auto-fill applicable items
  // For now, just mark auto-fillable items as needing attention

  const autoFillableItems = PRISMA_2020_ITEMS.filter(i => i.autoFillable);

  autoFillableItems.forEach(item => {
    const row = document.querySelector(`[data-item-id="${item.id}"]`);
    if (row) {
      row.classList.add('bg-yellow-50');
      const notesInput = row.querySelector('.item-notes');
      if (notesInput && !notesInput.value) {
        notesInput.value = `Auto-fill: ${item.autoFillSource}`;
        saveItemState(projectId, item.id, 'notes', notesInput.value);
      }
    }
  });

  alert(`${autoFillableItems.length} items marked for auto-fill. Review and complete each item.`);
}

export default {
  PRISMA_2020_ITEMS,
  getItemsByDomain,
  generateChecklistStatus,
  calculateCompletion,
  exportChecklistCSV,
  render,
  init
};
