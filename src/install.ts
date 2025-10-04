import { spawn } from 'node:child_process';

/**
 * Proxy npm install command and stream output to user
 */
export async function installPackage(packageSpec: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const npmProcess = spawn('npm', ['install', packageSpec], {
      stdio: 'inherit',
      shell: true,
    });

    npmProcess.on('close', (code) => {
      resolve(code ?? 1);
    });

    npmProcess.on('error', (error) => {
      reject(error);
    });
  });
}
