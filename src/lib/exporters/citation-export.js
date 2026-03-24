/**
 * Citation Export Module
 * Export studies to various citation formats (BibTeX, RIS, etc.)
 *
 * @module CitationExport
 */

/**
 * Escape special LaTeX characters
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeLatex(str) {
  if (!str) return '';
  return String(str)
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/&/g, '\\&')
    .replace(/%/g, '\\%')
    .replace(/\$/g, '\\$')
    .replace(/#/g, '\\#')
    .replace(/_/g, '\\_')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}');
}

/**
 * Clean text for citation
 * @param {string} str - String to clean
 * @returns {string} Cleaned string
 */
function cleanText(str) {
  if (!str) return '';
  return str.replace(/\s+/g, ' ').trim();
}

/**
 * Convert month name to BibTeX format
 * @param {string} date - ISO date string
 * @returns {string} BibTeX month
 */
function getBibtexMonth(date) {
  if (!date) return '';
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun',
                  'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const d = new Date(date);
  const month = d.getMonth();
  return months[month] || '';
}

/**
 * Convert year from date
 * @param {string} date - ISO date string
 * @returns {string} Year
 */
function getYear(date) {
  if (!date) return '';
  const d = new Date(date);
  return d.getFullYear().toString();
}

/**
 * Generate BibTeX entry for a study
 * @param {Object} study - Study object
 * @param {string} citationKey - Optional citation key
 * @returns {string} BibTeX entry
 */
export function generateBibtex(study, citationKey = null) {
  const key = citationKey || generateCitationKey(study);

  let bibtex = `@misc{${key},\n`;

  // Title
  if (study.briefTitle) {
    bibtex += `  title = {${escapeLatex(cleanText(study.briefTitle))}},\n`;
  }

  // Author (use sponsor as author)
  if (study.leadSponsor) {
    bibtex += `  author = {${escapeLatex(cleanText(study.leadSponsor))}},\n`;
  }

  // Year
  const year = getYear(study.studyFirstSubmitDate || study.startDate);
  if (year) {
    bibtex += `  year = {${year}},\n`;
  }

  // Month
  const month = getBibtexMonth(study.studyFirstSubmitDate || study.startDate);
  if (month) {
    bibtex += `  month = {${month}},\n`;
  }

  // URL
  bibtex += `  url = {https://clinicaltrials.gov/show/${study.nctId}},\n`;

  // Note
  bibtex += `  note = {ClinicalTrials.gov Identifier: ${study.nctId}`;

  if (study.overallStatus) {
    bibtex += `; Status: ${study.overallStatus}`;
  }

  if (study.hasResults) {
    bibtex += `; Results available`;
  }

  bibtex += `}\n`;

  bibtex += `}\n`;

  return bibtex;
}

/**
 * Generate citation key for a study
 * @param {Object} study - Study object
 * @returns {string} Citation key
 */
export function generateCitationKey(study) {
  let key = '';

  // Author/sponsor
  if (study.leadSponsor) {
    const sponsor = study.leadSponsor.toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .substring(0, 10);
    key += sponsor;
  }

  // Year
  const year = getYear(study.studyFirstSubmitDate || study.startDate);
  if (year) {
    key += year;
  }

  // NCT ID (last 4 digits)
  const nctSuffix = study.nctId.replace('NCT', '').slice(-4);
  key += nctSuffix;

  return key || study.nctId;
}

/**
 * Generate RIS entry for a study
 * @param {Object} study - Study object
 * @returns {string} RIS entry
 */
export function generateRIS(study) {
  let ris = '';

  // Type of reference
  ris += 'TY  - EGEN\n';

  // Title (Primary title)
  if (study.briefTitle) {
    ris += `TI  - ${cleanText(study.briefTitle)}\n`;
  }

  // Secondary title (official title if different)
  if (study.officialTitle && study.officialTitle !== study.briefTitle) {
    ris += `T2  - ${cleanText(study.officialTitle)}\n`;
  }

  // Authors (use sponsor)
  if (study.leadSponsor) {
    const sponsors = Array.isArray(study.collaborators)
      ? [study.leadSponsor, ...study.collaborators]
      : [study.leadSponsor];
    sponsors.forEach(sponsor => {
      ris += `A1  - ${cleanText(sponsor)}\n`;
    });
  }

  // Year
  const year = getYear(study.studyFirstSubmitDate || study.startDate);
  if (year) {
    ris += `Y1  - ${year}//\n`;
  }

  // Abstract/Summary
  if (study.briefSummary) {
    const summary = cleanText(study.briefSummary).substring(0, 10000);
    ris += `N2  - ${summary}\n`;
  }

  // Keywords (conditions)
  if (study.conditions && study.conditions.length > 0) {
    study.conditions.forEach(condition => {
      ris += `KW  - ${cleanText(condition)}\n`;
    });
  }

  // URL
  ris += `UR  - https://clinicaltrials.gov/show/${study.nctId}\n`;

  // Database
  ris += 'DB  - ClinicalTrials.gov\n';

  // Database identifier
  ris += `M3  - ${study.nctId}\n`;

  // Status
  if (study.overallStatus) {
    ris += `M1  - Status: ${study.overallStatus}\n`;
  }

  // End of record
  ris += 'ER  - \n';

  return ris;
}

/**
 * Generate CSV format for studies
 * @param {Array} studies - Array of studies
 * @returns {string} CSV content
 */
export function generateCSV(studies) {
  const headers = [
    'NCT ID',
    'Title',
    'Sponsor',
    'Status',
    'Start Date',
    'Completion Date',
    'Conditions',
    'Interventions',
    'URL',
    'Has Results'
  ];

  let csv = headers.map(h => `"${h}"`).join(',') + '\n';

  for (const study of studies) {
    const conditions = (study.conditions || []).join('; ');
    const interventions = (study.interventions || [])
      .map(i => i.name)
      .filter(Boolean)
      .join('; ');

    const row = [
      study.nctId,
      cleanText(study.briefTitle),
      study.leadSponsor || '',
      study.overallStatus || '',
      study.startDate || '',
      study.completionDate || '',
      conditions,
      interventions,
      `https://clinicaltrials.gov/show/${study.nctId}`,
      study.hasResults ? 'Yes' : 'No'
    ];

    csv += row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',') + '\n';
  }

  return csv;
}

/**
 * Generate EndNote format for studies
 * @param {Object} study - Study object
 * @returns {string} EndNote entry
 */
export function generateEndNote(study) {
  let note = '%0 Generic\n';

  // Title
  if (study.briefTitle) {
    note += `%T ${cleanText(study.briefTitle)}\n`;
  }

  // Authors/Sponsor
  if (study.leadSponsor) {
    note += `%A ${cleanText(study.leadSponsor)}\n`;
  }

  // Year
  const year = getYear(study.studyFirstSubmitDate || study.startDate);
  if (year) {
    note += `%D ${year}\n`;
  }

  // URL
  note += `%U https://clinicaltrials.gov/show/${study.nctId}\n`;

  // Database
  note += `%7 ClinicalTrials.gov\n`;

  // Identifier
  note += `%8 ${study.nctId}\n`;

  // Abstract
  if (study.briefSummary) {
    note += `%X ${cleanText(study.briefSummary)}\n`;
  }

  // Keywords
  if (study.conditions) {
    study.conditions.forEach(condition => {
      note += `%K ${cleanText(condition)}\n`;
    });
  }

  note += '\n';

  return note;
}

/**
 * Export studies to a citation format
 * @param {Array} studies - Array of studies
 * @param {string} format - Format ('bibtex', 'ris', 'csv', 'endnote')
 * @returns {string} Formatted citations
 */
export function exportCitations(studies, format = 'bibtex') {
  switch (format.toLowerCase()) {
    case 'bibtex':
      return studies.map(s => generateBibtex(s)).join('\n');

    case 'ris':
      return studies.map(s => generateRIS(s)).join('\n');

    case 'csv':
      return generateCSV(studies);

    case 'endnote':
      return studies.map(s => generateEndNote(s)).join('\n');

    default:
      throw new Error(`Unknown citation format: ${format}`);
  }
}

/**
 * Download citations as a file
 * @param {Array} studies - Array of studies
 * @param {string} format - Format
 * @param {string} filename - Optional filename
 */
export function downloadCitations(studies, format = 'bibtex', filename = null) {
  const content = exportCitations(studies, format);

  const extensions = {
    bibtex: '.bib',
    ris: '.ris',
    csv: '.csv',
    endnote: '.enw'
  };

  const defaultFilenames = {
    bibtex: 'citations.bib',
    ris: 'citations.ris',
    csv: 'studies.csv',
    endnote: 'citations.enw'
  };

  const finalFilename = filename || defaultFilenames[format] || 'citations.txt';

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = finalFilename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generate formatted citation string for display
 * @param {Object} study - Study object
 * @param {string} style - Citation style ('apa', 'mla', 'chicago', 'vancouver')
 * @returns {string} Formatted citation
 */
export function formatCitation(study, style = 'apa') {
  const sponsor = study.leadSponsor || 'Unknown Sponsor';
  const year = getYear(study.studyFirstSubmitDate || study.startDate);
  const title = cleanText(study.briefTitle || '');
  const url = `https://clinicaltrials.gov/show/${study.nctId}`;

  switch (style.toLowerCase()) {
    case 'apa':
      return `${sponsor} (${year}). ${title}. ClinicalTrials.gov Identifier ${study.nctId}. Retrieved from ${url}`;

    case 'mla':
      return `${sponsor}. "${title}." ClinicalTrials.gov, ${year}, ${url}. Accessed ${new Date().toLocaleDateString()}.`;

    case 'chicago':
      return `${sponsor}. "${title}." ClinicalTrials.gov. ${url} (accessed ${new Date().toLocaleDateString()}).`;

    case 'vancouver':
      return `${sponsor}. ${title}. ClinicalTrials.gov. ${year}. ${study.nctId}. ${url}.`;

    default:
      return `${sponsor}. ${title}. ${study.nctId}. ClinicalTrials.gov. ${year}.`;
  }
}

/**
 * Generate bibliography for multiple studies
 * @param {Array} studies - Array of studies
 * @param {string} style - Citation style
 * @returns {string} Formatted bibliography
 */
export function generateBibliography(studies, style = 'apa') {
  return studies
    .map(study => `<li>${formatCitation(study, style)}</li>`)
    .join('\n');
}

export default {
  generateBibtex,
  generateRIS,
  generateCSV,
  generateEndNote,
  exportCitations,
  downloadCitations,
  formatCitation,
  generateBibliography,
  generateCitationKey
};
