import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { AnalysisResult } from '../src/types';

import { loadCache, saveCache, clearCache, getCacheDir, formatAge } from '../src/cache';

// Test cache directory (will be created fresh for each test)
let testCacheDir: string;

describe('Cache', () => {
  const mockResult: AnalysisResult = {
    package: {
      name: 'test-package',
      version: '1.0.0',
      publishedAt: new Date('2024-01-01T00:00:00Z'),
      maintainers: ['test@example.com'],
      dependencies: {},
      devDependencies: {},
      description: 'Test package',
    },
    metrics: {
      daysSincePublish: 100,
      maintainerCount: 1,
      directDependencyCount: 5,
      totalDependencyCount: 50,
      approximateSizeMB: 1.5,
    },
    security: {
      status: 'clean',
      vulnerabilities: {
        critical: 0,
        high: 0,
        moderate: 0,
        low: 0,
        info: 0,
        total: 0,
      },
    },
    license: {
      raw: 'MIT',
      category: 'permissive',
      normalizedSpdx: 'MIT',
    },
    score: {
      grade: 'B',
      score: 25,
      penalties: [
        {
          reason: 'Many dependencies',
          severity: 'medium',
          gradeDeduction: 1,
        },
      ],
    },
    dependencyBreakdown: [
      { name: 'lodash', version: '4.17.21', transitiveCount: 0 },
    ],
  };

  beforeEach(async () => {
    // Create a real temp directory for each test
    testCacheDir = await fs.mkdtemp(join(tmpdir(), 'vetter-test-'));
    process.env.VETTER_CACHE_DIR = testCacheDir;
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.rm(testCacheDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
    delete process.env.VETTER_CACHE_DIR;
  });

  describe('getCacheDir', () => {
    it('should respect VETTER_CACHE_DIR', () => {
      process.env.VETTER_CACHE_DIR = '/custom/cache';
      expect(getCacheDir()).toBe('/custom/cache/entries');
    });

    it('should respect XDG_CACHE_HOME', () => {
      delete process.env.VETTER_CACHE_DIR;
      process.env.XDG_CACHE_HOME = '/home/user/.cache';
      expect(getCacheDir()).toBe('/home/user/.cache/vetter/entries');
    });

    it('should use LOCALAPPDATA on Windows', () => {
      delete process.env.VETTER_CACHE_DIR;
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });
      process.env.LOCALAPPDATA = 'C:\\Users\\test\\AppData\\Local';

      expect(getCacheDir()).toContain('vetter');

      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('should fall back to home directory', () => {
      delete process.env.VETTER_CACHE_DIR;
      delete process.env.XDG_CACHE_HOME;
      const cacheDir = getCacheDir();
      expect(cacheDir).toContain('vetter');
      expect(cacheDir).toContain('entries');
    });
  });

  describe('formatAge', () => {
    it('should format seconds', () => {
      expect(formatAge(30)).toBe('30s');
    });

    it('should format minutes', () => {
      expect(formatAge(120)).toBe('2m');
      expect(formatAge(180)).toBe('3m');
    });

    it('should format hours', () => {
      expect(formatAge(3600)).toBe('1h');
      expect(formatAge(7200)).toBe('2h');
    });

    it('should format days', () => {
      expect(formatAge(86400)).toBe('1d');
      expect(formatAge(172800)).toBe('2d');
    });

    describe('edge cases', () => {
      it('should handle negative seconds', () => {
        expect(formatAge(-1)).toBe('unknown');
        expect(formatAge(-100)).toBe('unknown');
      });

      it('should handle NaN', () => {
        expect(formatAge(NaN)).toBe('unknown');
      });

      it('should handle Infinity', () => {
        expect(formatAge(Infinity)).toBe('unknown');
        expect(formatAge(-Infinity)).toBe('unknown');
      });

      it('should handle decimal seconds by flooring', () => {
        expect(formatAge(30.7)).toBe('30s');
        expect(formatAge(59.9)).toBe('59s');
      });

      it('should handle zero', () => {
        expect(formatAge(0)).toBe('0s');
      });
    });
  });

  describe('saveCache and loadCache', () => {
    const packageName = 'test-package';
    const version = '1.0.0';
    const publishedAt = '2024-01-01T00:00:00.000Z';

    it('should save and load cache successfully', async () => {
      // Save
      await saveCache(packageName, version, publishedAt, mockResult);

      // Load
      const loaded = await loadCache(packageName, version, publishedAt);

      expect(loaded).not.toBeNull();
      expect(loaded?.analysis).toEqual(mockResult);
      expect(loaded?.cacheAgeSeconds).toBeGreaterThanOrEqual(0);
    });

    it('should return null for cache miss', async () => {
      const loaded = await loadCache('nonexistent', '1.0.0', publishedAt);
      expect(loaded).toBeNull();
    });

    it('should invalidate cache if publish date differs', async () => {
      // Save with one publish date
      await saveCache(packageName, version, publishedAt, mockResult);

      // Try to load with different publish date
      const loaded = await loadCache(packageName, version, '2025-01-01T00:00:00.000Z');
      expect(loaded).toBeNull();
    });

    it('should invalidate cache if TTL exceeded', async () => {
      // Save
      await saveCache(packageName, version, publishedAt, mockResult);

      // Verify it was saved
      const cachedBefore = await loadCache(packageName, version, publishedAt);
      expect(cachedBefore).not.toBeNull();

      // Compute cache path manually
      const { createHash } = await import('crypto');
      const key = createHash('sha1')
        .update('test-package@1.0.0')
        .digest('hex');
      const cachePath = join(testCacheDir, 'entries', `${key}.json`);

      // Read and modify the file
      const data = await fs.readFile(cachePath, 'utf-8');
      const entry = JSON.parse(data);

      // Set cachedAt to 8 days ago (beyond 7-day TTL)
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
      entry.cachedAt = eightDaysAgo.toISOString();

      await fs.writeFile(cachePath, JSON.stringify(entry));

      // Should be invalidated due to TTL
      const loaded = await loadCache(packageName, version, publishedAt);
      expect(loaded).toBeNull();
    });

    it('should handle corrupt JSON gracefully', async () => {
      // First save a valid entry
      await saveCache(packageName, version, publishedAt, mockResult);

      // Compute cache path
      const { createHash } = await import('crypto');
      const key = createHash('sha1')
        .update('test-package@1.0.0')
        .digest('hex');
      const cachePath = join(testCacheDir, 'entries', `${key}.json`);

      // Corrupt the file
      await fs.writeFile(cachePath, 'invalid json{{{');

      // Should return null instead of throwing
      const loaded = await loadCache(packageName, version, publishedAt);
      expect(loaded).toBeNull();
    });

    it('should handle scoped packages correctly', async () => {
      const scopedName = '@babel/core';
      const scopedVersion = '7.0.0';

      await saveCache(scopedName, scopedVersion, publishedAt, mockResult);
      const loaded = await loadCache(scopedName, scopedVersion, publishedAt);

      expect(loaded).not.toBeNull();
      expect(loaded?.analysis).toEqual(mockResult);
    });

    it('should normalize package names (case-insensitive)', async () => {
      await saveCache('Test-Package', version, publishedAt, mockResult);

      // Should load with different casing
      const loaded = await loadCache('test-package', version, publishedAt);
      expect(loaded).not.toBeNull();
    });
  });

  describe('clearCache', () => {
    it('should clear all cache entries', async () => {
      const publishedAt = '2024-01-01T00:00:00.000Z';

      // Save multiple entries
      await saveCache('pkg1', '1.0.0', publishedAt, mockResult);
      await saveCache('pkg2', '2.0.0', publishedAt, mockResult);
      await saveCache('pkg3', '3.0.0', publishedAt, mockResult);

      // Clear cache
      await clearCache();

      // All should be gone
      expect(await loadCache('pkg1', '1.0.0', publishedAt)).toBeNull();
      expect(await loadCache('pkg2', '2.0.0', publishedAt)).toBeNull();
      expect(await loadCache('pkg3', '3.0.0', publishedAt)).toBeNull();
    });

    it('should handle empty cache gracefully', async () => {
      await expect(clearCache()).resolves.not.toThrow();
    });
  });

  describe('error handling', () => {
    it('should warn about large cache entries', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Create a large result (>1MB JSON)
      const largeResult = {
        ...mockResult,
        score: {
          ...mockResult.score,
          penalties: Array(10000).fill({
            reason: 'x'.repeat(100),
            severity: 'medium' as const,
            gradeDeduction: 1,
          }),
        },
      };

      await saveCache('large-pkg', '1.0.0', '2024-01-01T00:00:00.000Z', largeResult);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Warning: Cache entry for large-pkg@1.0.0')
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('cache versioning', () => {
    it('should invalidate cache if version differs', async () => {
      const publishedAt = '2024-01-01T00:00:00.000Z';

      // Save with current version
      await saveCache('test', '1.0.0', publishedAt, mockResult);

      // Compute cache path
      const { createHash } = await import('crypto');
      const key = createHash('sha1')
        .update('test@1.0.0')
        .digest('hex');
      const cachePath = join(testCacheDir, 'entries', `${key}.json`);

      // Manually edit cache to have different version
      const data = await fs.readFile(cachePath, 'utf-8');
      const entry = JSON.parse(data);
      entry.cacheVersion = 999; // Future version
      await fs.writeFile(cachePath, JSON.stringify(entry));

      // Should be invalidated
      const loaded = await loadCache('test', '1.0.0', publishedAt);
      expect(loaded).toBeNull();
    });
  });

  describe('cache size management', () => {
    it('should prune oldest entries when cache exceeds 50MB', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const publishedAt = '2024-01-01T00:00:00.000Z';

      // Create a large result that will be ~1MB when serialized
      const largeResult = {
        ...mockResult,
        score: {
          ...mockResult.score,
          penalties: Array(10000).fill({
            reason: 'x'.repeat(100),
            severity: 'medium' as const,
            gradeDeduction: 1,
          }),
        },
      };

      // Save 60 entries (each ~1MB = 60MB total, exceeding 50MB limit)
      for (let i = 0; i < 60; i++) {
        await saveCache(`pkg-${i}`, '1.0.0', publishedAt, largeResult);
        // Small delay to ensure different modification times
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Check that pruning occurred
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cache pruned')
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('dependency breakdown caching', () => {
    it('should cache and restore dependency breakdown data', async () => {
      const publishedAt = '2024-01-01T00:00:00.000Z';
      const resultWithBreakdown = {
        ...mockResult,
        dependencyBreakdown: [
          { name: 'express', version: '4.18.0', transitiveCount: 50 },
          { name: 'lodash', version: '4.17.21', transitiveCount: 0 },
          { name: '@babel/core', version: '7.23.0', transitiveCount: 15 },
        ],
      };

      // Save result with breakdown
      await saveCache('test-pkg', '1.0.0', publishedAt, resultWithBreakdown);

      // Load from cache
      const cached = await loadCache('test-pkg', '1.0.0', publishedAt);

      expect(cached).toBeDefined();
      expect(cached?.analysis.dependencyBreakdown).toBeDefined();
      expect(cached?.analysis.dependencyBreakdown).toHaveLength(3);
      expect(cached?.analysis.dependencyBreakdown?.[0].name).toBe('express');
      expect(cached?.analysis.dependencyBreakdown?.[0].transitiveCount).toBe(50);
    });

    it('should cache empty breakdown array (package with no deps)', async () => {
      const publishedAt = '2024-01-01T00:00:00.000Z';
      const resultWithEmptyBreakdown = {
        ...mockResult,
        dependencyBreakdown: [],
      };

      // Save result with empty breakdown
      await saveCache('no-deps-pkg', '1.0.0', publishedAt, resultWithEmptyBreakdown);

      // Load from cache
      const cached = await loadCache('no-deps-pkg', '1.0.0', publishedAt);

      expect(cached).toBeDefined();
      expect(cached?.analysis.dependencyBreakdown).toBeDefined();
      expect(cached?.analysis.dependencyBreakdown).toEqual([]);
    });

    it('should cache undefined breakdown (lockfile unavailable)', async () => {
      const publishedAt = '2024-01-01T00:00:00.000Z';
      const resultWithUndefinedBreakdown = {
        ...mockResult,
        dependencyBreakdown: undefined,
      };

      // Save result with undefined breakdown
      await saveCache('no-lockfile-pkg', '1.0.0', publishedAt, resultWithUndefinedBreakdown);

      // Load from cache
      const cached = await loadCache('no-lockfile-pkg', '1.0.0', publishedAt);

      expect(cached).toBeDefined();
      expect(cached?.analysis.dependencyBreakdown).toBeUndefined();
    });
  });
});
