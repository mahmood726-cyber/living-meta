/**
 * Demo Data Injection Script for Living Meta-Analysis
 * Run this in the browser console or via Selenium to populate test data
 */

async function injectDemoData() {
  // Wait for DB to be ready
  const { db, initDB } = await import('/src/db/schema.js');
  await initDB();

  const projectId = crypto.randomUUID();
  const now = new Date().toISOString();

  // 1. Create demo project
  const project = {
    id: projectId,
    name: 'Demo: Aspirin vs Placebo for CVD Prevention',
    description: 'Systematic review of aspirin for cardiovascular disease prevention in high-risk patients',
    living: true,
    createdAt: now,
    updatedAt: now
  };
  await db.projects.put(project);
  console.log('Created project:', project.name);

  // 2. Create demo trial records (simulating CT.gov data)
  const demoTrials = [
    {
      nctId: 'NCT00000001',
      briefTitle: 'Aspirin for Primary Prevention of CVD in Diabetic Patients',
      briefSummary: 'A randomized controlled trial evaluating low-dose aspirin for primary prevention of cardiovascular events in patients with type 2 diabetes.',
      phase: 'Phase 3',
      overallStatus: 'Completed',
      enrollmentCount: 1500,
      studyType: 'Interventional',
      startDate: '2018-01-15',
      completionDate: '2022-06-30',
      sponsor: 'University Medical Center',
      hasResults: true,
      conditions: 'Type 2 Diabetes, Cardiovascular Disease',
      interventions: 'Aspirin 100mg vs Placebo'
    },
    {
      nctId: 'NCT00000002',
      briefTitle: 'Low-Dose Aspirin in Elderly Patients',
      briefSummary: 'Evaluation of aspirin 81mg daily for prevention of major cardiovascular events in patients aged 65 and older.',
      phase: 'Phase 3',
      overallStatus: 'Completed',
      enrollmentCount: 2200,
      studyType: 'Interventional',
      startDate: '2017-03-01',
      completionDate: '2021-12-15',
      sponsor: 'National Heart Institute',
      hasResults: true,
      conditions: 'Cardiovascular Disease Prevention',
      interventions: 'Aspirin 81mg vs Placebo'
    },
    {
      nctId: 'NCT00000003',
      briefTitle: 'Aspirin and Cardiovascular Outcomes Study',
      briefSummary: 'Multi-center trial of aspirin for secondary prevention in patients with prior MI.',
      phase: 'Phase 4',
      overallStatus: 'Completed',
      enrollmentCount: 3500,
      studyType: 'Interventional',
      startDate: '2016-06-01',
      completionDate: '2020-09-30',
      sponsor: 'Cardiology Research Network',
      hasResults: true,
      conditions: 'Myocardial Infarction, Secondary Prevention',
      interventions: 'Aspirin 325mg vs Placebo'
    },
    {
      nctId: 'NCT00000004',
      briefTitle: 'Aspirin Prevention Trial',
      briefSummary: 'Randomized trial of aspirin in patients with multiple cardiovascular risk factors.',
      phase: 'Phase 3',
      overallStatus: 'Completed',
      enrollmentCount: 1800,
      studyType: 'Interventional',
      startDate: '2019-02-01',
      completionDate: '2023-01-15',
      sponsor: 'Academic Medical Center',
      hasResults: true,
      conditions: 'Cardiovascular Risk',
      interventions: 'Aspirin 100mg vs Placebo'
    },
    {
      nctId: 'NCT00000005',
      briefTitle: 'Aspirin in High-Risk Populations',
      briefSummary: 'Assessment of aspirin efficacy in patients with hypertension and hyperlipidemia.',
      phase: 'Phase 3',
      overallStatus: 'Completed',
      enrollmentCount: 2800,
      studyType: 'Interventional',
      startDate: '2015-09-01',
      completionDate: '2019-12-31',
      sponsor: 'International CVD Consortium',
      hasResults: true,
      conditions: 'Hypertension, Hyperlipidemia',
      interventions: 'Aspirin 100mg vs Placebo'
    },
    {
      nctId: 'NCT00000006',
      briefTitle: 'Aspirin Dose-Response Study',
      briefSummary: 'Comparison of different aspirin doses for cardiovascular prevention.',
      phase: 'Phase 2/3',
      overallStatus: 'Completed',
      enrollmentCount: 1200,
      studyType: 'Interventional',
      startDate: '2018-04-01',
      completionDate: '2022-03-31',
      sponsor: 'Clinical Research Institute',
      hasResults: true,
      conditions: 'Cardiovascular Disease',
      interventions: 'Aspirin 75mg vs Placebo'
    },
    {
      nctId: 'NCT00000007',
      briefTitle: 'ASPIRE: Aspirin in Primary Prevention',
      briefSummary: 'Large-scale trial of aspirin for primary CVD prevention in moderate-risk adults.',
      phase: 'Phase 3',
      overallStatus: 'Completed',
      enrollmentCount: 4200,
      studyType: 'Interventional',
      startDate: '2014-01-01',
      completionDate: '2018-06-30',
      sponsor: 'Global Health Research',
      hasResults: true,
      conditions: 'Primary Prevention CVD',
      interventions: 'Aspirin 100mg vs Placebo'
    },
    {
      nctId: 'NCT00000008',
      briefTitle: 'Aspirin and Stroke Prevention',
      briefSummary: 'Evaluation of aspirin for stroke prevention in patients with atrial fibrillation.',
      phase: 'Phase 3',
      overallStatus: 'Completed',
      enrollmentCount: 1600,
      studyType: 'Interventional',
      startDate: '2017-08-01',
      completionDate: '2021-07-31',
      sponsor: 'Neurology Research Center',
      hasResults: true,
      conditions: 'Atrial Fibrillation, Stroke Prevention',
      interventions: 'Aspirin 325mg vs Placebo'
    }
  ];

  await db.records.bulkPut(demoTrials);
  console.log('Created', demoTrials.length, 'trial records');

  // 3. Create search run
  const searchRun = {
    id: crypto.randomUUID(),
    projectId: projectId,
    timestamp: now,
    query: { condition: 'cardiovascular disease', intervention: 'aspirin' },
    totalCount: demoTrials.length,
    nctIds: demoTrials.map(t => t.nctId)
  };
  await db.searchRuns.put(searchRun);

  // 4. Create screening decisions (include all)
  const screeningDecisions = demoTrials.map(trial => ({
    projectId: projectId,
    nctId: trial.nctId,
    decision: 'include',
    stage: 'full_text',
    decidedAt: now,
    autoScreened: false
  }));
  await db.screening.bulkPut(screeningDecisions);
  console.log('Created', screeningDecisions.length, 'screening decisions');

  // 5. Create extraction data (binary outcomes - CVD events)
  const extractionData = [
    { nctId: 'NCT00000001', events1: 45, n1: 750, events2: 68, n2: 750, label: 'Smith 2022' },
    { nctId: 'NCT00000002', events1: 52, n1: 1100, events2: 78, n2: 1100, label: 'Johnson 2021' },
    { nctId: 'NCT00000003', events1: 89, n1: 1750, events2: 142, n2: 1750, label: 'Williams 2020' },
    { nctId: 'NCT00000004', events1: 38, n1: 900, events2: 55, n2: 900, label: 'Brown 2023' },
    { nctId: 'NCT00000005', events1: 71, n1: 1400, events2: 98, n2: 1400, label: 'Davis 2019' },
    { nctId: 'NCT00000006', events1: 28, n1: 600, events2: 41, n2: 600, label: 'Miller 2022' },
    { nctId: 'NCT00000007', events1: 112, n1: 2100, events2: 156, n2: 2100, label: 'Wilson 2018' },
    { nctId: 'NCT00000008', events1: 35, n1: 800, events2: 52, n2: 800, label: 'Taylor 2021' }
  ];

  const extractions = extractionData.map(d => ({
    projectId: projectId,
    nctId: d.nctId,
    outcomeId: 'primary',
    outcomeType: 'binary',
    data: {
      treatment_label: 'Aspirin',
      treatment_events: d.events1,
      treatment_n: d.n1,
      control_label: 'Placebo',
      control_events: d.events2,
      control_n: d.n2,
      outcome_description: 'Major Adverse Cardiovascular Events (MACE)',
      timepoint: '12 months',
      studyLabel: d.label
    },
    qualityFlags: [],
    verified: true,
    extractedAt: now,
    verifiedAt: now
  }));

  await db.extraction.bulkPut(extractions);
  console.log('Created', extractions.length, 'extraction records');

  // 6. Update project with search run reference
  project.lastSearchRunId = searchRun.id;
  project.trialCount = demoTrials.length;
  await db.projects.put(project);

  console.log('\n=== Demo Data Injection Complete ===');
  console.log('Project ID:', projectId);
  console.log('Navigate to: /#/project/' + projectId + '/analysis');

  return projectId;
}

// Export for use
window.injectDemoData = injectDemoData;

// Auto-run if loaded directly
if (typeof window !== 'undefined') {
  console.log('Demo data injection ready. Run: injectDemoData()');
}
