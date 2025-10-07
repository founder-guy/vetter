import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { SecurityAnalysis, VulnerabilitySummary, SecurityAnalysisOptions } from '../types.js';
import { AuditResponseSchema } from '../types.js';
import { createTempWorkspace } from './npm-workspace.js';
import { getErrorMessage } from '../utils/errors.js';
import { NPM_INSTALL_TIMEOUT, NPM_AUDIT_TIMEOUT } from '../constants.js';
import { cleanupTempDir } from '../utils/cleanup.js';

const execFileAsync = promisify(execFile);

/**
 * Empty vulnerability summary (used when no vulnerabilities found or audit fails)
 */
const EMPTY_VULNERABILITIES: VulnerabilitySummary = {
  critical: 0,
  high: 0,
  moderate: 0,
  low: 0,
  info: 0,
  total: 0,
};

/**
 * Run npm audit in a temporary workspace
 *
 * **Workspace Handling:**
 * - If `options.workspace` is provided, uses shared workspace directory for audit
 * - If shared workspace has `installError`, returns unknown status immediately (fail-fast)
 * - If no workspace provided, creates temporary workspace as fallback
 *
 * **Error Contract:**
 * - Returns `status: 'unknown'` when workspace preparation or audit fails
 * - Check `auditError` field for failure details
 * - Never throws (errors are captured in return value)
 *
 * @param packageName - Package name to audit
 * @param version - Package version to audit
 * @param options - Optional workspace to reuse and registry configuration
 * @returns Security analysis with vulnerability summary (status: clean | vulnerable | unknown)
 */
export async function analyzePackageSecurity(
  packageName: string,
  version: string,
  options?: SecurityAnalysisOptions
): Promise<SecurityAnalysis> {
  // If workspace provided, use it; otherwise create temp workspace
  const useSharedWorkspace = !!options?.workspace;
  let tempDir: string | null = useSharedWorkspace ? options.workspace!.dir : null;

  try {
    // Fail fast if shared workspace preparation failed
    if (useSharedWorkspace && options.workspace!.installError) {
      return {
        status: 'unknown',
        vulnerabilities: EMPTY_VULNERABILITIES,
        auditError: `Workspace preparation failed: ${options.workspace!.installError}`,
      };
    }

    // Fallback: create temporary workspace if not provided
    if (!useSharedWorkspace) {
      const result = await createTempWorkspace(packageName, version, {
        workspaceName: 'audit',
        registry: options?.registry,
        timeout: NPM_INSTALL_TIMEOUT,
      });

      tempDir = result.dir;

      // Warn about install failures but continue (audit might still work)
      if (result.installError) {
        console.warn('Install warning:', result.installError);
      }
    }

    // Run npm audit
    try {
      const auditArgs = ['audit', '--json'];

      // Conditionally append --registry flag
      if (options?.registry?.trim()) {
        auditArgs.push('--registry', options.registry.trim());
      }

      const { stdout } = await execFileAsync('npm', auditArgs, {
        cwd: tempDir,
        timeout: NPM_AUDIT_TIMEOUT,
      });

      const auditData = JSON.parse(stdout);
      const parsed = AuditResponseSchema.parse(auditData);

      const vulnerabilities: VulnerabilitySummary =
        parsed.metadata?.vulnerabilities || EMPTY_VULNERABILITIES;

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
            parsed.metadata?.vulnerabilities || EMPTY_VULNERABILITIES;

          return {
            status: vulnerabilities.total > 0 ? 'vulnerable' : 'clean',
            vulnerabilities,
          };
        } catch {
          // Fall through to unknown status
        }
      }

      // Audit failed or unsupported
      return {
        status: 'unknown',
        vulnerabilities: EMPTY_VULNERABILITIES,
        auditError: getErrorMessage(auditError),
      };
    }
  } catch (error: unknown) {
    return {
      status: 'unknown',
      vulnerabilities: EMPTY_VULNERABILITIES,
      auditError: getErrorMessage(error),
    };
  } finally {
    // Cleanup temp directory (only if we created it, not if using shared workspace)
    if (!useSharedWorkspace) {
      await cleanupTempDir(tempDir);
    }
  }
}
