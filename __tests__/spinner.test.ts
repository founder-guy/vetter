import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import ora, { Ora } from 'ora';
import { withSpinner } from '../src/utils/spinner.js';

// Mock ora
vi.mock('ora');

describe('withSpinner', () => {
  let mockSpinner: {
    start: Mock;
    succeed: Mock;
    warn: Mock;
    info: Mock;
    fail: Mock;
  };

  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();

    mockSpinner = {
      start: vi.fn().mockReturnThis(),
      succeed: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      fail: vi.fn(),
    };

    // Reset ora mock
    vi.mocked(ora).mockReturnValue(mockSpinner as unknown as Ora);
  });

  describe('success cases', () => {
    it('should execute operation and return result when enabled', async () => {
      const operation = vi.fn().mockResolvedValue('success');

      const result = await withSpinner(
        true,
        'Loading...',
        operation
      );

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledOnce();
      expect(ora).toHaveBeenCalledWith('Loading...');
      expect(mockSpinner.start).toHaveBeenCalledOnce();
      expect(mockSpinner.succeed).toHaveBeenCalledWith('Loading...');
    });

    it('should execute operation without spinner when disabled', async () => {
      const operation = vi.fn().mockResolvedValue('success');

      const result = await withSpinner(
        false,
        'Loading...',
        operation
      );

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledOnce();
      expect(ora).not.toHaveBeenCalled();
      expect(mockSpinner.succeed).not.toHaveBeenCalled();
    });

    it('should use custom success message (string)', async () => {
      const operation = vi.fn().mockResolvedValue('success');

      await withSpinner(
        true,
        'Loading...',
        operation,
        { successMessage: 'Done!' }
      );

      expect(mockSpinner.succeed).toHaveBeenCalledWith('Done!');
    });

    it('should use result-dependent success message (string)', async () => {
      const operation = vi.fn().mockResolvedValue({ count: 42 });

      await withSpinner(
        true,
        'Counting...',
        operation,
        {
          successMessage: (result) => `Found ${result.count} items`
        }
      );

      expect(mockSpinner.succeed).toHaveBeenCalledWith('Found 42 items');
    });

    it('should use result-dependent success message with warn symbol', async () => {
      const operation = vi.fn().mockResolvedValue({ status: 'warning' });

      await withSpinner(
        true,
        'Checking...',
        operation,
        {
          successMessage: (result) => ({
            text: `Status: ${result.status}`,
            symbol: 'warn'
          })
        }
      );

      expect(mockSpinner.warn).toHaveBeenCalledWith('Status: warning');
      expect(mockSpinner.succeed).not.toHaveBeenCalled();
    });

    it('should use result-dependent success message with info symbol', async () => {
      const operation = vi.fn().mockResolvedValue({ status: 'unknown' });

      await withSpinner(
        true,
        'Checking...',
        operation,
        {
          successMessage: (result) => ({
            text: `Status: ${result.status}`,
            symbol: 'info'
          })
        }
      );

      expect(mockSpinner.info).toHaveBeenCalledWith('Status: unknown');
      expect(mockSpinner.succeed).not.toHaveBeenCalled();
    });

    it('should handle object success message with explicit succeed symbol', async () => {
      const operation = vi.fn().mockResolvedValue('success');

      await withSpinner(
        true,
        'Loading...',
        operation,
        {
          successMessage: () => ({ text: 'Complete', symbol: 'succeed' })
        }
      );

      expect(mockSpinner.succeed).toHaveBeenCalledWith('Complete');
    });
  });

  describe('failure cases', () => {
    it('should fail spinner and rethrow error', async () => {
      const error = new Error('Operation failed');
      const operation = vi.fn().mockRejectedValue(error);

      await expect(
        withSpinner(true, 'Loading...', operation)
      ).rejects.toThrow('Operation failed');

      expect(mockSpinner.fail).toHaveBeenCalledWith('Loading... failed');
      expect(mockSpinner.succeed).not.toHaveBeenCalled();
    });

    it('should use custom failure message', async () => {
      const error = new Error('Network error');
      const operation = vi.fn().mockRejectedValue(error);

      await expect(
        withSpinner(
          true,
          'Fetching...',
          operation,
          { failureMessage: 'Connection lost' }
        )
      ).rejects.toThrow('Network error');

      expect(mockSpinner.fail).toHaveBeenCalledWith('Connection lost');
    });

    it('should rethrow error without spinner when disabled', async () => {
      const error = new Error('Operation failed');
      const operation = vi.fn().mockRejectedValue(error);

      await expect(
        withSpinner(false, 'Loading...', operation)
      ).rejects.toThrow('Operation failed');

      expect(ora).not.toHaveBeenCalled();
      expect(mockSpinner.fail).not.toHaveBeenCalled();
    });
  });

  describe('real-world scenarios', () => {
    it('should handle metadata fetch pattern', async () => {
      const metadata = { name: 'lodash', version: '4.17.21' };
      const operation = vi.fn().mockResolvedValue(metadata);

      const result = await withSpinner(
        true,
        'Fetching package metadata...',
        operation,
        {
          successMessage: (pkg) => `Found ${pkg.name}@${pkg.version}`
        }
      );

      expect(result).toEqual(metadata);
      expect(mockSpinner.succeed).toHaveBeenCalledWith('Found lodash@4.17.21');
    });

    it('should handle security audit pattern (clean)', async () => {
      const audit = { status: 'clean' as const, vulnerabilities: { total: 0 } };
      const operation = vi.fn().mockResolvedValue(audit);

      await withSpinner(
        true,
        'Running security audit...',
        operation,
        {
          successMessage: (result) => {
            if (result.status === 'clean') {
              return 'Security audit complete - no vulnerabilities';
            }
            return 'Security audit complete';
          }
        }
      );

      expect(mockSpinner.succeed).toHaveBeenCalledWith(
        'Security audit complete - no vulnerabilities'
      );
    });

    it('should handle security audit pattern (vulnerable)', async () => {
      const audit = { status: 'vulnerable' as const, vulnerabilities: { total: 5 } };
      const operation = vi.fn().mockResolvedValue(audit);

      await withSpinner(
        true,
        'Running security audit...',
        operation,
        {
          successMessage: (result) => {
            if (result.status === 'vulnerable') {
              return {
                text: `Security audit found ${result.vulnerabilities.total} vulnerabilities`,
                symbol: 'warn' as const
              };
            }
            return 'Security audit complete';
          }
        }
      );

      expect(mockSpinner.warn).toHaveBeenCalledWith(
        'Security audit found 5 vulnerabilities'
      );
    });

    it('should handle security audit pattern (unknown)', async () => {
      const audit = { status: 'unknown' as const };
      const operation = vi.fn().mockResolvedValue(audit);

      await withSpinner(
        true,
        'Running security audit...',
        operation,
        {
          successMessage: (result) => {
            if (result.status === 'unknown') {
              return { text: 'Security audit status unknown', symbol: 'info' as const };
            }
            return 'Security audit complete';
          }
        }
      );

      expect(mockSpinner.info).toHaveBeenCalledWith('Security audit status unknown');
    });

    it('should handle workspace preparation pattern', async () => {
      const workspace = { directory: '/tmp/foo', cleanup: vi.fn() };
      const operation = vi.fn().mockResolvedValue(workspace);

      await withSpinner(
        true,
        'Preparing workspace...',
        operation,
        {
          successMessage: 'Workspace prepared',
          failureMessage: 'Failed to prepare workspace'
        }
      );

      expect(mockSpinner.succeed).toHaveBeenCalledWith('Workspace prepared');
    });
  });
});
