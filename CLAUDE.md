# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**vetter** is a pre-install risk scanner CLI that analyzes npm packages before installation, evaluating security vulnerabilities, maintenance status, and dependency bloat. It provides an A-F grade to help developers make informed decisions about dependencies.

## Development Commands

```bash
# Build for production
npm run build

# Build and watch (development)
npm run dev

# Run tests (watch mode)
npm test

# Run tests once (CI mode)
npm test -- --run

# Run single test file
npm test __tests__/scoring.test.ts

# Lint code
npm run lint

# Format code
npm run format

# Test the CLI locally
node bin/vetter install <package> --no-install
node bin/vetter install <package> --json --no-install
```

## Architecture

### Data Flow Pipeline

1. **CLI Entry** ([src/cli.ts](src/cli.ts)) → Parses arguments with Commander
2. **Package Parsing** ([src/services/npm.ts](src/services/npm.ts)) → Handles `pkg`, `@scope/pkg`, `pkg@version` formats
3. **Parallel Analysis**:
   - **Metadata Fetch** ([src/services/npm.ts](src/services/npm.ts)) → Uses `pacote` to get registry data
   - **Security Audit** ([src/services/security.ts](src/services/security.ts)) → Creates temp workspace, runs `npm audit`
   - **Metrics Calculation** ([src/services/metrics.ts](src/services/metrics.ts)) → Counts dependencies via temp lockfile
4. **Scoring** ([src/scoring.ts](src/scoring.ts)) → Pure function: applies penalty rules to generate A-F grade
5. **Rendering** ([src/report.ts](src/report.ts)) → Outputs text or JSON based on `--json` flag

### Key Architectural Patterns

**Temporary Workspace Pattern**: Both security and metrics services create isolated temp directories to run `npm install --package-lock-only`. This avoids polluting the user's environment while getting accurate dependency data.

**Sentinel Values**:
- `totalDependencyCount: -1` indicates counting failed (distinct from 0 dependencies)
- Security status can be `'clean' | 'vulnerable' | 'unknown'`

**Commander Flag Handling**: The `--no-install` flag creates `options.install: false` (not `options.noInstall: true`). Always check `options.install !== false`.

**Spinner Suppression**: In JSON mode (`--json`), spinners must be `null` to avoid contaminating stdout. Warnings go to stderr only.

## Grading Algorithm ([src/scoring.ts](src/scoring.ts))

The scoring is penalty-based, starting at grade A (0 points):

| Risk Factor | Penalty |
|-------------|---------|
| Critical/High vulnerabilities | -2 grades each |
| Moderate vulnerabilities | -1 grade |
| Last publish >730 days | -2 grades |
| Last publish >365 days | -1 grade |
| ≤1 maintainer | -1 grade |
| ≥100 total dependencies | -2 grades |
| ≥50 total dependencies | -1 grade |
| ≥5 MB unpacked | -1 grade |
| Unknown dependency count | -1 grade |

Grades: `A (0-19) → B (20-39) → C (40-59) → D (60-79) → E (80-99) → F (100+)`

## Critical Implementation Details

### 1. JSON Output Purity
When `--json` is enabled:
- **NO** spinners to stdout (check `!options.json` before creating `ora()`)
- Warnings/errors go to **stderr only** (use `console.error()`)
- Stdout contains **only** the JSON blob

### 2. Dependency Count Failure Handling
If dependency counting fails:
- Return `-1` (not `0`)
- Apply penalty in scoring
- Display "Dependency count unavailable" in text reports
- Output `totalDependencyCount: null` and `totalDependencyCountStatus: "unknown"` in JSON
- Log warning to stderr in JSON mode

### 3. Security Audit Edge Cases
- `npm audit` returns non-zero exit code when vulnerabilities exist
- Must parse `error.stdout` to get vulnerability data
- Timeout is 30s for audit, 60s for install
- Fallback to `status: 'unknown'` on total failure

### 4. Package Identifier Parsing
Handle all formats correctly:
- Simple: `lodash`
- Versioned: `lodash@4.17.21`
- Scoped: `@types/node`
- Scoped + version: `@babel/core@7.23.0`
- Tags: `react@latest`

Regex for scoped: `/^(@[^/]+\/[^@]+)(?:@(.+))?$/`

## Testing Strategy

- **Unit tests** in `__tests__/` use mocks for deterministic, offline testing:
  - `scoring.test.ts`: Pure functions (scoring logic, parsing)
  - `npm.test.ts`: Mocks `npm-registry-fetch` to avoid network calls
- **Manual testing** with real packages via CLI:
  - Healthy: `tiny-invariant`, `countup.js`
  - Bloated: `express` (68 deps)
  - Vulnerable: `request` (deprecated, has CVEs)
- **Edge case**: Unknown dependency count (simulate by breaking temp workspace)

**Mocking approach**: Tests use `vi.mock('npm-registry-fetch')` with realistic packument structures. This ensures tests run instantly, work offline, and never flake due to registry issues.

When adding new scoring rules, always add corresponding test in `__tests__/scoring.test.ts`.

## Build System

- **tsup** compiles `src/cli.ts` to `dist/cli.js` (ESM)
- **bin/vetter** imports `dist/cli.js`
- Must run `npm run build` after code changes to test CLI
- TypeScript strict mode enabled

## Common Pitfalls

1. **Forgetting to build**: CLI runs from `dist/`, not `src/`
2. **Spinner contamination**: Always gate spinners on `!options.json`
3. **Wrong Commander property**: Use `options.install !== false`, not `options.noInstall`
4. **Blocking on audit**: Large packages (500+ deps) can take 60-90s to analyze
5. **Temp dir cleanup**: Always use try/finally to ensure cleanup, but ignore cleanup errors

## Performance Characteristics

Typical analysis times:
- Metadata fetch: ~500ms
- Security audit: 5-60s (depends on dependency tree size)
- Metrics calculation: 2-10s (depends on lockfile complexity)

Bottleneck: `npm audit` execution in temp workspace.

## Future Extension Points

The codebase is designed to support:
- Result caching (check version in `~/.cache/vetter/`)
- `--fail-on-grade` flag (exit non-zero if grade below threshold)
- GitHub API integration (maintainer activity, stars)
- License checking (add to metrics pipeline)
- Alternative registries (parameterize registry URL in pacote calls)
