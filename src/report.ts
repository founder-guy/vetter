import chalk from 'chalk';
import type { AnalysisResult } from './types.js';
import * as readline from 'node:readline/promises';
import { formatAge } from './cache.js';

/**
 * Get color for grade
 */
function getGradeColor(grade: string): (text: string) => string {
  switch (grade) {
    case 'A':
      return chalk.green.bold;
    case 'B':
      return chalk.greenBright.bold;
    case 'C':
      return chalk.yellow.bold;
    case 'D':
      return chalk.hex('#FFA500').bold; // Orange
    case 'E':
      return chalk.red.bold;
    case 'F':
      return chalk.red.bold.underline;
    default:
      return chalk.white.bold;
  }
}

/**
 * Get color for license category
 */
function getLicenseColor(category: string): (text: string) => string {
  switch (category) {
    case 'permissive':
      return chalk.green;
    case 'weak-copyleft':
      return chalk.yellow;
    case 'strong-copyleft':
    case 'network-copyleft':
    case 'proprietary':
    case 'deprecated':
    case 'unlicensed':
      return chalk.red;
    case 'unknown':
      return chalk.gray;
    default:
      return chalk.white;
  }
}

/**
 * Get icon for severity
 */
function getSeverityIcon(severity: 'high' | 'medium' | 'low'): string {
  switch (severity) {
    case 'high':
      return chalk.red('✖');
    case 'medium':
      return chalk.yellow('⚠');
    case 'low':
      return chalk.blue('ℹ');
  }
}

/**
 * Render JSON report
 */
export function renderJsonReport(
  result: AnalysisResult,
  fromCache = false,
  cacheAgeSeconds = 0
): string {
  return JSON.stringify(
    {
      package: {
        name: result.package.name,
        version: result.package.version,
        description: result.package.description,
      },
      grade: result.score.grade,
      score: result.score.score,
      security: {
        status: result.security.status,
        vulnerabilities: result.security.vulnerabilities,
      },
      license: {
        raw: result.license.raw,
        category: result.license.category,
        normalizedSpdx: result.license.normalizedSpdx,
      },
      metrics: {
        daysSincePublish: result.metrics.daysSincePublish,
        maintainerCount: result.metrics.maintainerCount,
        directDependencyCount: result.metrics.directDependencyCount,
        totalDependencyCount:
          result.metrics.totalDependencyCount === -1
            ? null
            : result.metrics.totalDependencyCount,
        totalDependencyCountStatus:
          result.metrics.totalDependencyCount === -1 ? 'unknown' : 'known',
        approximateSizeMB: result.metrics.approximateSizeMB,
      },
      penalties: result.score.penalties,
      fromCache,
      cacheAgeSeconds,
    },
    null,
    2
  );
}

/**
 * Render human-friendly text report
 */
export function renderTextReport(
  result: AnalysisResult,
  fromCache = false,
  cacheAgeSeconds = 0
): string {
  const lines: string[] = [];
  const { package: pkg, score, security, metrics } = result;

  // Header
  lines.push('');
  lines.push(chalk.bold('━'.repeat(60)));
  lines.push(
    chalk.bold(`  ${pkg.name}`) + chalk.gray(`@${pkg.version}`)
  );
  if (fromCache) {
    lines.push(chalk.dim(`  (cached ${formatAge(cacheAgeSeconds)} ago)`));
  }
  if (pkg.description) {
    lines.push(chalk.gray(`  ${pkg.description}`));
  }
  lines.push(chalk.bold('━'.repeat(60)));
  lines.push('');

  // Grade badge
  const gradeColor = getGradeColor(score.grade);
  lines.push(`  ${chalk.bold('Risk Grade:')} ${gradeColor(score.grade)}`);
  lines.push('');

  // Security status
  if (security.status === 'vulnerable') {
    lines.push(chalk.bold('  Security Issues:'));
    const { critical, high, moderate, low } = security.vulnerabilities;
    if (critical > 0)
      lines.push(`    ${chalk.red('●')} ${critical} critical`);
    if (high > 0) lines.push(`    ${chalk.red('●')} ${high} high`);
    if (moderate > 0)
      lines.push(`    ${chalk.yellow('●')} ${moderate} moderate`);
    if (low > 0) lines.push(`    ${chalk.blue('●')} ${low} low`);
    lines.push('');
  } else if (security.status === 'clean') {
    lines.push(`  ${chalk.green('✓')} No known vulnerabilities`);
    lines.push('');
  } else if (security.status === 'unknown') {
    lines.push(
      `  ${chalk.yellow('?')} Security status unknown${security.auditError ? ': ' + security.auditError : ''}`
    );
    lines.push('');
  }

  // Metrics summary
  lines.push(chalk.bold('  Package Metrics:'));
  if (metrics.totalDependencyCount === -1) {
    lines.push(
      `    ${chalk.cyan('📦')} ${chalk.yellow('Dependency count unavailable')} (${metrics.directDependencyCount} direct dependencies known)`
    );
  } else {
    lines.push(
      `    ${chalk.cyan('📦')} ${metrics.totalDependencyCount} total dependencies (${metrics.directDependencyCount} direct)`
    );
  }
  lines.push(
    `    ${chalk.cyan('👥')} ${metrics.maintainerCount} ${metrics.maintainerCount === 1 ? 'maintainer' : 'maintainers'}`
  );
  lines.push(
    `    ${chalk.cyan('📅')} Published ${metrics.daysSincePublish} days ago`
  );
  if (metrics.approximateSizeMB > 0) {
    lines.push(
      `    ${chalk.cyan('💾')} ~${metrics.approximateSizeMB.toFixed(1)} MB unpacked`
    );
  }

  // License info
  const licenseColor = getLicenseColor(result.license.category);
  const licenseText = result.license.raw || 'None';
  lines.push(
    `    ${chalk.cyan('📄')} License: ${licenseColor(licenseText)}`
  );
  lines.push('');

  // Penalties
  if (score.penalties.length > 0) {
    lines.push(chalk.bold('  Risk Factors:'));
    for (const penalty of score.penalties) {
      const icon = getSeverityIcon(penalty.severity);
      lines.push(`    ${icon} ${penalty.reason}`);
    }
    lines.push('');
  } else {
    lines.push(chalk.green('  ✓ No significant risk factors detected'));
    lines.push('');
  }

  lines.push(chalk.bold('━'.repeat(60)));
  lines.push('');

  return lines.join('\n');
}

/**
 * Prompt user to proceed with installation
 */
export async function promptInstall(): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const answer = await rl.question(
      chalk.bold('Proceed with install? [y/N] ')
    );
    return answer.toLowerCase() === 'y';
  } finally {
    rl.close();
  }
}
