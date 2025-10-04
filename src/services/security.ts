import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SecurityAnalysis, VulnerabilitySummary } from '../types.js';
import { AuditResponseSchema } from '../types.js';

const execFileAsync = promisify(execFile);

/**
 * Run npm audit in a temporary workspace
 */
export async function analyzePackageSecurity(
  packageName: string,
  version: string
): Promise<SecurityAnalysis> {
  let tempDir: string | null = null;

  try {
    // Create temp directory
    tempDir = await mkdtemp(join(tmpdir(), 'vetter-'));

    // Create minimal package.json
    const pkgJson = {
      name: 'temp-audit',
      version: '1.0.0',
      dependencies: {
        [packageName]: version,
      },
    };
    await writeFile(join(tempDir, 'package.json'), JSON.stringify(pkgJson, null, 2));

    // Run npm install with --package-lock-only to avoid extracting tarballs
    try {
      await execFileAsync(
        'npm',
        ['install', '--package-lock-only', '--ignore-scripts', '--no-audit'],
        {
          cwd: tempDir,
          timeout: 60000,
        }
      );
    } catch (installError: unknown) {
      // Continue even if install partially fails
      const message = installError instanceof Error ? installError.message : String(installError);
      console.warn('Install warning:', message);
    }

    // Run npm audit
    try {
      const { stdout } = await execFileAsync('npm', ['audit', '--json'], {
        cwd: tempDir,
        timeout: 30000,
      });

      const auditData = JSON.parse(stdout);
      const parsed = AuditResponseSchema.parse(auditData);

      const vulnerabilities: VulnerabilitySummary =
        parsed.metadata?.vulnerabilities || {
          critical: 0,
          high: 0,
          moderate: 0,
          low: 0,
          info: 0,
          total: 0,
        };

      const status =
        vulnerabilities.total > 0
          ? ('vulnerable' as const)
          : ('clean' as const);

      return {
        status,
        vulnerabilities,
      };
    } catch (auditError: unknown) {
      // npm audit returns non-zero exit code when vulnerabilities found
      // Try to parse stdout anyway
      if (
        auditError &&
        typeof auditError === 'object' &&
        'stdout' in auditError &&
        typeof auditError.stdout === 'string'
      ) {
        try {
          const auditData = JSON.parse(auditError.stdout);
          const parsed = AuditResponseSchema.parse(auditData);

          const vulnerabilities: VulnerabilitySummary =
            parsed.metadata?.vulnerabilities || {
              critical: 0,
              high: 0,
              moderate: 0,
              low: 0,
              info: 0,
              total: 0,
            };

          return {
            status: vulnerabilities.total > 0 ? 'vulnerable' : 'clean',
            vulnerabilities,
          };
        } catch {
          // Fall through to unknown status
        }
      }

      // Audit failed or unsupported
      const message = auditError instanceof Error ? auditError.message : String(auditError);
      return {
        status: 'unknown',
        vulnerabilities: {
          critical: 0,
          high: 0,
          moderate: 0,
          low: 0,
          info: 0,
          total: 0,
        },
        auditError: message,
      };
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: 'unknown',
      vulnerabilities: {
        critical: 0,
        high: 0,
        moderate: 0,
        low: 0,
        info: 0,
        total: 0,
      },
      auditError: message,
    };
  } finally {
    // Cleanup temp directory
    if (tempDir) {
      try {
        await rm(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}
