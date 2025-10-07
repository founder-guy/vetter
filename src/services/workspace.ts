import { rm } from 'node:fs/promises';
import type { Workspace } from '../types.js';
import { createTempWorkspace } from './npm-workspace.js';
import { NPM_INSTALL_TIMEOUT } from '../constants.js';

/**
 * Prepare a temporary workspace for package analysis.
 *
 * Creates a temp directory, writes a minimal package.json, and runs
 * `npm install --package-lock-only` to generate the lockfile and dependency tree.
 *
 * **Lifecycle:**
 * - Caller owns cleanup: MUST call `workspace.cleanup()` in a finally block
 * - Returns even if install fails (sets `installError` but provides dir for audit)
 * - Lockfile parsing errors are treated as install failures
 *
 * **Usage:**
 * ```typescript
 * let workspace: Workspace | null = null;
 * try {
 *   workspace = await prepareWorkspace('lodash', '4.17.21');
 *   // Use workspace.dir, workspace.lockfile
 * } finally {
 *   if (workspace) await workspace.cleanup();
 * }
 * ```
 *
 * @param packageName - Package name (e.g., 'lodash' or '@babel/core')
 * @param version - Version to install (e.g., '4.17.21' or 'latest')
 * @param options - Optional registry configuration
 * @returns Workspace with dir, optional lockfile, cleanup function, optional installError
 */
export async function prepareWorkspace(
  packageName: string,
  version: string,
  options?: import('../types.js').RegistryOptions
): Promise<Workspace> {
  // Use shared helper to create workspace
  const { dir, lockfile, installError } = await createTempWorkspace(
    packageName,
    version,
    {
      workspaceName: 'workspace',
      registry: options?.registry,
      timeout: NPM_INSTALL_TIMEOUT,
    }
  );

  // Cleanup function (ignores errors per current pattern)
  const cleanup = async () => {
    try {
      await rm(dir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  };

  return {
    dir,
    lockfile,
    cleanup,
    installError,
  };
}
