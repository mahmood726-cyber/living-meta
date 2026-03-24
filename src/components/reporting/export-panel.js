/**
 * Export Panel Component
 * Full reporting UI with PRISMA flow, SoF table, and export options
 */

import { db } from '../../db/schema.js';
import { renderPRISMAFlow, exportPRISMAFlow, generatePRISMAData } from './prisma-flow.js';
import { renderSoFTable, generateSoFData, exportSoFHTML } from './sof-table.js';

// Component state
let reportState = {
  projectId: null,
  project: null,
  screening: [],
  extractions: [],
  analysisResults: null,
  eimSummary: null,
  activeTab: 'prisma'
};

/**
 * Main render function
 */
export async function render(params) {
  reportState.projectId = params.id;

  return `
    <div id="export-container" class="space-y-6">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold text-gray-900">Reporting & Export</h1>
        <a href="#/project/${params.id}/analysis" class="btn-secondary text-sm">
          <svg class="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 17l-5-5m0 0l5-5m-5 5h12" />
          </svg>
          Back to Analysis
        </a>
      </div>

      <div id="export-content">
        <div class="flex items-center justify-center h-64">
          <div class="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full"></div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Initialize component
 */
export async function init(params) {
  // Load project data
  reportState.project = await db.projects.get(params.id);

  // Load screening decisions
  reportState.screening = await db.screening.where('projectId', params.id);

  // Load extractions
  reportState.extractions = await db.extraction.where('projectId', params.id);

  // Load analysis results
  const allAnalysisResults = await db.analysisResults.where('projectId', params.id);
  const analysisResult = allAnalysisResults.length > 0 ? allAnalysisResults[allAnalysisResults.length - 1] : null;

  if (analysisResult) {
    reportState.analysisResults = analysisResult.results;
  }

  // Load EIM summary
  const allEimResults = await db.eimMeta.where('projectId', params.id);
  const eimResult = allEimResults.length > 0 ? allEimResults[allEimResults.length - 1] : null;

  if (eimResult) {
    reportState.eimSummary = eimResult;
  }

  rerenderContent();
}

/**
 * Re-render content
 */
function rerenderContent() {
  const container = document.getElementById('export-content');
  if (!container) return;

  container.innerHTML = `
    ${renderWarningsBanner()}
    ${renderTabs()}
    ${renderTabContent()}
    ${renderExportOptions()}
  `;

  initializeTabContent();
  bindEvents();
}

/**
 * Render mandatory warnings banner
 */
function renderWarningsBanner() {
  const warnings = [];

  // Coverage warning
  if (reportState.eimSummary?.coverage) {
    const coverage = reportState.eimSummary.coverage.coverage;
    if (coverage < 0.7) {
      warnings.push({
        type: coverage < 0.5 ? 'critical' : 'warning',
        title: 'Results Coverage',
        message: `Only ${(coverage * 100).toFixed(0)}% of eligible completed trials have posted results. Conclusions may be biased by missing data.`
      });
    }
  }

  // EIM summary
  if (reportState.eimSummary?.metaSummary) {
    const summary = reportState.eimSummary.metaSummary;
    if (summary.non_publication_rate > 0.3) {
      warnings.push({
        type: 'warning',
        title: 'Non-Publication Risk',
        message: `${(summary.non_publication_rate * 100).toFixed(0)}% of trials are missing results. Missing ~${formatNumber(summary.missing_participant_years)} participant-years of data.`
      });
    }
  }

  // TSA status
  if (reportState.analysisResults?.tsa) {
    const tsa = reportState.analysisResults.tsa;
    if (tsa.conclusion !== 'firm_evidence') {
      warnings.push({
        type: 'info',
        title: 'TSA Status',
        message: `Trial Sequential Analysis: ${(tsa.information_fraction * 100).toFixed(0)}% of required information size reached. More data may be needed before firm conclusions.`
      });
    }
  }

  if (warnings.length === 0) {
    return `
      <div class="card bg-green-50 border-green-200 mb-6">
        <div class="flex items-center">
          <svg class="w-5 h-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
          </svg>
          <span class="text-green-800 font-medium">No critical evidence integrity concerns detected.</span>
        </div>
      </div>
    `;
  }

  const hasCritical = warnings.some(w => w.type === 'critical');

  return `
    <div class="card ${hasCritical ? 'bg-red-50 border-red-200' : 'bg-yellow-50 border-yellow-200'} mb-6">
      <div class="flex items-start mb-3">
        <svg class="w-5 h-5 ${hasCritical ? 'text-red-500' : 'text-yellow-500'} mt-0.5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
        </svg>
        <div>
          <p class="font-medium ${hasCritical ? 'text-red-800' : 'text-yellow-800'}">
            Mandatory Report Disclosures
          </p>
          <p class="text-sm ${hasCritical ? 'text-red-700' : 'text-yellow-700'}">
            The following warnings will be included in all exported reports:
          </p>
        </div>
      </div>
      <div class="space-y-2 ml-7">
        ${warnings.map(w => `
          <div class="flex items-start">
            <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
              w.type === 'critical' ? 'bg-red-200 text-red-800' :
              w.type === 'warning' ? 'bg-yellow-200 text-yellow-800' :
              'bg-blue-200 text-blue-800'
            } mr-2">${w.title}</span>
            <span class="text-sm ${hasCritical ? 'text-red-700' : 'text-yellow-700'}">${w.message}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

/**
 * Render tabs
 */
function renderTabs() {
  const tabs = [
    { id: 'prisma', label: 'PRISMA Flow', icon: 'M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z' },
    { id: 'sof', label: 'Summary of Findings', icon: 'M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2' },
    { id: 'characteristics', label: 'Study Characteristics', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' }
  ];

  return `
    <div class="border-b border-gray-200 mb-6">
      <nav class="flex space-x-8">
        ${tabs.map(tab => `
          <button class="tab-btn pb-4 px-1 border-b-2 font-medium text-sm transition-colors ${
            reportState.activeTab === tab.id ?
              'border-primary-500 text-primary-600' :
              'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }" data-tab="${tab.id}">
            <svg class="w-5 h-5 inline mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${tab.icon}" />
            </svg>
            ${tab.label}
          </button>
        `).join('')}
      </nav>
    </div>
  `;
}

/**
 * Render tab content
 */
function renderTabContent() {
  switch (reportState.activeTab) {
    case 'prisma':
      return renderPRISMATab();
    case 'sof':
      return renderSoFTab();
    case 'characteristics':
      return renderCharacteristicsTab();
    default:
      return '';
  }
}

/**
 * Render PRISMA tab
 */
function renderPRISMATab() {
  return `
    <div class="card">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold">PRISMA 2020 Flow Diagram</h2>
        <button id="export-prisma-btn" class="btn-secondary text-sm">
          Export PNG
        </button>
      </div>
      <div id="prisma-canvas-container" class="overflow-x-auto">
        <canvas id="prisma-canvas" class="mx-auto"></canvas>
      </div>
    </div>
  `;
}

/**
 * Render SoF tab
 */
function renderSoFTab() {
  if (!reportState.analysisResults) {
    return `
      <div class="card text-center py-12">
        <svg class="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        <h3 class="text-lg font-medium text-gray-900 mb-2">No Analysis Results</h3>
        <p class="text-gray-600 mb-4">Run a meta-analysis first to generate a Summary of Findings table.</p>
        <a href="#/project/${reportState.projectId}/analysis" class="btn-primary">Go to Analysis</a>
      </div>
    `;
  }

  return `
    <div class="card">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold">Summary of Findings Table</h2>
        <button id="export-sof-btn" class="btn-secondary text-sm">
          Export HTML
        </button>
      </div>
      <div id="sof-table-container"></div>
    </div>
  `;
}

/**
 * Render study characteristics tab
 */
function renderCharacteristicsTab() {
  const included = reportState.screening.filter(s => s.decision === 'include');

  return `
    <div class="card">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold">Characteristics of Included Studies</h2>
        <button id="export-chars-btn" class="btn-secondary text-sm">
          Export CSV
        </button>
      </div>

      ${included.length === 0 ? `
        <p class="text-gray-500 text-center py-8">No studies included yet.</p>
      ` : `
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200 text-sm">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Study ID</th>
                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Phase</th>
                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Enrollment</th>
                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Results</th>
                <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Extracted</th>
              </tr>
            </thead>
            <tbody id="characteristics-tbody" class="bg-white divide-y divide-gray-200">
              <!-- Populated by JS -->
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
}

/**
 * Render export options
 */
function renderExportOptions() {
  return `
    <div class="card">
      <h2 class="text-lg font-semibold mb-4">Export Options</h2>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <button id="export-bundle-btn" class="export-btn p-4 bg-gray-50 rounded-lg text-left hover:bg-gray-100 transition-colors">
          <div class="flex items-center">
            <svg class="w-8 h-8 text-primary-600 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            <div>
              <p class="font-medium text-gray-900">Full Project Bundle</p>
              <p class="text-xs text-gray-500">JSON with complete audit trail</p>
            </div>
          </div>
        </button>

        <button id="export-data-btn" class="export-btn p-4 bg-gray-50 rounded-lg text-left hover:bg-gray-100 transition-colors">
          <div class="flex items-center">
            <svg class="w-8 h-8 text-green-600 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <div>
              <p class="font-medium text-gray-900">Extracted Data</p>
              <p class="text-xs text-gray-500">CSV spreadsheet format</p>
            </div>
          </div>
        </button>

        <button id="export-analysis-btn" class="export-btn p-4 bg-gray-50 rounded-lg text-left hover:bg-gray-100 transition-colors ${!reportState.analysisResults ? 'opacity-50 cursor-not-allowed' : ''}" ${!reportState.analysisResults ? 'disabled' : ''}>
          <div class="flex items-center">
            <svg class="w-8 h-8 text-orange-600 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <div>
              <p class="font-medium text-gray-900">Analysis Results</p>
              <p class="text-xs text-gray-500">JSON with all statistics</p>
            </div>
          </div>
        </button>

        <button id="export-report-btn" class="export-btn p-4 bg-gray-50 rounded-lg text-left hover:bg-gray-100 transition-colors">
          <div class="flex items-center">
            <svg class="w-8 h-8 text-blue-600 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <div>
              <p class="font-medium text-gray-900">Full Report</p>
              <p class="text-xs text-gray-500">HTML with all visualizations</p>
            </div>
          </div>
        </button>
      </div>
    </div>
  `;
}

/**
 * Initialize tab content (render visualizations)
 */
async function initializeTabContent() {
  if (reportState.activeTab === 'prisma') {
    const canvas = document.getElementById('prisma-canvas');
    if (canvas) {
      const prismaData = await generatePRISMAData(reportState.projectId);
      renderPRISMAFlow(canvas, prismaData);
    }
  }

  if (reportState.activeTab === 'sof') {
    const container = document.getElementById('sof-table-container');
    if (container && reportState.analysisResults) {
      const sofData = generateSoFData(
        reportState.analysisResults,
        reportState.eimSummary,
        reportState.project?.name
      );
      renderSoFTable(container, sofData);
    }
  }

  if (reportState.activeTab === 'characteristics') {
    await populateCharacteristicsTable();
  }
}

/**
 * Populate characteristics table
 */
async function populateCharacteristicsTable() {
  const tbody = document.getElementById('characteristics-tbody');
  if (!tbody) return;

  const included = reportState.screening.filter(s => s.decision === 'include');
  const nctIds = included.map(s => s.nctId);

  const records = await Promise.all(nctIds.map(id => db.records.get(id)));
  const extractionMap = new Map(reportState.extractions.map(e => [e.nctId, e]));

  const rows = records.filter(Boolean).map(record => {
    const extraction = extractionMap.get(record.nctId);

    return `
      <tr>
        <td class="px-3 py-2 font-medium">
          <a href="https://clinicaltrials.gov/study/${record.nctId}" target="_blank" class="text-primary-600 hover:underline">
            ${record.nctId}
          </a>
        </td>
        <td class="px-3 py-2">${record.overallStatus || '-'}</td>
        <td class="px-3 py-2">${record.phases?.join(', ') || '-'}</td>
        <td class="px-3 py-2">${record.enrollmentInfo?.count?.toLocaleString() || '-'}</td>
        <td class="px-3 py-2">
          ${record.hasResults ?
            '<span class="text-green-600 font-medium">Yes</span>' :
            '<span class="text-gray-400">No</span>'
          }
        </td>
        <td class="px-3 py-2">
          ${extraction?.verified ?
            '<span class="text-green-600 font-medium">Yes</span>' :
            extraction ?
              '<span class="text-yellow-600">Pending</span>' :
              '<span class="text-gray-400">No</span>'
          }
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = rows.join('');
}

/**
 * Bind event handlers
 */
function bindEvents() {
  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      reportState.activeTab = btn.dataset.tab;
      rerenderContent();
    });
  });

  // Export PRISMA
  document.getElementById('export-prisma-btn')?.addEventListener('click', async () => {
    const canvas = document.getElementById('prisma-canvas');
    if (canvas) {
      exportPRISMAFlow(canvas, `prisma_${reportState.project?.name || 'flow'}.png`);
      showToast('PRISMA diagram exported');
    }
  });

  // Export SoF
  document.getElementById('export-sof-btn')?.addEventListener('click', () => {
    if (reportState.analysisResults) {
      const sofData = generateSoFData(
        reportState.analysisResults,
        reportState.eimSummary,
        reportState.project?.name
      );
      const html = exportSoFHTML(sofData);
      downloadFile(html, `sof_${reportState.project?.name || 'table'}.html`, 'text/html');
      showToast('SoF table exported');
    }
  });

  // Export characteristics
  document.getElementById('export-chars-btn')?.addEventListener('click', async () => {
    await exportCharacteristicsCSV();
    showToast('Study characteristics exported');
  });

  // Export bundle
  document.getElementById('export-bundle-btn')?.addEventListener('click', async () => {
    await exportFullBundle();
    showToast('Project bundle exported');
  });

  // Export data
  document.getElementById('export-data-btn')?.addEventListener('click', async () => {
    await exportExtractedData();
    showToast('Extracted data exported');
  });

  // Export analysis
  document.getElementById('export-analysis-btn')?.addEventListener('click', () => {
    if (reportState.analysisResults) {
      const data = {
        projectId: reportState.projectId,
        projectName: reportState.project?.name,
        exportedAt: new Date().toISOString(),
        results: reportState.analysisResults,
        eim: reportState.eimSummary
      };
      downloadFile(
        JSON.stringify(data, null, 2),
        `analysis_${reportState.project?.name || 'results'}.json`,
        'application/json'
      );
      showToast('Analysis results exported');
    }
  });

  // Export full report
  document.getElementById('export-report-btn')?.addEventListener('click', async () => {
    await exportFullReport();
    showToast('Full report exported');
  });
}

/**
 * Export characteristics as CSV
 */
async function exportCharacteristicsCSV() {
  const included = reportState.screening.filter(s => s.decision === 'include');
  const nctIds = included.map(s => s.nctId);
  const records = await Promise.all(nctIds.map(id => db.records.get(id)));
  const extractionMap = new Map(reportState.extractions.map(e => [e.nctId, e]));

  const rows = records.filter(Boolean).map(r => ({
    nct_id: r.nctId,
    title: `"${(r.briefTitle || '').replace(/"/g, '""')}"`,
    status: r.overallStatus,
    phases: r.phases?.join('; ') || '',
    enrollment: r.enrollmentInfo?.count || '',
    has_results: r.hasResults ? 'Yes' : 'No',
    completion_date: r.completionDate || '',
    extracted: extractionMap.has(r.nctId) ? 'Yes' : 'No',
    verified: extractionMap.get(r.nctId)?.verified ? 'Yes' : 'No'
  }));

  const headers = Object.keys(rows[0] || {}).join(',');
  const csv = [headers, ...rows.map(r => Object.values(r).join(','))].join('\n');

  downloadFile(csv, `characteristics_${reportState.project?.name || 'studies'}.csv`, 'text/csv');
}

/**
 * Export extracted data as CSV
 */
async function exportExtractedData() {
  if (reportState.extractions.length === 0) {
    showToast('No extracted data available', 'warning');
    return;
  }

  const rows = reportState.extractions.map(e => ({
    nct_id: e.nctId,
    outcome_type: e.outcomeType,
    treatment_events: e.treatment?.events ?? '',
    treatment_n: e.treatment?.n ?? '',
    treatment_mean: e.treatment?.mean ?? '',
    treatment_sd: e.treatment?.sd ?? '',
    control_events: e.control?.events ?? '',
    control_n: e.control?.n ?? '',
    control_mean: e.control?.mean ?? '',
    control_sd: e.control?.sd ?? '',
    timepoint: e.timepoint || '',
    verified: e.verified ? 'Yes' : 'No',
    quality_flags: e.qualityFlags?.join('; ') || ''
  }));

  const headers = Object.keys(rows[0]).join(',');
  const csv = [headers, ...rows.map(r => Object.values(r).join(','))].join('\n');

  downloadFile(csv, `extracted_data_${reportState.project?.name || 'project'}.csv`, 'text/csv');
}

/**
 * Export full project bundle
 */
async function exportFullBundle() {
  const bundle = {
    exportedAt: new Date().toISOString(),
    version: '1.0',
    project: reportState.project,
    screening: reportState.screening,
    extractions: reportState.extractions,
    analysisResults: reportState.analysisResults,
    eimSummary: reportState.eimSummary
  };

  // Get records
  const nctIds = reportState.screening.map(s => s.nctId);
  const records = await Promise.all(nctIds.map(id => db.records.get(id)));
  bundle.records = records.filter(Boolean);

  downloadFile(
    JSON.stringify(bundle, null, 2),
    `bundle_${reportState.project?.name || 'project'}_${new Date().toISOString().slice(0, 10)}.json`,
    'application/json'
  );
}

/**
 * Export full HTML report
 */
async function exportFullReport() {
  const prismaData = await generatePRISMAData(reportState.projectId);

  let sofHTML = '';
  if (reportState.analysisResults) {
    const sofData = generateSoFData(
      reportState.analysisResults,
      reportState.eimSummary,
      reportState.project?.name
    );
    const sofContainer = document.createElement('div');
    renderSoFTable(sofContainer, sofData);
    sofHTML = sofContainer.innerHTML;
  }

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Meta-Analysis Report: ${reportState.project?.name || 'Project'}</title>
      <style>
        body { font-family: system-ui, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; }
        h1, h2, h3 { color: #111827; }
        .section { margin-bottom: 40px; }
        .warning { background: #fef3c7; border: 1px solid #f59e0b; padding: 16px; border-radius: 8px; margin-bottom: 20px; }
        .card { background: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 8px 12px; border: 1px solid #e5e7eb; text-align: left; }
        th { background: #f3f4f6; }
      </style>
    </head>
    <body>
      <h1>Meta-Analysis Report</h1>
      <p><strong>Project:</strong> ${reportState.project?.name || 'Untitled'}</p>
      <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>

      ${renderWarningsForReport()}

      <div class="section">
        <h2>Study Selection (PRISMA)</h2>
        <div class="card">
          <p>Records identified: ${prismaData.identification?.database_records || 0}</p>
          <p>Records screened: ${prismaData.screening?.records_screened || 0}</p>
          <p>Studies included: ${prismaData.included?.studies_included || 0}</p>
        </div>
      </div>

      ${sofHTML ? `
        <div class="section">
          <h2>Summary of Findings</h2>
          ${sofHTML}
        </div>
      ` : ''}

      ${reportState.analysisResults ? `
        <div class="section">
          <h2>Analysis Results</h2>
          <div class="card">
            <p><strong>Studies included:</strong> ${reportState.analysisResults.meta_analysis?.k || 0}</p>
            <p><strong>Total participants:</strong> ${reportState.analysisResults.meta_analysis?.total_n?.toLocaleString() || 0}</p>
            <p><strong>Effect (RE):</strong> ${reportState.analysisResults.meta_analysis?.random_effects?.estimate?.toFixed(3) || '-'}</p>
            <p><strong>95% CI:</strong> [${reportState.analysisResults.meta_analysis?.random_effects?.ci_lower?.toFixed(3) || '-'}, ${reportState.analysisResults.meta_analysis?.random_effects?.ci_upper?.toFixed(3) || '-'}]</p>
            <p><strong>I²:</strong> ${((reportState.analysisResults.meta_analysis?.heterogeneity?.I2 || 0) * 100).toFixed(1)}%</p>
          </div>
        </div>
      ` : ''}

      <footer style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280;">
        <p>Generated by Living Meta-Analysis Web App</p>
        <p>This report is based on data from ClinicalTrials.gov and should be interpreted with appropriate caution.</p>
      </footer>
    </body>
    </html>
  `;

  downloadFile(html, `report_${reportState.project?.name || 'project'}.html`, 'text/html');
}

/**
 * Render warnings for HTML report
 */
function renderWarningsForReport() {
  const warnings = [];

  if (reportState.eimSummary?.coverage?.coverage < 0.7) {
    warnings.push(`Results Coverage: ${(reportState.eimSummary.coverage.coverage * 100).toFixed(0)}% of eligible trials have posted results.`);
  }

  if (reportState.eimSummary?.metaSummary?.non_publication_rate > 0.3) {
    warnings.push(`Non-Publication Risk: ${(reportState.eimSummary.metaSummary.non_publication_rate * 100).toFixed(0)}% of trials missing results.`);
  }

  if (reportState.analysisResults?.tsa?.conclusion !== 'firm_evidence') {
    warnings.push(`TSA Status: ${((reportState.analysisResults?.tsa?.information_fraction || 0) * 100).toFixed(0)}% of required information reached.`);
  }

  if (warnings.length === 0) return '';

  return `
    <div class="warning">
      <h3 style="margin-top: 0;">Important Disclosures</h3>
      <ul>
        ${warnings.map(w => `<li>${w}</li>`).join('')}
      </ul>
    </div>
  `;
}

/**
 * Helper: Download file
 */
function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Helper: Show toast notification
 */
function showToast(message, type = 'success') {
  // Simple toast implementation
  const toast = document.createElement('div');
  toast.className = `fixed bottom-4 right-4 px-4 py-2 rounded-lg shadow-lg text-white ${
    type === 'success' ? 'bg-green-600' :
    type === 'warning' ? 'bg-yellow-600' :
    'bg-red-600'
  }`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

/**
 * Helper: Format number
 */
function formatNumber(n) {
  if (n === null || n === undefined) return '-';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toLocaleString();
}

export default { render, init };
