import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir, tmpdir } from 'os';
import type { AnalysisResult } from './types.js';
import { getErrorMessage } from './utils/errors.js';

// Constants
const CACHE_VERSION = 3; // Bumped for dependencyBreakdown field addition
const DEFAULT_TTL = 604800; // 7 days in seconds
const SIZE_WARNING_THRESHOLD = 1024 * 1024; // 1MB
const MAX_CACHE_SIZE = 50 * 1024 * 1024; // 50MB

// Cache entry structure
export interface CacheEntry {
  cacheVersion: number;
  cachedAt: string;
  ttl: number;
  package: string;
  publishedAt: string;
  analysis: AnalysisResult;
}

export interface CacheLoadResult {
  analysis: AnalysisResult;
  cacheAgeSeconds: number;
}

/**
 * Resolves the cache directory path, respecting environment variables and platform defaults.
 */
export function getCacheDir(): string {
  // Priority order:
  // 1. VETTER_CACHE_DIR
  // 2. XDG_CACHE_HOME/vetter (Linux/macOS)
  // 3. LOCALAPPDATA/vetter (Windows)
  // 4. ~/.cache/vetter (fallback)
  // 5. /tmp/vetter (emergency)

  if (process.env.VETTER_CACHE_DIR) {
    return join(process.env.VETTER_CACHE_DIR, 'entries');
  }

  if (process.env.XDG_CACHE_HOME) {
    return join(process.env.XDG_CACHE_HOME, 'vetter', 'entries');
  }

  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    return join(process.env.LOCALAPPDATA, 'vetter', 'entries');
  }

  try {
    const home = homedir();
    return join(home, '.cache', 'vetter', 'entries');
  } catch {
    // Emergency fallback if homedir() fails
    return join(tmpdir(), 'vetter', 'entries');
  }
}

/**
 * Generates a SHA-1 hash for the cache key from package name and version.
 */
function generateCacheKey(packageName: string, version: string): string {
  // Normalize: lowercase package name, exact version
  const normalized = `${packageName.toLowerCase()}@${version}`;
  return createHash('sha1').update(normalized).digest('hex');
}

/**
 * Gets the full path to a cache file for a given package and version.
 */
function getCachePath(packageName: string, version: string): string {
  const key = generateCacheKey(packageName, version);
  return join(getCacheDir(), `${key}.json`);
}

/**
 * Ensures the cache directory exists, creating it if necessary.
 */
async function ensureCacheDir(): Promise<void> {
  const cacheDir = getCacheDir();
  try {
    await fs.mkdir(cacheDir, { recursive: true, mode: 0o755 });
  } catch (error) {
    // Log to stderr but don't fail - graceful degradation
    console.error(`[vetter] Warning: Failed to create cache directory: ${getErrorMessage(error)}`);
  }
}

/**
 * Validates a cache entry against current metadata and TTL rules.
 */
function validateEntry(entry: CacheEntry, publishedAt: string): boolean {
  // Check cache version
  if (entry.cacheVersion !== CACHE_VERSION) {
    return false;
  }

  // Check publish date (package may have been republished)
  if (entry.publishedAt !== publishedAt) {
    return false;
  }

  // Check TTL
  const cachedAtTime = Date.parse(entry.cachedAt);
  if (Number.isNaN(cachedAtTime)) {
    return false;
  }

  // Validate TTL is a finite positive number
  if (typeof entry.ttl !== 'number' || !Number.isFinite(entry.ttl) || entry.ttl <= 0) {
    return false;
  }

  const now = Date.now();
  const ageSeconds = (now - cachedAtTime) / 1000;

  if (ageSeconds > entry.ttl) {
    return false;
  }

  return true;
}

/**
 * Loads a cached analysis result for a package, if available and valid.
 * Returns null if cache miss, invalid, or expired.
 */
export async function loadCache(
  packageName: string,
  version: string,
  publishedAt: string
): Promise<CacheLoadResult | null> {
  try {
    const cachePath = getCachePath(packageName, version);
    const data = await fs.readFile(cachePath, 'utf-8');
    const entry: CacheEntry = JSON.parse(data);

    // Validate entry
    if (!validateEntry(entry, publishedAt)) {
      return null;
    }

    // Reconstruct Date object from serialized string
    if (entry.analysis.package.publishedAt) {
      entry.analysis.package.publishedAt = new Date(entry.analysis.package.publishedAt);
    }

    // Calculate cache age
    const cachedAtTime = Date.parse(entry.cachedAt);
    const now = Date.now();
    const cacheAgeSeconds = Math.floor((now - cachedAtTime) / 1000);

    return {
      analysis: entry.analysis,
      cacheAgeSeconds,
    };
  } catch {
    // Any error (file not found, parse error, etc.) = cache miss
    return null;
  }
}

/**
 * Saves an analysis result to the cache.
 * Failures are logged to stderr but do not throw (graceful degradation).
 */
export async function saveCache(
  packageName: string,
  version: string,
  publishedAt: string,
  analysis: AnalysisResult
): Promise<void> {
  try {
    await ensureCacheDir();

    const entry: CacheEntry = {
      cacheVersion: CACHE_VERSION,
      cachedAt: new Date().toISOString(),
      ttl: DEFAULT_TTL,
      package: `${packageName}@${version}`,
      publishedAt,
      analysis,
    };

    const serialized = JSON.stringify(entry);

    // Log warning if entry is large
    const byteSize = Buffer.byteLength(serialized, 'utf-8');
    if (byteSize > SIZE_WARNING_THRESHOLD) {
      console.error(`[vetter] Warning: Cache entry for ${packageName}@${version} is ${Math.round(byteSize / 1024)}KB`);
    }

    const cachePath = getCachePath(packageName, version);
    const tmpPath = `${cachePath}.${process.pid}.tmp`;

    // Atomic write: write to temp file, then rename
    await fs.writeFile(tmpPath, serialized, 'utf-8');

    try {
      await fs.rename(tmpPath, cachePath);
    } catch {
      // Rename failed, try one more time (Windows NTFS sometimes fails on first try)
      try {
        // Clean up destination if it exists
        await fs.unlink(cachePath).catch(() => {});
        await fs.rename(tmpPath, cachePath);
      } catch (retryError) {
        // Cleanup temp file and log error
        await fs.unlink(tmpPath).catch(() => {});
        throw retryError;
      }
    }

    // Check cache size and prune if necessary
    await pruneIfOversized();
  } catch (error) {
    // Log to stderr but don't fail the analysis
    console.error(`[vetter] Warning: Failed to save cache: ${getErrorMessage(error)}`);
  }
}

/**
 * Calculates total cache size and retrieves file stats in a single pass.
 * Uses parallel I/O for better performance with large caches.
 *
 * @returns Object containing total size and array of file stats
 */
async function getCacheSizeAndStats(): Promise<{
  totalSize: number;
  files: Array<{ path: string; mtime: Date; size: number }>;
}> {
  const cacheDir = getCacheDir();

  try {
    const files = await fs.readdir(cacheDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    // Parallelize stat operations for better performance
    const fileStats = await Promise.all(
      jsonFiles.map(async (file) => {
        const filePath = join(cacheDir, file);
        const stats = await fs.stat(filePath);
        return {
          path: filePath,
          mtime: stats.mtime,
          size: stats.size,
        };
      })
    );

    const totalSize = fileStats.reduce((sum, file) => sum + file.size, 0);

    return { totalSize, files: fileStats };
  } catch {
    return { totalSize: 0, files: [] };
  }
}

/**
 * Prunes the oldest cache entries if total size exceeds MAX_CACHE_SIZE.
 * Optimized to use a single directory scan with parallel stat operations.
 */
async function pruneIfOversized(): Promise<void> {
  try {
    const { totalSize, files: fileStats } = await getCacheSizeAndStats();

    if (totalSize <= MAX_CACHE_SIZE) {
      return;
    }

    // Sort by modification time (oldest first)
    fileStats.sort((a, b) => a.mtime.getTime() - b.mtime.getTime());

    // Delete oldest files until we're under the limit
    let currentSize = totalSize;
    let deletedCount = 0;

    for (const file of fileStats) {
      if (currentSize <= MAX_CACHE_SIZE) {
        break;
      }

      try {
        await fs.unlink(file.path);
        currentSize -= file.size;
        deletedCount++;
      } catch {
        // Skip file if unlink fails (locked, permission issue, etc.)
      }
    }

    if (deletedCount > 0) {
      console.error(
        `[vetter] Cache pruned: removed ${deletedCount} old entries (${Math.round((totalSize - currentSize) / 1024)}KB freed)`
      );
    }
  } catch {
    // Ignore pruning errors - not critical
  }
}

/**
 * Clears all cache entries.
 */
export async function clearCache(): Promise<void> {
  const cacheDir = getCacheDir();
  try {
    const files = await fs.readdir(cacheDir);
    await Promise.all(
      files
        .filter((f) => f.endsWith('.json') || f.endsWith('.tmp'))
        .map((f) => fs.unlink(join(cacheDir, f)).catch(() => {}))
    );
  } catch (error) {
    // Swallow missing-directory errors quietly
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === 'ENOENT'
    ) {
      return;
    }

    // Log other errors but don't throw
    console.error(`[vetter] Warning: Failed to clear cache: ${getErrorMessage(error)}`);
  }
}

/**
 * Gets cache information (location, size, entry count).
 */
export async function getCacheInfo(): Promise<{
  path: string;
  sizeMB: number;
  count: number;
}> {
  const cacheDir = getCacheDir();

  try {
    const { totalSize, files } = await getCacheSizeAndStats();

    return {
      path: cacheDir,
      sizeMB: parseFloat((totalSize / (1024 * 1024)).toFixed(2)),
      count: files.length,
    };
  } catch {
    // If directory doesn't exist or can't be read, return zero values
    return {
      path: cacheDir,
      sizeMB: 0,
      count: 0,
    };
  }
}

/**
 * Formats a duration in seconds to a human-readable string.
 * Returns "unknown" for invalid inputs (NaN, Infinity, negative values).
 */
export function formatAge(seconds: number): string {
  // Validate input: reject non-finite or negative values
  if (!Number.isFinite(seconds) || seconds < 0) {
    return 'unknown';
  }

  // Round to nearest whole second (handle decimals)
  const wholeSeconds = Math.floor(seconds);

  const minutes = Math.floor(wholeSeconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return `${wholeSeconds}s`;
}
