# Usage Examples

## Installation

```bash
# Install globally
npm install -g vetter

# Or use with npx (no installation required)
npx vetter install lodash
```

## Basic Commands

### Analyze and Install
```bash
# Analyze a package and prompt for installation
vetter install express

# Analyze with specific version
vetter install express@4.18.2

# Scoped packages
vetter install @types/node
vetter install @babel/core@7.23.0
```

### Analysis Only
```bash
# Skip installation prompt
vetter install lodash --no-install
```

### JSON Output
```bash
# Get structured JSON output for CI/CD
vetter install express --json --no-install

# Parse with jq
vetter install express --json --no-install | jq '.grade'
```

### Caching
```bash
# Normal usage: cache is used automatically (7-day TTL, 50MB limit)
vetter install lodash --no-install

# Force fresh analysis (skip cache)
vetter install lodash --no-install --no-cache

# Re-analyze and update cache
vetter install lodash --no-install --refresh
```

The cache speeds up repeat scans (from ~10s to <1s) and is automatically managed:
- **Location**: `~/.cache/vetter` (Linux/macOS) or `%LOCALAPPDATA%\vetter` (Windows)
- **TTL**: 7 days (auto-invalidates when package is republished)
- **Size limit**: 50MB (oldest entries auto-deleted)

## CI/CD Integration

### Using `--fail-on-grade` (Recommended)

The `--fail-on-grade` flag automatically exits with code 1 if a package scores at or below your threshold:

```bash
# Fail if package is C or worse (fails on C, D, E, F)
vetter install lodash --fail-on-grade C --no-install

# More lenient: only fail on D or worse
vetter install express --fail-on-grade D --no-install

# Strict: only accept grade A packages
vetter install react --fail-on-grade B --no-install
```

### GitHub Actions Example

```yaml
- name: Check dependency risk
  run: npx vetter install ${{ matrix.package }} --fail-on-grade C --no-install
```

### GitLab CI Example

```yaml
check_dependencies:
  script:
    - npx vetter install lodash --fail-on-grade C --no-install
  allow_failure: false
```

### Pre-install Hook

```bash
#!/bin/bash
# .git/hooks/pre-commit or package.json script

# Check all packages being added
for package in "$@"; do
  echo "Vetting $package..."
  vetter install "$package" --fail-on-grade D --no-install || exit 1
done
```

### Manual JSON Parsing (Alternative)

If you need custom logic beyond simple thresholds:

```bash
#!/bin/bash
PACKAGE=$1
RESULT=$(npx vetter install "$PACKAGE" --json --no-install)
GRADE=$(echo "$RESULT" | jq -r '.grade')
VULNS=$(echo "$RESULT" | jq -r '.security.vulnerabilities.total')

if [ "$VULNS" -gt 0 ]; then
  echo "✗ Package has $VULNS vulnerabilities (Grade: $GRADE)"
  exit 1
fi

echo "✓ Package $PACKAGE is safe (Grade: $GRADE)"
```

## Understanding Grades

| Grade | Risk Level | Description |
|-------|------------|-------------|
| **A** | Very Low   | Excellent package, no significant issues |
| **B** | Low        | Minor concerns, generally safe |
| **C** | Medium     | Some risk factors present |
| **D** | High       | Multiple concerns, review carefully |
| **E** | Very High  | Significant issues, use with caution |
| **F** | Critical   | Severe problems, avoid if possible |

## Risk Factors Explained

### Security
- **Critical/High vulnerabilities**: Immediate security risks
- **Moderate vulnerabilities**: Known issues with lower severity

### Maintenance
- **Staleness**: Packages not updated in 1-2+ years may have compatibility or security issues
- **Maintainer count**: Single-maintainer packages have higher bus factor risk

### Bloat
- **Dependency count**: More dependencies = larger attack surface and installation time
- **Package size**: Large packages increase deployment size and installation time

## Tips

1. **Use `--no-install`** when you just want to check a package
2. **Combine with `--json`** for programmatic access
3. **Check before major version upgrades** to catch new issues
4. **Run in CI/CD** to prevent risky packages from entering your project
5. **Cache is automatic**: Repeat scans are instant (use `--no-cache` to force fresh analysis)
6. **Use `--refresh`** to update outdated cache entries
7. **Consider context**: A grade C or D package might still be the right choice if it's well-established (like webpack)
