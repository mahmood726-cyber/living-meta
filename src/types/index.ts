/**
 * Living Meta-Analysis - Type Definitions
 * Core type definitions for the application
 */

// ============================================================================
// PROJECT TYPES
// ============================================================================

export interface Project {
  id: string;
  name: string;
  description?: string;
  living: boolean;
  query: SearchQuery | null;
  lastSearchRunId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SearchQuery {
  term?: string;
  condition?: string;
  intervention?: string;
  studyType?: string;
  status?: string | string[];
  phase?: string | string[];
  hasResults?: boolean;
  startDateFrom?: string;
  startDateTo?: string;
  completionDateFrom?: string;
  completionDateTo?: string;
}

// ============================================================================
// STUDY TYPES
// ============================================================================

export interface Study {
  // Identification
  nctId: string;
  orgStudyId?: string;
  briefTitle: string;
  officialTitle?: string;
  acronym?: string;

  // Status
  overallStatus: string;
  expandedAccessInfo?: string;
  startDate?: string;
  completionDate?: string;
  primaryCompletionDate?: string;
  studyFirstSubmitDate?: string;
  studyFirstPostDate?: string;
  lastUpdatePostDate?: string;
  resultsFirstPostDate?: string;

  // Has results
  hasResults: boolean;

  // Sponsor
  leadSponsor?: string;
  leadSponsorClass?: string;
  collaborators?: string[];

  // Description
  briefSummary?: string;
  detailedDescription?: string;

  // Conditions
  conditions: string[];
  keywords: string[];

  // Design
  studyType?: string;
  phases: string[];
  designInfo: StudyDesignInfo;
  enrollmentInfo: EnrollmentInfo;

  // Arms and interventions
  armGroups: ArmGroup[];
  interventions: Intervention[];

  // Outcomes
  primaryOutcomes: Outcome[];
  secondaryOutcomes: Outcome[];

  // Eligibility
  eligibility: EligibilityInfo;

  // Location
  locationCount: number;
  countries: string[];

  // Derived
  conditionBrowse: BrowseLeaf[];
  interventionBrowse: BrowseLeaf[];

  // Results data
  resultsData: ResultsData | null;

  // Raw JSON for provenance
  _raw: unknown;

  // Metadata
  _parsedAt: string;
}

export interface StudyDesignInfo {
  allocation?: string;
  interventionModel?: string;
  primaryPurpose?: string;
  masking?: string;
  whoMasked?: string[];
}

export interface EnrollmentInfo {
  count?: number;
  type?: string;
}

export interface ArmGroup {
  label: string;
  type?: string;
  description?: string;
  interventionNames: string[];
}

export interface Intervention {
  type?: string;
  name: string;
  description?: string;
  armGroupLabels: string[];
}

export interface Outcome {
  measure: string;
  description?: string;
  timeFrame: string;
}

export interface EligibilityInfo {
  criteria?: string;
  healthyVolunteers?: string;
  sex?: string;
  genderBased?: string;
  minimumAge?: string;
  maximumAge?: string;
  stdAges: string[];
}

export interface BrowseLeaf {
  id?: string;
  name?: string;
}

export interface ResultsData {
  participantFlow: ParticipantFlowGroup[];
  baselineGroups: BaselineGroup[];
  baselineMeasures: BaselineMeasure[];
  outcomeMeasures: OutcomeMeasure[];
  adverseEvents: AdverseEventData;
}

export interface ParticipantFlowGroup {
  id: string;
  title: string;
  description?: string;
}

export interface BaselineGroup {
  id: string;
  title: string;
  description?: string;
}

export interface BaselineMeasure {
  title: string;
  paramType?: string;
  unitOfMeasure?: string;
  classes: BaselineClass[];
}

export interface BaselineClass {
  title: string;
  categories?: BaselineCategory[];
}

export interface BaselineCategory {
  title: string;
  measurements?: MeasurementValue[];
}

export interface MeasurementValue {
  groupId?: string;
  value?: string;
  spread?: string;
  lowerLimit?: string;
  upperLimit?: string;
  comment?: string;
}

export interface OutcomeMeasure {
  type?: string;
  title: string;
  description?: string;
  populationDescription?: string;
  reportingStatus?: string;
  timeFrame?: string;
  paramType?: string;
  dispersionType?: string;
  unitOfMeasure?: string;
  groups: OutcomeGroup[];
  classes: OutcomeClass[];
}

export interface OutcomeGroup {
  id: string;
  title: string;
  description?: string;
}

export interface OutcomeClass {
  title: string;
  categories?: OutcomeCategory[];
}

export interface OutcomeCategory {
  title: string;
  measurements?: MeasurementValue[];
}

export interface AdverseEventData {
  frequencyThreshold?: string;
  timeFrame?: string;
  description?: string;
  groups: AdverseEventGroup[];
}

export interface AdverseEventGroup {
  id: string;
  title: string;
  description?: string;
  seriousNumAffected?: number;
  seriousNumAtRisk?: number;
  otherNumAffected?: number;
  otherNumAtRisk?: number;
}

// ============================================================================
// SEARCH RUN TYPES
// ============================================================================

export interface SearchRun {
  id: string;
  projectId: string;
  query: SearchQuery;
  timestamp: string;
  totalCount: number;
  nctIds: string[];
  diff: SearchRunDiff | null;
  isLivingUpdate?: boolean;
  previousRunId?: string;
}

export interface SearchRunDiff {
  newTrials: number;
  removedTrials: number;
  updatedTrials?: number;
  newNctIds: string[];
  removedNctIds: string[];
  updatedNctIds?: string[];
}

// ============================================================================
// ANALYSIS TYPES
// ============================================================================

export interface EffectSize {
  yi: number | null;
  vi: number | null;
  se?: number;
}

export interface StudyEffectSize extends EffectSize {
  id: string;
  n1?: number;
  n2?: number;
  m1?: number;
  m2?: number;
  sd1?: number;
  sd2?: number;
  tpos?: number;
  tneg?: number;
  cpos?: number;
  cneg?: number;
}

export interface MetaAnalysisResult {
  model: 'FE' | 'RE-DL' | 'RE-PM' | 'RE-REML' | 'RE-MPL';
  k: number;
  theta: number;
  se: number;
  variance: number;
  ci_lower: number;
  ci_upper: number;
  z?: number;
  t?: number;
  pValue: number;
  Q: number;
  df: number;
  pQ: number;
  I2: number;
  H2: number;
  tau2?: number;
  tau?: number;
  pi_lower?: number;
  pi_upper?: number;
  hksj?: boolean;
  qStar?: number;
  fe?: MetaAnalysisResult;
}

export interface AnalysisSpec {
  outcomeId: string;
  measure: 'OR' | 'RR' | 'RD' | 'SMD' | 'MD';
  model: 'FE' | 'DL' | 'PM' | 'REML' | 'MPL';
  hksj: boolean;
  predictionInterval: boolean;
  subgroup?: string;
  metaRegression?: string[];
}

// ============================================================================
// SCREENING TYPES
// ============================================================================

export interface ScreeningDecision {
  nctId: string;
  decision: 'include' | 'exclude' | 'maybe' | 'pending';
  reason?: string;
  criteria?: string[];
  timestamp: string;
  reviewer?: string;
}

export interface ScreeningQueue {
  projectId: string;
  decisions: ScreeningDecision[];
  current: ScreeningDecision | null;
}

// ============================================================================
// EXTRACTION TYPES
// ============================================================================

export interface ExtractionRow {
  id: string;
  nctId: string;
  studyId: string;
  armId?: string;
  outcomeId?: string;
  timepoint?: string;
  sampleSize?: number;
  events?: number;
  mean?: number;
  sd?: number;
  median?: number;
  q1?: number;
  q3?: number;
  min?: number;
  max?: number;
  followUp?: string;
  notes?: string;
  verified: boolean;
  extractedAt?: string;
  extractedBy?: string;
}

// ============================================================================
// EIM (Evidence Integrity Module) TYPES
// ============================================================================

export interface EIMTrialFlags {
  nctId: string;
  nonPublicationRisk: 'low' | 'medium' | 'high';
  outcomeReportingBias: boolean;
  registrationDiscrepancy: boolean;
  statusChange: boolean;
  sponsorConflict: boolean;
  flags: string[];
  score: number;
}

export interface EIMMetaSummary {
  totalStudies: number;
  nonPublicationRisk: { low: number; medium: number; high: number };
  outcomeReportingBias: number;
  registrationDiscrepancies: number;
  overallIntegrity: 'high' | 'medium' | 'low';
}

// ============================================================================
// UI STATE TYPES
// ============================================================================

export interface ToastState {
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  duration?: number;
}

export interface ModalState {
  title: string;
  content: string;
  onMount?: () => void;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export interface UIState {
  loading: boolean;
  error: string | null;
  toast: ToastState | null;
  modal: ModalState | null;
  sidebarOpen: boolean;
  theme: 'light' | 'dark' | 'system';
}

export interface SyncState {
  lastSync: Date | null;
  syncing: boolean;
  pendingChanges: number;
}

// ============================================================================
// APPLICATION STATE TYPES
// ============================================================================

export interface AppState {
  currentProject: Project | null;
  projects: Project[];
  currentSearchRun: SearchRun | null;
  screeningQueue: ScreeningDecision[];
  screeningCurrent: ScreeningDecision | null;
  extractionTable: ExtractionRow[];
  analysisSpec: AnalysisSpec | null;
  analysisResults: MetaAnalysisResult | null;
  eimTrialFlags: EIMTrialFlags[];
  eimMetaSummary: EIMMetaSummary | null;
  ui: UIState;
  sync: SyncState;
}

// ============================================================================
// ACTION TYPES
// ============================================================================

export type Action = {
  type: string;
  payload?: unknown;
};

export type ActionCreator<T = unknown> = (payload?: T) => Action;

// ============================================================================
// ROUTER TYPES
// ============================================================================

export interface RouteConfig {
  path: string;
  title?: string;
  navMatch?: string;
  render?: (params: Record<string, string>, query: Record<string, string>) => string | HTMLElement | Promise<string | HTMLElement>;
  init?: (params: Record<string, string>, query: Record<string, string>) => void | Promise<void>;
  component?: () => Promise<{ render?: Function; init?: Function; default?: { render?: Function; init?: Function } }>;
}

export interface BeforeEachHook = (
  to: RouteConfig,
  from: RouteConfig | null,
  params: Record<string, string>,
  query: Record<string, string>
) => boolean | string | void | Promise<boolean | string | void>;

export interface AfterEachHook = (
  to: RouteConfig,
  from: RouteConfig | null,
  params: Record<string, string>,
  query: Record<string, string>
) => void | Promise<void>;

// ============================================================================
// STORE TYPES
// ============================================================================

export type Reducer<S = AppState, A extends Action = Action> = (state: S, action: A) => S;

export type Listener<S = AppState> = (
  state: S,
  action: Action,
  prevState: S
) => void;

export type Middleware<S = AppState, A extends Action = Action> = (
  state: S,
  action: A
) => A | null | undefined;

export type Selector<S = AppState, T = unknown> = (state: S) => T;

// ============================================================================
// ERROR TYPES
// ============================================================================

export enum ErrorCategory {
  NETWORK = 'network',
  DATABASE = 'database',
  VALIDATION = 'validation',
  ANALYSIS = 'analysis',
  WORKER = 'worker',
  UI = 'ui',
  UNKNOWN = 'unknown'
}

export enum ErrorSeverity {
  DEBUG = 'debug',
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

export class AppError extends Error {
  public readonly category: ErrorCategory;
  public readonly severity: ErrorSeverity;
  public readonly recoverable: boolean;
  public readonly cause?: Error;
  public readonly userMessage?: string;
  public readonly context?: Record<string, unknown>;

  constructor(
    message: string,
    options: {
      category?: ErrorCategory;
      severity?: ErrorSeverity;
      recoverable?: boolean;
      cause?: Error;
      userMessage?: string;
      context?: Record<string, unknown>;
    } = {}
  ) {
    super(message);
    this.name = 'AppError';
    this.category = options.category ?? ErrorCategory.UNKNOWN;
    this.severity = options.severity ?? ErrorSeverity.ERROR;
    this.recoverable = options.recoverable ?? true;
    this.cause = options.cause;
    this.userMessage = options.userMessage;
    this.context = options.context;
  }
}

// ============================================================================
// WORKER MESSAGE TYPES
// ============================================================================

export interface WorkerMessage<T = unknown> {
  type: string;
  payload?: T;
  error?: string;
  requestId?: string;
}

export type WorkerResponseType =
  | 'SEARCH_STARTED'
  | 'SEARCH_PROGRESS'
  | 'SEARCH_COMPLETE'
  | 'SEARCH_ERROR'
  | 'SEARCH_CANCELLED'
  | 'DIFF_COMPLETE'
  | 'UPDATE_CHECK_STARTED'
  | 'UPDATE_CHECK_PROGRESS'
  | 'UPDATE_CHECK_ERROR'
  | 'ANALYSIS_STARTED'
  | 'ANALYSIS_COMPLETE'
  | 'ANALYSIS_ERROR'
  | 'EIM_STARTED'
  | 'EIM_TRIAL_FLAGS'
  | 'EIM_META_SUMMARY'
  | 'EIM_ERROR';

// ============================================================================
// EXPORT TYPES
// ============================================================================

export type ExportFormat = 'json' | 'csv' | 'revman' | 'bibtex' | 'ris' | 'prisma';

export interface ExportOptions {
  format: ExportFormat;
  includeMetadata?: boolean;
  includeResults?: boolean;
  includeScreening?: boolean;
  includeExtraction?: boolean;
  includeAnalysis?: boolean;
  includeEIM?: boolean;
}

// ============================================================================
// DUPLICATE DETECTION TYPES
// ============================================================================

export interface DuplicateGroup {
  id: string;
  primaryNctId: string;
  duplicateNctIds: string[];
  similarity: number;
  reason: string[];
}

export interface DuplicateDetectionResult {
  groups: DuplicateGroup[];
  totalDuplicates: number;
  timestamp: string;
}

// ============================================================================
// PRISMA DIAGRAM TYPES
// ============================================================================

export interface PRISMAData {
  identification: {
    database: number;
    registry: number;
    other: number;
    total: number;
  };
  screening: {
    afterDuplicatesRemoved: number;
    afterTitleAbstract: number;
    afterFullText: number;
  };
  inclusion: {
    qualitative: number;
    quantitative: number;
  };
  exclusion: {
    fullText Reasons: Record<string, number>;
    total: number;
  };
}

export interface PRISMAGenerationOptions {
  format: 'svg' | 'png';
  width?: number;
  height?: number;
  includeReasons?: boolean;
}
