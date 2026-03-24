# Living Meta-Analysis API Documentation

## Table of Contents
1. [Analysis Worker API](#analysis-worker-api)
2. [Statistical Functions](#statistical-functions)
3. [Database Schema](#database-schema)
4. [Component API](#component-api)
5. [Event System](#event-system)

---

## Analysis Worker API

### Overview

The analysis worker (`src/workers/analysis_worker.js`) runs all statistical computations in a background thread to keep the UI responsive.

### Message Protocol

All messages follow this structure:

```javascript
// Request
{
  type: 'MESSAGE_TYPE',
  payload: { ... },
  requestId: 'unique-id'  // Optional, for tracking responses
}

// Response
{
  type: 'RESULT_TYPE',
  payload: { ... },
  requestId: 'unique-id'
}
```

### Message Types

#### RUN_META_ANALYSIS

Runs pairwise meta-analysis with full output.

**Request:**
```javascript
{
  type: 'RUN_META_ANALYSIS',
  payload: {
    studies: [
      { id: 'study1', yi: -0.5, vi: 0.1, n1: 50, n2: 50, label: 'Smith 2020' }
    ],
    spec: {
      effectType: 'OR',      // OR, RR, RD, MD, SMD
      tauMethod: 'REML',     // DL, PM, REML
      applyHKSJ: true,       // Apply Hartung-Knapp-Sidik-Jonkman
      alpha: 0.05
    }
  }
}
```

**Response:**
```javascript
{
  type: 'ANALYSIS_COMPLETE',
  payload: {
    meta_analysis: {
      k: 13,
      total_n: 1250,
      effect_measure: 'OR',
      fixed_effect: { estimate, se, ci_lower, ci_upper, z, p_value },
      random_effects: { estimate, se, ci_lower, ci_upper, z, p_value, method, hksj_applied },
      heterogeneity: { tau2, tau, Q, df, Q_pvalue, I2, I2_ci, H2 },
      prediction_interval: { lower, upper }
    },
    studies: [...],
    small_study_tests: {
      egger: { intercept, se, t, df, p, significant },
      peters: { ... },
      harbord: { ... },
      trim_and_fill: { k0, adjusted_estimate, imputed_studies }
    },
    e_values: { point_estimate, confidence_interval },
    sensitivity: {
      leave_one_out: [...],
      influence: [...]
    }
  }
}
```

#### RUN_NMA

Runs network meta-analysis.

**Request:**
```javascript
{
  type: 'RUN_NMA',
  payload: {
    studies: [
      { study: 'Trial1', treat1: 'A', treat2: 'B', yi: 0.5, vi: 0.1 }
    ],
    spec: {
      reference: 'Placebo',
      effectType: 'OR',
      inconsistencyTest: true
    }
  }
}
```

#### RUN_TSA

Runs Trial Sequential Analysis.

**Request:**
```javascript
{
  type: 'RUN_TSA',
  payload: {
    studies: [...],
    spec: {
      anticipatedEffect: 0.25,
      alpha: 0.05,
      beta: 0.2,
      heterogeneityAdjustment: 'DARIS'
    }
  }
}
```

---

## Statistical Functions

### Core Estimators

#### `derSimonianLaird(studies)`
DerSimonian-Laird random effects estimator.

```javascript
const result = derSimonianLaird(studies);
// Returns: { estimate, se, ci_lower, ci_upper, tau2, tau, z, p }
```

#### `pauleMandel(studies, options)`
Paule-Mandel iterative estimator.

```javascript
const result = pauleMandel(studies, { maxIter: 100, tol: 1e-8 });
```

#### `remlEstimator(studies, options)`
REML (Restricted Maximum Likelihood) estimator.

```javascript
const result = await remlEstimator(studies, { maxIter: 100 });
```

### Heterogeneity

#### `calculateHeterogeneity(studies, reResult)`
Calculate Q, I², H² and confidence intervals.

```javascript
const het = calculateHeterogeneity(studies, reResult);
// Returns: { Q, df, Q_p, I2, I2_ci_lower, I2_ci_upper, H2 }
```

#### `calculatePredictionInterval(estimate, tau2, se, k)`
Calculate prediction interval for a new study.

```javascript
const pi = calculatePredictionInterval(-0.5, 0.1, 0.05, 13);
// Returns: { lower, upper }
```

### Publication Bias

#### `runEggerTest(studies)`
Egger's regression test for funnel plot asymmetry.

```javascript
const egger = runEggerTest(studies);
// Returns: { intercept, se, t, df, p, significant }
```

#### `runPetersTest(studies)`
Peters' test for binary outcomes.

```javascript
const peters = runPetersTest(studies);
// Returns: { slope, se, t, df, p, significant }
```

#### `runTrimAndFill(studies, pooledEstimate)`
Duval & Tweedie trim-and-fill.

```javascript
const tf = runTrimAndFill(studies, -0.5);
// Returns: { k0, side, adjusted_estimate, imputed_studies }
```

### Effect Sizes

#### `calculateEffectSizes(studies, effectType)`
Convert raw data to effect sizes.

```javascript
const effects = calculateEffectSizes(studies, 'OR');
// Each study gets: yi, vi, se, weight_fe, weight_re
```

### Distributions

#### `tQuantile(p, df)`
Student's t-distribution quantile function.

```javascript
const t = tQuantile(0.975, 12);  // Returns 2.179
```

#### `tCDF(t, df)`
Student's t-distribution CDF.

```javascript
const p = tCDF(2.179, 12);  // Returns ~0.975
```

---

## Database Schema

### Tables

#### projects
```javascript
{
  id: 'uuid',
  name: 'Project Name',
  description: 'Description',
  living: true,
  query: { ... },
  createdAt: Date,
  updatedAt: Date
}
```

#### records
```javascript
{
  nctId: 'NCT00001234',
  briefTitle: 'Study Title',
  overallStatus: 'Completed',
  hasResults: true,
  lastUpdatePostDate: Date,
  rawJson: { ... }
}
```

#### screening
```javascript
{
  projectId: 'uuid',
  nctId: 'NCT00001234',
  stage: 1,
  decision: 'include',
  reasons: [],
  decidedAt: Date,
  decidedBy: 'user'
}
```

#### extraction
```javascript
{
  projectId: 'uuid',
  nctId: 'NCT00001234',
  outcomeId: 'outcome1',
  data: { n1, n2, events1, events2, ... },
  verified: false,
  locked: false,
  qualityFlags: []
}
```

---

## Component API

### lma-button

```html
<lma-button variant="primary" size="md" loading>Save</lma-button>
```

| Attribute | Values | Description |
|-----------|--------|-------------|
| variant | primary, secondary, danger, ghost | Button style |
| size | sm, md, lg | Button size |
| loading | boolean | Show loading spinner |
| disabled | boolean | Disable button |

### lma-modal

```html
<lma-modal id="confirm" title="Confirm" size="md">
  <p>Are you sure?</p>
  <div slot="footer">
    <lma-button data-close>Cancel</lma-button>
    <lma-button variant="primary">OK</lma-button>
  </div>
</lma-modal>
```

**Methods:**
- `modal.open()` - Show modal
- `modal.close()` - Hide modal

**Events:**
- `modal-open` - Fired when opened
- `modal-close` - Fired when closed

### lma-table

```javascript
const table = document.querySelector('lma-table');
table.columns = [
  { key: 'name', label: 'Study', sortable: true },
  { key: 'effect', label: 'Effect Size', decimals: 3 }
];
table.data = [{ name: 'Smith 2020', effect: -0.534 }];
```

| Property | Type | Description |
|----------|------|-------------|
| columns | Array | Column definitions |
| data | Array | Row data |
| pageSize | Number | Rows per page |

| Attribute | Description |
|-----------|-------------|
| sortable | Enable column sorting |
| paginated | Enable pagination |

### lma-toast

```javascript
import { LmaToast } from './components/base/lma-toast.js';

LmaToast.show({
  type: 'success',  // success, error, warning, info
  message: 'Analysis complete!',
  duration: 5000    // ms, 0 = no auto-dismiss
});
```

---

## Event System

### Store Events

```javascript
import { store } from './store.js';

store.subscribe((state, action) => {
  console.log('State changed:', action.type);
});
```

### Analysis Events

```javascript
analysisWorker.onmessage = (e) => {
  switch (e.data.type) {
    case 'ANALYSIS_STARTED':
      // Show progress
      break;
    case 'ANALYSIS_PROGRESS':
      // Update progress bar
      break;
    case 'ANALYSIS_COMPLETE':
      // Display results
      break;
    case 'ANALYSIS_ERROR':
      // Handle error
      break;
  }
};
```

---

## Error Handling

All errors follow this structure:

```javascript
{
  category: 'ANALYSIS' | 'DATABASE' | 'NETWORK' | 'WORKER',
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL',
  message: 'Human-readable message',
  code: 'ERROR_CODE',
  recoverable: true,
  context: { ... }
}
```

Use the error handler:

```javascript
import { handleError, AppError, ErrorCategory } from './lib/error-handler.js';

try {
  // risky operation
} catch (err) {
  handleError(new AppError('Analysis failed', {
    category: ErrorCategory.ANALYSIS,
    cause: err
  }));
}
```

---

## Meta-Regression API

### `simpleMetaRegression(studies, covariateOrOptions, explicitOptions)`

Simple meta-regression with one covariate.

**Calling Conventions:**
```javascript
// Convention 1: String covariate
simpleMetaRegression(studies, 'year')

// Convention 2: Options object
simpleMetaRegression(studies, { covariate: 'year', method: 'REML' })

// Convention 3: Both
simpleMetaRegression(studies, 'year', { nPermutations: 100 })
```

**Parameters:**
- `studies` (Array): Studies with `yi`, `vi`, and covariate
- `covariateOrOptions` (String|Object): Covariate name or options
- `explicitOptions` (Object): Options (if using string covariate)

**Options:**
- `method` (String): 'REML' (default), 'DL', 'ML'
- `test` (String): 'knha' (default), 't', 'z'
- `hksj` (Boolean): Alias for `test: 'knha'`
- `alpha` (Number): Significance level
- `nPermutations` (Number): For permutation test

**Returns:**
```javascript
{
  intercept: Number,
  slope: Number,
  interceptSE: Number,
  slopeSE: Number,
  zValue: Number,
  pValue: Number,
  df: Number,
  Q: Number,
  tau2: Number,
  r2: Number,
  i2: Number,
  nStudies: Number,
  covariate: String,
  hksj: Boolean,
  permutationTest: Object  // If nPermutations specified
}
```

### `multipleMetaRegression(studies, covariates, options)`

Multiple meta-regression with several covariates.

**Parameters:**
- `studies` (Array): Studies with `yi`, `vi`, and covariates
- `covariates` (Array): Covariate names
- `options` (Object):
  - `method` (String): 'REML', 'DL', 'backward' (stepwise)
  - `intercept` (Boolean): Include intercept (default: true)

**Returns:**
```javascript
{
  coefficients: { intercept: Number, covariate1: Number, ... },
  coefficientMatrix: Array,
  varianceMatrix: Array,
  vif: { intercept: 1, covariate1: Number, ... },
  selectedPredictors: Array  // If using stepwise
}
```

### `extractPredictors(studies)`

Automatically extract covariates from ClinicalTrials.gov data.

**Returns:**
```javascript
{
  year: Array,
  sampleSize: Array,
  phase: Array,
  multiCenter: Array,
  funding: Array,
  meanAge: Array,
  percentFemale: Array
}
```

---

## Network Meta-Analysis API

### `networkMetaAnalysis(studies, options)`

Perform frequentist network meta-analysis.

**Parameters:**
- `studies` (Array): Array of study objects with `arms` array
  ```javascript
  {
    id: 'S1',
    arms: [
      { treatment: 'A', events: 10, denominator: 100 },
      { treatment: 'B', events: 5, denominator: 100 }
    ]
  }
  ```
- `options` (Object):
  - `reference` (String): Reference treatment name
  - `tauMethod` (String): 'DL', 'REML', 'PM'
  - `hksj` (Boolean): Use HKSJ adjustment (default: true)
  - `alpha` (Number): Significance level (default: 0.05)

**Returns:**
```javascript
{
  effects: {
    'TreatmentA': { effect: Number, se: Number, ci_lower: Number, ci_upper: Number, p: Number }
  },
  rankings: {
    sucras: Array,       // SUCRA values (0-100)
    ranks: Array,        // Mean ranks
    pScores: Array       // P-scores
  },
  network: {
    connected: Boolean,
    geometry: String,    // 'star', 'chain', 'loop', 'complex'
    nTreatments: Number,
    nStudies: Number
  },
  tau2: Number
}
```

### `calculateSUCRA(treatments, effects, options)`

Calculate Surface Under Cumulative Ranking curve.

**Parameters:**
- `treatments` (Array): Treatment names
- `effects` (Array): Array of effect arrays per study
- `options` (Object):
  - `direction` (String): 'lower' (better when lower) or 'higher'

---

## Bayesian Methods API

### `bayesianRandomEffects(studies, options)`

Bayesian random-effects meta-analysis using MCMC.

**Parameters:**
- `studies` (Array): Studies with `yi` and `vi`
- `options` (Object):
  - `chains` (Number): MCMC chains (default: 3)
  - `iterations` (Number): Total iterations (default: 10000)
  - `burnIn` (Number): Burn-in period (default: 2000)
  - `thin` (Number): Thinning interval (default: 1)

**Returns:**
```javascript
{
  mu: { mean: Number, sd: Number, median: Number, p025: Number, p975: Number },
  muCI: { lower: Number, upper: Number },
  rhat: { mu: Number, tau2: Number, tau: Number },
  nEff: { mu: Number, tau2: Number, tau: Number }
}
```

**Convergence Criteria:**
- R-hat < 1.1 indicates convergence
- nEff > 400 recommended

---

## Error Messages API

All errors now include detailed recovery guidance:

```javascript
import { createError, getErrorMessage } from './src/lib/error-messages.js';

// Create error with recovery suggestion
const error = createError('INSUFFICIENT_STUDIES_NMA', 2);
// Returns: {
//   error: 'Insufficient studies for network meta-analysis',
//   detail: 'Network meta-analysis requires at least 3 studies, but only 2 were provided.',
//   recovery: 'Add more studies to establish a connected treatment network.',
//   errorCode: 'INSUFFICIENT_STUDIES_NMA'
// }

// Get error message by code
const info = getErrorMessage('HIGH_MULTICOLLINEARITY', [15.2, 8.5], ['x1', 'x2']);
```

### Error Codes

| Error Code | Description |
|------------|-------------|
| `INSUFFICIENT_STUDIES_META_ANALYSIS` | Need ≥2 studies |
| `INSUFFICIENT_STUDIES_NMA` | Need ≥3 studies |
| `INSUFFICIENT_STUDIES_REGRESSION` | Need ≥parameters studies |
| `NETWORK_DISCONNECTED` | Treatments not connected |
| `COVARIATE_NO_VARIATION` | Covariate has zero variance |
| `HIGH_MULTICOLLINEARITY` | VIF > 10 |
| `SINGULAR_MATRIX` | Cannot solve (linear dependence) |
| `BAYESIAN_NO_CONVERGENCE` | R-hat > 1.1 |
```
