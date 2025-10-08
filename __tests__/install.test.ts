import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { installPackage } from '../src/install.js';

// Mock child_process.spawn
vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

describe('installPackage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('should return 0 on successful installation', async () => {
    const mockProcess = new EventEmitter() as any;
    mockProcess.kill = vi.fn();
    mockProcess.exitCode = null;

    vi.mocked(spawn).mockReturnValue(mockProcess);

    const promise = installPackage('test-package@1.0.0');

    // Simulate successful installation
    mockProcess.exitCode = 0;
    mockProcess.emit('close', 0);

    const exitCode = await promise;
    expect(exitCode).toBe(0);
  });

  it('should return non-zero exit code on installation failure', async () => {
    const mockProcess = new EventEmitter() as any;
    mockProcess.kill = vi.fn();
    mockProcess.exitCode = null;

    vi.mocked(spawn).mockReturnValue(mockProcess);

    const promise = installPackage('test-package@1.0.0');

    // Simulate installation failure
    mockProcess.exitCode = 1;
    mockProcess.emit('close', 1);

    const exitCode = await promise;
    expect(exitCode).toBe(1);
  });

  it('should pass registry argument when provided', async () => {
    const mockProcess = new EventEmitter() as any;
    mockProcess.kill = vi.fn();
    mockProcess.exitCode = null;

    vi.mocked(spawn).mockReturnValue(mockProcess);

    const promise = installPackage('test-package@1.0.0', 'https://custom.registry.com');

    expect(spawn).toHaveBeenCalledWith(
      'npm',
      ['install', 'test-package@1.0.0', '--registry', 'https://custom.registry.com'],
      { stdio: 'inherit' }
    );

    mockProcess.exitCode = 0;
    mockProcess.emit('close', 0);
    await promise;
  });

  it('should resolve with exit code if process exits gracefully after SIGTERM', async () => {
    const mockProcess = new EventEmitter() as any;
    mockProcess.kill = vi.fn();
    mockProcess.exitCode = null;

    vi.mocked(spawn).mockReturnValue(mockProcess);

    const promise = installPackage('test-package@1.0.0');

    // Trigger timeout (sends SIGTERM) - use sync advanceTimersByTime to avoid async issues
    vi.advanceTimersByTime(300000);
    expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');

    // Process exits gracefully within grace period (3 seconds)
    vi.advanceTimersByTime(3000);
    mockProcess.exitCode = 0;
    mockProcess.emit('close', 0);

    const exitCode = await promise;
    expect(exitCode).toBe(0);
    expect(mockProcess.kill).toHaveBeenCalledTimes(1); // Only SIGTERM, no SIGKILL
  });

  it('should send SIGKILL and reject if process does not exit after grace period', async () => {
    const mockProcess = new EventEmitter() as any;
    mockProcess.kill = vi.fn();
    mockProcess.exitCode = null;

    vi.mocked(spawn).mockReturnValue(mockProcess);

    const promise = installPackage('test-package@1.0.0');

    // Trigger timeout (sends SIGTERM)
    vi.advanceTimersByTime(300000);
    expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');

    // Process doesn't exit, so advance through 5-second grace period
    vi.advanceTimersByTime(5000);

    // SIGKILL should be sent and promise should reject
    expect(mockProcess.kill).toHaveBeenCalledWith('SIGKILL');
    expect(mockProcess.kill).toHaveBeenCalledTimes(2);

    // Verify rejection
    await expect(promise).rejects.toThrow('Installation timed out after 5 minutes');
  });

  it('should reject on spawn error', async () => {
    const mockProcess = new EventEmitter() as any;
    mockProcess.kill = vi.fn();
    mockProcess.exitCode = null;

    vi.mocked(spawn).mockReturnValue(mockProcess);

    const promise = installPackage('test-package@1.0.0');

    // Simulate spawn error
    mockProcess.emit('error', new Error('ENOENT: npm not found'));

    await expect(promise).rejects.toThrow('ENOENT: npm not found');
  });

  it('should not send SIGKILL if process already exited', async () => {
    const mockProcess = new EventEmitter() as any;
    mockProcess.kill = vi.fn();
    mockProcess.exitCode = null;

    vi.mocked(spawn).mockReturnValue(mockProcess);

    const promise = installPackage('test-package@1.0.0');

    // Trigger timeout (sends SIGTERM)
    vi.advanceTimersByTime(300000);
    expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');

    // Process exits immediately (sets exitCode before grace period)
    mockProcess.exitCode = 0;
    mockProcess.emit('close', 0);

    const exitCode = await promise;
    expect(exitCode).toBe(0);

    // Advance through grace period - SIGKILL should NOT fire because exitCode is set
    vi.advanceTimersByTime(5000);
    expect(mockProcess.kill).toHaveBeenCalledTimes(1); // Only SIGTERM
  });

  it('should handle null exit code as 1', async () => {
    const mockProcess = new EventEmitter() as any;
    mockProcess.kill = vi.fn();
    mockProcess.exitCode = null;

    vi.mocked(spawn).mockReturnValue(mockProcess);

    const promise = installPackage('test-package@1.0.0');

    // Close event with null code
    mockProcess.emit('close', null);

    const exitCode = await promise;
    expect(exitCode).toBe(1);
  });

  it('should trim whitespace from registry URL', async () => {
    const mockProcess = new EventEmitter() as any;
    mockProcess.kill = vi.fn();
    mockProcess.exitCode = null;

    vi.mocked(spawn).mockReturnValue(mockProcess);

    const promise = installPackage('test-package@1.0.0', '  https://custom.registry.com  ');

    expect(spawn).toHaveBeenCalledWith(
      'npm',
      ['install', 'test-package@1.0.0', '--registry', 'https://custom.registry.com'],
      { stdio: 'inherit' }
    );

    mockProcess.exitCode = 0;
    mockProcess.emit('close', 0);
    await promise;
  });
});
