import ora, { Ora } from 'ora';

/**
 * Success message configuration for spinner
 */
export type SpinnerSuccessMessage =
  | string
  | {
      text: string;
      symbol?: 'succeed' | 'warn' | 'info';
    };

/**
 * Options for withSpinner utility
 */
export interface WithSpinnerOptions<T> {
  /**
   * Success message (static string or result-dependent callback)
   * @default Same as loading message
   */
  successMessage?: string | ((result: T) => SpinnerSuccessMessage);

  /**
   * Failure message (static string)
   * @default "{loadingMessage} failed"
   */
  failureMessage?: string;
}

/**
 * Wraps an async operation with spinner loading/success/failure states.
 *
 * **Benefits:**
 * - Eliminates repetitive try/catch/spinner boilerplate
 * - Centralizes spinner behavior (DRY principle)
 * - Supports result-dependent success messages (e.g., audit warnings)
 * - Automatically handles spinner null checks
 *
 * **Usage:**
 * ```typescript
 * // Simple case (metadata fetch)
 * const metadata = await withSpinner(
 *   showSpinners,
 *   'Fetching metadata...',
 *   () => getPackageMetadata(name, version)
 * );
 *
 * // Custom messages
 * const workspace = await withSpinner(
 *   showSpinners,
 *   'Preparing workspace...',
 *   () => prepareWorkspace(name, version),
 *   {
 *     successMessage: 'Workspace prepared',
 *     failureMessage: 'Failed to prepare workspace'
 *   }
 * );
 *
 * // Result-dependent message (audit)
 * const audit = await withSpinner(
 *   showSpinners,
 *   'Running security audit...',
 *   () => analyzePackageSecurity(name, version),
 *   {
 *     successMessage: (result) => {
 *       if (result.status === 'clean') {
 *         return 'Security audit complete - no vulnerabilities';
 *       }
 *       if (result.status === 'vulnerable') {
 *         return {
 *           text: `Security audit found ${result.vulnerabilities.total} vulnerabilities`,
 *           symbol: 'warn'
 *         };
 *       }
 *       return { text: 'Security audit status unknown', symbol: 'info' };
 *     }
 *   }
 * );
 * ```
 *
 * @param enabled - Whether to show spinner (false for --json mode)
 * @param loadingMessage - Message to display while operation runs
 * @param operation - Async operation to execute
 * @param options - Success/failure message overrides
 * @returns Result of the operation
 * @throws Re-throws any error from operation after failing spinner
 */
export async function withSpinner<T>(
  enabled: boolean,
  loadingMessage: string,
  operation: () => Promise<T>,
  options?: WithSpinnerOptions<T>
): Promise<T> {
  const spinner: Ora | null = enabled ? ora(loadingMessage).start() : null;

  try {
    const result = await operation();

    if (spinner) {
      // Determine success message
      let successMsg: SpinnerSuccessMessage = loadingMessage;
      if (options?.successMessage) {
        successMsg =
          typeof options.successMessage === 'function'
            ? options.successMessage(result)
            : options.successMessage;
      }

      // Apply success message with appropriate symbol
      if (typeof successMsg === 'string') {
        spinner.succeed(successMsg);
      } else {
        const symbol = successMsg.symbol ?? 'succeed';
        if (symbol === 'succeed') {
          spinner.succeed(successMsg.text);
        } else if (symbol === 'warn') {
          spinner.warn(successMsg.text);
        } else {
          spinner.info(successMsg.text);
        }
      }
    }

    return result;
  } catch (error) {
    if (spinner) {
      const failMsg = options?.failureMessage ?? `${loadingMessage} failed`;
      spinner.fail(failMsg);
    }
    throw error;
  }
}
