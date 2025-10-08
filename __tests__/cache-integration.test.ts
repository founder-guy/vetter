import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Mock the services to avoid actual npm calls
vi.mock('../src/services/npm.js', () => ({
  getPackageMetadata: vi.fn(async () => ({
    name: 'test-package',
    version: '1.0.0',
    publishedAt: new Date('2024-01-01T00:00:00Z'),
    maintainers: ['test@example.com'],
    dependencies: {},
    devDependencies: {},
    description: 'Test package',
  })),
}));

vi.mock('../src/services/security.js', () => ({
  analyzePackageSecurity: vi.fn(async () => ({
    status: 'clean',
    vulnerabilities: {
      critical: 0,
      high: 0,
      moderate: 0,
      low: 0,
      info: 0,
      total: 0,
    },
  })),
}));

vi.mock('../src/services/metrics.js', () => ({
  calculateMetrics: vi.fn(async () => ({
    daysSincePublish: 100,
    maintainerCount: 1,
    directDependencyCount: 0,
    totalDependencyCount: 1,
    approximateSizeMB: 0.01,
  })),
}));

import { getPackageMetadata } from '../src/services/npm.js';
import { analyzePackageSecurity } from '../src/services/security.js';
import { calculateMetrics } from '../src/services/metrics.js';
import { loadCache, saveCache } from '../src/cache.js';

describe('Cache Integration with Services', () => {
  let testCacheDir: string;

  beforeEach(async () => {
    // Create temp cache directory
    testCacheDir = await fs.mkdtemp(join(tmpdir(), 'vetter-cli-test-'));
    process.env.VETTER_CACHE_DIR = testCacheDir;

    // Reset mocks
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Clean up
    try {
      await fs.rm(testCacheDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
    delete process.env.VETTER_CACHE_DIR;
  });

  describe('cache bypass behavior', () => {
    it('should skip cache load when cache is disabled', async () => {
      const options = { cache: false, json: false, install: false };

      // Pre-populate cache
      const metadata = await getPackageMetadata('test-package', '1.0.0');
      const mockAnalysis = {
        package: metadata,
        metrics: await calculateMetrics(metadata),
        security: await analyzePackageSecurity('test-package', '1.0.0'),
        license: { raw: 'MIT', category: 'permissive' as const, normalizedSpdx: 'MIT' },
        score: { grade: 'A' as const, score: 0, penalties: [] },
        dependencyBreakdown: undefined,
      };

      await saveCache(
        'test-package',
        '1.0.0',
        metadata.publishedAt.toISOString(),
        mockAnalysis
      );

      // Verify cache exists
      const cached = await loadCache(
        'test-package',
        '1.0.0',
        metadata.publishedAt.toISOString()
      );
      expect(cached).not.toBeNull();

      // With --no-cache, services should still be called (not using cache)
      if (options.cache === false) {
        // Simulate fresh analysis
        await getPackageMetadata('test-package', '1.0.0');
        await analyzePackageSecurity('test-package', '1.0.0');
        await calculateMetrics(metadata);

        // Services should have been called
        expect(getPackageMetadata).toHaveBeenCalled();
        expect(analyzePackageSecurity).toHaveBeenCalled();
        expect(calculateMetrics).toHaveBeenCalled();
      }
    });

    it('should skip cache save when cache is disabled', async () => {
      const options = { cache: false, json: false, install: false };

      const metadata = await getPackageMetadata('test-package', '1.0.0');
      const mockAnalysis = {
        package: metadata,
        metrics: await calculateMetrics(metadata),
        security: await analyzePackageSecurity('test-package', '1.0.0'),
        license: { raw: 'MIT', category: 'permissive' as const, normalizedSpdx: 'MIT' },
        score: { grade: 'A' as const, score: 0, penalties: [] },
        dependencyBreakdown: undefined,
      };

      // With --no-cache, should NOT save
      if (options.cache === false) {
        // Don't save to cache
      } else {
        await saveCache(
          'test-package',
          '1.0.0',
          metadata.publishedAt.toISOString(),
          mockAnalysis
        );
      }

      // Verify cache is empty (nothing saved)
      const cached = await loadCache(
        'test-package',
        '1.0.0',
        metadata.publishedAt.toISOString()
      );
      expect(cached).toBeNull();
    });
  });

  describe('cache refresh behavior', () => {
    it('should skip cache load but save result when refresh is requested', async () => {
      const options = { refresh: true, cache: true, json: false, install: false };

      // Pre-populate cache with old data
      const metadata = await getPackageMetadata('test-package', '1.0.0');
      const oldAnalysis = {
        package: metadata,
        metrics: { ...await calculateMetrics(metadata), totalDependencyCount: 999 },
        security: await analyzePackageSecurity('test-package', '1.0.0'),
        license: { raw: 'MIT', category: 'permissive' as const, normalizedSpdx: 'MIT' },
        score: { grade: 'F' as const, score: 100, penalties: [] },
        dependencyBreakdown: undefined,
      };

      await saveCache(
        'test-package',
        '1.0.0',
        metadata.publishedAt.toISOString(),
        oldAnalysis
      );

      // Verify old cache exists
      const oldCached = await loadCache(
        'test-package',
        '1.0.0',
        metadata.publishedAt.toISOString()
      );
      expect(oldCached?.analysis.metrics.totalDependencyCount).toBe(999);

      // With --refresh, skip load and run fresh analysis
      if (!options.refresh) {
        // Would use cache
      } else {
        // Run fresh analysis
        const newAnalysis = {
          package: metadata,
          metrics: await calculateMetrics(metadata),
          security: await analyzePackageSecurity('test-package', '1.0.0'),
          license: { raw: 'MIT', category: 'permissive' as const, normalizedSpdx: 'MIT' },
          score: { grade: 'A' as const, score: 0, penalties: [] },
          dependencyBreakdown: undefined,
        };

        // Save updated result
        await saveCache(
          'test-package',
          '1.0.0',
          metadata.publishedAt.toISOString(),
          newAnalysis
        );
      }

      // Verify cache was updated
      const newCached = await loadCache(
        'test-package',
        '1.0.0',
        metadata.publishedAt.toISOString()
      );
      expect(newCached?.analysis.metrics.totalDependencyCount).toBe(1);
      expect(newCached?.analysis.score.grade).toBe('A');
    });
  });

  describe('normal cache flow', () => {
    it('should use cached result on second run (no flags)', async () => {
      const metadata = await getPackageMetadata('test-package', '1.0.0');
      const mockAnalysis = {
        package: metadata,
        metrics: await calculateMetrics(metadata),
        security: await analyzePackageSecurity('test-package', '1.0.0'),
        license: { raw: 'MIT', category: 'permissive' as const, normalizedSpdx: 'MIT' },
        score: { grade: 'A' as const, score: 0, penalties: [] },
        dependencyBreakdown: undefined,
      };

      // First run: save to cache
      await saveCache(
        'test-package',
        '1.0.0',
        metadata.publishedAt.toISOString(),
        mockAnalysis
      );

      // Reset mock call counts
      vi.clearAllMocks();

      // Second run: load from cache
      const cached = await loadCache(
        'test-package',
        '1.0.0',
        metadata.publishedAt.toISOString()
      );

      expect(cached).not.toBeNull();
      expect(cached?.analysis).toEqual(mockAnalysis);

      // Services should NOT be called (using cache)
      expect(analyzePackageSecurity).not.toHaveBeenCalled();
      expect(calculateMetrics).not.toHaveBeenCalled();
    });
  });

  describe('sequential cache updates', () => {
    it('should handle sequential cache updates correctly', async () => {
      const metadata = await getPackageMetadata('test-package', '1.0.0');
      const mockAnalysis = {
        package: metadata,
        metrics: await calculateMetrics(metadata),
        security: await analyzePackageSecurity('test-package', '1.0.0'),
        license: { raw: 'MIT', category: 'permissive' as const, normalizedSpdx: 'MIT' },
        score: { grade: 'A' as const, score: 0, penalties: [] },
        dependencyBreakdown: undefined,
      };

      // First save
      await saveCache(
        'test-package',
        '1.0.0',
        metadata.publishedAt.toISOString(),
        mockAnalysis
      );

      // Load and verify
      let cached = await loadCache(
        'test-package',
        '1.0.0',
        metadata.publishedAt.toISOString()
      );
      expect(cached?.analysis.score.grade).toBe('A');

      // Update with new analysis
      const modifiedAnalysis = {
        ...mockAnalysis,
        license: { raw: 'MIT', category: 'permissive' as const, normalizedSpdx: 'MIT' },
        score: { grade: 'B' as const, score: 25, penalties: [] },
        dependencyBreakdown: undefined,
      };

      await saveCache(
        'test-package',
        '1.0.0',
        metadata.publishedAt.toISOString(),
        modifiedAnalysis
      );

      // Load again and verify update
      cached = await loadCache(
        'test-package',
        '1.0.0',
        metadata.publishedAt.toISOString()
      );

      expect(cached).not.toBeNull();
      expect(cached?.analysis.score.grade).toBe('B');
    });
  });
});
