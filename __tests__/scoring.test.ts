import { describe, it, expect } from 'vitest';
import { calculateScore } from '../src/scoring.js';
import type { SecurityAnalysis, PackageMetrics } from '../src/types.js';

describe('calculateScore', () => {
  it('should return grade A for healthy package', () => {
    const security: SecurityAnalysis = {
      status: 'clean',
      vulnerabilities: {
        critical: 0,
        high: 0,
        moderate: 0,
        low: 0,
        info: 0,
        total: 0,
      },
    };

    const metrics: PackageMetrics = {
      daysSincePublish: 30,
      maintainerCount: 5,
      directDependencyCount: 3,
      totalDependencyCount: 10,
      approximateSizeMB: 0.5,
    };

    const result = calculateScore(security, metrics);
    expect(result.grade).toBe('A');
    expect(result.penalties).toHaveLength(0);
  });

  it('should penalize critical vulnerabilities', () => {
    const security: SecurityAnalysis = {
      status: 'vulnerable',
      vulnerabilities: {
        critical: 2,
        high: 0,
        moderate: 0,
        low: 0,
        info: 0,
        total: 2,
      },
    };

    const metrics: PackageMetrics = {
      daysSincePublish: 30,
      maintainerCount: 5,
      directDependencyCount: 3,
      totalDependencyCount: 10,
      approximateSizeMB: 0.5,
    };

    const result = calculateScore(security, metrics);
    expect(result.grade).not.toBe('A');
    expect(result.penalties.length).toBeGreaterThan(0);
    expect(result.penalties[0].reason).toContain('critical');
  });

  it('should penalize stale packages', () => {
    const security: SecurityAnalysis = {
      status: 'clean',
      vulnerabilities: {
        critical: 0,
        high: 0,
        moderate: 0,
        low: 0,
        info: 0,
        total: 0,
      },
    };

    const metrics: PackageMetrics = {
      daysSincePublish: 800,
      maintainerCount: 5,
      directDependencyCount: 3,
      totalDependencyCount: 10,
      approximateSizeMB: 0.5,
    };

    const result = calculateScore(security, metrics);
    expect(result.penalties.some((p) => p.reason.includes('days ago'))).toBe(
      true
    );
  });

  it('should penalize packages with many dependencies', () => {
    const security: SecurityAnalysis = {
      status: 'clean',
      vulnerabilities: {
        critical: 0,
        high: 0,
        moderate: 0,
        low: 0,
        info: 0,
        total: 0,
      },
    };

    const metrics: PackageMetrics = {
      daysSincePublish: 30,
      maintainerCount: 5,
      directDependencyCount: 50,
      totalDependencyCount: 150,
      approximateSizeMB: 0.5,
    };

    const result = calculateScore(security, metrics);
    expect(
      result.penalties.some((p) => p.reason.includes('dependencies'))
    ).toBe(true);
  });

  it('should penalize single maintainer', () => {
    const security: SecurityAnalysis = {
      status: 'clean',
      vulnerabilities: {
        critical: 0,
        high: 0,
        moderate: 0,
        low: 0,
        info: 0,
        total: 0,
      },
    };

    const metrics: PackageMetrics = {
      daysSincePublish: 30,
      maintainerCount: 1,
      directDependencyCount: 3,
      totalDependencyCount: 10,
      approximateSizeMB: 0.5,
    };

    const result = calculateScore(security, metrics);
    expect(
      result.penalties.some((p) => p.reason.includes('maintainer'))
    ).toBe(true);
  });

  it('should penalize large packages', () => {
    const security: SecurityAnalysis = {
      status: 'clean',
      vulnerabilities: {
        critical: 0,
        high: 0,
        moderate: 0,
        low: 0,
        info: 0,
        total: 0,
      },
    };

    const metrics: PackageMetrics = {
      daysSincePublish: 30,
      maintainerCount: 5,
      directDependencyCount: 3,
      totalDependencyCount: 10,
      approximateSizeMB: 10,
    };

    const result = calculateScore(security, metrics);
    expect(result.penalties.some((p) => p.reason.includes('size'))).toBe(true);
  });

  it('should accumulate multiple penalties', () => {
    const security: SecurityAnalysis = {
      status: 'vulnerable',
      vulnerabilities: {
        critical: 1,
        high: 2,
        moderate: 3,
        low: 0,
        info: 0,
        total: 6,
      },
    };

    const metrics: PackageMetrics = {
      daysSincePublish: 800,
      maintainerCount: 1,
      directDependencyCount: 50,
      totalDependencyCount: 120,
      approximateSizeMB: 8,
    };

    const result = calculateScore(security, metrics);
    expect(result.grade).toBe('F');
    expect(result.penalties.length).toBeGreaterThan(3);
  });

  it('should penalize unknown dependency count (-1)', () => {
    const security: SecurityAnalysis = {
      status: 'clean',
      vulnerabilities: {
        critical: 0,
        high: 0,
        moderate: 0,
        low: 0,
        info: 0,
        total: 0,
      },
    };

    const metrics: PackageMetrics = {
      daysSincePublish: 30,
      maintainerCount: 5,
      directDependencyCount: 10,
      totalDependencyCount: -1, // Unknown/failed to count
      approximateSizeMB: 0.5,
    };

    const result = calculateScore(security, metrics);
    expect(result.grade).toBe('B'); // -1 grade from A
    expect(result.penalties.length).toBe(1);
    expect(result.penalties[0].reason).toBe('Unable to determine dependency count');
    expect(result.penalties[0].severity).toBe('medium');
    expect(result.penalties[0].gradeDeduction).toBe(1);
  });
});
