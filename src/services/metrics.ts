import type { PackageSnapshot, PackageMetrics, PackageLockfileData } from '../types.js';
import { createTempWorkspace } from './npm-workspace.js';
import { getErrorMessage } from '../utils/errors.js';
import { NPM_INSTALL_TIMEOUT } from '../constants.js';
import { cleanupTempDir } from '../utils/cleanup.js';

/**
 * Count total transitive dependencies from package-lock.json
 * Returns -1 if counting fails (to distinguish from 0 dependencies)
 *
 * **Workspace Handling:**
 * - If `lockfile` is provided, uses it directly (fast path - CLI always provides this)
 * - If parsing fails or no lockfile provided, falls back to creating temporary workspace
 * - Fallback uses shared helper for consistency (only occurs in standalone test usage)
 *
 * **Note:** In CLI flow, shared workspace is always provided, so fallback rarely executes.
 * The fallback lockfile is used internally but not exposed to caller.
 *
 * @param packageName - Package name
 * @param version - Package version
 * @param lockfile - Optional pre-parsed lockfile (from shared workspace)
 * @param options - Optional registry configuration
 * @returns Number of dependencies, or -1 on failure
 */
async function countDependencies(
  packageName: string,
  version: string,
  lockfile?: PackageLockfileData,
  options?: import('../types.js').RegistryOptions
): Promise<number> {
  // If lockfile provided, use it directly
  if (lockfile) {
    try {
      const packages = lockfile.packages || {};
      const nodeModulesCount = Object.keys(packages).filter(
        (key) => key.startsWith('node_modules/')
      ).length;
      return nodeModulesCount;
    } catch (error) {
      // Fallback to temp workspace if parsing fails
      console.warn('Could not parse provided lockfile, falling back to temp workspace');
    }
  }

  // Fallback: create temp workspace using shared helper
  let tempDir: string | null = null;

  try {
    const result = await createTempWorkspace(packageName, version, {
      workspaceName: 'deps',
      registry: options?.registry,
      timeout: NPM_INSTALL_TIMEOUT,
    });

    tempDir = result.dir;

    // Check for install errors
    if (result.installError) {
      console.warn('Could not count dependencies:', result.installError);
      return -1;
    }

    // Use parsed lockfile from helper (this fixes the limitation!)
    if (result.lockfile) {
      const packages = result.lockfile.packages || {};
      const nodeModulesCount = Object.keys(packages).filter(
        (key) => key.startsWith('node_modules/')
      ).length;
      return nodeModulesCount;
    }

    // Lockfile unavailable even though install succeeded
    console.warn('Could not count dependencies: lockfile unavailable');
    return -1;
  } catch (error) {
    // Return -1 to indicate failure (distinguishes from 0 dependencies)
    console.warn('Could not count dependencies:', getErrorMessage(error));
    return -1;
  } finally {
    // Cleanup temp directory
    await cleanupTempDir(tempDir);
  }
}

/**
 * Calculate package metrics
 *
 * @param pkg - Package snapshot from registry
 * @param options - Optional workspace with pre-parsed lockfile
 * @returns Package metrics including dependency counts
 */
export async function calculateMetrics(
  pkg: PackageSnapshot,
  options?: import('../types.js').MetricsCalculationOptions
): Promise<PackageMetrics> {
  const now = new Date();
  const daysSincePublish = Math.floor(
    (now.getTime() - pkg.publishedAt.getTime()) / (1000 * 60 * 60 * 24)
  );

  const maintainerCount = pkg.maintainers.length;
  const directDependencyCount = Object.keys(pkg.dependencies).length;

  // Count total dependencies (transitive)
  // Pass lockfile from workspace if available
  const totalDependencyCount = await countDependencies(
    pkg.name,
    pkg.version,
    options?.workspace?.lockfile,
    options
  );

  // Calculate approximate size in MB
  const approximateSizeMB = pkg.unpackedSize ? pkg.unpackedSize / (1024 * 1024) : 0;

  return {
    daysSincePublish,
    maintainerCount,
    directDependencyCount,
    totalDependencyCount,
    approximateSizeMB,
  };
}
