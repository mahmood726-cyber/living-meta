/**
 * Analysis Results Panel
 * Displays comprehensive meta-analysis results with all required outputs
 */

import { renderForestPlot, exportForestPlot } from './forest-plot.js';
import { renderFunnelPlot, exportFunnelPlot } from './funnel-plot.js';
import { renderTSAChart } from './tsa-chart.js';

/**
 * Default configuration
 */
const DEFAULT_CONFIG = {
  showForestPlot: true,
  showFunnelPlot: true,
  showTSA: true,
  showSensitivity: true,
  significanceLevel: 0.05,
  decimalPlaces: 3
};

/**
 * Render the complete results panel
 * @param {HTMLElement} container - Container element
 * @param {object} results - Analysis results from worker
 * @param {object} config - Display configuration
 */
export function renderResultsPanel(container, results, config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  container.innerHTML = `
    <div class="analysis-results space-y-6">
      ${renderSummaryCards(results, cfg)}
      ${renderPooledEstimates(results, cfg)}
      ${renderHeterogeneityPanel(results, cfg)}
      ${cfg.showForestPlot ? renderForestPlotSection(results, cfg) : ''}
      ${renderSmallStudyTests(results, cfg)}
      ${renderEValues(results, cfg)}
      ${cfg.showFunnelPlot ? renderFunnelPlotSection(results, cfg) : ''}
      ${cfg.showSensitivity ? renderSensitivityAnalysis(results, cfg) : ''}
      ${cfg.showTSA && results.tsa ? renderTSASection(results, cfg) : ''}
    </div>
  `;

  // Initialize canvases after DOM is ready
  setTimeout(() => initializeCanvases(results, cfg), 0);
}

/**
 * Render summary cards at top
 */
function renderSummaryCards(results, cfg) {
  const { meta_analysis: ma } = results;
  const re = ma.random_effects;

  const significant = re.p_value < cfg.significanceLevel;
  const direction = re.estimate > 0 ? 'favors treatment' : 'favors control';

  return `
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div class="card text-center">
        <p class="text-sm text-gray-500 mb-1">Studies Included</p>
        <p class="text-3xl font-bold text-gray-900">${ma.k}</p>
      </div>
      <div class="card text-center">
        <p class="text-sm text-gray-500 mb-1">Total Participants</p>
        <p class="text-3xl font-bold text-gray-900">${formatNumber(ma.total_n)}</p>
      </div>
      <div class="card text-center ${significant ? 'bg-green-50' : 'bg-gray-50'}">
        <p class="text-sm ${significant ? 'text-green-600' : 'text-gray-500'} mb-1">Effect (RE)</p>
        <p class="text-2xl font-bold ${significant ? 'text-green-700' : 'text-gray-900'}">
          ${formatEffect(re.estimate, ma.effect_measure)}
        </p>
        <p class="text-xs ${significant ? 'text-green-600' : 'text-gray-500'}">
          ${direction}
        </p>
      </div>
      <div class="card text-center">
        <p class="text-sm text-gray-500 mb-1">I² Heterogeneity</p>
        <p class="text-3xl font-bold ${getI2Color(ma.heterogeneity.I2)}">${(ma.heterogeneity.I2 * 100).toFixed(1)}%</p>
      </div>
    </div>
  `;
}

/**
 * Render pooled estimates section
 */
function renderPooledEstimates(results, cfg) {
  const { meta_analysis: ma } = results;
  const fe = ma.fixed_effect;
  const re = ma.random_effects;
  const measure = ma.effect_measure;
  const dp = cfg.decimalPlaces;

  const formatCI = (lower, upper) => `[${formatEffect(lower, measure)}, ${formatEffect(upper, measure)}]`;

  return `
    <div class="card">
      <h3 class="text-lg font-semibold mb-4">Pooled Effect Estimates</h3>

      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Model</th>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">${measure}</th>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">95% CI</th>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">SE</th>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Z</th>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">p-value</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr>
              <td class="px-4 py-2 text-sm font-medium">Fixed Effect</td>
              <td class="px-4 py-2 text-sm">${formatEffect(fe.estimate, measure)}</td>
              <td class="px-4 py-2 text-sm">${formatCI(fe.ci_lower, fe.ci_upper)}</td>
              <td class="px-4 py-2 text-sm">${fe.se.toFixed(dp)}</td>
              <td class="px-4 py-2 text-sm">${fe.z.toFixed(2)}</td>
              <td class="px-4 py-2 text-sm ${fe.p_value < 0.05 ? 'font-bold text-green-600' : ''}">${formatPValue(fe.p_value)}</td>
            </tr>
            <tr class="bg-primary-50">
              <td class="px-4 py-2 text-sm font-medium">
                Random Effects (${re.method || 'REML'})
                ${re.hksj_applied ? '<span class="ml-1 text-xs text-primary-600">[HKSJ]</span>' : ''}
              </td>
              <td class="px-4 py-2 text-sm font-bold">${formatEffect(re.estimate, measure)}</td>
              <td class="px-4 py-2 text-sm font-bold">${formatCI(re.ci_lower, re.ci_upper)}</td>
              <td class="px-4 py-2 text-sm">${re.se.toFixed(dp)}</td>
              <td class="px-4 py-2 text-sm">${re.z?.toFixed(2) || '-'}</td>
              <td class="px-4 py-2 text-sm ${re.p_value < 0.05 ? 'font-bold text-green-600' : ''}">${formatPValue(re.p_value)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      ${re.hksj_applied ? `
        <div class="mt-4 p-3 bg-blue-50 rounded-lg text-sm">
          <p class="text-blue-800">
            <strong>HKSJ adjustment applied.</strong>
            ${re.hksj_wider ? 'The HKSJ CI is wider than the standard CI (expected behavior).' :
              'Note: The HKSJ CI was narrower than standard; the wider interval is reported per the "never narrower" rule.'}
          </p>
        </div>
      ` : ''}

      ${ma.prediction_interval ? `
        <div class="mt-4 p-3 bg-gray-50 rounded-lg">
          <p class="text-sm text-gray-700">
            <strong>Prediction Interval (95%):</strong>
            ${formatCI(ma.prediction_interval.lower, ma.prediction_interval.upper)}
          </p>
          <p class="text-xs text-gray-500 mt-1">
            The predicted range of effects for a new study. Based on df = k-2 = ${ma.k - 2}.
          </p>
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Render heterogeneity panel
 */
function renderHeterogeneityPanel(results, cfg) {
  const het = results.meta_analysis.heterogeneity;
  const dp = cfg.decimalPlaces;

  return `
    <div class="card">
      <h3 class="text-lg font-semibold mb-4">Heterogeneity Assessment</h3>

      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div class="p-4 bg-gray-50 rounded-lg text-center">
          <p class="text-xs text-gray-500 uppercase">Cochran's Q</p>
          <p class="text-xl font-bold">${het.Q.toFixed(2)}</p>
          <p class="text-xs text-gray-500">df = ${het.df}, p = ${formatPValue(het.Q_pvalue)}</p>
        </div>

        <div class="p-4 rounded-lg text-center ${getI2Background(het.I2)}">
          <p class="text-xs text-gray-500 uppercase">I² (inconsistency)</p>
          <p class="text-xl font-bold">${(het.I2 * 100).toFixed(1)}%</p>
          <p class="text-xs text-gray-500">
            ${het.I2_ci ? `95% CI: [${(het.I2_ci.lower * 100).toFixed(1)}%, ${(het.I2_ci.upper * 100).toFixed(1)}%]` : ''}
          </p>
        </div>

        <div class="p-4 bg-gray-50 rounded-lg text-center">
          <p class="text-xs text-gray-500 uppercase">H²</p>
          <p class="text-xl font-bold">${het.H2.toFixed(2)}</p>
          <p class="text-xs text-gray-500">Total/Within variance</p>
        </div>

        <div class="p-4 bg-gray-50 rounded-lg text-center">
          <p class="text-xs text-gray-500 uppercase">τ² (between-study)</p>
          <p class="text-xl font-bold">${het.tau2.toFixed(dp)}</p>
          <p class="text-xs text-gray-500">τ = ${het.tau.toFixed(dp)}</p>
        </div>
      </div>

      <div class="p-4 border rounded-lg">
        <h4 class="font-medium mb-2">Interpretation</h4>
        <p class="text-sm text-gray-700">${getHeterogeneityInterpretation(het)}</p>

        ${het.tau_clinical ? `
          <div class="mt-3 p-3 bg-primary-50 rounded">
            <p class="text-sm text-primary-800">
              <strong>Clinical interpretation of τ:</strong> ${het.tau_clinical}
            </p>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

/**
 * Render forest plot section
 */
function renderForestPlotSection(results, cfg) {
  return `
    <div class="card">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-semibold">Forest Plot</h3>
        <button id="export-forest-btn" class="btn-secondary text-sm">
          Export PNG
        </button>
      </div>
      <div class="overflow-x-auto">
        <canvas id="forest-plot-canvas" class="mx-auto"></canvas>
      </div>
    </div>
  `;
}

/**
 * Render small-study tests section
 */
function renderSmallStudyTests(results, cfg) {
  const tests = results.small_study_tests;
  if (!tests) return '';

  const egger = tests.egger;
  const peters = tests.peters;
  const harbord = tests.harbord;

  return `
    <div class="card">
      <h3 class="text-lg font-semibold mb-4">Small-Study / Publication Bias Tests</h3>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        ${egger && egger.applicable !== false ? `
          <div class="p-4 border rounded-lg ${egger.p < 0.1 ? 'border-yellow-400 bg-yellow-50' : ''}">
            <h4 class="font-medium mb-2">Egger's Test</h4>
            <p class="text-sm">Intercept: ${(egger.intercept || 0).toFixed(3)}</p>
            <p class="text-sm">SE: ${(egger.se || 0).toFixed(3)}</p>
            <p class="text-sm font-medium ${egger.p < 0.1 ? 'text-yellow-700' : ''}">
              p = ${formatPValue(egger.p)}
            </p>
            ${egger.p < 0.1 ? `
              <p class="text-xs text-yellow-600 mt-2">Suggestive of asymmetry</p>
            ` : `
              <p class="text-xs text-gray-500 mt-2">No significant asymmetry detected</p>
            `}
          </div>
        ` : ''}

        ${peters && peters.applicable !== false ? `
          <div class="p-4 border rounded-lg ${peters.p < 0.1 ? 'border-yellow-400 bg-yellow-50' : ''}">
            <h4 class="font-medium mb-2">Peters' Test</h4>
            <p class="text-sm">Slope: ${(peters.slope || 0).toFixed(3)}</p>
            <p class="text-sm font-medium ${peters.p < 0.1 ? 'text-yellow-700' : ''}">
              p = ${formatPValue(peters.p)}
            </p>
            <p class="text-xs text-gray-500 mt-2">Recommended for binary outcomes</p>
          </div>
        ` : ''}

        ${harbord && harbord.applicable !== false ? `
          <div class="p-4 border rounded-lg ${harbord.p < 0.1 ? 'border-yellow-400 bg-yellow-50' : ''}">
            <h4 class="font-medium mb-2">Harbord's Test</h4>
            <p class="text-sm">Intercept: ${(harbord.intercept || 0).toFixed(3)}</p>
            <p class="text-sm font-medium ${harbord.p < 0.1 ? 'text-yellow-700' : ''}">
              p = ${formatPValue(harbord.p)}
            </p>
            <p class="text-xs text-gray-500 mt-2">Modified for OR/RR</p>
          </div>
        ` : ''}
      </div>

      ${tests.trim_and_fill ? `
        <div class="mt-4 p-4 bg-gray-50 rounded-lg">
          <h4 class="font-medium mb-2">Trim and Fill Analysis</h4>
          <p class="text-sm text-gray-700">
            Imputed ${tests.trim_and_fill.k_imputed} studies.
            Adjusted estimate: ${formatEffect(tests.trim_and_fill.adjusted_estimate, results.meta_analysis.effect_measure)}
            [${formatEffect(tests.trim_and_fill.adjusted_ci_lower, results.meta_analysis.effect_measure)},
             ${formatEffect(tests.trim_and_fill.adjusted_ci_upper, results.meta_analysis.effect_measure)}]
          </p>
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Render E-values section
 */
function renderEValues(results, cfg) {
  const evalues = results.e_values;
  if (!evalues) return '';

  return `
    <div class="card">
      <h3 class="text-lg font-semibold mb-4">Sensitivity to Unmeasured Confounding (E-values)</h3>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="p-4 bg-gray-50 rounded-lg">
          <h4 class="font-medium mb-2">E-value for Point Estimate</h4>
          <p class="text-3xl font-bold text-primary-600">${(evalues.point_estimate || evalues.point || 1).toFixed(2)}</p>
          <p class="text-sm text-gray-600 mt-2">
            An unmeasured confounder would need to be associated with both the treatment
            and the outcome by a risk ratio of at least ${(evalues.point_estimate || evalues.point || 1).toFixed(2)}-fold each,
            above and beyond the measured confounders, to explain away the observed effect.
          </p>
        </div>

        <div class="p-4 bg-gray-50 rounded-lg">
          <h4 class="font-medium mb-2">E-value for CI Bound Closest to 1</h4>
          <p class="text-3xl font-bold text-gray-700">${(evalues.confidence_interval || evalues.ci_bound || 1).toFixed(2)}</p>
          <p class="text-sm text-gray-600 mt-2">
            ${(evalues.confidence_interval || evalues.ci_bound || 1) <= 1 ?
              'The confidence interval already includes 1, so the E-value is 1.' :
              `To shift the confidence interval to include the null, confounding with strength ${(evalues.confidence_interval || evalues.ci_bound || 1).toFixed(2)} would be needed.`
            }
          </p>
        </div>
      </div>

      <div class="mt-4 p-3 border rounded-lg text-sm text-gray-600">
        <p>
          <strong>Interpretation guide:</strong>
          E-values > 2 are generally considered robust. The higher the E-value, the stronger
          unmeasured confounding would need to be to explain the result.
          ${(evalues.point_estimate || evalues.point || 1) >= 2 ?
            '<span class="text-green-600 font-medium">This result shows moderate-to-good robustness.</span>' :
            '<span class="text-yellow-600 font-medium">This result may be sensitive to unmeasured confounding.</span>'
          }
        </p>
      </div>
    </div>
  `;
}

/**
 * Render funnel plot section
 */
function renderFunnelPlotSection(results, cfg) {
  return `
    <div class="card">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-semibold">Funnel Plot</h3>
        <div class="flex items-center gap-2">
          <label class="text-sm text-gray-600">
            <input type="checkbox" id="funnel-contours" class="mr-1" checked>
            Show contours
          </label>
          <button id="export-funnel-btn" class="btn-secondary text-sm">
            Export PNG
          </button>
        </div>
      </div>
      <div class="overflow-x-auto">
        <canvas id="funnel-plot-canvas" class="mx-auto"></canvas>
      </div>
    </div>
  `;
}

/**
 * Render sensitivity analysis section
 */
function renderSensitivityAnalysis(results, cfg) {
  const sensitivity = results.sensitivity;
  if (!sensitivity) return '';

  const leaveOneOut = sensitivity.leave_one_out;
  const influence = sensitivity.influence;

  return `
    <div class="card">
      <h3 class="text-lg font-semibold mb-4">Sensitivity Analysis</h3>

      ${influence ? `
        <div class="mb-6">
          <h4 class="font-medium mb-3">Influence Diagnostics</h4>
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200 text-sm">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Study</th>
                  <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">dfbetas</th>
                  <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">dffits</th>
                  <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Cook's D</th>
                  <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">cov.r</th>
                  <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Influential?</th>
                </tr>
              </thead>
              <tbody class="bg-white divide-y divide-gray-200">
                ${influence.map(i => `
                  <tr class="${i.influential ? 'bg-yellow-50' : ''}">
                    <td class="px-3 py-2">${i.study}</td>
                    <td class="px-3 py-2">${i.dfbetas?.toFixed(3) || '-'}</td>
                    <td class="px-3 py-2">${i.dffits?.toFixed(3) || '-'}</td>
                    <td class="px-3 py-2">${i.cooks_d?.toFixed(3) || '-'}</td>
                    <td class="px-3 py-2">${i.cov_r?.toFixed(3) || '-'}</td>
                    <td class="px-3 py-2">
                      ${i.influential ?
                        '<span class="text-yellow-600 font-medium">Yes</span>' :
                        '<span class="text-gray-400">No</span>'
                      }
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      ` : ''}

      ${leaveOneOut ? `
        <div>
          <h4 class="font-medium mb-3">Leave-One-Out Analysis</h4>
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200 text-sm">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Omitted</th>
                  <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Estimate</th>
                  <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">95% CI</th>
                  <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">I²</th>
                  <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">p-value</th>
                </tr>
              </thead>
              <tbody class="bg-white divide-y divide-gray-200">
                ${leaveOneOut.map(l => `
                  <tr class="${l.changes_significance ? 'bg-red-50' : ''}">
                    <td class="px-3 py-2 font-medium">${l.omitted}</td>
                    <td class="px-3 py-2">${formatEffect(l.estimate, results.meta_analysis.effect_measure)}</td>
                    <td class="px-3 py-2">[${formatEffect(l.ci_lower, results.meta_analysis.effect_measure)}, ${formatEffect(l.ci_upper, results.meta_analysis.effect_measure)}]</td>
                    <td class="px-3 py-2">${(l.I2 * 100).toFixed(1)}%</td>
                    <td class="px-3 py-2 ${l.p_value < 0.05 ? 'font-bold' : ''}">${formatPValue(l.p_value)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          ${leaveOneOut.some(l => l.changes_significance) ?
            '<p class="text-sm text-red-600 mt-2">Some studies, if removed, change the statistical significance of the result.</p>' : ''
          }
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Render TSA section
 */
function renderTSASection(results, cfg) {
  const tsa = results.tsa;

  return `
    <div class="card">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-semibold">Trial Sequential Analysis</h3>
        <span class="px-3 py-1 rounded-full text-sm font-medium ${
          tsa.conclusion === 'firm_evidence' ? 'bg-green-100 text-green-800' :
          tsa.conclusion === 'futility' ? 'bg-gray-100 text-gray-800' :
          'bg-yellow-100 text-yellow-800'
        }">
          ${tsa.conclusion === 'firm_evidence' ? 'Firm Evidence Reached' :
            tsa.conclusion === 'futility' ? 'Futility Boundary Crossed' :
            'More Data Needed'}
        </span>
      </div>

      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div class="p-3 bg-gray-50 rounded-lg text-center">
          <p class="text-xs text-gray-500 uppercase">Accrued Information</p>
          <p class="text-lg font-bold">${(tsa.information_fraction * 100).toFixed(1)}%</p>
        </div>
        <div class="p-3 bg-gray-50 rounded-lg text-center">
          <p class="text-xs text-gray-500 uppercase">Required Information Size</p>
          <p class="text-lg font-bold">${formatNumber(tsa.required_information_size)}</p>
        </div>
        <div class="p-3 bg-gray-50 rounded-lg text-center">
          <p class="text-xs text-gray-500 uppercase">Current Z</p>
          <p class="text-lg font-bold">${tsa.current_z.toFixed(2)}</p>
        </div>
        <div class="p-3 bg-gray-50 rounded-lg text-center">
          <p class="text-xs text-gray-500 uppercase">Monitoring Boundary</p>
          <p class="text-lg font-bold">${tsa.current_boundary.toFixed(2)}</p>
        </div>
      </div>

      <div class="overflow-x-auto">
        <canvas id="tsa-chart-canvas" class="mx-auto"></canvas>
      </div>

      <div class="mt-4 p-3 bg-blue-50 rounded-lg text-sm text-blue-800">
        <p>${tsa.interpretation}</p>
      </div>
    </div>
  `;
}

/**
 * Initialize canvas visualizations
 */
function initializeCanvases(results, cfg) {
  // Forest plot
  const forestCanvas = document.getElementById('forest-plot-canvas');
  if (forestCanvas && results.meta_analysis) {
    renderForestPlot(forestCanvas, {
      studies: results.studies,
      fixed_effect: results.meta_analysis.fixed_effect,
      random_effects: results.meta_analysis.random_effects,
      prediction_interval: results.meta_analysis.prediction_interval,
      effect_measure: results.meta_analysis.effect_measure
    });

    document.getElementById('export-forest-btn')?.addEventListener('click', () => {
      exportForestPlot(forestCanvas, 'forest-plot.png');
    });
  }

  // Funnel plot
  const funnelCanvas = document.getElementById('funnel-plot-canvas');
  if (funnelCanvas && results.studies) {
    renderFunnelPlot(funnelCanvas, {
      studies: results.studies,
      pooled_effect: results.meta_analysis.random_effects.estimate,
      effect_measure: results.meta_analysis.effect_measure
    }, {
      showContours: document.getElementById('funnel-contours')?.checked
    });

    document.getElementById('funnel-contours')?.addEventListener('change', (e) => {
      renderFunnelPlot(funnelCanvas, {
        studies: results.studies,
        pooled_effect: results.meta_analysis.random_effects.estimate,
        effect_measure: results.meta_analysis.effect_measure
      }, {
        showContours: e.target.checked
      });
    });

    document.getElementById('export-funnel-btn')?.addEventListener('click', () => {
      exportFunnelPlot(funnelCanvas, 'funnel-plot.png');
    });
  }

  // TSA chart
  const tsaCanvas = document.getElementById('tsa-chart-canvas');
  if (tsaCanvas && results.tsa) {
    renderTSAChart(tsaCanvas, results.tsa);
  }
}

/**
 * Format effect size for display
 */
function formatEffect(value, measure) {
  if (value === null || value === undefined) return '-';

  // For ratio measures, may need to exponentiate if on log scale
  if (['OR', 'RR', 'HR'].includes(measure)) {
    return value.toFixed(2);
  }
  return value.toFixed(3);
}

/**
 * Format p-value for display
 */
function formatPValue(p) {
  if (p === null || p === undefined) return '-';
  if (p < 0.001) return '< 0.001';
  if (p < 0.01) return p.toFixed(3);
  return p.toFixed(2);
}

/**
 * Format large numbers
 */
function formatNumber(n) {
  if (n === null || n === undefined) return '-';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toLocaleString();
}

/**
 * Get I² interpretation color
 */
function getI2Color(I2) {
  if (I2 >= 0.75) return 'text-red-600';
  if (I2 >= 0.50) return 'text-orange-500';
  if (I2 >= 0.25) return 'text-yellow-500';
  return 'text-green-600';
}

/**
 * Get I² background class
 */
function getI2Background(I2) {
  if (I2 >= 0.75) return 'bg-red-50';
  if (I2 >= 0.50) return 'bg-orange-50';
  if (I2 >= 0.25) return 'bg-yellow-50';
  return 'bg-green-50';
}

/**
 * Get heterogeneity interpretation text
 */
function getHeterogeneityInterpretation(het) {
  const i2Pct = het.I2 * 100;

  if (i2Pct >= 75) {
    return `There is considerable heterogeneity (I² = ${i2Pct.toFixed(1)}%). The between-study variance (τ² = ${het.tau2.toFixed(3)}) is substantial. Subgroup analysis or meta-regression may be warranted to explore sources of heterogeneity.`;
  }
  if (i2Pct >= 50) {
    return `There is substantial heterogeneity (I² = ${i2Pct.toFixed(1)}%). While the pooled estimate remains informative, interpret with caution given the variability across studies.`;
  }
  if (i2Pct >= 25) {
    return `There is moderate heterogeneity (I² = ${i2Pct.toFixed(1)}%). The random effects model appropriately accounts for this variability.`;
  }
  return `There is low heterogeneity (I² = ${i2Pct.toFixed(1)}%). The studies are relatively consistent, though the random effects model remains appropriate for generalizability.`;
}

/**
 * Create a summary object for export/reporting
 */
export function getResultsSummary(results) {
  const ma = results.meta_analysis;
  const re = ma.random_effects;

  return {
    k: ma.k,
    total_n: ma.total_n,
    effect_measure: ma.effect_measure,
    pooled_estimate: {
      fe: ma.fixed_effect.estimate,
      re: re.estimate,
      re_ci: [re.ci_lower, re.ci_upper],
      re_p: re.p_value
    },
    heterogeneity: {
      I2: ma.heterogeneity.I2,
      tau2: ma.heterogeneity.tau2,
      Q: ma.heterogeneity.Q,
      Q_p: ma.heterogeneity.Q_pvalue
    },
    prediction_interval: ma.prediction_interval,
    e_values: results.e_values,
    small_study_bias: {
      egger_p: results.small_study_tests?.egger?.p,
      asymmetry_detected: (results.small_study_tests?.egger?.p || 1) < 0.1
    },
    tsa: results.tsa ? {
      conclusion: results.tsa.conclusion,
      information_fraction: results.tsa.information_fraction
    } : null
  };
}

export default {
  renderResultsPanel,
  getResultsSummary
};
