import chalk from 'chalk';
import { parsePackageString, getPackageMetadata } from '../services/npm.js';
import { analyzePackageSecurity } from '../services/security.js';
import { calculateMetrics } from '../services/metrics.js';
import { analyzeLicense } from '../services/license.js';
import { analyzeDependencyBreakdown } from '../services/breakdown.js';
import { detectTyposquatting } from '../services/typosquatting.js';
import { calculateScore } from '../scoring.js';
import { renderTextReport, renderJsonReport, promptInstall } from '../report.js';
import { installPackage } from '../install.js';
import type { AnalysisResult, InstallOptions } from '../types.js';
import { isGradeAtOrBelowThreshold, isValidGrade } from '../grading.js';
import { loadCache, saveCache, formatAge } from '../cache.js';
import { prepareWorkspace } from '../services/workspace.js';
import { getErrorMessage } from '../utils/errors.js';
import { withSpinner } from '../utils/spinner.js';

/**
 * Run the install command: analyze package and optionally install
 *
 * **Exit codes:**
 * - 0: Success (analysis complete, install declined, grade passed threshold)
 * - 1: Failure (invalid input, grade failed threshold, errors)
 * - N: Installation exit code (if user approved install)
 *
 * **Design:**
 * - Pure function (no process.exit calls)
 * - Returns exit code for CLI to handle
 * - Fully testable (can mock all services)
 *
 * @param packageString - Package identifier (e.g., 'lodash', 'lodash@4.17.21')
 * @param options - CLI options (--json, --no-install, --fail-on-grade, etc.)
 * @returns Exit code (0 = success, 1 = failure, other = install exit code)
 */
export async function runInstallCommand(
  packageString: string,
  options: InstallOptions
): Promise<number> {
  // Validate --fail-on-grade option
  if (options.failOnGrade) {
    const normalizedGrade = options.failOnGrade.toUpperCase();
    if (!isValidGrade(normalizedGrade)) {
      console.error(
        chalk.red(
          `\nError: Invalid grade "${options.failOnGrade}". Must be A, B, C, D, E, or F.\n`
        )
      );
      return 1;
    }
    options.failOnGrade = normalizedGrade;
  }

  try {
    // Parse package identifier
    const { name, version } = parsePackageString(packageString);

    // Only show spinners in non-JSON mode
    const showSpinners = !options.json;

    // Fetch metadata (always needed for cache validation)
    const packageSnapshot = await withSpinner(
      showSpinners,
      'Fetching package metadata...',
      () => getPackageMetadata(name, version, { registry: options.registry }),
      {
        successMessage: (pkg) => `Found ${pkg.name}@${pkg.version}`,
        failureMessage: 'Failed to fetch package metadata',
      }
    );

    // Run typosquatting detection (NOT cached, always runs fresh)
    const typosquattingAnalysis = detectTyposquatting(packageSnapshot.name, packageSnapshot);

    // Log warning to stderr for high-confidence matches (non-JSON mode only)
    if (
      !options.json &&
      (typosquattingAnalysis.confidence === 'critical' ||
        typosquattingAnalysis.confidence === 'high')
    ) {
      console.error(chalk.red.bold(`\n⚠️  TYPOSQUATTING RISK: ${typosquattingAnalysis.reason}`));
      if (typosquattingAnalysis.targetPackage) {
        console.error(
          chalk.yellow(
            `   If you meant to install ${typosquattingAnalysis.targetPackage}, run: npm install ${typosquattingAnalysis.targetPackage}\n`
          )
        );
      }
    }

    // Try to load from cache (unless --no-cache or --refresh)
    let result: AnalysisResult | null = null;
    let cacheAgeSeconds = 0;
    let fromCache = false;

    if (options.cache !== false && !options.refresh) {
      const cached = await loadCache(
        packageSnapshot.name,
        packageSnapshot.version,
        packageSnapshot.publishedAt.toISOString()
      );
      if (cached) {
        result = cached.analysis;
        cacheAgeSeconds = cached.cacheAgeSeconds;
        fromCache = true;
        // Log cache hit to stderr
        if (!options.json) {
          console.error(
            chalk.dim(`Using cached analysis (${formatAge(cacheAgeSeconds)} old)`)
          );
        }
      }
    }

    // Run full analysis if cache miss
    if (!result) {
      // Log cache miss to stderr
      if (!options.json && options.cache !== false) {
        console.error(chalk.dim('Cache miss, analyzing...'));
      }

      // Prepare shared workspace (single npm install for both security and metrics)
      const workspace = await withSpinner(
        showSpinners,
        'Preparing workspace...',
        () => prepareWorkspace(packageSnapshot.name, packageSnapshot.version, {
          registry: options.registry,
        }),
        {
          successMessage: 'Workspace prepared',
          failureMessage: 'Failed to prepare workspace',
        }
      );

      try {
        // Run security audit (reuses workspace)
        const securityAnalysis = await withSpinner(
          showSpinners,
          'Running security audit...',
          () =>
            analyzePackageSecurity(packageSnapshot.name, packageSnapshot.version, {
              workspace,
              registry: options.registry,
            }),
          {
            successMessage: (result) => {
              if (result.status === 'clean') {
                return 'Security audit complete - no vulnerabilities';
              }
              if (result.status === 'vulnerable') {
                return {
                  text: `Security audit found ${result.vulnerabilities.total} vulnerabilities`,
                  symbol: 'warn',
                };
              }
              return { text: 'Security audit status unknown', symbol: 'info' };
            },
            failureMessage: 'Security audit failed',
          }
        );

        // Calculate metrics (reuses workspace)
        const metrics = await withSpinner(
          showSpinners,
          'Analyzing package metrics...',
          () =>
            calculateMetrics(packageSnapshot, {
              workspace,
              registry: options.registry,
            }),
          {
            successMessage: 'Package metrics analyzed',
            failureMessage: 'Failed to analyze metrics',
          }
        );

        // Analyze license
        const licenseInfo = analyzeLicense(packageSnapshot.license);

        // Compute dependency breakdown (always computed for caching, even without --deps flag)
        // Performance: ~10ms for typical packages, amortized across cache TTL
        const dependencyBreakdown = workspace?.lockfile
          ? analyzeDependencyBreakdown(workspace.lockfile, packageSnapshot.name)
          : undefined;

        // Calculate score (uses fresh typosquatting analysis, not cached)
        const score = calculateScore(
          securityAnalysis,
          metrics,
          licenseInfo,
          typosquattingAnalysis
        );

        // Build result (typosquatting is NOT included in cached result)
        result = {
          package: packageSnapshot,
          metrics,
          security: securityAnalysis,
          license: licenseInfo,
          score,
          dependencyBreakdown,
        };

        // Save to cache (unless --no-cache)
        if (options.cache !== false) {
          await saveCache(
            packageSnapshot.name,
            packageSnapshot.version,
            packageSnapshot.publishedAt.toISOString(),
            result
          );
        }
      } finally {
        // Cleanup workspace (always runs, even on error)
        if (workspace) {
          await workspace.cleanup();
        }
      }
    }

    // Recompute score with fresh typosquatting analysis (whether from cache or fresh)
    // This ensures typosquatting detection always uses latest logic
    const score = calculateScore(
      result.security,
      result.metrics,
      result.license,
      typosquattingAnalysis
    );

    // Merge typosquatting into result for rendering (but not cached)
    const finalResult = {
      ...result,
      score, // Use freshly computed score with typosquatting
    };

    // Warn about degraded signals in JSON mode (via stderr so it doesn't pollute JSON)
    if (options.json) {
      if (finalResult.metrics.totalDependencyCount === -1) {
        console.error(
          'Warning: Unable to determine dependency count - analysis may be incomplete'
        );
      }
      if (finalResult.security.status === 'unknown') {
        console.error(
          'Warning: Security audit failed - vulnerability status unknown'
        );
      }
    }

    // Render report
    if (options.json) {
      console.log(
        renderJsonReport(
          finalResult,
          typosquattingAnalysis,
          fromCache,
          cacheAgeSeconds,
          { showDeps: !!options.deps }
        )
      );
    } else {
      console.log(
        renderTextReport(
          finalResult,
          typosquattingAnalysis,
          fromCache,
          cacheAgeSeconds,
          { showDeps: !!options.deps }
        )
      );
    }

    // Check grade threshold if --fail-on-grade is set
    if (options.failOnGrade) {
      if (isGradeAtOrBelowThreshold(finalResult.score.grade, options.failOnGrade)) {
        // Grade failed threshold - return exit code 1
        if (!options.json) {
          console.log(
            chalk.red(
              `\n✗ Package grade ${finalResult.score.grade} fails threshold ${options.failOnGrade}\n`
            )
          );
        }
        return 1;
      }
      // Grade passed threshold - continue normally
      if (!options.json) {
        console.log(
          chalk.green(
            `\n✓ Package grade ${finalResult.score.grade} passes threshold ${options.failOnGrade}\n`
          )
        );
      }
    }

    // Installation prompt
    if (options.install !== false && !options.json) {
      const shouldInstall = await promptInstall();
      if (shouldInstall) {
        console.log(chalk.bold('\nInstalling package...\n'));
        const exitCode = await installPackage(
          `${finalResult.package.name}@${finalResult.package.version}`,
          options.registry
        );
        return exitCode;
      } else {
        console.log(chalk.gray('Installation cancelled.'));
        return 0;
      }
    } else {
      return 0;
    }
  } catch (error) {
    console.error(chalk.red(`\nError: ${getErrorMessage(error)}\n`));
    return 1;
  }
}
