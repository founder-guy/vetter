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

### Caching Layer ([src/cache.ts](src/cache.ts))

**Cache Key**: SHA-1 hash of normalized `package@version` (e.g., `lodash@4.17.21`)
**Storage**: JSON file per entry in `~/.cache/vetter/entries/` (or platform equivalent)
**TTL**: 7 days (hardcoded in v0.2)
**Size Limit**: 50MB (automatically prunes oldest entries when exceeded)

**Flow**:
1. Always fetch metadata first (cheap, needed for publish date validation)
2. Attempt cache load (unless `--no-cache`/`--refresh`)
3. Validate: cache version, publish date, TTL
4. On hit: render cached result, skip analysis
5. On miss: run full analysis, save to cache
6. After save: check cache size and prune if >50MB (deletes oldest entries first)

**Invalidation Rules** (checked in order):
1. Cache version mismatch → hard invalidate (schema changed)
2. Publish date differs → hard invalidate (package republished)
3. TTL exceeded (`now - cachedAt > 7 days`) → hard invalidate
4. `--no-cache` flag → bypass cache entirely
5. `--refresh` flag → skip load, force save

**Concurrency**: Atomic writes via temp file + rename; race-safe across parallel runs.

**Date Serialization**: JSON.stringify converts Date objects to ISO strings; loadCache reconstructs them via `new Date()`.

**Size Management**:
- 50MB hard limit enforced automatically after each save
- Pruning deletes oldest entries first (by mtime) until cache ≤ 50MB
- Pruning is silent unless entries are deleted (then logs to stderr)
- Sorting by mtime ensures recently-used packages are kept

**Pitfalls**:
- Cache directory creation can fail silently (logs to stderr, continues)
- Large entries (>1MB) log warning but still cache
- Always validate publish date to catch republished packages
- Cache hit/miss status logged to stderr (unless `--json`)
- Pruning can be expensive (stats all files) but only runs when saving, not loading

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
  - `cache.test.ts`: Cache module (load/save, TTL, invalidation, pruning) using real temp filesystem
  - `cache-integration.test.ts`: Cache behavior with mocked services (tests cache/refresh logic but not actual CLI flag handling)
- **Manual testing** with real packages via CLI:
  - Healthy: `tiny-invariant`, `countup.js`
  - Bloated: `express` (68 deps)
  - Vulnerable: `request` (deprecated, has CVEs)
- **Edge case**: Unknown dependency count (simulate by breaking temp workspace)

**Mocking approach**: Tests use `vi.mock('npm-registry-fetch')` with realistic packument structures. This ensures tests run instantly, work offline, and never flake due to registry issues.

**Cache tests**: Use real filesystem (`fs.mkdtemp`) instead of memfs to avoid mocking layer mismatches. Each test gets isolated temp directory.

**CLI flag testing**: `--no-cache` and `--refresh` flags are manually verified via CLI (`node bin/vetter install <pkg> --no-cache`). Automated CLI-level flag tests would require spawning the process or invoking the action handler, which adds complexity.

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
