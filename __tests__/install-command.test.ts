import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runInstallCommand } from '../src/commands/install.js';

// Mock all external dependencies
vi.mock('../src/services/npm.js');
vi.mock('../src/services/security.js');
vi.mock('../src/services/metrics.js');
vi.mock('../src/services/license.js');
vi.mock('../src/services/breakdown.js');
vi.mock('../src/scoring.js');
vi.mock('../src/report.js');
vi.mock('../src/install.js');
vi.mock('../src/cache.js');
vi.mock('../src/services/workspace.js');
vi.mock('../src/grading.js');

import { parsePackageString, getPackageMetadata } from '../src/services/npm.js';
import { analyzePackageSecurity } from '../src/services/security.js';
import { calculateMetrics } from '../src/services/metrics.js';
import { analyzeLicense } from '../src/services/license.js';
import { analyzeDependencyBreakdown } from '../src/services/breakdown.js';
import { calculateScore } from '../src/scoring.js';
import { renderTextReport, renderJsonReport, promptInstall } from '../src/report.js';
import { installPackage } from '../src/install.js';
import { loadCache, saveCache } from '../src/cache.js';
import { prepareWorkspace } from '../src/services/workspace.js';
import { isValidGrade, isGradeAtOrBelowThreshold } from '../src/grading.js';

describe('runInstallCommand', () => {
  // Mock console methods to avoid test output pollution
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  const mockPackageSnapshot = {
    name: 'test-package',
    version: '1.0.0',
    description: 'Test package',
    license: 'MIT',
    publishedAt: new Date('2024-01-01'),
    maintainers: ['test@example.com'],
    dependencies: {},
    unpackedSize: 1000000,
  };

  const mockAnalysisResult = {
    package: mockPackageSnapshot,
    metrics: {
      daysSincePublish: 30,
      maintainerCount: 1,
      directDependencyCount: 0,
      totalDependencyCount: 0,
      approximateSizeMB: 1,
    },
    security: {
      status: 'clean' as const,
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
      category: 'permissive' as const,
      spdx: 'MIT',
    },
    score: {
      grade: 'A' as const,
      penalty: 0,
      breakdown: {
        security: 0,
        maintenance: 0,
        dependencies: 0,
        size: 0,
        license: 0,
      },
    },
  };

  beforeEach(() => {
    // Default mocks for successful flow
    vi.mocked(parsePackageString).mockReturnValue({ name: 'test-package', version: '1.0.0' });
    vi.mocked(getPackageMetadata).mockResolvedValue(mockPackageSnapshot);
    vi.mocked(loadCache).mockResolvedValue(null);
    vi.mocked(prepareWorkspace).mockResolvedValue({
      dir: '/tmp/test',
      lockfile: { name: 'test', version: '1.0.0', lockfileVersion: 3, packages: {} },
      cleanup: vi.fn().mockResolvedValue(undefined),
    });
    vi.mocked(analyzePackageSecurity).mockResolvedValue(mockAnalysisResult.security);
    vi.mocked(calculateMetrics).mockResolvedValue(mockAnalysisResult.metrics);
    vi.mocked(analyzeLicense).mockReturnValue(mockAnalysisResult.license);
    vi.mocked(analyzeDependencyBreakdown).mockReturnValue(undefined);
    vi.mocked(calculateScore).mockReturnValue(mockAnalysisResult.score);
    vi.mocked(saveCache).mockResolvedValue(undefined);
    vi.mocked(renderTextReport).mockReturnValue('Mock report');
    vi.mocked(renderJsonReport).mockReturnValue('{}');
    vi.mocked(promptInstall).mockResolvedValue(false);
  });

  it('should return exit code 1 for invalid grade', async () => {
    vi.mocked(isValidGrade).mockReturnValue(false);

    const exitCode = await runInstallCommand('test-package', {
      failOnGrade: 'Z' as any,
      json: false,
    });

    expect(exitCode).toBe(1);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Invalid grade "Z"')
    );
  });

  it('should return exit code 1 when grade fails threshold', async () => {
    vi.mocked(isValidGrade).mockReturnValue(true);
    vi.mocked(isGradeAtOrBelowThreshold).mockReturnValue(true);

    // Mock package with grade F
    const failedScore = { ...mockAnalysisResult.score, grade: 'F' as const };
    vi.mocked(calculateScore).mockReturnValue(failedScore);

    const exitCode = await runInstallCommand('test-package', {
      failOnGrade: 'C',
      json: false,
      install: false,
    });

    expect(exitCode).toBe(1);
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Package grade F fails threshold C')
    );
  });

  it('should return exit code 0 when grade passes threshold', async () => {
    vi.mocked(isValidGrade).mockReturnValue(true);
    vi.mocked(isGradeAtOrBelowThreshold).mockReturnValue(false);

    const exitCode = await runInstallCommand('test-package', {
      failOnGrade: 'C',
      json: false,
      install: false,
    });

    expect(exitCode).toBe(0);
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Package grade A passes threshold C')
    );
  });

  it('should return exit code 0 for analysis with --no-install', async () => {
    const exitCode = await runInstallCommand('test-package', {
      install: false,
      json: false,
    });

    expect(exitCode).toBe(0);
    expect(promptInstall).not.toHaveBeenCalled();
  });

  it('should return exit code 0 in JSON mode (no install prompt)', async () => {
    const exitCode = await runInstallCommand('test-package', {
      json: true,
    });

    expect(exitCode).toBe(0);
    expect(promptInstall).not.toHaveBeenCalled();
    expect(renderJsonReport).toHaveBeenCalled();
  });

  it('should return exit code 1 on metadata fetch error', async () => {
    vi.mocked(getPackageMetadata).mockRejectedValue(new Error('Package not found'));

    const exitCode = await runInstallCommand('nonexistent-package', {
      json: false,
      install: false,
    });

    expect(exitCode).toBe(1);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Package not found')
    );
  });

  it('should return exit code 0 when using cached analysis', async () => {
    vi.mocked(loadCache).mockResolvedValue({
      analysis: mockAnalysisResult,
      cacheAgeSeconds: 3600,
    });

    const exitCode = await runInstallCommand('test-package', {
      json: false,
      install: false,
    });

    expect(exitCode).toBe(0);
    // Should not run analysis if cache hit
    expect(prepareWorkspace).not.toHaveBeenCalled();
    expect(analyzePackageSecurity).not.toHaveBeenCalled();
  });

  it('should return exit code 0 when user declines installation', async () => {
    vi.mocked(promptInstall).mockResolvedValue(false);

    const exitCode = await runInstallCommand('test-package', {
      install: true,
      json: false,
    });

    expect(exitCode).toBe(0);
    expect(promptInstall).toHaveBeenCalled();
    expect(installPackage).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Installation cancelled')
    );
  });

  it('should return install exit code when user accepts installation', async () => {
    vi.mocked(promptInstall).mockResolvedValue(true);
    vi.mocked(installPackage).mockResolvedValue(42);

    const exitCode = await runInstallCommand('test-package', {
      install: true,
      json: false,
    });

    expect(exitCode).toBe(42);
    expect(promptInstall).toHaveBeenCalled();
    expect(installPackage).toHaveBeenCalledWith('test-package@1.0.0');
  });

  it('should skip cache when --no-cache flag is set', async () => {
    const exitCode = await runInstallCommand('test-package', {
      cache: false,
      install: false,
      json: false,
    });

    expect(exitCode).toBe(0);
    expect(loadCache).not.toHaveBeenCalled();
    expect(saveCache).not.toHaveBeenCalled();
  });

  it('should skip cache load when --refresh flag is set but still save', async () => {
    const exitCode = await runInstallCommand('test-package', {
      refresh: true,
      install: false,
      json: false,
    });

    expect(exitCode).toBe(0);
    expect(loadCache).not.toHaveBeenCalled();
    expect(saveCache).toHaveBeenCalled();
  });

  it('should pass registry option to all service calls', async () => {
    const registry = 'https://custom.registry.com';

    await runInstallCommand('test-package', {
      registry,
      install: false,
      json: false,
    });

    expect(getPackageMetadata).toHaveBeenCalledWith(
      'test-package',
      '1.0.0',
      { registry }
    );
    expect(prepareWorkspace).toHaveBeenCalledWith(
      'test-package',
      '1.0.0',
      { registry }
    );
    expect(analyzePackageSecurity).toHaveBeenCalledWith(
      'test-package',
      '1.0.0',
      expect.objectContaining({ registry })
    );
  });

  it('should cleanup workspace even when analysis fails', async () => {
    const cleanup = vi.fn().mockResolvedValue(undefined);
    vi.mocked(prepareWorkspace).mockResolvedValue({
      dir: '/tmp/test',
      lockfile: undefined,
      cleanup,
    });
    vi.mocked(analyzePackageSecurity).mockRejectedValue(new Error('Audit failed'));

    const exitCode = await runInstallCommand('test-package', {
      install: false,
      json: false,
    });

    expect(exitCode).toBe(1);
    expect(cleanup).toHaveBeenCalled();
  });
});
