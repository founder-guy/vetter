import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { createSpinner } from 'nanospinner';
import { withSpinner } from '../src/utils/spinner.js';

// Mock nanospinner
vi.mock('nanospinner');

describe('withSpinner', () => {
  let mockSpinner: {
    start: Mock;
    success: Mock;
    warn: Mock;
    info: Mock;
    error: Mock;
  };

  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();

    mockSpinner = {
      start: vi.fn().mockReturnThis(),
      success: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
    };

    // Reset nanospinner mock
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(createSpinner).mockReturnValue(mockSpinner as any);
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
      expect(createSpinner).toHaveBeenCalledWith('Loading...');
      expect(mockSpinner.start).toHaveBeenCalledOnce();
      expect(mockSpinner.success).toHaveBeenCalledWith({ text: 'Loading...' });
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
      expect(createSpinner).not.toHaveBeenCalled();
      expect(mockSpinner.success).not.toHaveBeenCalled();
    });

    it('should use custom success message (string)', async () => {
      const operation = vi.fn().mockResolvedValue('success');

      await withSpinner(
        true,
        'Loading...',
        operation,
        { successMessage: 'Done!' }
      );

      expect(mockSpinner.success).toHaveBeenCalledWith({ text: 'Done!' });
    });

    it('should use result-dependent success message (string)', async () => {
      const operation = vi.fn().mockResolvedValue({ count: 42 });

      await withSpinner(
        true,
        'Counting...',
        operation,
        {
          successMessage: (result: { count: number }) => `Found ${result.count} items`
        }
      );

      expect(mockSpinner.success).toHaveBeenCalledWith({ text: 'Found 42 items' });
    });

    it('should use result-dependent success message with warn symbol', async () => {
      const operation = vi.fn().mockResolvedValue({ status: 'warning' });

      await withSpinner(
        true,
        'Checking...',
        operation,
        {
          successMessage: (result: { status: string }) => ({
            text: `Status: ${result.status}`,
            symbol: 'warn' as const
          })
        }
      );

      expect(mockSpinner.warn).toHaveBeenCalledWith({ text: 'Status: warning' });
      expect(mockSpinner.success).not.toHaveBeenCalled();
    });

    it('should use result-dependent success message with info symbol', async () => {
      const operation = vi.fn().mockResolvedValue({ status: 'unknown' });

      await withSpinner(
        true,
        'Checking...',
        operation,
        {
          successMessage: (result: { status: string }) => ({
            text: `Status: ${result.status}`,
            symbol: 'info' as const
          })
        }
      );

      expect(mockSpinner.info).toHaveBeenCalledWith({ text: 'Status: unknown' });
      expect(mockSpinner.success).not.toHaveBeenCalled();
    });

    it('should handle object success message with explicit succeed symbol', async () => {
      const operation = vi.fn().mockResolvedValue('success');

      await withSpinner(
        true,
        'Loading...',
        operation,
        {
          successMessage: () => ({ text: 'Complete', symbol: 'succeed' as const })
        }
      );

      expect(mockSpinner.success).toHaveBeenCalledWith({ text: 'Complete' });
    });
  });

  describe('failure cases', () => {
    it('should fail spinner and rethrow error', async () => {
      const error = new Error('Operation failed');
      const operation = vi.fn().mockRejectedValue(error);

      await expect(
        withSpinner(true, 'Loading...', operation)
      ).rejects.toThrow('Operation failed');

      expect(mockSpinner.error).toHaveBeenCalledWith({ text: 'Loading... failed' });
      expect(mockSpinner.success).not.toHaveBeenCalled();
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

      expect(mockSpinner.error).toHaveBeenCalledWith({ text: 'Connection lost' });
    });

    it('should rethrow error without spinner when disabled', async () => {
      const error = new Error('Operation failed');
      const operation = vi.fn().mockRejectedValue(error);

      await expect(
        withSpinner(false, 'Loading...', operation)
      ).rejects.toThrow('Operation failed');

      expect(createSpinner).not.toHaveBeenCalled();
      expect(mockSpinner.error).not.toHaveBeenCalled();
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
          successMessage: (pkg: { name: string; version: string }) => `Found ${pkg.name}@${pkg.version}`
        }
      );

      expect(result).toEqual(metadata);
      expect(mockSpinner.success).toHaveBeenCalledWith({ text: 'Found lodash@4.17.21' });
    });

    it('should handle security audit pattern (clean)', async () => {
      const audit = { status: 'clean' as const, vulnerabilities: { total: 0 } };
      const operation = vi.fn().mockResolvedValue(audit);

      await withSpinner(
        true,
        'Running security audit...',
        operation,
        {
          successMessage: (result: typeof audit) => {
            if (result.status === 'clean') {
              return 'Security audit complete - no vulnerabilities';
            }
            return 'Security audit complete';
          }
        }
      );

      expect(mockSpinner.success).toHaveBeenCalledWith({
        text: 'Security audit complete - no vulnerabilities'
      });
    });

    it('should handle security audit pattern (vulnerable)', async () => {
      const audit = { status: 'vulnerable' as const, vulnerabilities: { total: 5 } };
      const operation = vi.fn().mockResolvedValue(audit);

      await withSpinner(
        true,
        'Running security audit...',
        operation,
        {
          successMessage: (result: typeof audit) => {
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

      expect(mockSpinner.warn).toHaveBeenCalledWith({
        text: 'Security audit found 5 vulnerabilities'
      });
    });

    it('should handle security audit pattern (unknown)', async () => {
      const audit = { status: 'unknown' as const };
      const operation = vi.fn().mockResolvedValue(audit);

      await withSpinner(
        true,
        'Running security audit...',
        operation,
        {
          successMessage: (result: typeof audit) => {
            if (result.status === 'unknown') {
              return { text: 'Security audit status unknown', symbol: 'info' as const };
            }
            return 'Security audit complete';
          }
        }
      );

      expect(mockSpinner.info).toHaveBeenCalledWith({ text: 'Security audit status unknown' });
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

      expect(mockSpinner.success).toHaveBeenCalledWith({ text: 'Workspace prepared' });
    });
  });
});
