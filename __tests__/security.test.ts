import { describe, it, expect, vi, beforeEach } from 'vitest';
import { analyzePackageSecurity } from '../src/services/security.js';

// Track execFileAsync calls for verification
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let execFileCalls: Array<{ file: string; args: string[]; options: any }> = [];

// Mock node:child_process
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

// Mock node:util to override promisify behavior
vi.mock('node:util', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:util')>();
  return {
    ...actual,
    promisify: () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return async (file: string, args: string[], options: any) => {
        execFileCalls.push({ file, args, options });

        // Return appropriate response based on command
        if (args.includes('audit')) {
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
        // install command
        return { stdout: '', stderr: '' };
      };
    },
  };
});

// Mock node:fs/promises
vi.mock('node:fs/promises', () => ({
  mkdtemp: vi.fn().mockResolvedValue('/tmp/vetter-test-123'),
  rm: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue(JSON.stringify({
    name: 'test-package',
    version: '1.0.0',
    lockfileVersion: 3,
    packages: {},
  })),
}));

describe('analyzePackageSecurity', () => {
  beforeEach(() => {
    execFileCalls = [];
  });

  it('should pass --registry flag to npm audit when provided', async () => {
    await analyzePackageSecurity('test-package', '1.0.0', {
      registry: 'https://custom.registry.com',
    });

    // Verify npm audit was called with --registry flag
    expect(execFileCalls.length).toBe(2); // install + audit

    // Check the audit call (second call)
    const auditCall = execFileCalls[1];
    expect(auditCall.file).toBe('npm');
    expect(auditCall.args).toContain('audit');
    expect(auditCall.args).toContain('--registry');
    expect(auditCall.args).toContain('https://custom.registry.com');
  });

  it('should not pass --registry flag to npm audit when not provided', async () => {
    await analyzePackageSecurity('test-package', '1.0.0');

    // Verify npm audit was called without --registry flag
    expect(execFileCalls.length).toBe(2); // install + audit

    // Check the audit call (second call)
    const auditCall = execFileCalls[1];
    expect(auditCall.file).toBe('npm');
    expect(auditCall.args).toContain('audit');
    expect(auditCall.args).not.toContain('--registry');
  });

  it('should use shared workspace when provided', async () => {
    const workspace = {
      dir: '/tmp/shared-workspace',
      lockfile: { name: 'test', version: '1.0.0', lockfileVersion: 3 },
      cleanup: vi.fn(),
    };

    await analyzePackageSecurity('test-package', '1.0.0', {
      workspace,
      registry: 'https://custom.registry.com',
    });

    // Should only call npm audit (not npm install, since workspace is provided)
    expect(execFileCalls.length).toBe(1);

    // Verify audit call has registry flag
    const auditCall = execFileCalls[0];
    expect(auditCall.file).toBe('npm');
    expect(auditCall.args).toContain('audit');
    expect(auditCall.args).toContain('--registry');
    expect(auditCall.args).toContain('https://custom.registry.com');
  });
});
