#!/usr/bin/env node

import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runInstallCommand } from './commands/install.js';
import type { InstallOptions } from './types.js';
import { clearCache, getCacheInfo } from './cache.js';
import { getErrorMessage } from './utils/errors.js';

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
  .option('--registry <url>', 'Use custom npm registry (defaults to public npm)')
  .action(async (packageString: string, options: InstallOptions) => {
    const exitCode = await runInstallCommand(packageString, options);
    process.exitCode = exitCode;
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
        process.exitCode = 1;
      }
    } catch (error) {
      console.error(chalk.red(`\nError: ${getErrorMessage(error)}\n`));
      process.exitCode = 1;
    }
  });

// Handle unknown commands
program.on('command:*', () => {
  console.error(chalk.red('\nInvalid command.\n'));
  program.outputHelp();
  process.exitCode = 1;
});

// Parse arguments (async for action handlers)
await program.parseAsync(process.argv);

// Show help if no arguments
if (process.argv.length === 2) {
  program.outputHelp();
  process.exitCode = 0;
}

// Single exit point
process.exit(process.exitCode ?? 0);
