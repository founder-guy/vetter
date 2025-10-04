# Vetter

[![npm](https://img.shields.io/npm/v/vetter)](https://www.npmjs.com/package/vetter)

> Pre-install risk scanner for npm packages

**Vetter** analyzes npm packages before installation, evaluating security vulnerabilities, maintenance status, dependency bloat, and other risk factors. Get an **A–F grade** for any package and make informed decisions about what goes into your `node_modules`.

## Features

- 🔍 **Security Analysis** - Runs `npm audit` to detect known vulnerabilities
- 📊 **Risk Scoring** - Evaluates packages across multiple dimensions
- 📦 **Dependency Analysis** - Counts transitive dependencies and package size
- 👥 **Maintenance Indicators** - Checks maintainer count and staleness
- 🎨 **Colorized CLI Output** - Human-friendly reports with grade badges
- 🤖 **JSON Mode** - Structured output for CI/CD pipelines
- ⚡ **Fast** - Analyzes packages without full installation

## Installation

```bash
npm install -g vetter
```

Or use directly with `npx`:

```bash
npx vetter install <package>
```

## Usage

### Basic Usage

```bash
vetter install lodash
```

This will:
1. Fetch package metadata from npm registry
2. Run security audit in a temporary workspace
3. Analyze dependencies, size, and maintenance metrics
4. Calculate risk grade (A–F)
5. Display a colorized report
6. Prompt you to proceed with installation

### Options

```bash
# Skip installation prompt (analysis only)
vetter install lodash --no-install

# Output JSON for parsing/CI integration
vetter install lodash --json

# Specify version
vetter install lodash@4.17.21

# Scoped packages
vetter install @types/node

# Skip cache (force fresh analysis)
vetter install lodash --no-cache

# Force re-analysis and update cache
vetter install lodash --refresh
```

## Caching

Vetter caches analysis results for **7 days** to speed up repeat scans of the same `package@version`.

### Cache Location

The cache is stored in a platform-specific directory:
- **Linux/macOS**: `$XDG_CACHE_HOME/vetter/entries` or `~/.cache/vetter/entries`
- **Windows**: `%LOCALAPPDATA%\vetter\entries`
- **Custom**: Set `VETTER_CACHE_DIR`, which will contain an `entries/` subdirectory

### Cache Size Management

The cache has a **50MB size limit**. When this limit is exceeded, the oldest cache entries are automatically deleted to stay within the limit.

### Cache Invalidation

The cache is automatically invalidated when:
- The package is republished (publish date changes)
- 7 days have elapsed since the analysis
- The cache schema version changes

### Cache Flags

- `--no-cache`: Skip cache entirely (always run fresh analysis)
- `--refresh`: Force re-analysis and update the cache

### Manual Cache Management

To clear the cache manually:

```bash
# Linux/macOS
rm -rf ~/.cache/vetter

# Windows
rmdir /s %LOCALAPPDATA%\vetter
```

## Grading System

Vetter starts at grade **A** and applies penalties based on risk factors:

### Security
- **Has critical vulnerabilities**: -2 grades
- **Has high vulnerabilities**: -2 grades
- **Has moderate vulnerabilities**: -1 grade

### Maintenance
- **Last published >2 years ago**: -2 grades
- **Last published >1 year ago**: -1 grade
- **≤1 maintainer**: -1 grade

### Bloat
- **≥100 total dependencies**: -2 grades
- **≥50 total dependencies**: -1 grade
- **≥5 MB unpacked size**: -1 grade

Grades range from **A** (low risk) to **F** (high risk).

## Example Output

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  express@4.18.2
  Fast, unopinionated, minimalist web framework
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Risk Grade: B

  ✓ No known vulnerabilities

  Package Metrics:
    📦 57 total dependencies (30 direct)
    👥 3 maintainers
    📅 Published 120 days ago
    💾 ~0.2 MB unpacked

  Risk Factors:
    ⚠ 57 total dependencies (≥50)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Proceed with install? [y/N]
```

## JSON Output

Use `--json` for machine-readable output:

```json
{
  "package": {
    "name": "express",
    "version": "4.18.2",
    "description": "Fast, unopinionated, minimalist web framework"
  },
  "grade": "B",
  "score": 20,
  "security": {
    "status": "clean",
    "vulnerabilities": {
      "critical": 0,
      "high": 0,
      "moderate": 0,
      "low": 0,
      "info": 0,
      "total": 0
    }
  },
  "metrics": {
    "daysSincePublish": 120,
    "maintainerCount": 3,
    "directDependencyCount": 30,
    "totalDependencyCount": 57,
    "approximateSizeMB": 0.2
  },
  "penalties": [
    {
      "reason": "57 total dependencies (≥50)",
      "severity": "medium",
      "gradeDeduction": 1
    }
  ]
}
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Lint
npm run lint

# Format
npm run format

# Dev mode (watch)
npm run dev
```

## Requirements

- Node.js ≥18
- npm (for audit functionality)

## Architecture

```
src/
├── cli.ts              # Commander CLI entry point
├── types.ts            # TypeScript interfaces and Zod schemas
├── scoring.ts          # Grade calculation algorithm
├── report.ts           # Text and JSON report rendering
├── install.ts          # npm install proxy
└── services/
    ├── npm.ts          # Package metadata fetching
    ├── security.ts     # npm audit runner
    └── metrics.ts      # Dependency and staleness metrics
```

## Roadmap

- [ ] GitHub maintainer activity analysis
- [ ] Suspicious package name detection
- [ ] License compatibility checks
- [ ] Alternative registries support

## FAQ

### Can I use Vetter in CI/CD pipelines?

**Yes.** Use the `--fail-on-grade` flag to enforce risk thresholds:

```bash
# Fail CI if package grade is C or worse
vetter install lodash --fail-on-grade C --no-install

# More lenient: only fail on D or worse
vetter install express --fail-on-grade D --no-install

# Combine with --json for structured output (exit code still reflects threshold)
vetter install react --fail-on-grade C --json --no-install
```

The `--fail-on-grade` flag exits with code 1 if the package grade is **at or below** the threshold (e.g., `--fail-on-grade C` fails on C, D, E, or F). This eliminates the need for shell scripting to parse grades manually.

**Manual parsing:** You can also use `--json --no-install` for custom logic:

```bash
vetter install lodash --json --no-install | jq '.grade'
```

### Does Vetter install packages automatically?

**No, not without your confirmation.** After displaying the risk report, Vetter prompts:

```
Proceed with install? [y/N]
```

If you press `y`, Vetter proxies to `npm install <package>` in your current directory. If you press `n` (or anything else), it exits without installing.

Use `--no-install` to skip this prompt entirely and only perform the analysis.

### Does Vetter count devDependencies when scanning packages?

**No, not by default.** When you run `vetter install <package>`, it creates a temporary workspace and runs `npm install --package-lock-only <package>`, which only installs runtime dependencies. The dependency count reflects what will actually end up in your `node_modules` when you install the package.

**Exception:** If you run Vetter on a local directory with a `package.json`, it will analyze whatever dependencies are present in that environment, including devDependencies if they've been installed.

### Why does the security scan take so long for some packages?

Vetter runs `npm audit` in an isolated temporary workspace to get accurate vulnerability data. For packages with large dependency trees (50+ transitive dependencies), this can take 30-60 seconds because:

1. npm must resolve the entire dependency tree
2. npm queries the registry's security database for every package
3. The audit runs in a fresh environment without cached data

This is a fundamental limitation of npm's audit mechanism. Vetter shows a spinner during this process so you know it's working.

### Why does Vetter give itself different grades depending on where I run it?

When you run `npx vetter install vetter`, you're scanning the **published npm package**, which only includes runtime dependencies (commander, ora, chalk, npm-registry-fetch, npm-pick-manifest, zod). This typically results in a **B or C grade** with ~15-20 total dependencies.

When you run Vetter **inside the cloned repository** (e.g., `node bin/vetter install vetter`), it scans the local development environment, which includes **devDependencies** like TypeScript, Vitest, ESLint, tsup, and their transitive dependencies. This results in a **D grade** with 100+ total dependencies.

**This is intentional and correct.** Vetter shows you what you'll *actually install* in your project. The published package is lean; the development environment is heavier. This distinction applies to any package with a significant devDependency footprint.

### Why does Vetter penalize packages with ≤1 maintainer?

Single-maintainer packages are at higher risk of:
- **Abandonment** - If the maintainer loses interest or capacity, the package becomes unmaintained
- **Bus factor** - No redundancy if the maintainer is unavailable
- **Security response** - Slower patching if only one person can publish updates

This doesn't mean single-maintainer packages are bad—many excellent libraries are maintained by one person. It's simply a risk factor to be aware of when choosing dependencies. The penalty is only -1 grade, and you can still install packages with this warning.

### Can Vetter scan private/scoped packages from custom registries?

Currently, Vetter uses npm's default registry (`https://registry.npmjs.org`). It **can** scan scoped packages like `@babel/core` or `@types/node` as long as they're public.

**Planned feature:** Support for alternative registries (e.g., GitHub Package Registry, private npm registries) by respecting `.npmrc` configuration. Track progress in the [roadmap](#roadmap).

### What happens if dependency counting fails?

If Vetter can't determine the dependency count (e.g., network failure, registry timeout, or malformed package), it:

1. Sets `totalDependencyCount: -1` internally (distinct from 0 dependencies)
2. Applies a **-1 grade penalty** for unknown risk
3. Displays "Dependency count unavailable" in text reports
4. Outputs `totalDependencyCount: null` and `totalDependencyCountStatus: "unknown"` in JSON mode
5. Logs a warning to stderr in JSON mode (so stdout remains valid JSON)

The penalty is conservative—we assume unknown dependencies *could* be a risk, so the grade reflects that uncertainty.

### Why doesn't Vetter show license information?

License compatibility checking is not yet implemented but is on the [roadmap](#roadmap). The metadata is available from the npm registry, and we plan to add warnings for:

- Non-OSI approved licenses
- GPL/copyleft licenses in commercial projects
- Missing license fields

This requires careful implementation to avoid false positives, so it's planned for a future release.

## License

ISC

## Contributing

Contributions welcome! Please open an issue or PR.
