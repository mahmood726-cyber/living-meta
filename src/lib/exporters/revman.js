/**
 * RevMan Export Module
 * Export studies and analysis results to Review Manager (RevMan) format
 *
 * RevMan uses a specific XML format for importing study data
 * @module RevManExporter
 */

/**
 * Generate RevMan XML for a study
 * @param {Object} study - The study object
 * @returns {string} XML string
 */
function generateStudyXML(study) {
  const { nctId, briefTitle, officialTitle, conditions, interventions, armGroups, hasResults } = study;

  let xml = `  <study id="${escapeXML(nctId)}">\n`;
  xml += `    <citation>${escapeXML(briefTitle)}</citation>\n`;

  if (officialTitle && officialTitle !== briefTitle) {
    xml += `    <official_title>${escapeXML(officialTitle)}</official_title>\n`;
  }

  // Conditions
  if (conditions && conditions.length > 0) {
    xml += `    <conditions>\n`;
    conditions.forEach(condition => {
      xml += `      <condition>${escapeXML(condition)}</condition>\n`;
    });
    xml += `    </conditions>\n`;
  }

  // Interventions
  if (interventions && interventions.length > 0) {
    xml += `    <interventions>\n`;
    const uniqueInterventions = [...new Set(interventions.map(i => i.name))];
    uniqueInterventions.forEach(intervention => {
      xml += `      <intervention>${escapeXML(intervention)}</intervention>\n`;
    });
    xml += `    </interventions>\n`;
  }

  // Arms/Groups
  if (armGroups && armGroups.length > 0) {
    xml += `    <arms>\n`;
    armGroups.forEach(arm => {
      xml += `      <arm id="${escapeXML(arm.label)}">\n`;
      xml += `        <label>${escapeXML(arm.label)}</label>\n`;
      if (arm.description) {
        xml += `        <description>${escapeXML(arm.description)}</description>\n`;
      }
      if (arm.type) {
        xml += `        <type>${escapeXML(arm.type)}</type>\n`;
      }
      xml += `      </arm>\n`;
    });
    xml += `    </arms>\n`;
  }

  // Study identifiers
  xml += `    <identifiers>\n`;
  xml += `      <nct_id>${escapeXML(nctId)}</nct_id>\n`;
  xml += `      <source>ClinicalTrials.gov</source>\n`;
  xml += `    </identifiers>\n`;

  // Has results flag
  xml += `    <has_results>${hasResults ? 'yes' : 'no'}</has_results>\n`;

  xml += `  </study>\n`;

  return xml;
}

/**
 * Generate RevMan comparison XML
 * @param {string} comparisonName - Name of the comparison
 * @param {Array} arms - Array of arm names
 * @returns {string} XML string
 */
function generateComparisonXML(comparisonName, arms) {
  let xml = `  <comparison id="C01">\n`;
  xml += `    <name>${escapeXML(comparisonName)}</name>\n`;

  if (arms && arms.length >= 2) {
    xml += `    <arms>\n`;
    arms.forEach((arm, index) => {
      xml += `      <arm id="A0${index + 1}">${escapeXML(arm)}</arm>\n`;
    });
    xml += `    </arms>\n`;
  }

  xml += `  </comparison>\n`;

  return xml;
}

/**
 * Generate RevMan outcome data XML
 * @param {Object} outcome - Outcome data
 * @returns {string} XML string
 */
function generateOutcomeXML(outcome) {
  const { name, measure, data } = outcome;

  let xml = `    <outcome id="O01">\n`;
  xml += `      <name>${escapeXML(name)}</name>\n`;
  xml += `      <measure>${escapeXML(measure)}</measure>\n`;

  if (data && data.studies) {
    xml += `      <data>\n`;
    data.studies.forEach(studyData => {
      xml += `        <study id="${escapeXML(studyData.studyId)}">\n`;
      xml += `          <arm id="A01">\n`;
      xml += `            <events>${studyData.arm1?.events || 0}</events>\n`;
      xml += `            <total>${studyData.arm1?.total || 0}</total>\n`;
      xml += `          </arm>\n`;
      xml += `          <arm id="A02">\n`;
      xml += `          <events>${studyData.arm2?.events || 0}</events>\n`;
      xml += `          <total>${studyData.arm2?.total || 0}</total>\n`;
      xml += `          </arm>\n`;
      xml += `        </study>\n`;
    });
    xml += `      </data>\n`;
  }

  xml += `    </outcome>\n`;

  return xml;
}

/**
 * Generate full RevMan file XML
 * @param {Object} project - Project data
 * @param {Array} studies - Array of studies
 * @param {Object} analysis - Analysis results
 * @returns {string} Complete XML string
 */
export function generateRevManXML(project, studies, analysis) {
  const timestamp = new Date().toISOString();

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<revman xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="revman.xsd">\n';
  xml += `  <meta>\n`;
  xml += `    <generated_by>Living Meta-Analysis</generated_by>\n`;
  xml += `    <version>2.0.0</version>\n`;
  xml += `    <timestamp>${timestamp}</timestamp>\n`;
  xml += `  </meta>\n`;

  // Review information
  xml += '  <review>\n';
  xml += `    <title>${escapeXML(project.name)}</title>\n`;
  if (project.description) {
    xml += `    <description>${escapeXML(project.description)}</description>\n`;
  }
  xml += `    <type>Intervention</type>\n`;
  xml += '  </review>\n';

  // Studies
  xml += '  <studies>\n';
  studies.forEach(study => {
    xml += generateStudyXML(study);
  });
  xml += '  </studies>\n';

  // Comparisons and outcomes
  if (analysis) {
    xml += '  <comparisons>\n';

    // Generate comparison based on analysis
    const comparisonName = analysis.comparisonName || 'Experimental vs Control';
    const arms = extractArmsFromStudies(studies);
    xml += generateComparisonXML(comparisonName, arms);

    // Outcomes
    if (analysis.outcomes) {
      xml += '    <outcomes>\n';
      analysis.outcomes.forEach(outcome => {
        xml += generateOutcomeXML(outcome);
      });
      xml += '    </outcomes>\n';
    }

    xml += '  </comparisons>\n';

    // Analysis results
    xml += '  <analysis>\n';
    xml += generateAnalysisResultsXML(analysis);
    xml += '  </analysis>\n';
  }

  xml += '</revman>\n';

  return xml;
}

/**
 * Generate analysis results XML
 * @param {Object} analysis - Analysis results
 * @returns {string} XML string
 */
function generateAnalysisResultsXML(analysis) {
  let xml = '';

  if (analysis.result) {
    const result = analysis.result;
    xml += `    <result outcome_id="O01">\n`;
    xml += `      <effect_estimate>${(result.theta || 0).toFixed(4)}</effect_estimate>\n`;
    xml += `      <ci_lower>${(result.ci_lower || 0).toFixed(4)}</ci_lower>\n`;
    xml += `      <ci_upper>${(result.ci_upper || 0).toFixed(4)}</ci_upper>\n`;
    xml += `      <standard_error>${(result.se || 0).toFixed(4)}</standard_error>\n`;
    xml += `      <p_value>${(result.pValue || 1).toFixed(4)}</p_value>\n`;
    xml += `      <model>${result.model || 'RE-DL'}</model>\n`;

    if (result.tau2 !== undefined) {
      xml += `      <tau2>${result.tau2.toFixed(4)}</tau2>\n`;
    }

    if (result.I2 !== undefined) {
      xml += `      <i2>${result.I2.toFixed(2)}</i2>\n`;
    }

    if (result.Q !== undefined) {
      xml += `      <q>${result.Q.toFixed(4)}</q>\n`;
      xml += `      <q_df>${result.df || 0}</q_df>\n`;
      xml += `      <q_p>${(result.pQ || 0).toFixed(4)}</q_p>\n`;
    }

    xml += `    </result>\n`;
  }

  return xml;
}

/**
 * Extract unique arms from studies
 * @param {Array} studies - Array of studies
 * @returns {Array} Array of unique arm names
 */
function extractArmsFromStudies(studies) {
  const armSet = new Set();

  studies.forEach(study => {
    if (study.armGroups) {
      study.armGroups.forEach(arm => {
        armSet.add(arm.label);
      });
    }
  });

  return Array.from(armSet);
}

/**
 * Escape special XML characters
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeXML(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Export project to RevMan format and trigger download
 * @param {Object} project - Project data
 * @param {Array} studies - Array of studies
 * @param {Object} analysis - Analysis results (optional)
 * @returns {string} XML string
 */
export function exportToRevMan(project, studies, analysis = null) {
  const xml = generateRevManXML(project, studies, analysis);
  const filename = `${slugify(project.name)}_revman.xml`;

  // Create and trigger download
  const blob = new Blob([xml], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return xml;
}

/**
 * Convert string to slug-safe format
 * @param {string} str - String to slugify
 * @returns {string} Slugified string
 */
function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/--+/g, '-')
    .trim();
}

/**
 * Generate RevMan 5 file format (.rm5)
 * RevMan 5 uses a different format than the XML import format
 * @param {Object} project - Project data
 * @param {Array} studies - Array of studies
 * @param {Object} analysis - Analysis results
 * @returns {string} RM5 file content
 */
export function generateRevMan5File(project, studies, analysis) {
  // This is a simplified version - actual .rm5 files are complex binary/zipped formats
  // For full compatibility, users should use the XML import format

  const timestamp = new Date().toISOString();
  let content = `REVMAN5\n`;
  content += `# Generated by Living Meta-Analysis v2.0.0\n`;
  content += `# ${timestamp}\n\n`;

  content += `[REVIEW]\n`;
  content += `Title=${project.name}\n`;
  if (project.description) {
    content += `Notes=${project.description}\n`;
  }
  content += `Type=Intervention\n`;
  content += `Status=Published\n\n`;

  content += `[STUDIES]\n`;
  studies.forEach((study, index) => {
    content += `Study${index + 1}ID=${study.nctId}\n`;
    content += `Study${index + 1}Title=${study.briefTitle}\n`;
    content += `Study${index + 1}Year=${study.startDate?.substring(0, 4) || 'Unknown'}\n`;
  });
  content += '\n';

  if (analysis?.result) {
    const result = analysis.result;
    content += `[DATA]\n`;
    content += `Outcome1=${analysis.outcomeName || 'Primary Outcome'}\n`;
    content += `Effect=${result.theta?.toFixed(4)}\n`;
    content += `CI_Lower=${result.ci_lower?.toFixed(4)}\n`;
    content += `CI_Upper=${result.ci_upper?.toFixed(4)}\n`;
    content += `P_Value=${result.pValue?.toFixed(4)}\n`;
    content += `Model=${result.model || 'Random'}\n`;
    content += `I2=${result.I2?.toFixed(2)}\n`;
  }

  return content;
}

/**
 * Export to RevMan 5 format
 * @param {Object} project - Project data
 * @param {Array} studies - Array of studies
 * @param {Object} analysis - Analysis results
 * @returns {string} File content
 */
export function exportToRevMan5(project, studies, analysis) {
  const content = generateRevMan5File(project, studies, analysis);
  const filename = `${slugify(project.name)}_revman5.rm5`;

  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return content;
}

/**
 * Generate forest plot in RevMan-compatible format
 * @param {Object} analysis - Analysis results
 * @param {Array} studies - Study data with effect sizes
 * @returns {Object} Forest plot data
 */
export function generateForestPlotData(analysis, studies) {
  const plotData = {
    title: analysis.outcomeName || 'Forest Plot',
    outcome: analysis.measure || 'OR',
    scale: getScaleForMeasure(analysis.measure),
    studies: studies.map((study, index) => ({
      id: study.nctId || study.id,
      label: study.label || study.nctId || `Study ${index + 1}`,
      effect: study.yi,
      se: Math.sqrt(study.vi),
      ci_lower: study.yi - 1.96 * Math.sqrt(study.vi),
      ci_upper: study.yi + 1.96 * Math.sqrt(study.vi),
      weight: study.weight || 0
    })),
    summary: {
      effect: analysis.result?.theta || 0,
      ci_lower: analysis.result?.ci_lower || 0,
      ci_upper: analysis.result?.ci_upper || 0,
      model: analysis.result?.model || 'RE-DL'
    },
    heterogeneity: {
      i2: analysis.result?.I2 || 0,
      tau2: analysis.result?.tau2 || 0,
      q: analysis.result?.Q || 0,
      p: analysis.result?.pQ || 1
    }
  };

  return plotData;
}

/**
 * Get scale type for effect measure
 * @param {string} measure - Effect measure
 * @returns {string} Scale type
 */
function getScaleForMeasure(measure) {
  const scales = {
    'OR': 'logarithmic',
    'RR': 'logarithmic',
    'RD': 'linear',
    'SMD': 'linear',
    'MD': 'linear'
  };
  return scales[measure] || 'linear';
}

/**
 * Validate RevMan export data
 * @param {Object} project - Project data
 * @param {Array} studies - Array of studies
 * @returns {Object} Validation result
 */
export function validateRevManExport(project, studies) {
  const errors = [];
  const warnings = [];

  // Check required fields
  if (!project.name) {
    errors.push('Project name is required');
  }

  if (!studies || studies.length === 0) {
    errors.push('At least one study is required');
  }

  // Check study data
  studies.forEach((study, index) => {
    if (!study.nctId) {
      warnings.push(`Study ${index + 1} missing NCT ID`);
    }
    if (!study.briefTitle) {
      warnings.push(`Study ${index + 1} missing title`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

export default {
  generateRevManXML,
  generateRevMan5File,
  exportToRevMan,
  exportToRevMan5,
  generateForestPlotData,
  validateRevManExport
};
