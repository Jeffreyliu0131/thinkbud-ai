# Testing

Automated tests make rapid AI-assisted iteration reviewable, but a passing suite is not proof of complete coverage, user value, live-model quality, or production readiness. ThinkBud therefore keeps code tests, synthetic behavior evals, provenance checks, and human/live release evidence separate.

## Framework

- **Vitest** v4.x with jsdom environment
- **@testing-library/react** for component testing
- **@testing-library/jest-dom** for DOM matchers

## Running Tests

```bash
# Run all tests once
npm test

# Watch mode (re-run on file changes)
npm run test:watch
```

## Test Layers

### Unit Tests
- **Where:** `src/lib/__tests__/`, `functions/__tests__/`, `src/test/`, or co-located `.test.ts`
- **What:** Pure functions, audit and guard rules, input-safety boundaries, failure policy, prompt builders, rate limiting, auth logic, API endpoint handlers
- **When:** Every new utility or business logic function

### Component Tests
- **Where:** `src/components/__tests__/`
- **What:** React components with @testing-library/react
- **When:** UI components with conditional rendering or user interaction

### Integration Tests
- **Where:** `src/hooks/__tests__/`
- **What:** Hooks with mocked fetch/IndexedDB
- **When:** Complex hooks that combine multiple data sources

## Conventions

- Test files use `.test.ts` or `.test.tsx` extension
- Place tests in `__tests__/` subdirectory or co-located with source
- Use `describe` blocks grouped by function/component name
- Chinese comments for test descriptions (matches product language)
- Mock external APIs (fetch, IndexedDB) — never hit real endpoints in tests
- Setup file: `src/test/setup.ts` (imports jest-dom matchers)

## Full Verification

```bash
npm run verify
```

This runs lint, TypeScript checks, unit/integration/component tests, the deterministic synthetic eval, provenance generation, and the production build. The generated evidence records the exact test and eval state; do not treat an old count in prose as canonical.

## Evaluation Layers

- `evals/cases/synthetic-v1.json`: synthetic positive, negative, boundary, and adversarial cases.
- `evals/run.ts`: deterministic release gate; no provider credentials or child data.
- `docs/evals/HUMAN_RUBRIC.md`: independent human scoring contract.
- `evals/calibrate-grader.ts`: advisory grader calibration against human labels.
- `evals/generate-live-slice.ts`: guarded optional live slice; requires explicit credentials and budget approval.

```bash
npm run eval:gate
npm run eval:calibrate-grader
```

The full release gate intentionally fails until every item in `docs/RELEASE_CHECKLIST.md` is supported by real evidence.
