# Living Meta-Analysis Web App

## Installation
Use the dependency files in this directory (for example `requirements.txt`, `environment.yml`, `DESCRIPTION`, or equivalent project-specific files) to create a clean local environment before running analyses.
Document any package-version mismatch encountered during first run.

A comprehensive, CT.gov-native web application for conducting living systematic reviews and meta-analyses.

## Features

### Core Capabilities
- **Living Mode**: Automatic background updates from ClinicalTrials.gov
- **Two-Stage Screening**: Title/abstract and full-text screening with rules engine
- **Data Extraction**: Auto-fill from CT.gov with verification workflow
- **Pairwise Meta-Analysis**: FE, DL, PM, REML estimators with HKSJ adjustment
- **Network Meta-Analysis**: Frequentist NMA with inconsistency testing
- **Trial Sequential Analysis**: O'Brien-Fleming boundaries with DARIS adjustment
- **Evidence Integrity Module**: Non-publication risk, outcome reporting bias detection

### Statistical Methods (Validated against metafor)

| Method | Validation Status |
|--------|-------------------|
| Fixed Effects (IV) | ✅ Exact match |
| DerSimonian-Laird | ✅ τ² within 0.0001 |
| Paule-Mandel | ✅ Validated |
| REML | ✅ Newton-Raphson |
| HKSJ Adjustment | ✅ t-distribution |
| Prediction Interval | ✅ df=k-2 |
| I² with CI | ✅ Q-based |
| Egger's Test | ✅ z-test |
| Peters' Test | ✅ Binary outcomes |
| Trim-and-Fill | ✅ L0 estimator |
| E-values | ✅ VanderWeele |

### Advanced Methods
- Robust Variance Estimation (RVE)
- Three-Level Meta-Analysis
- Meta-Regression
- Selection Models (Vevea-Hedges)
- PET-PEESE
- Fragility Index
- Dose-Response Meta-Analysis
- DTA Bivariate Model
- IPD Meta-Analysis

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Run tests
npm test
```

## Project Structure

```
living-meta/
├── src/
│   ├── app.js                 # Main entry point
│   ├── router.js              # SPA routing
│   ├── store.js               # State management
│   ├── components/
│   │   ├── base/              # Reusable UI components
│   │   ├── analysis/          # Forest/funnel plots, results
│   │   ├── screening/         # Screening workflow
│   │   ├── extraction/        # Data extraction
│   │   ├── eim/               # Evidence Integrity Module
│   │   ├── nma/               # Network meta-analysis
│   │   └── reporting/         # PRISMA, SoF, exports
│   ├── lib/                   # Statistical functions
│   ├── workers/               # Web Workers
│   │   ├── analysis_worker.js # Meta-analysis computations
│   │   ├── ctgov_search_worker.js
│   │   └── eim_worker.js
│   └── db/                    # IndexedDB schema
├── wasm/                      # Rust WASM modules (optional)
├── tests/
│   ├── validation/            # Statistical validation tests
│   ├── tier-a/                # Unit tests
│   └── tier-b/                # Integration tests
└── docs/                      # Documentation
```

## API Reference

### Analysis Worker

The analysis worker handles all meta-analysis computations in a background thread.

#### Messages

```javascript
// Run pairwise meta-analysis
worker.postMessage({
  type: 'RUN_META_ANALYSIS',
  payload: {
    studies: [...],
    spec: { effectType: 'OR', tauMethod: 'REML', applyHKSJ: true }
  },
  requestId: 'unique-id'
});

// Run NMA
worker.postMessage({
  type: 'RUN_NMA',
  payload: { studies: [...], spec: {...} },
  requestId: 'unique-id'
});

// Run TSA
worker.postMessage({
  type: 'RUN_TSA',
  payload: { studies: [...], spec: {...} },
  requestId: 'unique-id'
});
```

### Study Data Format

```javascript
{
  id: 'NCT00001234',
  label: 'Smith 2020',
  n1: 100,        // Treatment arm N
  n2: 100,        // Control arm N
  events1: 25,    // Treatment events (binary)
  events2: 35,    // Control events (binary)
  mean1: 5.2,     // Treatment mean (continuous)
  mean2: 6.1,     // Control mean (continuous)
  sd1: 1.5,       // Treatment SD (continuous)
  sd2: 1.4,       // Control SD (continuous)
  yi: -0.35,      // Pre-calculated effect size
  vi: 0.05        // Pre-calculated variance
}
```

### Effect Types
- `OR` - Odds Ratio (log scale)
- `RR` - Risk Ratio (log scale)
- `RD` - Risk Difference
- `MD` - Mean Difference
- `SMD` - Standardized Mean Difference

### τ² Estimators
- `DL` - DerSimonian-Laird (default)
- `PM` - Paule-Mandel
- `REML` - Restricted Maximum Likelihood

## Validation

All statistical methods are validated against the metafor R package.

```bash
# Run validation suite
node tests/validation/expanded_validation.cjs
node tests/validation/js_validation_v3.cjs
```

### Validation Results
- `expanded_validation.cjs`: 18/18 tests pass
- `js_validation_v3.cjs`: 22/22 tests pass
- `final_validation.cjs`: 16/16 tests pass

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

Requires Web Workers and IndexedDB support.

## License

MIT

## References

- Viechtbauer, W. (2010). metafor: Meta-Analysis Package for R.
- Higgins & Thompson (2002). Quantifying heterogeneity in a meta-analysis.
- Duval & Tweedie (2000). Trim and Fill.
- Hartung & Knapp (2001). HKSJ adjustment.
- VanderWeele & Ding (2017). E-values.
