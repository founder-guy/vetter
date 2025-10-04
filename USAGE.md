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

## CI/CD Integration

### GitHub Actions Example
```yaml
- name: Analyze package risk
  run: |
    GRADE=$(npx vetter install ${{ matrix.package }} --json --no-install | jq -r '.grade')
    echo "Package grade: $GRADE"
    if [ "$GRADE" = "F" ] || [ "$GRADE" = "E" ]; then
      echo "Package has high risk!"
      exit 1
    fi
```

### Script Usage
```bash
#!/bin/bash
# Check if package grade is acceptable

PACKAGE=$1
RESULT=$(npx vetter install "$PACKAGE" --json --no-install)
GRADE=$(echo "$RESULT" | jq -r '.grade')

case "$GRADE" in
  A|B|C)
    echo "✓ Package $PACKAGE has acceptable risk (Grade: $GRADE)"
    npm install "$PACKAGE"
    ;;
  D|E|F)
    echo "✗ Package $PACKAGE has high risk (Grade: $GRADE)"
    exit 1
    ;;
esac
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
5. **Consider context**: A grade C or D package might still be the right choice if it's well-established (like webpack)
