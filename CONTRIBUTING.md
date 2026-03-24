# Contributing to Living Meta-Analysis

Thank you for your interest in contributing to Living Meta-Analysis! This document provides guidelines and instructions for contributing to the project.

---

## Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [Getting Started](#getting-started)
3. [Development Workflow](#development-workflow)
4. [Coding Standards](#coding-standards)
5. [Testing Guidelines](#testing-guidelines)
6. [Commit Conventions](#commit-conventions)
7. [Pull Request Process](#pull-request-process)
8. [Review Process](#review-process)

---

## Code of Conduct

### Our Pledge

We are committed to making participation in this project a harassment-free experience for everyone.

### Our Standards

**Positive behavior includes:**
- Being respectful and inclusive
- Gracefully accepting constructive criticism
- Focusing on what is best for the community
- Showing empathy towards other community members

**Unacceptable behavior includes:**
- Harassment, trolling, or discriminatory language
- Personal attacks or insulting comments
- Public or private harassment
- Publishing others' private information

### Reporting Issues

Report conduct issues to: [maintainer@example.com](mailto:maintainer@example.com)

---

## Getting Started

### Prerequisites

- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher
- **Git**: v2.30.0 or higher
- **Editor**: VS Code (recommended) with extensions:
  - ESLint
  - Prettier
  - Vitest

### Fork and Clone

1. Fork the repository on GitHub
2. Clone your fork:

```bash
git clone https://github.com/your-username/living-meta.git
cd living-meta
```

3. Add upstream remote:

```bash
git remote add upstream https://github.com/original-org/living-meta.git
```

### Install Dependencies

```bash
npm install
```

### Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:5173`

---

## Development Workflow

### 1. Create a Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

**Branch Naming Conventions:**
- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation changes
- `refactor/` - Code refactoring
- `test/` - Test additions or changes
- `perf/` - Performance improvements

### 2. Make Changes

Edit files following the [Coding Standards](#coding-standards).

### 3. Test Your Changes

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm test -- --coverage

# Run specific test file
npm test -- path/to/test.test.js
```

### 4. Lint and Format

```bash
# Lint code
npm run lint

# Fix linting issues
npm run lint -- --fix

# Format code
npm run format
```

### 5. Commit Changes

Follow [Commit Conventions](#commit-conventions).

### 6. Push and Create PR

```bash
git push origin feature/your-feature-name
```

Then create a Pull Request on GitHub.

---

## Coding Standards

### JavaScript Style Guide

We follow standard JavaScript conventions with these specifics:

#### 1. File Structure

```javascript
/**
 * File description
 *
 * @module module-name
 * @version 1.0.0
 */

// Imports
import { foo } from './foo.js';

// Constants
const CONSTANT_VALUE = 'value';

// Functions
export function myFunction(param) {
  // Implementation
}

// Classes (if needed)
export class MyClass {
  constructor() {
    // Constructor
  }
}
```

#### 2. Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Variables | camelCase | `studyCount` |
| Constants | UPPER_SNAKE_CASE | `MAX_STUDIES` |
| Functions | camelCase | `calculateEffectSize` |
| Classes | PascalCase | `MetaAnalysis` |
| Files | kebab-case | `effect-size.js` |

#### 3. Code Organization

**Preferred:**
```javascript
// Bad
const x = [];
for (const s of studies) { x.push(s.yi); }
const mean = x.reduce((a, b) => a + b) / x.length;

// Good
const effectSizes = studies.map(s => s.yi);
const meanEffect = effectSizes.reduce((sum, val) => sum + val, 0) / effectSizes.length;
```

#### 4. Comments

**JSDoc for functions:**
```javascript
/**
 * Calculate pooled effect size using fixed-effect model
 *
 * @param {Array<Object>} studies - Array of study objects with yi and vi
 * @param {Object} options - Analysis options
 * @param {string} [options.effectType='OR'] - Effect measure type
 * @param {number} [options.alpha=0.05] - Significance level
 * @returns {Object} Pooled estimate with CI and test statistics
 * @throws {Error} If studies array is empty or invalid
 */
export function fixedEffects(studies, options = {}) {
  // Implementation
}
```

**Inline comments for complex logic:**
```javascript
// Calculate variance using Delta method
// Reference: Hedges & Fleiss (1993), Eq. 4
const variance = (a * d) / (b * c);
```

### Statistical Methods Guidelines

#### 1. Validation

Always validate input:

```javascript
if (!studies || studies.length === 0) {
  return createError('INSUFFICIENT_STUDIES_META_ANALYSIS', 0);
}

for (const study of studies) {
  if (study.vi <= 0) {
    return createError('NEGATIVE_VARIANCE', study.id, study.vi);
  }
}
```

#### 2. Numerical Stability

Handle edge cases:

```javascript
// Avoid division by zero
const weight = vi > 0 ? 1 / vi : 0;

// Handle extreme values
const logRatio = Math.max(Math.min(ratio, 100), -100);

// Use logarithms for large products
const product = Math.exp(sum(logValues));
```

#### 3. Return Consistent Structure

```javascript
// Success case
return {
  estimate: value,
  se: standardError,
  ci_lower: lowerBound,
  ci_upper: upperBound,
  p_value: pValue
};

// Error case
return createError('ERROR_CODE', ...context);
```

---

## Testing Guidelines

### Test Structure

```javascript
import { describe, it, expect } from 'vitest';
import { myFunction } from './my-module.js';

describe('MyModule', () => {
  describe('myFunction', () => {
    it('should return correct result for valid input', () => {
      const input = { /* test data */ };
      const result = myFunction(input);

      expect(result).toBeDefined();
      expect(result.estimate).toBeCloseTo(expected, 2);
    });

    it('should handle edge case', () => {
      const result = myFunction(edgeCase);
      expect(result.error).toBeDefined();
    });
  });
});
```

### Test Categories

#### 1. Unit Tests
- Test individual functions in isolation
- Use mock data
- Fast execution

#### 2. Integration Tests
- Test module interactions
- Use realistic data
- Located in `tests/integration/`

#### 3. Validation Tests
- Compare against R package outputs
- Use gold-standard datasets
- Located in `tests/validation/`

### Coverage Requirements

| Type | Minimum Coverage |
|------|------------------|
| Core statistics | 90% |
| UI components | 80% |
| Utilities | 85% |
| Overall | 85% |

---

## Commit Conventions

### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Code style changes (formatting) |
| `refactor` | Code refactoring |
| `perf` | Performance improvement |
| `test` | Adding or updating tests |
| `chore` | Build process or auxiliary tool changes |
| `revert` | Revert a previous commit |

### Examples

**Feature:**
```
feat(nma): add SUCRA ranking calculation

Implement Surface Under Cumulative Ranking Curve
for treatment rankings in network meta-analysis.

Closes #123
```

**Bug fix:**
```
fix(meta-regression): handle VIF calculation for singular matrix

Previous implementation returned VIF=1 for singular matrices,
now returns VIF=Infinity to indicate perfect multicollinearity.

Fixes #456
```

**Documentation:**
```
docs(api): add meta-regression function documentation

Add JSDoc comments and usage examples for all
meta-regression functions.
```

---

## Pull Request Process

### PR Title Format

Use the same format as commit messages:

```
feat(nma): add inconsistency testing
```

### PR Description Template

```markdown
## Summary
<!-- Brief description of changes -->

## Changes
<!-- List of specific changes -->

## Testing
<!-- How you tested your changes -->

- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing completed

## Related Issues
<!-- Issue numbers this PR addresses -->

Closes #123
```

### Checklist

Before submitting a PR, ensure:

- [ ] Code follows style guidelines
- [ ] Tests pass locally
- [ ] New tests added for new features
- [ ] Documentation updated
- [ ] Commit messages follow conventions
- [ ] PR description is complete
- [ ] No merge conflicts with upstream

---

## Review Process

### Review Criteria

1. **Code Quality**: Clean, readable, maintainable
2. **Tests**: Adequate coverage, all passing
3. **Documentation**: JSDoc, comments updated
4. **Functionality**: Works as intended
5. **Performance**: No significant regressions

### Review Timeline

| Review Stage | Expected Timeline |
|--------------|-------------------|
| Initial review | 1-3 days |
| Follow-up review | 1-2 days after updates |
| Final approval | Within 1 week of submission |

### Addressing Feedback

1. Make requested changes
2. Request re-review when ready
3. Respond to each comment individually

---

## Release Process

### Version Numbering

We follow Semantic Versioning: `MAJOR.MINOR.PATCH`

- **MAJOR**: Breaking changes
- **MINOR**: New features, backward compatible
- **PATCH**: Bug fixes, backward compatible

### Release Steps

1. Update version in `package.json`
2. Update CHANGELOG.md
3. Create release tag
4. Publish to npm (if applicable)
5. Create GitHub release

---

## Getting Help

### Resources

- **Documentation**: `/docs`
- **Issues**: [GitHub Issues](https://github.com/your-org/living-meta/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-org/living-meta/discussions)

### Contact

- **Maintainer**: [maintainer@example.com](mailto:maintainer@example.com)
- **Discord**: [Server Link](https://discord.gg/...)

---

## Recognition

Contributors are recognized in:
- `CONTRIBUTORS.md`
- Release notes
- Project website

Thank you for contributing to Living Meta-Analysis!

---

*Last updated: 2026-01-14*
