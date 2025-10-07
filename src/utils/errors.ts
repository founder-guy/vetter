/**
 * Extract error message from unknown error value
 *
 * @param error - Error value (could be Error, string, or anything)
 * @returns Error message string
 */
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
