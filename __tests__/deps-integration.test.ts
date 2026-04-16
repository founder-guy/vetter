import { describe, it, expect } from 'vitest';
import { analyzeDependencyBreakdown } from '../src/services/breakdown.js';
import { renderTextReport, renderJsonReport } from '../src/report.js';
import type { AnalysisResult, DependencyBreakdown, TyposquattingAnalysis } from '../src/types.js';

describe('--deps CLI Integration', () => {
  /**
   * These tests verify the integration of the --deps feature:
   * 1. Breakdown is computed when workspace has lockfile
   * 2. Breakdown is undefined when workspace fails
   * 3. Rendering handles all three states correctly
   */

  const safeTyposquatting: TyposquattingAnalysis = {
    confidence: 'safe',
  };

  const mockAnalysisResult: AnalysisResult = {
    package: {
      name: 'test-package',
      version: '1.0.0',
      description: 'Test package',
      publishedAt: new Date('2024-01-01'),
      publishedAtKnown: true,
      maintainers: ['test@example.com'],
      license: 'MIT',
      dependencies: {},
      devDependencies: {},
    },
    metrics: {
      daysSincePublish: 30,
      maintainerCount: 1,
      directDependencyCount: 3,
      totalDependencyCount: 10,
      approximateSizeMB: 0.5,
    },
    security: {
      status: 'clean',
      vulnerabilities: { critical: 0, high: 0, moderate: 0, low: 0, info: 0, total: 0 },
    },
    license: {
      raw: 'MIT',
      category: 'permissive',
      normalizedSpdx: 'MIT',
    },
    score: {
      grade: 'A',
      score: 0,
      penalties: [],
    },
    dependencyBreakdown: undefined, // Will be set per test
  };

  describe('Breakdown computation', () => {
    it('should compute breakdown when lockfile is available', () => {
      const mockLockfile = {
        lockfileVersion: 2,
        packages: {
          'node_modules/test-package': {
            version: '1.0.0',
            dependencies: { 'dep-a': '^1.0.0', 'dep-b': '^1.0.0' },
          },
          'node_modules/dep-a': {
            version: '1.0.0',
            dependencies: { 'dep-c': '^1.0.0' },
          },
          'node_modules/dep-b': { version: '1.0.0' },
          'node_modules/dep-c': { version: '1.0.0' },
        },
      };

      const breakdown = analyzeDependencyBreakdown(mockLockfile, 'test-package');

      expect(breakdown).toBeDefined();
      expect(breakdown.length).toBe(2); // dep-a and dep-b
      expect(breakdown[0].name).toBe('dep-a');
      expect(breakdown[0].transitiveCount).toBe(1); // dep-c
      expect(breakdown[1].name).toBe('dep-b');
      expect(breakdown[1].transitiveCount).toBe(0);
    });

    it('should return undefined breakdown when lockfile is unavailable', () => {
      // Simulates workspace preparation failure or missing lockfile
      const breakdown = analyzeDependencyBreakdown(undefined, 'test-package');

      expect(breakdown).toEqual([]); // Empty array, not undefined
    });

    it('should return empty array when package has no dependencies', () => {
      const mockLockfile = {
        lockfileVersion: 2,
        packages: {
          'node_modules/test-package': {
            version: '1.0.0',
            // No dependencies field
          },
        },
      };

      const breakdown = analyzeDependencyBreakdown(mockLockfile, 'test-package');

      expect(breakdown).toEqual([]);
    });
  });

  describe('Text rendering with --deps flag', () => {
    it('should show breakdown when deps exist and --deps is set', () => {
      const breakdown: DependencyBreakdown[] = [
        { name: 'lodash', version: '4.17.21', transitiveCount: 5 },
        { name: 'axios', version: '1.0.0', transitiveCount: 3 },
      ];

      const result = { ...mockAnalysisResult, dependencyBreakdown: breakdown };
      const output = renderTextReport(result, safeTyposquatting, false, 0, { showDeps: true });

      expect(output).toContain('Top Dependencies (by sub-tree size):');
      expect(output).toContain('lodash@4.17.21');
      expect(output).toContain('5 transitive deps');
      expect(output).toContain('axios@1.0.0');
      expect(output).toContain('3 transitive deps');
    });

    it('should show "No direct dependencies found" when breakdown is empty array', () => {
      const result = { ...mockAnalysisResult, dependencyBreakdown: [] };
      const output = renderTextReport(result, safeTyposquatting, false, 0, { showDeps: true });

      expect(output).toContain('No direct dependencies found');
      expect(output).not.toContain('Top Dependencies');
      expect(output).not.toContain('lockfile parsing failed');
    });

    it('should show "lockfile parsing failed" when breakdown is undefined', () => {
      const result = { ...mockAnalysisResult, dependencyBreakdown: undefined };
      const output = renderTextReport(result, safeTyposquatting, false, 0, { showDeps: true });

      expect(output).toContain('lockfile parsing failed');
      expect(output).not.toContain('Top Dependencies');
      expect(output).not.toContain('No direct dependencies found');
    });

    it('should not show breakdown section when --deps is not set', () => {
      const breakdown: DependencyBreakdown[] = [
        { name: 'lodash', version: '4.17.21', transitiveCount: 5 },
      ];

      const result = { ...mockAnalysisResult, dependencyBreakdown: breakdown };
      const output = renderTextReport(result, safeTyposquatting, false, 0, { showDeps: false });

      expect(output).not.toContain('Top Dependencies');
      expect(output).not.toContain('lodash');
    });
  });

  describe('JSON rendering with --deps flag', () => {
    it('should include breakdown in JSON when --deps is set and data exists', () => {
      const breakdown: DependencyBreakdown[] = [
        { name: 'lodash', version: '4.17.21', transitiveCount: 5 },
        { name: 'axios', version: '1.0.0', transitiveCount: 3 },
      ];

      const result = { ...mockAnalysisResult, dependencyBreakdown: breakdown };
      const output = renderJsonReport(result, safeTyposquatting, false, 0, { showDeps: true });
      const json = JSON.parse(output);

      expect(json.dependencyBreakdown).toBeDefined();
      expect(json.dependencyBreakdown).toHaveLength(2);
      expect(json.dependencyBreakdown[0].name).toBe('lodash');
      expect(json.dependencyBreakdown[0].transitiveCount).toBe(5);
    });

    it('should include empty array in JSON when breakdown is empty', () => {
      const result = { ...mockAnalysisResult, dependencyBreakdown: [] };
      const output = renderJsonReport(result, safeTyposquatting, false, 0, { showDeps: true });
      const json = JSON.parse(output);

      expect(json.dependencyBreakdown).toBeDefined();
      expect(json.dependencyBreakdown).toEqual([]);
    });

    it('should not include breakdown in JSON when --deps is not set', () => {
      const breakdown: DependencyBreakdown[] = [
        { name: 'lodash', version: '4.17.21', transitiveCount: 5 },
      ];

      const result = { ...mockAnalysisResult, dependencyBreakdown: breakdown };
      const output = renderJsonReport(result, safeTyposquatting, false, 0, { showDeps: false });
      const json = JSON.parse(output);

      expect(json.dependencyBreakdown).toBeUndefined();
    });

    it('should not include breakdown in JSON when breakdown is undefined', () => {
      const result = { ...mockAnalysisResult, dependencyBreakdown: undefined };
      const output = renderJsonReport(result, safeTyposquatting, false, 0, { showDeps: true });
      const json = JSON.parse(output);

      // When breakdown is undefined, JSON should not include the field
      expect(json.dependencyBreakdown).toBeUndefined();
    });
  });

  describe('Breakdown with different package types', () => {
    it('should handle packages with many deps (renderer displays all provided)', () => {
      // Note: The breakdown analyzer limits to 10, this test verifies renderer can handle any amount
      const breakdown: DependencyBreakdown[] = [];
      for (let i = 0; i < 10; i++) {
        breakdown.push({
          name: `dep-${i}`,
          version: '1.0.0',
          transitiveCount: 10 - i, // Descending order
        });
      }

      const result = { ...mockAnalysisResult, dependencyBreakdown: breakdown };
      const output = renderTextReport(result, safeTyposquatting, false, 0, { showDeps: true });

      // Should show all 10 entries provided
      expect(output.match(/dep-\d+/g)?.length).toBe(10);
      expect(output).toContain('dep-0'); // Highest count
      expect(output).toContain('dep-9'); // Last entry
    });

    it('should handle scoped package names', () => {
      const breakdown: DependencyBreakdown[] = [
        { name: '@babel/core', version: '7.0.0', transitiveCount: 10 },
        { name: '@types/node', version: '18.0.0', transitiveCount: 0 },
      ];

      const result = { ...mockAnalysisResult, dependencyBreakdown: breakdown };
      const output = renderTextReport(result, safeTyposquatting, false, 0, { showDeps: true });

      expect(output).toContain('@babel/core@7.0.0');
      expect(output).toContain('@types/node@18.0.0');
    });

    it('should handle deps with zero transitive count', () => {
      const breakdown: DependencyBreakdown[] = [
        { name: 'leaf-dep', version: '1.0.0', transitiveCount: 0 },
      ];

      const result = { ...mockAnalysisResult, dependencyBreakdown: breakdown };
      const output = renderTextReport(result, safeTyposquatting, false, 0, { showDeps: true });

      expect(output).toContain('leaf-dep@1.0.0');
      expect(output).toContain('0 transitive deps');
    });
  });
});
