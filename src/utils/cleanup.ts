import { rm } from 'node:fs/promises';

/**
 * Cleanup a temporary directory, ignoring errors.
 *
 * This utility encapsulates the common pattern of cleaning up temporary
 * workspaces created during package analysis. Errors are silently ignored
 * since cleanup failures are not critical to the analysis flow.
 *
 * @param tempDir - Directory path to cleanup (can be null for convenience)
 *
 * @example
 * ```typescript
 * let tempDir: string | null = null;
 * try {
 *   tempDir = await createTempWorkspace(...);
 *   // Use tempDir
 * } finally {
 *   await cleanupTempDir(tempDir);
 * }
 * ```
 */
export async function cleanupTempDir(tempDir: string | null): Promise<void> {
  if (!tempDir) return;

  try {
    await rm(tempDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors - temp directory cleanup is not critical
    // Errors can occur if:
    // - Directory already deleted
    // - Permission issues
    // - File system errors
  }
}
