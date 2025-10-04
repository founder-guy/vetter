import type {
  Grade,
  ScoreResult,
  Penalty,
  SecurityAnalysis,
  PackageMetrics,
} from './types.js';

const GRADES: Grade[] = ['A', 'B', 'C', 'D', 'E', 'F'];

/**
 * Convert numeric score to letter grade
 */
function scoreToGrade(score: number): Grade {
  const index = Math.max(0, Math.min(5, Math.floor(score / 20)));
  return GRADES[index];
}

/**
 * Calculate package risk score and grade
 * Starts at A (0 points), penalties add points, higher score = worse grade
 */
export function calculateScore(
  security: SecurityAnalysis,
  metrics: PackageMetrics
): ScoreResult {
  const penalties: Penalty[] = [];
  let totalDeduction = 0;

  // Security vulnerabilities
  if (security.status === 'vulnerable') {
    const { critical, high, moderate } = security.vulnerabilities;

    if (critical > 0) {
      const deduction = 2;
      penalties.push({
        reason: `${critical} critical ${critical === 1 ? 'vulnerability' : 'vulnerabilities'}`,
        severity: 'high',
        gradeDeduction: deduction,
      });
      totalDeduction += deduction;
    }

    if (high > 0) {
      const deduction = 2;
      penalties.push({
        reason: `${high} high ${high === 1 ? 'vulnerability' : 'vulnerabilities'}`,
        severity: 'high',
        gradeDeduction: deduction,
      });
      totalDeduction += deduction;
    }

    if (moderate > 0) {
      const deduction = 1;
      penalties.push({
        reason: `${moderate} moderate ${moderate === 1 ? 'vulnerability' : 'vulnerabilities'}`,
        severity: 'medium',
        gradeDeduction: deduction,
      });
      totalDeduction += deduction;
    }
  }

  // Staleness
  if (metrics.daysSincePublish > 730) {
    const deduction = 2;
    penalties.push({
      reason: `Last published ${metrics.daysSincePublish} days ago (>2 years)`,
      severity: 'high',
      gradeDeduction: deduction,
    });
    totalDeduction += deduction;
  } else if (metrics.daysSincePublish > 365) {
    const deduction = 1;
    penalties.push({
      reason: `Last published ${metrics.daysSincePublish} days ago (>1 year)`,
      severity: 'medium',
      gradeDeduction: deduction,
    });
    totalDeduction += deduction;
  }

  // Maintainer count
  if (metrics.maintainerCount <= 1) {
    const deduction = 1;
    penalties.push({
      reason: `Only ${metrics.maintainerCount} ${metrics.maintainerCount === 1 ? 'maintainer' : 'maintainers'}`,
      severity: 'medium',
      gradeDeduction: deduction,
    });
    totalDeduction += deduction;
  }

  // Dependency count
  if (metrics.totalDependencyCount === -1) {
    // Unknown dependency count (counting failed)
    const deduction = 1;
    penalties.push({
      reason: 'Unable to determine dependency count',
      severity: 'medium',
      gradeDeduction: deduction,
    });
    totalDeduction += deduction;
  } else if (metrics.totalDependencyCount >= 100) {
    const deduction = 2;
    penalties.push({
      reason: `${metrics.totalDependencyCount} total dependencies (≥100)`,
      severity: 'high',
      gradeDeduction: deduction,
    });
    totalDeduction += deduction;
  } else if (metrics.totalDependencyCount >= 50) {
    const deduction = 1;
    penalties.push({
      reason: `${metrics.totalDependencyCount} total dependencies (≥50)`,
      severity: 'medium',
      gradeDeduction: deduction,
    });
    totalDeduction += deduction;
  }

  // Package size
  if (metrics.approximateSizeMB >= 5) {
    const deduction = 1;
    penalties.push({
      reason: `Package size ${metrics.approximateSizeMB.toFixed(1)} MB (≥5 MB)`,
      severity: 'medium',
      gradeDeduction: deduction,
    });
    totalDeduction += deduction;
  }

  // Calculate final score (0 = A, 20 = B, 40 = C, etc.)
  const score = Math.min(100, totalDeduction * 20);
  const grade = scoreToGrade(score);

  return {
    grade,
    score,
    penalties,
  };
}
