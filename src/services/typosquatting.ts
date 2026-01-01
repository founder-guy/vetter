import {
  POPULAR_PACKAGES,
  TOP_100_SET,
  TOP_500_SET,
  TOP_1000_SET,
} from '../data/popular-packages.js';
import type { PackageSnapshot, TyposquattingAnalysis } from '../types.js';

/**
 * Levenshtein distance implementation with early termination
 * Optimized to bail out early when distance exceeds maxDistance
 */
function levenshteinDistance(a: string, b: string, maxDistance = Infinity): number {
  // Quick reject: if length difference alone exceeds max, skip computation
  if (Math.abs(a.length - b.length) > maxDistance) {
    return maxDistance + 1;
  }

  // Standard DP algorithm with early termination
  const matrix: number[][] = [];

  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
      rowMin = Math.min(rowMin, matrix[i][j]);
    }

    // Early termination: if minimum in this row exceeds maxDistance, we can stop
    if (rowMin > maxDistance) {
      return maxDistance + 1;
    }
  }

  return matrix[a.length][b.length];
}

/**
 * Official npm scopes that should be protected against typosquatting
 */
const OFFICIAL_SCOPES = new Set([
  'types',
  'babel',
  'aws-sdk',
  'angular',
  'vue',
  'react-native',
  'typescript-eslint',
  'eslint',
  'testing-library',
  'sentry',
  'jest',
  'graphql-tools',
  'storybook',
  'mui',
  'emotion',
  'radix-ui',
  'tanstack',
  'clerk',
  'auth0',
  'vercel',
  'next',
  'nuxt',
]);

/**
 * Check if a scope is a typosquat of an official scope
 */
function checkScopeTyposquat(scope: string): { target: string; distance: number } | null {
  // Remove @ prefix if present
  const cleanScope = scope.startsWith('@') ? scope.slice(1) : scope;

  for (const official of OFFICIAL_SCOPES) {
    const dist = levenshteinDistance(cleanScope, official, 2);
    if (dist <= 2 && dist > 0) {
      return { target: official, distance: dist };
    }
  }
  return null;
}

/**
 * Extract package name without scope
 */
function extractPackageName(fullName: string): { scope?: string; baseName: string } {
  const scopeMatch = fullName.match(/^(@[^/]+)\/(.+)$/);
  if (scopeMatch) {
    return {
      scope: scopeMatch[1],
      baseName: scopeMatch[2],
    };
  }
  return { baseName: fullName };
}

/**
 * Detect typosquatting using multi-signal confidence tiering
 *
 * @param packageName - Full package name (e.g., "lodash" or "@types/node")
 * @param packageSnapshot - Package metadata (for age and maintainer count)
 * @returns Typosquatting analysis with confidence level and details
 */
export function detectTyposquatting(
  packageName: string,
  packageSnapshot: PackageSnapshot
): TyposquattingAnalysis {
  const { scope, baseName } = extractPackageName(packageName);
  const packageAge = Math.floor(
    (Date.now() - packageSnapshot.publishedAt.getTime()) / (1000 * 60 * 60 * 24)
  );
  const maintainerCount = packageSnapshot.maintainers.length;

  // Check for scope typosquatting first (if scoped package)
  if (scope) {
    const scopeTyposquat = checkScopeTyposquat(scope);
    if (scopeTyposquat) {
      return {
        confidence: scopeTyposquat.distance === 1 ? 'critical' : 'high',
        targetPackage: `@${scopeTyposquat.target}/${baseName}`,
        editDistance: scopeTyposquat.distance,
        reason: `Scope "${scope}" is ${scopeTyposquat.distance} character${scopeTyposquat.distance === 1 ? '' : 's'} from official scope "@${scopeTyposquat.target}"`,
      };
    }
  }

  // Quick check: is this package itself in the popular list?
  if (TOP_1000_SET.has(packageName)) {
    return { confidence: 'safe' };
  }

  let bestMatch: { name: string; distance: number; tier: string } | null = null;

  // Check against all popular packages with early termination (maxDistance=2)
  for (const popularPkg of POPULAR_PACKAGES) {
    const distance = levenshteinDistance(baseName, popularPkg.name, 2);

    // Only consider matches with distance > 0 and ≤2 (distance=0 means exact match, not typosquat)
    // This prevents false positives for scoped packages like @types/node, @babel/core
    if (distance > 0 && distance <= 2 && (!bestMatch || distance < bestMatch.distance)) {
      bestMatch = { name: popularPkg.name, distance, tier: popularPkg.tier };
    }
  }

  // Apply confidence tiers (only if bestMatch exists)
  if (bestMatch) {
    // Critical: Edit distance ≤1 from top-100
    if (bestMatch.distance <= 1 && TOP_100_SET.has(bestMatch.name)) {
      return {
        confidence: 'critical',
        targetPackage: bestMatch.name,
        editDistance: bestMatch.distance,
        reason: `Name is ${bestMatch.distance} character${bestMatch.distance === 1 ? '' : 's'} from "${bestMatch.name}"`,
      };
    }

    // High: Edit distance ≤2 from top-500 AND (age <30 days OR ≤1 maintainer)
    if (
      bestMatch.distance <= 2 &&
      TOP_500_SET.has(bestMatch.name) &&
      (packageAge < 30 || maintainerCount <= 1)
    ) {
      return {
        confidence: 'high',
        targetPackage: bestMatch.name,
        editDistance: bestMatch.distance,
        reason: `Name is ${bestMatch.distance} character${bestMatch.distance === 1 ? '' : 's'} from "${bestMatch.name}" and package ${packageAge < 30 ? `was published ${packageAge} day${packageAge === 1 ? '' : 's'} ago` : `has ${maintainerCount} maintainer${maintainerCount === 1 ? '' : 's'}`}`,
      };
    }

    // Medium: Edit distance ≤2 from top-1000
    if (bestMatch.distance <= 2) {
      return {
        confidence: 'medium',
        targetPackage: bestMatch.name,
        editDistance: bestMatch.distance,
        reason: `Name is ${bestMatch.distance} character${bestMatch.distance === 1 ? '' : 's'} from "${bestMatch.name}"`,
      };
    }
  }

  // Low: Contains exact name of top-100 as substring AND (age <30 days OR ≤1 maintainer)
  // This prevents false positives for legitimate packages like "react-native", "express-validator"
  for (const top100Pkg of Array.from(TOP_100_SET)) {
    if (
      baseName.includes(top100Pkg) &&
      baseName !== top100Pkg &&
      (packageAge < 30 || maintainerCount <= 1)
    ) {
      return {
        confidence: 'low',
        targetPackage: top100Pkg,
        reason: `Name contains "${top100Pkg}" as substring and package ${packageAge < 30 ? `was published ${packageAge} day${packageAge === 1 ? '' : 's'} ago` : `has ${maintainerCount} maintainer${maintainerCount === 1 ? '' : 's'}`}`,
      };
    }
  }

  return { confidence: 'safe' };
}
