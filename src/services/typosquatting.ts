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
  // Only compute age when publish date is trustworthy. When unknown, drop the
  // age signal so the `age < 30` gate can't fire against the epoch fallback
  // (which would force an instant-F false positive for any distance-2 match
  // on packages from registries that omit `time[version]`).
  const ageKnown = packageSnapshot.publishedAtKnown;
  const packageAge = ageKnown
    ? Math.floor((Date.now() - packageSnapshot.publishedAt.getTime()) / (1000 * 60 * 60 * 24))
    : -1;
  const isYoung = ageKnown && packageAge < 30;
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

  // Track best match per tier to prevent a closer low-tier match from
  // shadowing a more dangerous higher-tier match
  let bestTop100: { name: string; distance: number } | null = null;
  let bestTop500: { name: string; distance: number } | null = null;
  let bestAny: { name: string; distance: number } | null = null;

  // Check against all popular packages with early termination (maxDistance=2)
  for (const popularPkg of POPULAR_PACKAGES) {
    const distance = levenshteinDistance(baseName, popularPkg.name, 2);

    // Only consider matches with distance > 0 and ≤2 (distance=0 means exact match, not typosquat)
    // This prevents false positives for scoped packages like @types/node, @babel/core
    if (distance > 0 && distance <= 2) {
      if (TOP_100_SET.has(popularPkg.name) && (!bestTop100 || distance < bestTop100.distance)) {
        bestTop100 = { name: popularPkg.name, distance };
      }
      if (TOP_500_SET.has(popularPkg.name) && (!bestTop500 || distance < bestTop500.distance)) {
        bestTop500 = { name: popularPkg.name, distance };
      }
      if (!bestAny || distance < bestAny.distance) {
        bestAny = { name: popularPkg.name, distance };
      }
    }
  }

  // Apply confidence tiers from most dangerous to least dangerous,
  // each evaluated against its own best match within that tier

  // Critical: Edit distance ≤1 from top-100
  if (bestTop100 && bestTop100.distance <= 1) {
    return {
      confidence: 'critical',
      targetPackage: bestTop100.name,
      editDistance: bestTop100.distance,
      reason: `Name is ${bestTop100.distance} character${bestTop100.distance === 1 ? '' : 's'} from "${bestTop100.name}"`,
    };
  }

  // High: Edit distance ≤2 from top-500 AND (age <30 days OR ≤1 maintainer)
  if (bestTop500 && bestTop500.distance <= 2 && (isYoung || maintainerCount <= 1)) {
    return {
      confidence: 'high',
      targetPackage: bestTop500.name,
      editDistance: bestTop500.distance,
      reason: `Name is ${bestTop500.distance} character${bestTop500.distance === 1 ? '' : 's'} from "${bestTop500.name}" and package ${isYoung ? `was published ${packageAge} day${packageAge === 1 ? '' : 's'} ago` : `has ${maintainerCount} maintainer${maintainerCount === 1 ? '' : 's'}`}`,
    };
  }

  // Medium: Edit distance ≤2 from any top-1000 package
  if (bestAny && bestAny.distance <= 2) {
    return {
      confidence: 'medium',
      targetPackage: bestAny.name,
      editDistance: bestAny.distance,
      reason: `Name is ${bestAny.distance} character${bestAny.distance === 1 ? '' : 's'} from "${bestAny.name}"`,
    };
  }

  // Low: Contains exact name of top-100 as substring AND (age <30 days OR ≤1 maintainer)
  // This prevents false positives for legitimate packages like "react-native", "express-validator"
  for (const top100Pkg of Array.from(TOP_100_SET)) {
    if (
      baseName.includes(top100Pkg) &&
      baseName !== top100Pkg &&
      (isYoung || maintainerCount <= 1)
    ) {
      return {
        confidence: 'low',
        targetPackage: top100Pkg,
        reason: `Name contains "${top100Pkg}" as substring and package ${isYoung ? `was published ${packageAge} day${packageAge === 1 ? '' : 's'} ago` : `has ${maintainerCount} maintainer${maintainerCount === 1 ? '' : 's'}`}`,
      };
    }
  }

  return { confidence: 'safe' };
}
