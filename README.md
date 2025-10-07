# Vetter

[![npm](https://img.shields.io/npm/v/vetter)](https://www.npmjs.com/package/vetter)
[![npm downloads](https://img.shields.io/npm/dw/vetter)](https://www.npmjs.com/package/vetter)
[![license](https://img.shields.io/npm/l/vetter)](https://www.npmjs.com/package/vetter)

> Pre-install risk scanner for npm packages

**Vetter** analyzes npm packages before installation, evaluating security vulnerabilities, maintenance status, license risks, dependency bloat, and other risk factors. Get an **A–F grade** for any package and make informed decisions about what goes into your `node_modules`.

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

# Show dependency breakdown (top 10 by sub-tree size)
vetter install express --deps --no-install

# Use custom/private npm registry
vetter install lodash --registry https://registry.example.com
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

Use the `vetter cache` command to manage the cache:

```bash
# View cache information (location, size, entry count)
vetter cache info

# Clear all cached entries
vetter cache clear
```

Or manually delete the cache directory:

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

### License Risk
- **Network copyleft (AGPL)**: -2 grades
- **Strong copyleft (GPL)**: -2 grades
- **Weak copyleft (LGPL/MPL/EPL)**: -1 grade
- **Proprietary/UNLICENSED/SSPL**: -2 grades
- **Deprecated (JSON, BSD-4-Clause, CC-BY-NC)**: -2 grades
- **No license specified**: -2 grades
- **Unknown/unrecognized license**: -1 grade
- **Permissive (MIT, Apache, BSD-2/3, ISC)**: no penalty

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
    📄 License: MIT

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
  "license": {
    "raw": "MIT",
    "category": "permissive",
    "normalizedSpdx": "MIT"
  },
  "metrics": {
    "daysSincePublish": 120,
    "maintainerCount": 3,
    "directDependencyCount": 30,
    "totalDependencyCount": 57,
    "totalDependencyCountStatus": "known",
    "approximateSizeMB": 0.2
  },
  "penalties": [
    {
      "reason": "57 total dependencies (≥50)",
      "severity": "medium",
      "gradeDeduction": 1
    }
  ],
  "dependencyBreakdown": [
    { "name": "body-parser", "version": "1.20.1", "transitiveCount": 12 },
    { "name": "accepts", "version": "1.3.8", "transitiveCount": 8 },
    { "name": "type-is", "version": "1.6.18", "transitiveCount": 6 }
  ]
}
```

**Note**: The `dependencyBreakdown` field is only included when the `--deps` flag is used.

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
    ├── workspace.ts    # Shared temporary workspace management
    ├── security.ts     # npm audit runner
    ├── metrics.ts      # Dependency and staleness metrics
    ├── license.ts      # License categorization and SPDX parsing
    └── breakdown.ts    # Dependency sub-tree analysis (for --deps flag)
```

## Roadmap

- [ ] GitHub maintainer activity analysis
- [ ] Suspicious package name detection
- [ ] Custom license policy flags (`--allow-license`, `--deny-license`)

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

Vetter runs `npm audit` in an isolated temporary workspace to get accurate vulnerability data. For packages with large dependency trees (50+ transitive dependencies), the audit can take 30-60 seconds because:

1. npm must query the registry's security database for every package in the tree
2. The audit analyzes all transitive dependencies (not just direct ones)
3. The process runs in a fresh environment without cached audit data

This is a fundamental limitation of npm's audit mechanism. Vetter shows a spinner during this process so you know it's working. The dependency resolution itself is fast (shared workspace setup completes in <1 second), but the security database queries take time.

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

**Yes.** Vetter supports custom registries via the `--registry` flag:

```bash
# Use a custom or private npm registry
vetter install my-package --registry https://npm.pkg.github.com

# Works with scoped packages
vetter install @myorg/private-pkg --registry https://registry.example.com
```

By default, Vetter uses npm's default registry (`https://registry.npmjs.org`). The `--registry` flag overrides this for analysis operations (metadata fetching, lockfile generation, and security audits).

**Note:** The `--registry` flag only affects analysis. If you proceed with installation, it will use your npm configuration (`.npmrc`) to determine the registry. To install from a custom registry, ensure your `.npmrc` is properly configured.

**Authentication:** Vetter respects your existing npm authentication. If you've configured credentials for a private registry in `~/.npmrc`, Vetter will use them automatically during analysis.

### What happens if dependency counting fails?

If Vetter can't determine the dependency count (e.g., network failure, registry timeout, or malformed package), it:

1. Sets `totalDependencyCount: -1` internally (distinct from 0 dependencies)
2. Applies a **-1 grade penalty** for unknown risk
3. Displays "Dependency count unavailable" in text reports
4. Outputs `totalDependencyCount: null` and `totalDependencyCountStatus: "unknown"` in JSON mode
5. Logs a warning to stderr in JSON mode (so stdout remains valid JSON)

The penalty is conservative—we assume unknown dependencies *could* be a risk, so the grade reflects that uncertainty.

### How does Vetter handle license checking?

Vetter automatically detects and categorizes package licenses, applying penalties based on legal/compliance risk:

**License Categories:**
- **Permissive** (MIT, Apache-2.0, BSD, ISC): No penalty—safe for most use cases
- **Weak Copyleft** (LGPL, MPL, EPL): -1 grade—requires reciprocal licensing on modifications
- **Strong Copyleft** (GPL): -2 grades—requires full source disclosure when distributed
- **Network Copyleft** (AGPL): -2 grades—copyleft triggered by network interaction
- **Proprietary/UNLICENSED**: -2 grades—legal red flag, no usage rights granted
- **Deprecated** (JSON, BSD-4-Clause, CC-BY-NC): -2 grades—problematic or policy-violating
- **No License**: -2 grades—missing license field, unclear usage rights
- **Unknown**: -1 grade—unrecognized SPDX identifier

**SPDX Expression Support:**
Vetter parses SPDX expressions like `MIT OR Apache-2.0`. If any option is permissive, the package is categorized as safe. For `AND` expressions, the worst-case license applies.

**Legacy Format Handling:**
Vetter normalizes legacy npm license formats (object `{ type: 'MIT' }` or array `[{ type: 'MIT' }]`) into standard SPDX strings.

**Future Plans:**
Custom license policies (`--allow-license GPL-3.0`, `--deny-license AGPL-3.0`) are planned for a future release.

### How can I see which dependencies cause bloat?

Use the `--deps` flag to see a breakdown of the top 10 dependencies by sub-tree size:

```bash
vetter install express --deps --no-install
```

This shows which specific packages pull in the most transitive dependencies, helping you identify the biggest contributors to bloat. The breakdown is computed during analysis and cached, so repeat runs with `--deps` are instant.

**Note**: The breakdown requires successful lockfile parsing. If dependency resolution fails but the count succeeds (rare fallback case), you'll see "Dependency breakdown unavailable (lockfile parsing failed)."

## License

ISC

## Contributing

Contributions welcome! Please open an issue or PR.