import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parsePackageString, getPackageMetadata } from '../src/services/npm.js';
import type { Packument } from 'npm-pick-manifest';

// Mock npm-registry-fetch
vi.mock('npm-registry-fetch', () => ({
  default: {
    json: vi.fn(),
  },
}));

import registryFetch from 'npm-registry-fetch';

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

  it('should reject empty string', () => {
    expect(() => parsePackageString('')).toThrow('Invalid package identifier: ""');
  });

  it('should reject whitespace-only string', () => {
    expect(() => parsePackageString('   ')).toThrow('Invalid package identifier');
  });

  it('should reject single @ symbol', () => {
    expect(() => parsePackageString('@')).toThrow('Invalid package identifier: "@"');
  });

  it('should reject @ with version only', () => {
    expect(() => parsePackageString('@1.0.0')).toThrow('Invalid package identifier: "@1.0.0"');
  });

  it('should handle whitespace in valid package names', () => {
    const result = parsePackageString('  lodash  ');
    expect(result).toEqual({ name: 'lodash', version: undefined });
  });
});

describe('getPackageMetadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createMockPackument = (
    name: string,
    versions: Record<string, { version: string; dependencies?: Record<string, string> }>
  ): Packument => {
    const distTags: Record<string, string> = {};
    const time: Record<string, string> = {};
    const versionsData: Record<string, any> = {};

    Object.entries(versions).forEach(([versionKey, versionData]) => {
      const { version, dependencies = {} } = versionData;
      versionsData[version] = {
        name,
        version,
        dependencies,
        maintainers: [{ name: 'test-user', email: 'test@example.com' }],
        dist: { unpackedSize: 10000 },
        description: 'Test package',
      };
      time[version] = '2024-01-15T12:00:00.000Z';
    });

    // Set latest tag to the last version
    const latestVersion = Object.values(versions).slice(-1)[0].version;
    distTags.latest = latestVersion;

    return {
      name,
      'dist-tags': distTags,
      versions: versionsData,
      time,
    } as unknown as Packument;
  };

  it('should fetch latest version for simple package', async () => {
    const mockPackument = createMockPackument('tiny-invariant', {
      '1.3.1': { version: '1.3.1' },
      '1.3.3': { version: '1.3.3' },
    });

    vi.mocked(registryFetch.json).mockResolvedValue(mockPackument);

    const pkg = await getPackageMetadata('tiny-invariant');

    expect(pkg.name).toBe('tiny-invariant');
    expect(pkg.version).toBe('1.3.3'); // latest
    expect(pkg.publishedAt).toBeInstanceOf(Date);
    expect(pkg.maintainers.length).toBeGreaterThan(0);
    expect(registryFetch.json).toHaveBeenCalledWith('/tiny-invariant', {
      preferOnline: true,
    });
  });

  it('should fetch specific version', async () => {
    const mockPackument = createMockPackument('tiny-invariant', {
      '1.3.1': { version: '1.3.1', dependencies: { foo: '^1.0.0' } },
      '1.3.3': { version: '1.3.3' },
    });

    vi.mocked(registryFetch.json).mockResolvedValue(mockPackument);

    const pkg = await getPackageMetadata('tiny-invariant', '1.3.1');

    expect(pkg.version).toBe('1.3.1');
    expect(pkg.dependencies).toEqual({ foo: '^1.0.0' });
  });

  it('should resolve semver range', async () => {
    const mockPackument = createMockPackument('react', {
      '18.0.0': { version: '18.0.0' },
      '18.2.0': { version: '18.2.0' },
      '18.3.1': { version: '18.3.1' },
      '19.0.0': { version: '19.0.0' },
    });

    vi.mocked(registryFetch.json).mockResolvedValue(mockPackument);

    const pkg = await getPackageMetadata('react', '^18.0.0');

    expect(pkg.version).toMatch(/^18\./);
    expect(pkg.version).toBe('18.3.1'); // highest 18.x
  });

  it('should resolve tags', async () => {
    const mockPackument = createMockPackument('react', {
      '18.3.1': { version: '18.3.1' },
    });

    vi.mocked(registryFetch.json).mockResolvedValue(mockPackument);

    const pkg = await getPackageMetadata('react', 'latest');

    expect(pkg.version).toBe('18.3.1');
    expect(pkg.name).toBe('react');
  });

  it('should handle scoped packages', async () => {
    const mockPackument = createMockPackument('@types/node', {
      '20.0.0': { version: '20.0.0' },
    });

    vi.mocked(registryFetch.json).mockResolvedValue(mockPackument);

    const pkg = await getPackageMetadata('@types/node');

    expect(pkg.name).toBe('@types/node');
    expect(pkg.version).toBe('20.0.0');
    expect(registryFetch.json).toHaveBeenCalledWith('/%40types/node', {
      preferOnline: true,
    });
  });

  it('should throw on package not found', async () => {
    const error = new Error('Not found');
    Object.assign(error, { statusCode: 404 });

    vi.mocked(registryFetch.json).mockRejectedValue(error);

    await expect(
      getPackageMetadata('this-pkg-does-not-exist-xyz-vetter-123')
    ).rejects.toThrow('Package not found');
  });

  it('should handle packages with maintainers array', async () => {
    const mockPackument = createMockPackument('express', {
      '4.18.0': { version: '4.18.0' },
    });

    vi.mocked(registryFetch.json).mockResolvedValue(mockPackument);

    const pkg = await getPackageMetadata('express');

    expect(Array.isArray(pkg.maintainers)).toBe(true);
    expect(pkg.maintainers.length).toBeGreaterThan(0);
  });

  it('should handle network errors', async () => {
    const error = new Error('Network error');
    Object.assign(error, { code: 'ENOTFOUND' });

    vi.mocked(registryFetch.json).mockRejectedValue(error);

    await expect(
      getPackageMetadata('some-package')
    ).rejects.toThrow('Cannot reach npm registry');
  });

  it('should pass custom registry to registryFetch', async () => {
    const mockPackument = createMockPackument('lodash', {
      '4.17.21': { version: '4.17.21' },
    });

    vi.mocked(registryFetch.json).mockResolvedValue(mockPackument);

    await getPackageMetadata('lodash', undefined, {
      registry: 'https://custom-registry.example.com',
    });

    expect(registryFetch.json).toHaveBeenCalledWith('/lodash', {
      registry: 'https://custom-registry.example.com',
      preferOnline: true,
    });
  });

  it('should use default registry when no registry option provided', async () => {
    const mockPackument = createMockPackument('lodash', {
      '4.17.21': { version: '4.17.21' },
    });

    vi.mocked(registryFetch.json).mockResolvedValue(mockPackument);

    await getPackageMetadata('lodash');

    expect(registryFetch.json).toHaveBeenCalledWith('/lodash', {
      preferOnline: true,
    });
  });
});
