import { describe, it, expect } from 'vitest';
import { parsePackageString } from '../src/services/npm.js';

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
