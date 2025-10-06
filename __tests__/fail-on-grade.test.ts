import { describe, it, expect } from 'vitest';
import { isGradeAtOrBelowThreshold } from '../src/grading.js';
import { calculateScore } from '../src/scoring.js';
import type { Grade, SecurityAnalysis, PackageMetrics, LicenseInfo } from '../src/types.js';

describe('Grade Comparison', () => {
  describe('isGradeAtOrBelowThreshold', () => {
    it('should return true when grade equals threshold', () => {
      expect(isGradeAtOrBelowThreshold('A', 'A')).toBe(true);
      expect(isGradeAtOrBelowThreshold('C', 'C')).toBe(true);
      expect(isGradeAtOrBelowThreshold('F', 'F')).toBe(true);
    });

    it('should return true when grade is worse than threshold', () => {
      expect(isGradeAtOrBelowThreshold('B', 'A')).toBe(true);
      expect(isGradeAtOrBelowThreshold('D', 'C')).toBe(true);
      expect(isGradeAtOrBelowThreshold('F', 'E')).toBe(true);
      expect(isGradeAtOrBelowThreshold('F', 'A')).toBe(true);
    });

    it('should return false when grade is better than threshold', () => {
      expect(isGradeAtOrBelowThreshold('A', 'B')).toBe(false);
      expect(isGradeAtOrBelowThreshold('C', 'D')).toBe(false);
      expect(isGradeAtOrBelowThreshold('E', 'F')).toBe(false);
      expect(isGradeAtOrBelowThreshold('A', 'F')).toBe(false);
    });

    it('should handle all grade combinations correctly', () => {
      // Test threshold C - should fail on C, D, E, F
      expect(isGradeAtOrBelowThreshold('A', 'C')).toBe(false);
      expect(isGradeAtOrBelowThreshold('B', 'C')).toBe(false);
      expect(isGradeAtOrBelowThreshold('C', 'C')).toBe(true);
      expect(isGradeAtOrBelowThreshold('D', 'C')).toBe(true);
      expect(isGradeAtOrBelowThreshold('E', 'C')).toBe(true);
      expect(isGradeAtOrBelowThreshold('F', 'C')).toBe(true);
    });
  });

  describe('Threshold Scenarios', () => {
    it('should correctly identify packages that fail threshold A', () => {
      // Threshold A - only A passes
      expect(isGradeAtOrBelowThreshold('A', 'A')).toBe(true);
      expect(isGradeAtOrBelowThreshold('B', 'A')).toBe(true);
      expect(isGradeAtOrBelowThreshold('C', 'A')).toBe(true);
    });

    it('should correctly identify packages that fail threshold C', () => {
      // Threshold C - A and B pass, C/D/E/F fail
      expect(isGradeAtOrBelowThreshold('A', 'C')).toBe(false); // passes
      expect(isGradeAtOrBelowThreshold('B', 'C')).toBe(false); // passes
      expect(isGradeAtOrBelowThreshold('C', 'C')).toBe(true);  // fails
      expect(isGradeAtOrBelowThreshold('D', 'C')).toBe(true);  // fails
    });

    it('should correctly identify packages that fail threshold F', () => {
      // Threshold F - only F fails
      expect(isGradeAtOrBelowThreshold('A', 'F')).toBe(false);
      expect(isGradeAtOrBelowThreshold('E', 'F')).toBe(false);
      expect(isGradeAtOrBelowThreshold('F', 'F')).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle best and worst grades', () => {
      // Best grade (A) vs worst threshold (F)
      expect(isGradeAtOrBelowThreshold('A', 'F')).toBe(false);

      // Worst grade (F) vs best threshold (A)
      expect(isGradeAtOrBelowThreshold('F', 'A')).toBe(true);
    });

    it('should handle adjacent grades', () => {
      expect(isGradeAtOrBelowThreshold('A', 'B')).toBe(false);
      expect(isGradeAtOrBelowThreshold('B', 'A')).toBe(true);
      expect(isGradeAtOrBelowThreshold('B', 'C')).toBe(false);
      expect(isGradeAtOrBelowThreshold('C', 'B')).toBe(true);
    });
  });
});

describe('CLI Integration Scenarios', () => {
  it('should understand --fail-on-grade C use case', () => {
    // Common CI scenario: fail on C or worse
    const threshold: Grade = 'C';

    // These should pass
    expect(isGradeAtOrBelowThreshold('A', threshold)).toBe(false);
    expect(isGradeAtOrBelowThreshold('B', threshold)).toBe(false);

    // These should fail
    expect(isGradeAtOrBelowThreshold('C', threshold)).toBe(true);
    expect(isGradeAtOrBelowThreshold('D', threshold)).toBe(true);
    expect(isGradeAtOrBelowThreshold('E', threshold)).toBe(true);
    expect(isGradeAtOrBelowThreshold('F', threshold)).toBe(true);
  });

  it('should understand --fail-on-grade D use case', () => {
    // Lenient CI scenario: only fail on D or worse
    const threshold: Grade = 'D';

    // These should pass
    expect(isGradeAtOrBelowThreshold('A', threshold)).toBe(false);
    expect(isGradeAtOrBelowThreshold('B', threshold)).toBe(false);
    expect(isGradeAtOrBelowThreshold('C', threshold)).toBe(false);

    // These should fail
    expect(isGradeAtOrBelowThreshold('D', threshold)).toBe(true);
    expect(isGradeAtOrBelowThreshold('E', threshold)).toBe(true);
    expect(isGradeAtOrBelowThreshold('F', threshold)).toBe(true);
  });

  it('should understand strict --fail-on-grade B use case', () => {
    // Strict CI scenario: only accept A, fail on B or worse
    const threshold: Grade = 'B';

    // Only A passes
    expect(isGradeAtOrBelowThreshold('A', threshold)).toBe(false);

    // All others fail
    expect(isGradeAtOrBelowThreshold('B', threshold)).toBe(true);
    expect(isGradeAtOrBelowThreshold('C', threshold)).toBe(true);
    expect(isGradeAtOrBelowThreshold('D', threshold)).toBe(true);
  });
});

describe('--fail-on-grade Integration with Scoring', () => {
  /**
   * Integration tests that verify the full flow:
   * security + metrics → score → grade → threshold comparison
   */

  const permissiveLicense: LicenseInfo = {
    raw: 'MIT',
    category: 'permissive',
    normalizedSpdx: 'MIT',
  };

  it('should determine exit code 1 when grade fails threshold (equal)', () => {
    const security: SecurityAnalysis = {
      status: 'vulnerable',
      vulnerabilities: { critical: 0, high: 0, moderate: 1, low: 0, info: 0, total: 1 },
    };
    const metrics: PackageMetrics = {
      daysSincePublish: 400,
      maintainerCount: 1,
      directDependencyCount: 0,
      totalDependencyCount: 1,
      approximateSizeMB: 0.5,
    };

    const score = calculateScore(security, metrics, permissiveLicense);
    expect(score.grade).toBe('D'); // moderate vuln + stale + 1 maintainer = D

    const shouldFail = isGradeAtOrBelowThreshold(score.grade, 'D');
    expect(shouldFail).toBe(true);
  });

  it('should determine exit code 1 when grade fails threshold (worse)', () => {
    const security: SecurityAnalysis = {
      status: 'vulnerable',
      vulnerabilities: { critical: 1, high: 0, moderate: 0, low: 0, info: 0, total: 1 },
    };
    const metrics: PackageMetrics = {
      daysSincePublish: 800,
      maintainerCount: 1,
      directDependencyCount: 0,
      totalDependencyCount: 100,
      approximateSizeMB: 5,
    };

    const score = calculateScore(security, metrics, permissiveLicense);
    expect(score.grade).toBe('F'); // Critical vuln + many penalties

    const shouldFail = isGradeAtOrBelowThreshold(score.grade, 'C');
    expect(shouldFail).toBe(true);
  });

  it('should determine exit code 0 when grade passes threshold', () => {
    const security: SecurityAnalysis = {
      status: 'clean',
      vulnerabilities: { critical: 0, high: 0, moderate: 0, low: 0, info: 0, total: 0 },
    };
    const metrics: PackageMetrics = {
      daysSincePublish: 30,
      maintainerCount: 5,
      directDependencyCount: 0,
      totalDependencyCount: 1,
      approximateSizeMB: 0.5,
    };

    const score = calculateScore(security, metrics, permissiveLicense);
    expect(score.grade).toBe('A'); // Healthy package

    const shouldFail = isGradeAtOrBelowThreshold(score.grade, 'C');
    expect(shouldFail).toBe(false);
  });

  it('should handle strict CI threshold (only accept A)', () => {
    const threshold = 'B' as Grade; // Fails on B or worse

    // Package with minor issue (grade B)
    const security: SecurityAnalysis = {
      status: 'clean',
      vulnerabilities: { critical: 0, high: 0, moderate: 0, low: 0, info: 0, total: 0 },
    };
    const metrics: PackageMetrics = {
      daysSincePublish: 400,
      maintainerCount: 2,
      directDependencyCount: 0,
      totalDependencyCount: 1,
      approximateSizeMB: 0.5,
    };

    const score = calculateScore(security, metrics, permissiveLicense);
    expect(score.grade).toBe('B');

    const shouldFail = isGradeAtOrBelowThreshold(score.grade, threshold);
    expect(shouldFail).toBe(true);
  });

  it('should handle lenient CI threshold (accept up to C)', () => {
    const threshold = 'D' as Grade; // Only fails on D or worse

    const security: SecurityAnalysis = {
      status: 'clean',
      vulnerabilities: { critical: 0, high: 0, moderate: 0, low: 0, info: 0, total: 0 },
    };
    const metrics: PackageMetrics = {
      daysSincePublish: 400,
      maintainerCount: 2,
      directDependencyCount: 0,
      totalDependencyCount: 1,
      approximateSizeMB: 0.5,
    };

    const score = calculateScore(security, metrics, permissiveLicense);
    expect(score.grade).toBe('B');

    const shouldFail = isGradeAtOrBelowThreshold(score.grade, threshold);
    expect(shouldFail).toBe(false); // B is better than D
  });
});
