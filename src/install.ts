import { spawn } from 'node:child_process';

/**
 * Proxy npm install command and stream output to user
 *
 * **Timeout:** 5-minute limit to prevent indefinite hangs
 * **Registry:** Supports custom registry via optional parameter
 *
 * @param packageSpec - Package specifier (e.g., 'lodash@4.17.21')
 * @param registry - Optional custom npm registry URL
 * @returns Exit code from npm install (0 = success)
 */
export async function installPackage(packageSpec: string, registry?: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const args = ['install', packageSpec];
    if (registry?.trim()) {
      args.push('--registry', registry.trim());
    }

    const npmProcess = spawn('npm', args, {
      stdio: 'inherit',
    });

    // 5-minute timeout for user-facing install
    const timeout = setTimeout(() => {
      npmProcess.kill('SIGTERM');
      reject(new Error('Installation timed out after 5 minutes'));
    }, 300000);

    npmProcess.on('close', (code) => {
      clearTimeout(timeout);
      resolve(code ?? 1);
    });

    npmProcess.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}
