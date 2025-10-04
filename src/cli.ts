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
import { calculateScore } from './scoring.js';
import { renderTextReport, renderJsonReport, promptInstall } from './report.js';
import { installPackage } from './install.js';
import type { AnalysisResult, InstallOptions } from './types.js';
import { isGradeAtOrBelowThreshold, isValidGrade } from './grading.js';

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
  .option('--fail-on-grade <grade>', 'Exit with code 1 if package grade is at or below threshold (A-F)')
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

      // Fetch metadata
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

      // Run security audit
      const auditSpinner = showSpinners
        ? ora('Running security audit...').start()
        : null;
      let securityAnalysis;
      try {
        securityAnalysis = await analyzePackageSecurity(
          packageSnapshot.name,
          packageSnapshot.version
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

      // Calculate metrics
      const metricsSpinner = showSpinners
        ? ora('Analyzing package metrics...').start()
        : null;
      let metrics;
      try {
        metrics = await calculateMetrics(packageSnapshot);
        if (metricsSpinner) {
          metricsSpinner.succeed('Package metrics analyzed');
        }
      } catch (error) {
        if (metricsSpinner) {
          metricsSpinner.fail('Failed to analyze metrics');
        }
        throw error;
      }

      // Calculate score
      const score = calculateScore(securityAnalysis, metrics);

      // Build result
      const result: AnalysisResult = {
        package: packageSnapshot,
        metrics,
        security: securityAnalysis,
        score,
      };

      // Warn about degraded signals in JSON mode (via stderr so it doesn't pollute JSON)
      if (options.json) {
        if (metrics.totalDependencyCount === -1) {
          console.error(
            'Warning: Unable to determine dependency count - analysis may be incomplete'
          );
        }
        if (securityAnalysis.status === 'unknown') {
          console.error(
            'Warning: Security audit failed - vulnerability status unknown'
          );
        }
      }

      // Render report
      if (options.json) {
        console.log(renderJsonReport(result));
      } else {
        console.log(renderTextReport(result));
      }

      // Check grade threshold if --fail-on-grade is set
      if (options.failOnGrade) {
        if (isGradeAtOrBelowThreshold(score.grade, options.failOnGrade)) {
          // Grade failed threshold - exit immediately with code 1
          if (!options.json) {
            console.log(
              chalk.red(
                `\n✗ Package grade ${score.grade} fails threshold ${options.failOnGrade}\n`
              )
            );
          }
          process.exit(1);
        }
        // Grade passed threshold - continue normally
        if (!options.json) {
          console.log(
            chalk.green(
              `\n✓ Package grade ${score.grade} passes threshold ${options.failOnGrade}\n`
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
            `${packageSnapshot.name}@${packageSnapshot.version}`
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
