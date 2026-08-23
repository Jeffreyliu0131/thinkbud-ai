# Testing

100% test coverage is the key to great vibe coding. Tests let you move fast, trust your instincts, and ship with confidence — without them, vibe coding is just yolo coding. With tests, it's a superpower.

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

### Unit Tests (348 tests across 24 files)
- **Where:** `src/lib/__tests__/`, `functions/__tests__/`, `src/test/`, or co-located `.test.ts`
- **What:** Pure functions, audit rules, prompt builders, rate limiting, auth logic, API endpoint handlers (chat, rtc-start)
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
