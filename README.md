# vetter

> Pre-install risk scanner for npm packages

**vetter** analyzes npm packages before installation, evaluating security vulnerabilities, maintenance status, dependency bloat, and other risk factors. Get an **A–F grade** for any package and make informed decisions about what goes into your `node_modules`.

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
```

## Grading System

vetter starts at grade **A** and applies penalties based on risk factors:

### Security
- **Critical/High vulnerabilities**: -2 grades each
- **Moderate vulnerabilities**: -1 grade

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

- [ ] `--fail-on-grade` flag for CI pipelines
- [ ] Result caching in `~/.cache/vetter`
- [ ] GitHub maintainer activity analysis
- [ ] Suspicious package name detection
- [ ] License compatibility checks
- [ ] Alternative registries support

## License

ISC

## Contributing

Contributions welcome! Please open an issue or PR.
