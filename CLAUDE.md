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

# Test with custom registry
node bin/vetter install <package> --registry https://registry.npmjs.org --no-install
```

## Architecture

### Data Flow Pipeline

1. **CLI Entry** ([src/cli.ts](src/cli.ts)) → Parses arguments with Commander
2. **Package Parsing** ([src/services/npm.ts](src/services/npm.ts)) → Handles `pkg`, `@scope/pkg`, `pkg@version` formats
3. **Metadata Fetch** ([src/services/npm.ts](src/services/npm.ts)) → Uses `npm-registry-fetch` to get registry data
4. **Typosquatting Detection** ([src/services/typosquatting.ts](src/services/typosquatting.ts)) → Runs fresh on every invocation (NOT cached) using package name and metadata
5. **Cache Check** → Attempt to load cached analysis (unless `--no-cache`/`--refresh`)
6. **Workspace Preparation** (on cache miss) ([src/services/workspace.ts](src/services/workspace.ts)) → Creates shared temp directory, runs single `npm install --package-lock-only`, parses lockfile
7. **Analysis** (on cache miss, reuses shared workspace):
   - **Security Audit** ([src/services/security.ts](src/services/security.ts)) → Runs `npm audit` in shared workspace
   - **Metrics Calculation** ([src/services/metrics.ts](src/services/metrics.ts)) → Uses pre-parsed lockfile from workspace
   - **License Analysis** ([src/services/license.ts](src/services/license.ts)) → Categorizes license from metadata
   - **Dependency Breakdown** ([src/services/breakdown.ts](src/services/breakdown.ts)) → Analyzes sub-tree sizes (always computed for caching)
8. **Scoring** ([src/scoring.ts](src/scoring.ts)) → Pure function: applies penalty rules including fresh typosquatting analysis to generate A-F grade
9. **Rendering** ([src/report.ts](src/report.ts)) → Outputs text or JSON based on `--json` flag

### Key Architectural Patterns

**Shared Workspace Pattern** ([src/services/workspace.ts](src/services/workspace.ts)): On cache misses, the CLI creates a single temporary workspace via `prepareWorkspace()` that:
- Runs `npm install --package-lock-only` once (instead of twice)
- Parses `package-lock.json` into memory
- Provides both the directory and parsed lockfile to security and metrics services
- Ensures cleanup via `workspace.cleanup()` in a finally block
- **Performance**: Saves ~300ms (50% of install overhead) by eliminating duplicate npm install calls
- **Fallback**: Services can still create their own temp workspaces if the optional `workspace` parameter is not provided (backward compatible)

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
**Cache Version**: 3 (bumped for dependencyBreakdown field addition)

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
| Typosquatting: critical/high confidence | -5 grades (instant F) |
| Typosquatting: medium confidence | -2 grades |
| Typosquatting: low confidence | -1 grade |
| Critical/High vulnerabilities | -2 grades each |
| Moderate vulnerabilities | -1 grade |
| Last publish >730 days | -2 grades |
| Last publish >365 days | -1 grade |
| ≤1 maintainer | -1 grade |
| ≥100 total dependencies | -2 grades |
| ≥50 total dependencies | -1 grade |
| ≥5 MB unpacked | -1 grade |
| Unknown dependency count | -1 grade |
| Network/strong copyleft (AGPL/GPL) | -2 grades |
| Weak copyleft (LGPL/MPL/EPL) | -1 grade |
| Proprietary/UNLICENSED | -2 grades |
| Deprecated license (JSON, BSD-4-Clause, CC-BY-NC) | -2 grades |
| No license specified | -2 grades |
| Unknown license | -1 grade |

Grades: `A (0-19) → B (20-39) → C (40-59) → D (60-79) → E (80-99) → F (100+)`

**Note**: The -5 grade deduction for critical/high typosquatting confidence guarantees a score ≥100 (F grade) regardless of other factors.

### License Categorization ([src/services/license.ts](src/services/license.ts))

**Categories:**
- **Permissive**: MIT, Apache-2.0, BSD-2/3-Clause, ISC, Unlicense (no penalty)
- **Weak Copyleft**: LGPL, MPL, EPL, CDDL (requires reciprocal licensing on modifications)
- **Proprietary/Restricted**: UNLICENSED, SSPL, "SEE LICENSE IN ..." (no redistribution/hosting rights)
- **Strong Copyleft**: GPL-2.0, GPL-3.0 (requires full source disclosure)
- **Network Copyleft**: AGPL (copyleft triggered by network interaction)
- **Proprietary**: UNLICENSED, "SEE LICENSE IN ..." (legal red flag)
- **Deprecated**: JSON, BSD-4-Clause, Creative Commons NC/SA variants (policy violations)
- **Unlicensed**: Missing or empty license field
- **Unknown**: Unrecognized SPDX identifiers

**SPDX Expression Parsing:**
- `MIT OR Apache-2.0`: Categorized as permissive (best-case applies if any branch is safe)
- `GPL-3.0 AND LGPL-3.0`: Categorized as strong-copyleft (worst-case applies for AND)
- Simple string matching for OR/AND operators (no external SPDX parser needed)

**Legacy Format Normalization** ([src/services/npm.ts](src/services/npm.ts#L57)):
- Object format: `{ type: 'MIT', url: '...' }` → `'MIT'`
- Array format: `[{ type: 'MIT' }, { type: 'Apache-2.0' }]` → `'MIT OR Apache-2.0'`

### Typosquatting Detection ([src/services/typosquatting.ts](src/services/typosquatting.ts))

**Design**: Multi-signal confidence tiering using Levenshtein distance, package age, and maintainer count.

**Key Characteristics**:
- Runs **fresh on every invocation** (NOT cached) - ensures latest detection logic always applies
- Uses static bundled list of top 1000 npm packages ([src/data/popular-packages.ts](src/data/popular-packages.ts))
- Performance: ~10ms per analysis (Levenshtein with early termination when distance >2)

**Confidence Tiers**:
1. **Critical**: Edit distance ≤1 from top-100 package → Instant F grade
2. **High**: Edit distance ≤2 from top-500 AND (age <30 days OR ≤1 maintainer) → Instant F grade
3. **Medium**: Edit distance ≤2 from top-1000 package → -2 grades
4. **Low**: Contains top-100 name as substring AND (age <30 days OR ≤1 maintainer) → -1 grade
5. **Safe**: No match found

**Scope Spoofing Detection**:
- Scoped packages (@scope/name) are checked separately
- Scope is compared against hardcoded `OFFICIAL_SCOPES` set (e.g., @types, @babel, @aws-sdk)
- Distance 1 from official scope → critical, distance 2 → high
- Prevents attacks like `@typess/node` vs `@types/node`

**Algorithm Details**:
- Levenshtein distance with early termination (maxDistance=2)
  - Quick reject: skip if length difference alone exceeds maxDistance
  - Row-minimum early termination: stop if no cell in current row ≤ maxDistance
- Base name extraction: `@scope/package` → check scope separately, then check "package" against popular packages
- Substring matching: only triggers for top-100 packages with multi-signal gating (age/maintainer)

**Important Edge Cases**:
- Exact matches (distance=0) are NOT flagged - prevents false positives for scoped packages like `@types/chalk` (base name "chalk" exactly matches popular package)
- Legitimate packages like `react-native`, `lodash-es` avoid flagging due to age (>30 days) + maintainer count (>1)
- Package must be in TOP_1000_SET for early "safe" return (self-check)

**Cache Design Rationale**:
- TyposquattingAnalysis is NOT stored in cached AnalysisResult
- Detection runs fresh even on cache hits
- Score is recomputed with fresh typosquatting data before rendering
- Ensures users always get latest detection logic without waiting for cache invalidation

**Data Source**:
- [src/data/popular-packages.ts](src/data/popular-packages.ts) is auto-generated from npm download stats
- Updated manually with vetter releases (no runtime fetching)
- 48KB TypeScript file with pre-computed Sets for O(1) lookups

## Critical Implementation Details

### 1. JSON Output Purity
When `--json` is enabled:
- **NO** spinners to stdout (check `!options.json` before creating spinner)
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
  - `scoring.test.ts`: Pure functions (scoring logic, grade calculation)
  - `npm.test.ts`: Package parsing and metadata fetching (mocks `npm-registry-fetch`)
  - `license.test.ts`: License categorization and SPDX expression parsing
  - `breakdown.test.ts`: Dependency sub-tree analysis from lockfiles
  - `security.test.ts`: Security audit with custom registry support
  - `workspace.test.ts`: Workspace preparation and lockfile parsing
  - `cache.test.ts`: Cache module (load/save, TTL, invalidation, pruning) using real temp filesystem
  - `fail-on-grade.test.ts`: Grade threshold validation and comparison logic
- **Integration tests** verify component interactions:
  - `cache-integration.test.ts`: Cache behavior with mocked services (tests cache/refresh logic but not actual CLI flag handling)
  - `deps-integration.test.ts`: Dependency breakdown integration with workspace and metrics
  - `workspace-integration.test.ts`: End-to-end workspace preparation with npm install
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
6. **npm execution**: Never use `shell: true` with spawn (security risk); always add timeouts to prevent hangs; use SIGTERM → SIGKILL escalation for graceful shutdown
7. **Commander exit behavior**: Use `program.outputHelp()` instead of `program.help()` to avoid implicit `process.exit(0)`. Set `process.exitCode` in action handlers, exit once at the end

## CLI Architecture

**Pattern:** Single exit point with testable command modules

The CLI follows a command extraction pattern to maximize testability and maintainability:
- **cli.ts**: Argument parsing and routing (Commander.js setup)
- **commands/**: Command implementation modules (business logic, no process.exit)
- **services/**: Reusable analysis logic

**Structure:**
```typescript
// Command module (testable, returns exit codes)
export async function runCommand(args: string, options: Options): Promise<number> {
  try {
    // Business logic here
    return 0;  // Success
  } catch (error) {
    console.error(error);
    return 1;  // Failure
  }
}

// CLI router (sets exit code, single exit point)
program
  .command('cmd <args>')
  .action(async (args, opts) => {
    const exitCode = await runCommand(args, opts);
    process.exitCode = exitCode;
  });

await program.parseAsync(process.argv);

if (process.argv.length === 2) {
  program.outputHelp();  // NOT help() - that calls process.exit()
  process.exitCode = 0;
}

process.exit(process.exitCode ?? 0);  // Single exit point
```

**Benefits:**
- **Testable**: Commands are pure functions returning exit codes (no process.exit in logic)
- **Clean shutdown**: Single exit point prevents race conditions with async actions
- **Easy mocking**: Mock services in tests, verify exit codes directly

**Testing commands:**
```typescript
// __tests__/install-command.test.ts
it('should return exit code 1 when grade fails threshold', async () => {
  const exitCode = await runInstallCommand('pkg', { failOnGrade: 'C' });
  expect(exitCode).toBe(1);
});
```

**Top-level await:** Requires Node.js ≥14.8 and ES2022 target (already configured in tsconfig.json).

## Dependency Breakdown (--deps flag)

The `--deps` flag triggers display of the top 10 dependencies sorted by transitive sub-tree size. Implementation details:

- **Computation**: Always runs during fresh analysis (adds ~10ms), cached in `AnalysisResult.dependencyBreakdown`
- **Display**: Only shown when `--deps` flag is set (renderer checks `options.showDeps`)
- **Cache**: Breakdown stored with CACHE_VERSION = 3; old entries auto-invalidate
- **Fallback limitation**: If metrics service creates its own temp workspace (shared workspace failed), breakdown will be unavailable even if count succeeds
- **Lockfile formats**: Supports both v2/v3 (packages map) and v1 (dependencies tree)
- **Performance**: O(n) where n = package count; typical 100-dep package takes ~10ms

When breakdown is unavailable:
- Text mode: Shows "Dependency breakdown unavailable (lockfile parsing failed)" message
- JSON mode: Omits `dependencyBreakdown` field entirely

## Performance Characteristics

Typical analysis times:
- Metadata fetch: ~500ms
- Security audit: 5-60s (depends on dependency tree size)
- Metrics calculation: 2-10s (depends on lockfile complexity)
- Dependency breakdown: ~10ms (only on cache miss)

Bottleneck: `npm audit` execution in temp workspace.

**Timeouts:**
- Analysis operations: 30-60s (prevents hangs during analysis)
- User install: 5 minutes (allows time for large packages)

## Custom Registry Support

The `--registry` flag allows analysis of packages from custom/private npm registries:

```bash
vetter install @myorg/pkg --registry https://npm.pkg.github.com --no-install
```

**Implementation details:**
- Flag is passed to all npm operations: metadata fetch (`npm-registry-fetch`), workspace preparation, security audit, and user installation
- See [src/cli.ts:44](src/cli.ts#L44) for CLI flag definition
- Registry option flows through all operations: metadata fetch, workspace preparation, security audit, and user installation
- Authentication via existing `~/.npmrc` credentials (npm handles this transparently)

**Testing:**
- Unit tests in [__tests__/security.test.ts](__tests__/security.test.ts) verify registry flag is passed to `npm audit`
- Manual testing: `node bin/vetter install lodash --registry https://registry.npmjs.org --no-install`

## Future Extension Points

The codebase is designed to support:
- GitHub API integration (maintainer activity, stars)
- Custom license policy flags (`--allow-license`, `--deny-license`)
