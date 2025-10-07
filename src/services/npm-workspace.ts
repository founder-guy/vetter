import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PackageLockfileData } from '../types.js';
import { getErrorMessage } from '../utils/errors.js';
import { NPM_INSTALL_TIMEOUT } from '../constants.js';

const execFileAsync = promisify(execFile);

/**
 * Result from creating a temporary workspace
 */
export interface TempWorkspaceResult {
  /** Absolute path to temporary directory */
  dir: string;
  /** Parsed package-lock.json if npm install succeeded */
  lockfile?: PackageLockfileData;
  /** Error message if npm install or lockfile parsing failed */
  installError?: string;
}

/**
 * Options for creating a temporary workspace
 */
export interface TempWorkspaceOptions {
  /** Name suffix for temp directory (e.g., 'audit' → 'vetter-audit-xyz') */
  workspaceName?: string;
  /** Custom npm registry URL */
  registry?: string;
  /** npm install timeout in milliseconds (default: NPM_INSTALL_TIMEOUT) */
  timeout?: number;
}

/**
 * Create a temporary workspace with package-lock.json generation.
 *
 * **Purpose:**
 * Consolidates duplicate workspace creation logic from workspace.ts, security.ts,
 * and metrics.ts into a single, well-tested implementation.
 *
 * **Contract:**
 * - **Never throws** for npm install or lockfile parsing failures
 * - Install/parse errors are captured in `installError` field
 * - **Can throw** for filesystem errors (mkdtemp, writeFile) - these are rare
 * - Returns partial results when possible (dir always available, lockfile optional)
 *
 * **Caller Responsibilities:**
 * - MUST clean up returned `dir` via `rm(dir, { recursive: true, force: true })`
 * - Should check `installError` before using `lockfile`
 *
 * **Example Usage:**
 * ```typescript
 * const { dir, lockfile, installError } = await createTempWorkspace(
 *   'lodash',
 *   '4.17.21',
 *   { workspaceName: 'audit', registry: 'https://registry.npmjs.org' }
 * );
 *
 * try {
 *   if (installError) {
 *     console.warn('Install failed:', installError);
 *   }
 *   if (lockfile) {
 *     // Use lockfile for analysis
 *   }
 * } finally {
 *   await rm(dir, { recursive: true, force: true });
 * }
 * ```
 *
 * @param packageName - Package name (e.g., 'lodash' or '@babel/core')
 * @param version - Version specifier (e.g., '4.17.21', 'latest', '^1.0.0')
 * @param options - Optional configuration (workspace name, registry, timeout)
 * @returns Workspace result with directory, optional lockfile, optional error
 * @throws Only for filesystem errors (mkdtemp, writeFile) - NOT for npm failures
 */
export async function createTempWorkspace(
  packageName: string,
  version: string,
  options?: TempWorkspaceOptions
): Promise<TempWorkspaceResult> {
  const workspaceName = options?.workspaceName ?? 'workspace';

  // Create temp directory (can throw - rare filesystem error)
  const tmpDir = await mkdtemp(join(tmpdir(), `vetter-${workspaceName}-`));

  // Create minimal package.json (can throw - rare filesystem error)
  const pkgJson = {
    name: `temp-${workspaceName}`,
    version: '1.0.0',
    dependencies: {
      [packageName]: version,
    },
  };
  await writeFile(join(tmpDir, 'package.json'), JSON.stringify(pkgJson, null, 2));

  // Build npm install arguments
  const npmArgs = ['install', '--package-lock-only', '--ignore-scripts', '--no-audit'];

  // Add registry flag if provided (trim to handle whitespace)
  if (options?.registry?.trim()) {
    npmArgs.push('--registry', options.registry.trim());
  }

  let installError: string | undefined;
  let lockfile: PackageLockfileData | undefined;

  // Run npm install (errors caught and stored, not thrown)
  try {
    await execFileAsync('npm', npmArgs, {
      cwd: tmpDir,
      timeout: options?.timeout ?? NPM_INSTALL_TIMEOUT,
    });

    // Parse lockfile (errors caught and stored)
    try {
      const lockfilePath = join(tmpDir, 'package-lock.json');
      const lockContent = await readFile(lockfilePath, 'utf-8');
      lockfile = JSON.parse(lockContent) as PackageLockfileData;
    } catch (parseError) {
      // Lockfile missing or invalid JSON
      installError = `Failed to parse package-lock.json: ${getErrorMessage(parseError)}`;
    }
  } catch (error) {
    // npm install failed (network, registry, timeout, etc.)
    installError = getErrorMessage(error);
  }

  return {
    dir: tmpDir,
    lockfile,
    installError,
  };
}
