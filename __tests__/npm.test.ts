import { describe, it, expect } from 'vitest';
import { parsePackageString, getPackageMetadata } from '../src/services/npm.js';

describe('parsePackageString', () => {
  it('should parse simple package name', () => {
    const result = parsePackageString('lodash');
    expect(result).toEqual({ name: 'lodash', version: undefined });
  });

  it('should parse package with version', () => {
    const result = parsePackageString('lodash@4.17.21');
    expect(result).toEqual({ name: 'lodash', version: '4.17.21' });
  });

  it('should parse scoped package', () => {
    const result = parsePackageString('@types/node');
    expect(result).toEqual({ name: '@types/node', version: undefined });
  });

  it('should parse scoped package with version', () => {
    const result = parsePackageString('@types/node@20.0.0');
    expect(result).toEqual({ name: '@types/node', version: '20.0.0' });
  });

  it('should parse package with tag', () => {
    const result = parsePackageString('react@latest');
    expect(result).toEqual({ name: 'react', version: 'latest' });
  });

  it('should parse scoped package with tag', () => {
    const result = parsePackageString('@babel/core@next');
    expect(result).toEqual({ name: '@babel/core', version: 'next' });
  });
});

describe('getPackageMetadata', () => {
  it('should fetch latest version for simple package', async () => {
    const pkg = await getPackageMetadata('tiny-invariant');
    expect(pkg.name).toBe('tiny-invariant');
    expect(pkg.version).toBeTruthy();
    expect(pkg.publishedAt).toBeInstanceOf(Date);
    expect(pkg.maintainers.length).toBeGreaterThan(0);
  }, 15000);

  it('should fetch specific version', async () => {
    const pkg = await getPackageMetadata('tiny-invariant', '1.3.1');
    expect(pkg.version).toBe('1.3.1');
    expect(pkg.dependencies).toBeDefined();
  }, 15000);

  it('should resolve semver range', async () => {
    const pkg = await getPackageMetadata('react', '^18.0.0');
    expect(pkg.version).toMatch(/^18\./);
  }, 15000);

  it('should resolve tags', async () => {
    const pkg = await getPackageMetadata('react', 'latest');
    expect(pkg.version).toBeTruthy();
    expect(pkg.name).toBe('react');
  }, 15000);

  it('should handle scoped packages', async () => {
    const pkg = await getPackageMetadata('@types/node');
    expect(pkg.name).toBe('@types/node');
    expect(pkg.version).toBeTruthy();
  }, 15000);

  it('should throw on package not found', async () => {
    await expect(
      getPackageMetadata('this-pkg-does-not-exist-xyz-vetter-123')
    ).rejects.toThrow('Package not found');
  }, 15000);

  it('should handle packages with maintainers array', async () => {
    const pkg = await getPackageMetadata('express');
    expect(Array.isArray(pkg.maintainers)).toBe(true);
    expect(pkg.maintainers.length).toBeGreaterThan(0);
  }, 15000);
});
