import { spawn } from 'node:child_process';

/**
 * Proxy npm install command and stream output to user
 *
 * **Timeout:** 5-minute limit with graceful SIGTERM → SIGKILL escalation
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

    // 5-minute timeout with graceful SIGTERM → SIGKILL escalation
    let timeout: NodeJS.Timeout;
    let killTimeout: NodeJS.Timeout | undefined;

    timeout = setTimeout(() => {
      npmProcess.kill('SIGTERM');

      // Force kill if process hasn't exited after 5-second grace period
      killTimeout = setTimeout(() => {
        if (npmProcess.exitCode === null) {
          npmProcess.kill('SIGKILL');
          reject(new Error('Installation timed out after 5 minutes'));
        }
      }, 5000);
    }, 300000);

    npmProcess.on('close', (code) => {
      clearTimeout(timeout);
      if (killTimeout) clearTimeout(killTimeout);
      resolve(code ?? 1);
    });

    npmProcess.on('error', (error) => {
      clearTimeout(timeout);
      if (killTimeout) clearTimeout(killTimeout);
      reject(error);
    });
  });
}
