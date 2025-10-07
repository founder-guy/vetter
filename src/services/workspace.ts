import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Workspace, PackageLockfileData } from '../types.js';

const execFileAsync = promisify(execFile);

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
  // Create temp directory
  const tmpDir = await mkdtemp(join(tmpdir(), 'vetter-'));

  // Create minimal package.json
  const pkgJson = {
    name: 'temp-workspace',
    version: '1.0.0',
    dependencies: {
      [packageName]: version,
    },
  };
  await writeFile(join(tmpDir, 'package.json'), JSON.stringify(pkgJson, null, 2));

  // Cleanup function (ignores errors per current pattern)
  const cleanup = async () => {
    try {
      await rm(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  };

  // Run npm install --package-lock-only
  let installError: string | undefined;
  let lockfile: PackageLockfileData | undefined;

  try {
    const npmArgs = ['install', '--package-lock-only', '--ignore-scripts', '--no-audit'];

    // Conditionally append --registry flag
    if (options?.registry?.trim()) {
      npmArgs.push('--registry', options.registry.trim());
    }

    await execFileAsync('npm', npmArgs, {
      cwd: tmpDir,
      timeout: 60000, // 60s timeout (matches current services)
    });

    // Try to parse lockfile (only if it exists)
    try {
      const lockfilePath = join(tmpDir, 'package-lock.json');
      await access(lockfilePath); // Check if file exists
      const lockContent = await readFile(lockfilePath, 'utf-8');
      lockfile = JSON.parse(lockContent) as PackageLockfileData;
    } catch (parseError) {
      // Lockfile missing or invalid JSON → treat as install failure
      const message = parseError instanceof Error ? parseError.message : String(parseError);
      installError = `Failed to parse package-lock.json: ${message}`;
    }
  } catch (error: unknown) {
    // Install failed (network error, registry issue, etc.)
    // Still return workspace so audit can run (matches current behavior)
    const message = error instanceof Error ? error.message : String(error);
    installError = message;
  }

  return {
    dir: tmpDir,
    lockfile,
    cleanup,
    installError,
  };
}
