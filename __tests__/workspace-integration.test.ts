import { describe, it, expect, vi, beforeEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import type { PackageSnapshot } from '../src/types.js';

// Hoist shared mocks
const { execFileMock, execFileAsyncMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
  execFileAsyncMock: vi.fn(),
}));

// Mock node:child_process
vi.mock('node:child_process', () => ({
  execFile: execFileMock,
}));

// Mock node:util to intercept promisify
vi.mock('node:util', async () => {
  const actual = await vi.importActual<typeof import('node:util')>('node:util');
  return {
    ...actual,
    promisify(fn: unknown) {
      if (fn === execFileMock) return execFileAsyncMock;
      return actual.promisify(fn as any);
    },
  };
});

// Import modules under test
import { prepareWorkspace } from '../src/services/workspace.js';
import { analyzePackageSecurity } from '../src/services/security.js';
import { calculateMetrics } from '../src/services/metrics.js';

describe('Shared Workspace Integration', () => {
  const mockPackage: PackageSnapshot = {
    name: 'test-package',
    version: '1.0.0',
    publishedAt: new Date('2024-01-01'),
    maintainers: ['test@example.com'],
    dependencies: { 'dep-1': '^1.0.0' },
    devDependencies: {},
    unpackedSize: 100000,
    description: 'Test package',
    license: 'MIT',
  };

  beforeEach(() => {
    execFileMock.mockReset();
    execFileAsyncMock.mockReset();

    // Default: successful install and audit
    execFileAsyncMock.mockImplementation(async (cmd: string, args: string[], options?: any) => {
      if (cmd === 'npm' && args[0] === 'install') {
        const lockfile = {
          packages: {
            '': {},
            'node_modules/dep-1': {},
            'node_modules/dep-2': {},
            'node_modules/dep-3': {},
          },
        };
        await fs.writeFile(
          join(options.cwd, 'package-lock.json'),
          JSON.stringify(lockfile, null, 2)
        );
        return { stdout: '', stderr: '' };
      }

      if (cmd === 'npm' && args[0] === 'audit') {
        return {
          stdout: JSON.stringify({
            metadata: {
              vulnerabilities: {
                critical: 0,
                high: 0,
                moderate: 0,
                low: 0,
                info: 0,
                total: 0,
              },
            },
          }),
          stderr: '',
        };
      }

      return { stdout: '', stderr: '' };
    });
  });

  it('should calculate same metrics with and without shared workspace', async () => {
    // Without workspace (original behavior)
    const metricsWithoutWorkspace = await calculateMetrics(mockPackage);

    // With shared workspace
    const workspace = await prepareWorkspace(mockPackage.name, mockPackage.version);

    try {
      const metricsWithWorkspace = await calculateMetrics(mockPackage, { workspace });

      // Should produce identical results
      expect(metricsWithWorkspace.totalDependencyCount).toBe(
        metricsWithoutWorkspace.totalDependencyCount
      );
      expect(metricsWithWorkspace.daysSincePublish).toBe(metricsWithoutWorkspace.daysSincePublish);
      expect(metricsWithWorkspace.maintainerCount).toBe(metricsWithoutWorkspace.maintainerCount);
      expect(metricsWithWorkspace.approximateSizeMB).toBe(
        metricsWithoutWorkspace.approximateSizeMB
      );
    } finally {
      await workspace.cleanup();
    }
  });

  it('should run security audit successfully with shared workspace', async () => {
    const workspace = await prepareWorkspace(mockPackage.name, mockPackage.version);

    try {
      const security = await analyzePackageSecurity(mockPackage.name, mockPackage.version, {
        workspace,
      });

      expect(security.status).toBe('clean');
      expect(security.vulnerabilities.total).toBe(0);
    } finally {
      await workspace.cleanup();
    }
  });

  it('should fail fast when workspace install fails (new behavior)', async () => {
    // Mock install failure
    execFileAsyncMock.mockImplementation(async (cmd: string, args: string[], options?: any) => {
      if (cmd === 'npm' && args[0] === 'install') {
        throw new Error('Network timeout');
      }
      return { stdout: '', stderr: '' };
    });

    const workspace = await prepareWorkspace(mockPackage.name, mockPackage.version);
    expect(workspace.installError).toBeDefined();
    expect(workspace.installError).toContain('Network timeout');

    try {
      const security = await analyzePackageSecurity(mockPackage.name, mockPackage.version, {
        workspace,
      });

      // Security should fail fast with unknown status
      expect(security.status).toBe('unknown');
      expect(security.auditError).toBe('Workspace preparation failed: Network timeout');
      expect(security.vulnerabilities.total).toBe(0);
    } finally {
      await workspace.cleanup();
    }
  });

  it('should fallback to temp workspace when lockfile missing from shared workspace', async () => {
    // First call (workspace creation): install fails
    // Second call (metrics fallback): install succeeds
    let callCount = 0;
    execFileAsyncMock.mockImplementation(async (cmd: string, args: string[], options?: any) => {
      if (cmd === 'npm' && args[0] === 'install') {
        callCount++;
        if (callCount === 1) {
          // Workspace install fails
          throw new Error('Registry error');
        } else {
          // Metrics fallback succeeds
          const lockfile = {
            packages: {
              '': {},
              'node_modules/dep-1': {},
              'node_modules/dep-2': {},
            },
          };
          await fs.writeFile(
            join(options.cwd, 'package-lock.json'),
            JSON.stringify(lockfile, null, 2)
          );
          return { stdout: '', stderr: '' };
        }
      }
      return { stdout: '', stderr: '' };
    });

    const workspace = await prepareWorkspace(mockPackage.name, mockPackage.version);
    expect(workspace.lockfile).toBeUndefined();

    try {
      const metrics = await calculateMetrics(mockPackage, { workspace });

      // Should fallback and succeed
      expect(metrics.totalDependencyCount).toBe(2); // From fallback install
      expect(callCount).toBe(2); // Workspace install + fallback install
    } finally {
      await workspace.cleanup();
    }
  });

  it('should reuse workspace directory for both security and metrics', async () => {
    let installCallCount = 0;
    execFileAsyncMock.mockImplementation(async (cmd: string, args: string[], options?: any) => {
      if (cmd === 'npm' && args[0] === 'install') {
        installCallCount++;
        const lockfile = {
          packages: {
            '': {},
            'node_modules/dep-1': {},
          },
        };
        await fs.writeFile(
          join(options.cwd, 'package-lock.json'),
          JSON.stringify(lockfile, null, 2)
        );
        return { stdout: '', stderr: '' };
      }
      if (cmd === 'npm' && args[0] === 'audit') {
        return {
          stdout: JSON.stringify({
            metadata: {
              vulnerabilities: {
                critical: 0,
                high: 0,
                moderate: 0,
                low: 0,
                info: 0,
                total: 0,
              },
            },
          }),
          stderr: '',
        };
      }
      return { stdout: '', stderr: '' };
    });

    const workspace = await prepareWorkspace(mockPackage.name, mockPackage.version);

    try {
      await analyzePackageSecurity(mockPackage.name, mockPackage.version, { workspace });
      await calculateMetrics(mockPackage, { workspace });

      // Should only install once (in prepareWorkspace)
      expect(installCallCount).toBe(1);
    } finally {
      await workspace.cleanup();
    }
  });
});
