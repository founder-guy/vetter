#!/usr/bin/env node

import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { parsePackageString, getPackageMetadata } from './services/npm.js';
import { analyzePackageSecurity } from './services/security.js';
import { calculateMetrics } from './services/metrics.js';
import { analyzeLicense } from './services/license.js';
import { analyzeDependencyBreakdown } from './services/breakdown.js';
import { calculateScore } from './scoring.js';
import { renderTextReport, renderJsonReport, promptInstall } from './report.js';
import { installPackage } from './install.js';
import type { AnalysisResult, InstallOptions, Workspace } from './types.js';
import { isGradeAtOrBelowThreshold, isValidGrade } from './grading.js';
import { loadCache, saveCache, formatAge, clearCache, getCacheInfo } from './cache.js';
import { prepareWorkspace } from './services/workspace.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(
  readFileSync(join(__dirname, '../package.json'), 'utf-8')
);

const program = new Command();

program
  .name('vetter')
  .description('Pre-install risk scanner for npm packages')
  .version(packageJson.version);

program
  .command('install <package>')
  .description('Analyze and optionally install an npm package')
  .option('--json', 'Output results as JSON')
  .option('--no-install', 'Skip installation prompt')
  .option('--no-cache', 'Skip cache read/write')
  .option('--refresh', 'Force re-analysis and update cache')
  .option('--fail-on-grade <grade>', 'Exit with code 1 if package grade is at or below threshold (A-F)')
  .option('--deps', 'Show detailed dependency breakdown (top 10 by sub-tree size)')
  .action(async (packageString: string, options: InstallOptions) => {
    // Validate --fail-on-grade option
    if (options.failOnGrade) {
      const normalizedGrade = options.failOnGrade.toUpperCase();
      if (!isValidGrade(normalizedGrade)) {
        console.error(chalk.red(`\nError: Invalid grade "${options.failOnGrade}". Must be A, B, C, D, E, or F.\n`));
        process.exit(1);
      }
      options.failOnGrade = normalizedGrade;
    }
    try {
      // Parse package identifier
      const { name, version } = parsePackageString(packageString);

      // Only show spinners in non-JSON mode
      const showSpinners = !options.json;

      // Fetch metadata (always needed for cache validation)
      const metadataSpinner = showSpinners
        ? ora('Fetching package metadata...').start()
        : null;
      let packageSnapshot;
      try {
        packageSnapshot = await getPackageMetadata(name, version);
        if (metadataSpinner) {
          metadataSpinner.succeed(
            `Found ${packageSnapshot.name}@${packageSnapshot.version}`
          );
        }
      } catch (error) {
        if (metadataSpinner) {
          metadataSpinner.fail('Failed to fetch package metadata');
        }
        throw error;
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
        let workspace: Workspace | null = null;
        const workspaceSpinner = showSpinners
          ? ora('Preparing workspace...').start()
          : null;

        try {
          workspace = await prepareWorkspace(packageSnapshot.name, packageSnapshot.version);
          if (workspaceSpinner) {
            workspaceSpinner.succeed('Workspace prepared');
          }
        } catch (error) {
          if (workspaceSpinner) {
            workspaceSpinner.fail('Failed to prepare workspace');
          }
          throw error;
        }

        try {
          // Run security audit (reuses workspace)
          const auditSpinner = showSpinners
            ? ora('Running security audit...').start()
            : null;
          let securityAnalysis;
          try {
            securityAnalysis = await analyzePackageSecurity(
              packageSnapshot.name,
              packageSnapshot.version,
              { workspace }
            );
            if (auditSpinner) {
              if (securityAnalysis.status === 'clean') {
                auditSpinner.succeed('Security audit complete - no vulnerabilities');
              } else if (securityAnalysis.status === 'vulnerable') {
                auditSpinner.warn(
                  `Security audit found ${securityAnalysis.vulnerabilities.total} vulnerabilities`
                );
              } else {
                auditSpinner.info('Security audit status unknown');
              }
            }
          } catch (error) {
            if (auditSpinner) {
              auditSpinner.fail('Security audit failed');
            }
            throw error;
          }

          // Calculate metrics (reuses workspace)
          const metricsSpinner = showSpinners
            ? ora('Analyzing package metrics...').start()
            : null;
          let metrics;
          try {
            metrics = await calculateMetrics(packageSnapshot, { workspace });
            if (metricsSpinner) {
              metricsSpinner.succeed('Package metrics analyzed');
            }
          } catch (error) {
            if (metricsSpinner) {
              metricsSpinner.fail('Failed to analyze metrics');
            }
            throw error;
          }

          // Analyze license
          const licenseInfo = analyzeLicense(packageSnapshot.license);

          // Compute dependency breakdown (always computed for caching, even without --deps flag)
          // Performance: ~10ms for typical packages, amortized across cache TTL
          const dependencyBreakdown = workspace?.lockfile
            ? analyzeDependencyBreakdown(workspace.lockfile, packageSnapshot.name)
            : undefined;

          // Calculate score
          const score = calculateScore(securityAnalysis, metrics, licenseInfo);

          // Build result
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

      // Warn about degraded signals in JSON mode (via stderr so it doesn't pollute JSON)
      if (options.json) {
        if (result.metrics.totalDependencyCount === -1) {
          console.error(
            'Warning: Unable to determine dependency count - analysis may be incomplete'
          );
        }
        if (result.security.status === 'unknown') {
          console.error(
            'Warning: Security audit failed - vulnerability status unknown'
          );
        }
      }

      // Render report
      if (options.json) {
        console.log(renderJsonReport(result, fromCache, cacheAgeSeconds, { showDeps: !!options.deps }));
      } else {
        console.log(renderTextReport(result, fromCache, cacheAgeSeconds, { showDeps: !!options.deps }));
      }

      // Check grade threshold if --fail-on-grade is set
      if (options.failOnGrade) {
        if (isGradeAtOrBelowThreshold(result.score.grade, options.failOnGrade)) {
          // Grade failed threshold - exit immediately with code 1
          if (!options.json) {
            console.log(
              chalk.red(
                `\n✗ Package grade ${result.score.grade} fails threshold ${options.failOnGrade}\n`
              )
            );
          }
          process.exit(1);
        }
        // Grade passed threshold - continue normally
        if (!options.json) {
          console.log(
            chalk.green(
              `\n✓ Package grade ${result.score.grade} passes threshold ${options.failOnGrade}\n`
            )
          );
        }
      }

      // Installation prompt
      if (options.install !== false && !options.json) {
        const shouldInstall = await promptInstall();
        if (shouldInstall) {
          console.log(
            chalk.bold('\nInstalling package...\n')
          );
          const exitCode = await installPackage(
            `${result.package.name}@${result.package.version}`
          );
          process.exit(exitCode);
        } else {
          console.log(chalk.gray('Installation cancelled.'));
          process.exit(0);
        }
      } else {
        process.exit(0);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`\nError: ${message}\n`));
      process.exit(1);
    }
  });

program
  .command('cache <action>')
  .description('Manage analysis cache')
  .action(async (action: string) => {
    try {
      if (action === 'clear') {
        await clearCache();
        console.log(chalk.green('Cache cleared'));
      } else if (action === 'info') {
        const info = await getCacheInfo();
        console.log(chalk.bold('\nCache Information:'));
        console.log(`  Location: ${chalk.cyan(info.path)}`);
        console.log(`  Size: ${chalk.yellow(`${info.sizeMB} MB`)}`);
        console.log(`  Entries: ${chalk.yellow(info.count.toString())}`);
      } else {
        console.error(chalk.red(`\nUnknown action: ${action}\n`));
        console.log('Usage: vetter cache <clear|info>');
        process.exit(1);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`\nError: ${message}\n`));
      process.exit(1);
    }
  });

// Handle unknown commands
program.on('command:*', () => {
  console.error(chalk.red('\nInvalid command.\n'));
  program.help();
  process.exit(1);
});

// Parse arguments
program.parse(process.argv);

// Show help if no arguments
if (process.argv.length === 2) {
  program.help();
}
