/**
 * ROB 2.0 Assessment Component
 * Interactive risk of bias assessment tool
 */

import { db } from '../../db/schema.js';
import { showToast } from '../../lib/utils.js';
import {
  RESPONSE_OPTIONS,
  JUDGMENT,
  ROB2_DOMAINS,
  createAssessment,
  updateAssessment,
  getTrafficLightSummary,
  exportAssessment
} from '../../lib/rob/rob2.js';

// Response option labels
const RESPONSE_LABELS = {
  [RESPONSE_OPTIONS.YES]: 'Yes',
  [RESPONSE_OPTIONS.PROBABLY_YES]: 'Probably yes',
  [RESPONSE_OPTIONS.NO]: 'No',
  [RESPONSE_OPTIONS.PROBABLY_NO]: 'Probably no',
  [RESPONSE_OPTIONS.NO_INFORMATION]: 'No information',
  [RESPONSE_OPTIONS.NOT_APPLICABLE]: 'Not applicable'
};

/**
 * Render ROB 2.0 assessment page
 */
export async function render(params) {
  const { projectId, studyId, outcomeId } = params;

  if (!projectId || !studyId) {
    return `
      <div class="card text-center py-12">
        <h2 class="text-xl font-semibold text-danger-700">Missing Parameters</h2>
        <p class="text-gray-600 mt-2">Study ID is required for ROB 2.0 assessment.</p>
      </div>
    `;
  }

  // Load or create assessment
  let assessment = await db.robAssessments?.get([projectId, studyId, outcomeId || 'primary']);
  if (!assessment) {
    assessment = createAssessment(studyId, outcomeId || 'primary');
    assessment.projectId = projectId;
  }

  const trafficLight = getTrafficLightSummary(assessment);

  return `
    <div class="rob2-assessment" data-project-id="${projectId}" data-study-id="${studyId}" data-outcome-id="${outcomeId || 'primary'}">
      <!-- Header -->
      <div class="flex justify-between items-center mb-6">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Risk of Bias Assessment</h1>
          <p class="text-gray-600 mt-1">ROB 2.0 - Study: ${studyId}</p>
        </div>
        <div class="flex space-x-3">
          <button id="export-rob-btn" class="btn-secondary">
            <svg class="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Export
          </button>
          <button id="save-rob-btn" class="btn-primary">
            <svg class="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
            Save Assessment
          </button>
        </div>
      </div>

      <!-- Traffic Light Summary -->
      <div class="card mb-6">
        <h2 class="text-lg font-semibold text-gray-900 mb-4">Summary</h2>
        <div class="flex items-center space-x-4">
          ${trafficLight.map(d => `
            <div class="flex flex-col items-center">
              <div class="w-8 h-8 rounded-full" style="background-color: ${d.color}"></div>
              <span class="text-xs text-gray-600 mt-1 text-center max-w-16">${d.name.split(' ')[0]}</span>
            </div>
          `).join('')}
          <div class="border-l border-gray-300 pl-4 ml-4">
            <div class="flex flex-col items-center">
              <div class="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
                   style="background-color: ${getOverallColor(assessment.overallJudgment)}">
                ${assessment.overallJudgment ? assessment.overallJudgment.charAt(0) : '?'}
              </div>
              <span class="text-xs text-gray-600 mt-1">Overall</span>
            </div>
          </div>
        </div>
        ${assessment.overallJudgment ? `
          <p class="mt-3 text-sm">
            <span class="font-medium">Overall judgment:</span>
            <span class="ml-2 px-2 py-1 rounded text-sm" style="background-color: ${getOverallColor(assessment.overallJudgment)}20; color: ${getOverallColor(assessment.overallJudgment)}">
              ${assessment.overallJudgment}
            </span>
          </p>
        ` : ''}
      </div>

      <!-- Domain Assessments -->
      <div class="space-y-6">
        ${Object.entries(ROB2_DOMAINS).map(([domainId, domain]) => renderDomain(domainId, domain, assessment)).join('')}
      </div>

      <!-- Notes -->
      <div class="card mt-6">
        <h2 class="text-lg font-semibold text-gray-900 mb-4">Additional Notes</h2>
        <textarea id="rob-notes" class="input w-full" rows="4" placeholder="Any additional notes about this assessment...">${assessment.notes || ''}</textarea>
      </div>
    </div>
  `;
}

/**
 * Render a single domain
 */
function renderDomain(domainId, domain, assessment) {
  const judgment = assessment.domainJudgments[domainId];
  const judgmentColor = getJudgmentColor(judgment);

  return `
    <div class="card" id="domain-${domainId}">
      <div class="flex justify-between items-start mb-4">
        <div>
          <h3 class="text-lg font-semibold text-gray-900">${domainId}: ${domain.name}</h3>
          <p class="text-sm text-gray-600">${domain.description}</p>
        </div>
        <div class="flex items-center space-x-2">
          <span class="text-sm text-gray-500">Domain judgment:</span>
          <span class="px-3 py-1 rounded-full text-sm font-medium"
                style="background-color: ${judgmentColor}20; color: ${judgmentColor}">
            ${judgment || 'Incomplete'}
          </span>
        </div>
      </div>

      <div class="space-y-4">
        ${domain.questions.map(q => renderQuestion(q, assessment)).join('')}
      </div>
    </div>
  `;
}

/**
 * Render a signaling question
 */
function renderQuestion(question, assessment) {
  const response = assessment.responses[question.id];
  const supportingText = assessment.supportingText[question.id] || '';

  return `
    <div class="border border-gray-200 rounded-lg p-4" data-question-id="${question.id}">
      <div class="flex justify-between items-start">
        <div class="flex-1">
          <p class="font-medium text-gray-900">${question.id}. ${question.text}</p>
          <p class="text-sm text-gray-500 mt-1">${question.guidance}</p>
        </div>
      </div>

      <div class="mt-3 flex flex-wrap gap-2">
        ${Object.entries(RESPONSE_LABELS).map(([value, label]) => `
          <label class="inline-flex items-center">
            <input type="radio" name="q-${question.id}" value="${value}"
                   class="rob-response h-4 w-4 text-primary-600 border-gray-300"
                   ${response === value ? 'checked' : ''}>
            <span class="ml-2 text-sm ${response === value ? 'font-medium text-primary-700' : 'text-gray-700'}">${label}</span>
          </label>
        `).join('')}
      </div>

      <div class="mt-3">
        <input type="text" class="rob-supporting-text input w-full text-sm"
               data-question-id="${question.id}"
               placeholder="Supporting text (optional)..."
               value="${supportingText}">
      </div>
    </div>
  `;
}

/**
 * Get color for judgment
 */
function getJudgmentColor(judgment) {
  const colors = {
    [JUDGMENT.LOW]: '#22c55e',
    [JUDGMENT.SOME_CONCERNS]: '#f59e0b',
    [JUDGMENT.HIGH]: '#ef4444'
  };
  return colors[judgment] || '#9ca3af';
}

/**
 * Get color for overall judgment
 */
function getOverallColor(judgment) {
  return getJudgmentColor(judgment);
}

/**
 * Initialize the assessment page
 */
export async function init(params) {
  const container = document.querySelector('.rob2-assessment');
  if (!container) return;

  const projectId = container.dataset.projectId;
  const studyId = container.dataset.studyId;
  const outcomeId = container.dataset.outcomeId;

  // Load current assessment
  let assessment = await db.robAssessments?.get([projectId, studyId, outcomeId]);
  if (!assessment) {
    assessment = createAssessment(studyId, outcomeId);
    assessment.projectId = projectId;
  }

  // Handle response changes
  container.querySelectorAll('.rob-response').forEach(radio => {
    radio.addEventListener('change', async (e) => {
      const questionId = e.target.name.replace('q-', '');
      const value = e.target.value;

      assessment = updateAssessment(assessment, { [questionId]: value });
      await saveAndRefresh(assessment, container);
    });
  });

  // Handle supporting text changes
  container.querySelectorAll('.rob-supporting-text').forEach(input => {
    input.addEventListener('change', async (e) => {
      const questionId = e.target.dataset.questionId;
      assessment.supportingText[questionId] = e.target.value;
      assessment.updatedAt = new Date().toISOString();
    });
  });

  // Handle notes changes
  document.getElementById('rob-notes')?.addEventListener('change', (e) => {
    assessment.notes = e.target.value;
    assessment.updatedAt = new Date().toISOString();
  });

  // Save button
  document.getElementById('save-rob-btn')?.addEventListener('click', async () => {
    try {
      await db.robAssessments?.put(assessment);
      showToast({ type: 'success', message: 'Assessment saved' });
    } catch (err) {
      console.error('Failed to save assessment:', err);
      showToast({ type: 'error', message: 'Failed to save assessment' });
    }
  });

  // Export button
  document.getElementById('export-rob-btn')?.addEventListener('click', () => {
    const exported = exportAssessment(assessment);
    const blob = new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rob2_${studyId}_${outcomeId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
}

/**
 * Save assessment and refresh UI
 */
async function saveAndRefresh(assessment, container) {
  // Update traffic light summary
  const trafficLight = getTrafficLightSummary(assessment);

  // Update domain judgment badges
  Object.entries(assessment.domainJudgments).forEach(([domainId, judgment]) => {
    const domainEl = container.querySelector(`#domain-${domainId}`);
    if (domainEl) {
      const badge = domainEl.querySelector('.rounded-full');
      if (badge) {
        const color = getJudgmentColor(judgment);
        badge.style.backgroundColor = `${color}20`;
        badge.style.color = color;
        badge.textContent = judgment || 'Incomplete';
      }
    }
  });

  // Auto-save
  try {
    await db.robAssessments?.put(assessment);
  } catch (err) {
    console.error('Auto-save failed:', err);
  }
}

export default { render, init };
