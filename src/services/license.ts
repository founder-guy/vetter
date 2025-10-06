import type { LicenseInfo, LicenseCategory } from '../types.js';

/**
 * Strong copyleft licenses requiring full source disclosure (uppercase for case-insensitive matching)
 */
const STRONG_COPYLEFT = new Set([
  'GPL-1.0',
  'GPL-1.0+',
  'GPL-1.0-ONLY',
  'GPL-1.0-OR-LATER',
  'GPL-2.0',
  'GPL-2.0+',
  'GPL-2.0-ONLY',
  'GPL-2.0-OR-LATER',
  'GPL-3.0',
  'GPL-3.0+',
  'GPL-3.0-ONLY',
  'GPL-3.0-OR-LATER',
]);

/**
 * Network copyleft (AGPL) - copyleft triggered by network interaction (uppercase for case-insensitive matching)
 */
const NETWORK_COPYLEFT = new Set([
  'AGPL-1.0',
  'AGPL-1.0-ONLY',
  'AGPL-1.0-OR-LATER',
  'AGPL-3.0',
  'AGPL-3.0-ONLY',
  'AGPL-3.0-OR-LATER',
]);

/**
 * Weak copyleft - reciprocal only on modifications (uppercase for case-insensitive matching)
 */
const WEAK_COPYLEFT = new Set([
  'LGPL-2.0',
  'LGPL-2.0+',
  'LGPL-2.0-ONLY',
  'LGPL-2.0-OR-LATER',
  'LGPL-2.1',
  'LGPL-2.1+',
  'LGPL-2.1-ONLY',
  'LGPL-2.1-OR-LATER',
  'LGPL-3.0',
  'LGPL-3.0+',
  'LGPL-3.0-ONLY',
  'LGPL-3.0-OR-LATER',
  'MPL-1.0',
  'MPL-1.1',
  'MPL-2.0',
  'MPL-2.0-NO-COPYLEFT-EXCEPTION',
  'EPL-1.0',
  'EPL-2.0',
  'CDDL-1.0',
  'CDDL-1.1',
]);

/**
 * Deprecated or problematic licenses (uppercase for case-insensitive matching)
 */
const DEPRECATED = new Set([
  'JSON', // Problematic "shall be used for Good, not Evil" clause
  'BSD-4-CLAUSE', // Old BSD with advertising clause
  'CC-BY-NC-1.0',
  'CC-BY-NC-2.0',
  'CC-BY-NC-2.5',
  'CC-BY-NC-3.0',
  'CC-BY-NC-4.0',
  'CC-BY-NC-ND-1.0',
  'CC-BY-NC-ND-2.0',
  'CC-BY-NC-ND-2.5',
  'CC-BY-NC-ND-3.0',
  'CC-BY-NC-ND-4.0',
  'CC-BY-NC-SA-1.0',
  'CC-BY-NC-SA-2.0',
  'CC-BY-NC-SA-2.5',
  'CC-BY-NC-SA-3.0',
  'CC-BY-NC-SA-4.0',
]);

/**
 * Permissive licenses (uppercase for case-insensitive matching)
 */
const PERMISSIVE = new Set([
  'MIT',
  '0BSD',
  'BSD',
  'BSD-2-CLAUSE',
  'BSD-3-CLAUSE',
  'BSD-3-CLAUSE-CLEAR',
  'APACHE-1.0',
  'APACHE-1.1',
  'APACHE-2.0',
  'ISC',
  'UNLICENSE',
  'CC0-1.0',
  'WTFPL',
  'ZLIB',
  'PYTHON-2.0',
]);

/**
 * Proprietary/unlicensed markers
 */
const PROPRIETARY_MARKERS = new Set([
  'UNLICENSED',
  'PROPRIETARY',
  'SEE LICENSE IN',
  'SEE LICENSE',
  'COMMERCIAL',
  'SSPL-1.0', // Server Side Public License - treated as proprietary/high risk
]);

/**
 * Determine whether an expression is fully wrapped in a single matching pair
 * of parentheses (e.g. "(MIT)" or "((MIT AND ISC))").
 */
function hasWrappingParens(expression: string): boolean {
  if (!expression.startsWith('(') || !expression.endsWith(')')) {
    return false;
  }

  let depth = 0;
  for (let i = 0; i < expression.length; i++) {
    const char = expression[i];
    if (char === '(') {
      depth++;
    } else if (char === ')') {
      depth--;
      if (depth === 0 && i < expression.length - 1) {
        // Matching closing paren occurs before the end, so outer parens
        // do not wrap the entire expression.
        return false;
      }
    }

    if (depth < 0) {
      return false;
    }
  }

  return depth === 0;
}

/**
 * Remove any fully wrapping parentheses around an expression, repeating until
 * none remain (e.g. "((MIT))" -> "MIT").
 */
function stripWrappingParens(expression: string): string {
  let result = expression.trim();
  while (hasWrappingParens(result)) {
    result = result.slice(1, -1).trim();
  }
  return result;
}

/**
 * Categorize a single SPDX license identifier
 * Note: SPDX identifiers are case-insensitive per spec, so we normalize to uppercase
 */
function categorizeSingleLicense(license: string): LicenseCategory {
  const cleaned = stripWrappingParens(license);
  const normalized = cleaned.toUpperCase();

  // Check proprietary markers first
  for (const marker of PROPRIETARY_MARKERS) {
    if (normalized.includes(marker)) {
      return 'proprietary';
    }
  }

  // Check specific categories (sets contain uppercase SPDX IDs)
  if (NETWORK_COPYLEFT.has(normalized)) {
    return 'network-copyleft';
  }
  if (STRONG_COPYLEFT.has(normalized)) {
    return 'strong-copyleft';
  }
  if (WEAK_COPYLEFT.has(normalized)) {
    return 'weak-copyleft';
  }
  if (DEPRECATED.has(normalized)) {
    return 'deprecated';
  }
  if (PERMISSIVE.has(normalized)) {
    return 'permissive';
  }

  // Unknown license
  return 'unknown';
}

/**
 * Split expression by top-level operator, respecting parentheses.
 * Example: "MIT OR (Apache-2.0 AND GPL-3.0)" split by OR -> ["MIT", "(Apache-2.0 AND GPL-3.0)"]
 */
function splitByTopLevelOperator(expression: string, operator: 'OR' | 'AND'): string[] {
  const parts: string[] = [];
  const pattern = operator === 'OR' ? ' OR ' : ' AND ';
  let current = '';
  let depth = 0;
  const upper = expression.toUpperCase();

  for (let i = 0; i < expression.length; i++) {
    const char = expression[i];

    if (char === '(') {
      depth++;
      current += char;
    } else if (char === ')') {
      depth--;
      current += char;
    } else if (depth === 0 && upper.substring(i, i + pattern.length) === pattern) {
      // Found top-level operator
      parts.push(current.trim());
      current = '';
      i += pattern.length - 1; // Skip the operator (minus 1 because loop will increment)
    } else {
      current += char;
    }
  }

  // Add remaining part
  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

/**
 * Parse SPDX expression and categorize by worst-case risk
 * Implements proper operator precedence: AND binds tighter than OR
 * Examples:
 * - "MIT OR Apache-2.0" -> permissive (both are permissive)
 * - "MIT OR Apache-2.0 AND GPL-3.0" -> MIT OR (Apache-2.0 AND GPL-3.0) -> permissive (one branch is safe)
 * - "GPL-3.0 AND LGPL-3.0" -> strong-copyleft (worst case)
 * - "(MIT OR Apache-2.0) AND GPL-3.0" -> parentheses force OR first -> strong-copyleft
 * Note: Handles case-insensitive OR/AND operators and respects parentheses
 */
function categorizeExpression(expression: string): LicenseCategory {
  const trimmed = stripWrappingParens(expression);

  // SPDX operator precedence: AND binds tighter than OR
  // So we check for OR first (lower precedence), and only split by AND if no OR exists

  // Check for top-level OR operator (lowest precedence)
  const orParts = splitByTopLevelOperator(trimmed, 'OR');
  if (orParts.length > 1) {
    // Has top-level OR: process each branch and apply "best case" logic
    const categories = orParts.map(part => categorizeExpression(part));

    // If any branch is permissive, consider it acceptable
    if (categories.includes('permissive')) {
      return 'permissive';
    }

    // Otherwise, return worst case
    return getWorstCategory(categories);
  }

  // No top-level OR, check for AND (higher precedence)
  const andParts = splitByTopLevelOperator(trimmed, 'AND');
  if (andParts.length > 1) {
    // Has top-level AND: process each branch and apply "worst case" logic
    const categories = andParts.map(part => categorizeExpression(part));
    return getWorstCategory(categories);
  }

  // Single license (may still have wrapping parens like "(MIT)")
  return categorizeSingleLicense(trimmed);
}

/**
 * Determine worst-case license category from a list
 * Priority: network-copyleft > strong-copyleft > proprietary > deprecated > weak-copyleft > unknown > permissive
 */
function getWorstCategory(categories: LicenseCategory[]): LicenseCategory {
  if (categories.includes('network-copyleft')) return 'network-copyleft';
  if (categories.includes('strong-copyleft')) return 'strong-copyleft';
  if (categories.includes('proprietary')) return 'proprietary';
  if (categories.includes('deprecated')) return 'deprecated';
  if (categories.includes('weak-copyleft')) return 'weak-copyleft';
  if (categories.includes('unknown')) return 'unknown';
  return 'permissive';
}

/**
 * Analyze package license and categorize risk
 */
export function analyzeLicense(rawLicense?: string): LicenseInfo {
  // Handle missing license
  if (!rawLicense) {
    return {
      category: 'unlicensed',
    };
  }

  const trimmed = rawLicense.trim();

  // Handle empty string
  if (!trimmed) {
    return {
      raw: rawLicense,
      category: 'unlicensed',
    };
  }

  // Categorize the license
  const category = categorizeExpression(trimmed);

  return {
    raw: rawLicense,
    category,
    normalizedSpdx: trimmed,
  };
}
