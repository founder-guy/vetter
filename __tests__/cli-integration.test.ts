import { describe, it, expect } from 'vitest';
import { isGradeAtOrBelowThreshold } from '../src/grading.js';
import { calculateScore } from '../src/scoring.js';
import type { SecurityAnalysis, PackageMetrics, Grade, LicenseInfo } from '../src/types.js';

describe('CLI --fail-on-grade Integration Logic', () => {
  /**
   * These tests verify the core logic flow for --fail-on-grade:
   * 1. Package is analyzed and graded
   * 2. Grade is compared against threshold
   * 3. Exit code is determined based on comparison
   */

  const permissiveLicense: LicenseInfo = {
    raw: 'MIT',
    category: 'permissive',
    normalizedSpdx: 'MIT',
  };

  describe('Exit code determination', () => {
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
      expect(score.grade).toBe('D'); // moderate vuln + stale + 1 maintainer = D (3 penalties)

      // CLI logic: if (isGradeAtOrBelowThreshold(score.grade, 'D')) { exit(1) }
      const shouldFail = isGradeAtOrBelowThreshold(score.grade, 'D');
      expect(shouldFail).toBe(true);
      // Expected: process.exit(1)
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
      expect(score.grade).toBe('F'); // Critical vuln + many penalties = F

      // CLI logic: if (isGradeAtOrBelowThreshold(score.grade, 'C')) { exit(1) }
      const shouldFail = isGradeAtOrBelowThreshold(score.grade, 'C');
      expect(shouldFail).toBe(true);
      // Expected: process.exit(1)
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

      // CLI logic: if (isGradeAtOrBelowThreshold(score.grade, 'C')) { exit(1) }
      const shouldFail = isGradeAtOrBelowThreshold(score.grade, 'C');
      expect(shouldFail).toBe(false);
      // Expected: continue to normal exit with process.exit(0)
    });

    it('should determine exit code correctly for borderline cases', () => {
      // Package with grade B vs threshold B (should fail - equal counts as failure)
      const gradeB = 'B' as Grade;
      const thresholdB = 'B' as Grade;
      expect(isGradeAtOrBelowThreshold(gradeB, thresholdB)).toBe(true);

      // Package with grade B vs threshold C (should pass - B is better than C)
      const thresholdC = 'C' as Grade;
      expect(isGradeAtOrBelowThreshold(gradeB, thresholdC)).toBe(false);

      // Package with grade C vs threshold B (should fail - C is worse than B)
      const gradeC = 'C' as Grade;
      expect(isGradeAtOrBelowThreshold(gradeC, thresholdB)).toBe(true);
    });
  });

  describe('Real-world CI scenarios', () => {
    it('should handle strict CI threshold (only accept A)', () => {
      const threshold = 'B' as Grade; // Fails on B or worse

      // Healthy package with minor issue (grade B)
      const security: SecurityAnalysis = {
        status: 'clean',
        vulnerabilities: { critical: 0, high: 0, moderate: 0, low: 0, info: 0, total: 0 },
      };
      const metrics: PackageMetrics = {
        daysSincePublish: 400, // Slightly stale
        maintainerCount: 2,
        directDependencyCount: 0,
        totalDependencyCount: 1,
        approximateSizeMB: 0.5,
      };

      const score = calculateScore(security, metrics, permissiveLicense);
      expect(score.grade).toBe('B'); // Stale penalty

      const shouldFail = isGradeAtOrBelowThreshold(score.grade, threshold);
      expect(shouldFail).toBe(true); // Should fail strict CI
    });

    it('should handle lenient CI threshold (accept up to C)', () => {
      const threshold = 'D' as Grade; // Only fails on D or worse

      // Package with some issues (grade C)
      const security: SecurityAnalysis = {
        status: 'clean',
        vulnerabilities: { critical: 0, high: 0, moderate: 0, low: 0, info: 0, total: 0 },
      };
      const metrics: PackageMetrics = {
        daysSincePublish: 400, // Slightly stale (1+ year)
        maintainerCount: 2,
        directDependencyCount: 0,
        totalDependencyCount: 1,
        approximateSizeMB: 0.5,
      };

      const score = calculateScore(security, metrics, permissiveLicense);
      expect(score.grade).toBe('B'); // 1 penalty (stale 1+ year)

      const shouldFail = isGradeAtOrBelowThreshold(score.grade, threshold);
      expect(shouldFail).toBe(false); // Should pass lenient CI (B is better than D)
    });

    it('should handle common CI threshold (fail on C or worse)', () => {
      const threshold = 'C' as Grade;

      // Grade A - should pass
      const gradeA: Grade = 'A';
      expect(isGradeAtOrBelowThreshold(gradeA, threshold)).toBe(false);

      // Grade B - should pass
      const gradeB: Grade = 'B';
      expect(isGradeAtOrBelowThreshold(gradeB, threshold)).toBe(false);

      // Grade C - should fail (equal to threshold)
      const gradeC: Grade = 'C';
      expect(isGradeAtOrBelowThreshold(gradeC, threshold)).toBe(true);

      // Grade D, E, F - should fail
      expect(isGradeAtOrBelowThreshold('D' as Grade, threshold)).toBe(true);
      expect(isGradeAtOrBelowThreshold('E' as Grade, threshold)).toBe(true);
      expect(isGradeAtOrBelowThreshold('F' as Grade, threshold)).toBe(true);
    });
  });

  describe('Grade normalization', () => {
    it('should work with normalized grades (case-insensitive input)', () => {
      // CLI normalizes input: options.failOnGrade.toUpperCase()
      const userInput = 'c';
      const normalizedThreshold = userInput.toUpperCase() as Grade;

      expect(normalizedThreshold).toBe('C');
      expect(isGradeAtOrBelowThreshold('C', normalizedThreshold)).toBe(true);
      expect(isGradeAtOrBelowThreshold('B', normalizedThreshold)).toBe(false);
    });
  });
});
