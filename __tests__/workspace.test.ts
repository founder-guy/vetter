import { describe, it, expect, vi, beforeEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';

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

// Now import the module under test
import { prepareWorkspace } from '../src/services/workspace.js';

describe('prepareWorkspace', () => {
  beforeEach(() => {
    execFileMock.mockReset();
    execFileAsyncMock.mockReset();

    // Default: successful install
    execFileAsyncMock.mockImplementation(async (cmd: string, args: string[], options?: any) => {
      if (cmd === 'npm' && args[0] === 'install') {
        // Create mock package-lock.json
        const lockfile = {
          name: 'temp-workspace',
          version: '1.0.0',
          lockfileVersion: 3,
          packages: {
            '': {},
            'node_modules/test-dep-1': {},
            'node_modules/test-dep-2': {},
          },
        };
        await fs.writeFile(
          join(options.cwd, 'package-lock.json'),
          JSON.stringify(lockfile, null, 2)
        );
        return { stdout: '', stderr: '' };
      }
      return { stdout: '', stderr: '' };
    });
  });

  it('should create workspace and return parsed lockfile on success', async () => {
    const workspace = await prepareWorkspace('test-package', '1.0.0');

    expect(workspace).toHaveProperty('dir');
    expect(workspace).toHaveProperty('cleanup');
    expect(workspace).toHaveProperty('lockfile');
    expect(workspace.lockfile).toBeDefined();
    expect(workspace.lockfile?.packages).toBeDefined();
    expect(Object.keys(workspace.lockfile!.packages)).toHaveLength(3);
    expect(workspace.installError).toBeUndefined();

    // Verify temp dir exists
    await expect(fs.access(workspace.dir)).resolves.toBeUndefined();

    // Cleanup
    await workspace.cleanup();

    // Verify cleanup removed directory
    await expect(fs.access(workspace.dir)).rejects.toThrow();
  });

  it('should return installError when npm install fails', async () => {
    // Mock install failure
    execFileAsyncMock.mockRejectedValueOnce(new Error('Network error: ENOTFOUND'));

    const workspace = await prepareWorkspace('nonexistent-package', '999.999.999');

    expect(workspace).toHaveProperty('dir');
    expect(workspace).toHaveProperty('cleanup');
    expect(workspace.lockfile).toBeUndefined();
    expect(workspace.installError).toContain('Network error');

    // Cleanup should still work
    await workspace.cleanup();
  });

  it('should return installError when lockfile parsing fails', async () => {
    // Mock successful install but create invalid JSON
    execFileAsyncMock.mockImplementationOnce(async (cmd: string, args: string[], options?: any) => {
      if (cmd === 'npm' && args[0] === 'install') {
        await fs.writeFile(
          join(options.cwd, 'package-lock.json'),
          'invalid json {{{' // Malformed JSON
        );
        return { stdout: '', stderr: '' };
      }
      return { stdout: '', stderr: '' };
    });

    const workspace = await prepareWorkspace('test-package', '1.0.0');

    expect(workspace.lockfile).toBeUndefined();
    expect(workspace.installError).toMatch(/Failed to parse package-lock\.json/);

    // Cleanup
    await workspace.cleanup();
  });

  it('should handle cleanup gracefully when directory already removed', async () => {
    const workspace = await prepareWorkspace('test-package', '1.0.0');

    // Manually remove directory
    await fs.rm(workspace.dir, { recursive: true, force: true });

    // Cleanup should not throw (ignores errors)
    await expect(workspace.cleanup()).resolves.toBeUndefined();
  });

  it('should create minimal package.json with correct dependencies', async () => {
    const workspace = await prepareWorkspace('@babel/core', '7.23.0');

    const pkgJsonPath = join(workspace.dir, 'package.json');
    const pkgJsonContent = await fs.readFile(pkgJsonPath, 'utf-8');
    const pkgJson = JSON.parse(pkgJsonContent);

    expect(pkgJson.name).toBe('temp-workspace');
    expect(pkgJson.version).toBe('1.0.0');
    expect(pkgJson.dependencies).toEqual({ '@babel/core': '7.23.0' });

    // Cleanup
    await workspace.cleanup();
  });

  it('should preserve directory structure for audit when install fails', async () => {
    // Mock install failure
    execFileAsyncMock.mockRejectedValueOnce(new Error('Registry timeout'));

    const workspace = await prepareWorkspace('test-package', '1.0.0');

    // Directory should still exist for audit
    await expect(fs.access(workspace.dir)).resolves.toBeUndefined();

    // package.json should still exist
    const pkgJsonPath = join(workspace.dir, 'package.json');
    await expect(fs.access(pkgJsonPath)).resolves.toBeUndefined();

    // Cleanup
    await workspace.cleanup();
  });
});
