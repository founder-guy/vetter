import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PackageSnapshot, PackageMetrics } from '../types.js';

const execFileAsync = promisify(execFile);

/**
 * Count total transitive dependencies from package-lock.json
 * Returns -1 if counting fails (to distinguish from 0 dependencies)
 */
async function countDependencies(packageName: string, version: string): Promise<number> {
  let tempDir: string | null = null;

  try {
    tempDir = await mkdtemp(join(tmpdir(), 'vetter-deps-'));

    const pkgJson = {
      name: 'temp-deps-check',
      version: '1.0.0',
      dependencies: {
        [packageName]: version,
      },
    };
    await writeFile(join(tempDir, 'package.json'), JSON.stringify(pkgJson, null, 2));

    // Generate package-lock.json
    await execFileAsync(
      'npm',
      ['install', '--package-lock-only', '--ignore-scripts', '--no-audit'],
      {
        cwd: tempDir,
        timeout: 60000,
      }
    );

    // Read and parse package-lock.json
    const lockContent = await readFile(join(tempDir, 'package-lock.json'), 'utf-8');
    const lockData = JSON.parse(lockContent);

    // Count packages in node_modules (excludes root package)
    const packages = lockData.packages || {};
    const nodeModulesCount = Object.keys(packages).filter(
      (key) => key.startsWith('node_modules/')
    ).length;

    return nodeModulesCount;
  } catch (error) {
    // Return -1 to indicate failure (distinguishes from 0 dependencies)
    console.warn('Could not count dependencies:', (error as Error).message);
    return -1;
  } finally {
    if (tempDir) {
      try {
        await rm(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

/**
 * Calculate package metrics
 */
export async function calculateMetrics(pkg: PackageSnapshot): Promise<PackageMetrics> {
  const now = new Date();
  const daysSincePublish = Math.floor(
    (now.getTime() - pkg.publishedAt.getTime()) / (1000 * 60 * 60 * 24)
  );

  const maintainerCount = pkg.maintainers.length;
  const directDependencyCount = Object.keys(pkg.dependencies).length;

  // Count total dependencies (transitive)
  const totalDependencyCount = await countDependencies(pkg.name, pkg.version);

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
