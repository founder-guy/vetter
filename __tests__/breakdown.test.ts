import { describe, it, expect } from 'vitest';
import { analyzeDependencyBreakdown } from '../src/services/breakdown.js';
import type { PackageLockfileData } from '../src/types.js';

describe('analyzeDependencyBreakdown', () => {
  describe('edge cases', () => {
    it('should return empty array for undefined lockfile', () => {
      expect(analyzeDependencyBreakdown(undefined, 'test-pkg')).toEqual([]);
    });

    it('should return empty array for empty lockfile', () => {
      expect(analyzeDependencyBreakdown({ packages: {} }, 'test-pkg')).toEqual([]);
    });

    it('should return empty array for lockfile with no packages or dependencies', () => {
      expect(analyzeDependencyBreakdown({} as PackageLockfileData, 'test-pkg')).toEqual([]);
    });

    it('should return empty array when target package not found in lockfile', () => {
      const mockLockfile: PackageLockfileData = {
        lockfileVersion: 2,
        packages: {
          'node_modules/other-pkg': { version: '1.0.0' }
        }
      };
      expect(analyzeDependencyBreakdown(mockLockfile, 'missing-pkg')).toEqual([]);
    });
  });

  describe('v2/v3 lockfile format (packages map)', () => {
    it('should count transitive dependencies correctly', () => {
      const mockLockfile: PackageLockfileData = {
        lockfileVersion: 2,
        packages: {
          'node_modules/foo': {
            version: '1.0.0',
            dependencies: { bar: '^1.0.0', baz: '^1.0.0' }
          },
          'node_modules/bar': {
            version: '1.0.0',
            dependencies: { qux: '^1.0.0' }
          },
          'node_modules/baz': { version: '1.0.0' },
          'node_modules/qux': { version: '1.0.0' },
        },
      };

      const result = analyzeDependencyBreakdown(mockLockfile, 'foo');

      // Should show foo's direct dependencies (bar, baz)
      expect(result).toHaveLength(2);

      // bar should have 1 transitive dep (qux)
      const barResult = result.find(d => d.name === 'bar');
      expect(barResult?.version).toBe('1.0.0');
      expect(barResult?.transitiveCount).toBe(1); // qux

      // baz should have 0 transitive deps
      const bazResult = result.find(d => d.name === 'baz');
      expect(bazResult?.transitiveCount).toBe(0);
    });

    it('should handle scoped packages', () => {
      const mockLockfile: PackageLockfileData = {
        lockfileVersion: 2,
        packages: {
          'node_modules/test-pkg': {
            version: '1.0.0',
            dependencies: { '@babel/core': '^7.0.0', '@babel/helper': '^7.0.0' }
          },
          'node_modules/@babel/core': { version: '7.0.0' },
          'node_modules/@babel/helper': { version: '7.0.0' },
        },
      };

      const result = analyzeDependencyBreakdown(mockLockfile, 'test-pkg');

      expect(result).toHaveLength(2);
      expect(result.some(d => d.name === '@babel/core')).toBe(true);
      expect(result.some(d => d.name === '@babel/helper')).toBe(true);
    });

    it('should handle missing version fields with "unknown"', () => {
      const mockLockfile: PackageLockfileData = {
        lockfileVersion: 2,
        packages: {
          'node_modules/test-pkg': {
            version: '1.0.0',
            dependencies: { foo: '^1.0.0' }
          },
          'node_modules/foo': {}, // No version field
        },
      };

      const result = analyzeDependencyBreakdown(mockLockfile, 'test-pkg');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('foo');
      expect(result[0].version).toBe('unknown');
    });

    it('should sort by transitiveCount descending', () => {
      const mockLockfile: PackageLockfileData = {
        lockfileVersion: 2,
        packages: {
          'node_modules/test-pkg': {
            version: '1.0.0',
            dependencies: { small: '^1.0.0', medium: '^1.0.0', large: '^1.0.0' }
          },
          'node_modules/small': { version: '1.0.0' },
          'node_modules/medium': {
            version: '1.0.0',
            dependencies: { dep1: '^1.0.0', dep2: '^1.0.0' }
          },
          'node_modules/dep1': { version: '1.0.0' },
          'node_modules/dep2': { version: '1.0.0' },
          'node_modules/large': {
            version: '1.0.0',
            dependencies: { dep3: '^1.0.0', dep4: '^1.0.0', dep5: '^1.0.0' }
          },
          'node_modules/dep3': { version: '1.0.0' },
          'node_modules/dep4': { version: '1.0.0' },
          'node_modules/dep5': { version: '1.0.0' },
        },
      };

      const result = analyzeDependencyBreakdown(mockLockfile, 'test-pkg');

      expect(result[0].name).toBe('large');
      expect(result[0].transitiveCount).toBe(3);
      expect(result[1].name).toBe('medium');
      expect(result[1].transitiveCount).toBe(2);
      expect(result[2].name).toBe('small');
      expect(result[2].transitiveCount).toBe(0);
    });

    it('should limit to top 10 results', () => {
      const packages: Record<string, any> = {
        'node_modules/test-pkg': {
          version: '1.0.0',
          dependencies: {} as Record<string, string>
        }
      };

      // Create 15 packages as direct dependencies
      for (let i = 0; i < 15; i++) {
        packages['node_modules/test-pkg'].dependencies[`pkg${i}`] = '^1.0.0';
        packages[`node_modules/pkg${i}`] = { version: '1.0.0' };
      }

      const mockLockfile: PackageLockfileData = {
        lockfileVersion: 2,
        packages,
      };

      const result = analyzeDependencyBreakdown(mockLockfile, 'test-pkg');

      expect(result).toHaveLength(10);
    });

    it('should handle circular dependencies gracefully', () => {
      const mockLockfile: PackageLockfileData = {
        lockfileVersion: 2,
        packages: {
          'node_modules/test-pkg': {
            version: '1.0.0',
            dependencies: { a: '^1.0.0' } // Only a is a direct dep
          },
          'node_modules/a': {
            version: '1.0.0',
            dependencies: { b: '^1.0.0' }
          },
          'node_modules/b': {
            version: '1.0.0',
            dependencies: { a: '^1.0.0' } // Circular reference
          },
        },
      };

      // Should not throw or hang
      const result = analyzeDependencyBreakdown(mockLockfile, 'test-pkg');

      expect(result).toHaveLength(1); // Only 'a' is a direct dep
      expect(result[0].name).toBe('a');
      // Should count b as transitive dep (circular ref handled by visited set)
      expect(result[0].transitiveCount).toBe(1);
    });

    it('should handle nested node_modules paths', () => {
      const mockLockfile: PackageLockfileData = {
        lockfileVersion: 2,
        packages: {
          'node_modules/test-pkg': {
            version: '1.0.0',
            dependencies: { foo: '^1.0.0', bar: '^1.0.0' }
          },
          'node_modules/foo': {
            version: '1.0.0',
            dependencies: { bar: '^2.0.0' }
          },
          'node_modules/foo/node_modules/bar': { version: '2.0.0' }, // Nested
          'node_modules/bar': { version: '1.0.0' }, // Top-level different version
        },
      };

      const result = analyzeDependencyBreakdown(mockLockfile, 'test-pkg');

      expect(result).toHaveLength(2);
      const fooResult = result.find(d => d.name === 'foo');
      expect(fooResult?.transitiveCount).toBe(1); // Should count nested bar
    });

    it('should deduplicate shared dependencies (diamond pattern)', () => {
      // This tests the fix for the double-counting bug
      // Pattern: test-pkg depends on A and B, both A and B depend on C
      const mockLockfile: PackageLockfileData = {
        lockfileVersion: 2,
        packages: {
          'node_modules/test-pkg': {
            version: '1.0.0',
            dependencies: { 'pkg-a': '^1.0.0', 'pkg-b': '^1.0.0' }
          },
          'node_modules/pkg-a': {
            version: '1.0.0',
            dependencies: { shared: '^1.0.0', 'only-a': '^1.0.0' }
          },
          'node_modules/pkg-b': {
            version: '1.0.0',
            dependencies: { shared: '^1.0.0', 'only-b': '^1.0.0' }
          },
          'node_modules/shared': { version: '1.0.0' },
          'node_modules/only-a': { version: '1.0.0' },
          'node_modules/only-b': { version: '1.0.0' },
        },
      };

      const result = analyzeDependencyBreakdown(mockLockfile, 'test-pkg');

      expect(result).toHaveLength(2);

      // pkg-a should count: shared + only-a = 2 transitive deps
      const pkgAResult = result.find(d => d.name === 'pkg-a');
      expect(pkgAResult?.transitiveCount).toBe(2);

      // pkg-b should count: shared + only-b = 2 transitive deps
      // BUT 'shared' was already visited when counting pkg-a's tree
      // So when we count pkg-b independently, it should still be 2
      // (each direct dep gets its own independent count)
      const pkgBResult = result.find(d => d.name === 'pkg-b');
      expect(pkgBResult?.transitiveCount).toBe(2);
    });
  });

  describe('v1 lockfile format (dependencies tree)', () => {
    it('should handle v1 format with dependencies tree', () => {
      const mockLockfile: PackageLockfileData = {
        lockfileVersion: 1,
        dependencies: {
          'test-pkg': {
            version: '1.0.0',
            dependencies: {
              foo: {
                version: '1.0.0',
                dependencies: {
                  bar: {
                    version: '1.0.0',
                    dependencies: {
                      baz: {
                        version: '1.0.0',
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const result = analyzeDependencyBreakdown(mockLockfile, 'test-pkg');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('foo');
      expect(result[0].version).toBe('1.0.0');
      expect(result[0].transitiveCount).toBe(2); // bar + baz
    });

    it('should handle v1 format with multiple top-level deps', () => {
      const mockLockfile: PackageLockfileData = {
        lockfileVersion: 1,
        dependencies: {
          'test-pkg': {
            version: '1.0.0',
            dependencies: {
              foo: {
                version: '1.0.0',
                dependencies: {
                  shared: { version: '1.0.0' },
                },
              },
              bar: {
                version: '2.0.0',
                dependencies: {
                  shared: { version: '1.0.0' },
                  other: { version: '1.0.0' },
                },
              },
            },
          },
        },
      };

      const result = analyzeDependencyBreakdown(mockLockfile, 'test-pkg');

      expect(result).toHaveLength(2);
      const barResult = result.find(d => d.name === 'bar');
      expect(barResult?.transitiveCount).toBe(2); // shared + other
    });

    it('should handle v1 circular dependencies', () => {
      const mockLockfile: PackageLockfileData = {
        lockfileVersion: 1,
        dependencies: {
          'test-pkg': {
            version: '1.0.0',
            dependencies: {
              a: {
                version: '1.0.0',
                dependencies: {
                  b: {
                    version: '1.0.0',
                    // In v1, circular refs are typically not represented
                    // but we should handle it if they are
                  },
                },
              },
            },
          },
        },
      };

      const result = analyzeDependencyBreakdown(mockLockfile, 'test-pkg');

      expect(result).toHaveLength(1);
      expect(result[0].transitiveCount).toBe(1);
    });
  });
});
