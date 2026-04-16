import { describe, it, expect } from 'vitest';
import { detectTyposquatting } from '../src/services/typosquatting.js';
import type { PackageSnapshot } from '../src/types.js';
import { TOP_100_SET, TOP_500_SET, TOP_1000_SET } from '../src/data/popular-packages.js';

// Use actual packages from the sets to avoid brittleness
const SAMPLE_TOP_100 = Array.from(TOP_100_SET).slice(0, 5);
const SAMPLE_TOP_500 = Array.from(TOP_500_SET)
  .filter((p) => !TOP_100_SET.has(p))
  .slice(0, 5);
const SAMPLE_TOP_1000 = Array.from(TOP_1000_SET)
  .filter((p) => !TOP_500_SET.has(p))
  .slice(0, 5);

// Helper to create mock PackageSnapshot
function createMockSnapshot(
  name: string,
  daysOld: number,
  maintainerCount: number
): PackageSnapshot {
  return {
    name,
    version: '1.0.0',
    publishedAt: new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000),
    publishedAtKnown: true,
    maintainers: Array(maintainerCount).fill('mock@example.com'),
    dependencies: {},
    devDependencies: {},
  };
}

// Helper to create typosquat name (add extra char)
function typosquat(name: string, chars = 1): string {
  return name + 's'.repeat(chars); // Simple: add 's' characters
}

describe('typosquatting detection', () => {
  describe('safe packages', () => {
    it('should mark popular packages as safe', () => {
      const pkg = SAMPLE_TOP_100[0];
      const result = detectTyposquatting(pkg, createMockSnapshot(pkg, 100, 5));
      expect(result.confidence).toBe('safe');
    });

    it('should mark legitimate unrelated packages as safe', () => {
      const result = detectTyposquatting(
        'my-custom-lib',
        createMockSnapshot('my-custom-lib', 100, 2)
      );
      expect(result.confidence).toBe('safe');
    });

    it('should NOT flag established packages with legitimate names', () => {
      // Simulate packages like "react-native" (contains "react" but is legitimate)
      const result = detectTyposquatting(
        'react-native',
        createMockSnapshot('react-native', 1000, 10)
      );
      expect(result.confidence).toBe('safe');
    });
  });

  describe('critical confidence', () => {
    it('should flag 1-char distance from top-100 as critical', () => {
      const target = SAMPLE_TOP_100[0];
      const typo = typosquat(target, 1);
      const result = detectTyposquatting(typo, createMockSnapshot(typo, 5, 1));
      expect(result.confidence).toBe('critical');
      expect(result.targetPackage).toBe(target);
      expect(result.editDistance).toBe(1);
    });

    it('should include clear reason message', () => {
      const target = SAMPLE_TOP_100[0];
      const typo = typosquat(target, 1);
      const result = detectTyposquatting(typo, createMockSnapshot(typo, 5, 1));
      expect(result.reason).toContain(`1 character`);
      expect(result.reason).toContain(target);
    });
  });

  describe('high confidence', () => {
    it('should flag 2-char distance from top-500 with age <30 days as high', () => {
      const target = SAMPLE_TOP_500[0];
      const typo = typosquat(target, 2);
      const result = detectTyposquatting(typo, createMockSnapshot(typo, 10, 5));
      expect(result.confidence).toBe('high');
      expect(result.targetPackage).toBe(target);
    });

    it('should flag 2-char distance from top-500 with ≤1 maintainer as high', () => {
      const target = SAMPLE_TOP_500[0];
      const typo = typosquat(target, 2);
      const result = detectTyposquatting(typo, createMockSnapshot(typo, 200, 1));
      expect(result.confidence).toBe('high');
      expect(result.targetPackage).toBe(target);
    });

    it('should NOT flag old established packages as high', () => {
      // 2-char distance but >30 days old and >1 maintainer
      const target = SAMPLE_TOP_500[0];
      const typo = typosquat(target, 2);
      const result = detectTyposquatting(typo, createMockSnapshot(typo, 500, 3));
      expect(result.confidence).not.toBe('high');
      expect(result.confidence).toBe('medium'); // Should downgrade to medium
    });
  });

  describe('medium confidence', () => {
    it('should flag 2-char distance from top-1000 as medium', () => {
      const target = SAMPLE_TOP_1000[0];
      const typo = typosquat(target, 2);
      const result = detectTyposquatting(typo, createMockSnapshot(typo, 200, 3));
      expect(result.confidence).toBe('medium');
    });
  });

  describe('low confidence', () => {
    it('should flag packages containing top-100 names as substring with young age', () => {
      const target = SAMPLE_TOP_100[0];
      const suspicious = `${target}-utils`;
      const result = detectTyposquatting(suspicious, createMockSnapshot(suspicious, 5, 3));
      expect(result.confidence).toBe('low');
      expect(result.targetPackage).toBe(target);
    });

    it('should flag packages containing top-100 names as substring with ≤1 maintainer', () => {
      const target = SAMPLE_TOP_100[0];
      const suspicious = `${target}-helper`;
      const result = detectTyposquatting(suspicious, createMockSnapshot(suspicious, 200, 1));
      expect(result.confidence).toBe('low');
    });

    it('should NOT flag established packages with substring matches', () => {
      // Simulate legitimate packages like "express-validator" (old + multiple maintainers)
      const target = SAMPLE_TOP_100[0];
      const legitimate = `${target}-validator`;
      const result = detectTyposquatting(legitimate, createMockSnapshot(legitimate, 500, 5));
      expect(result.confidence).toBe('safe');
    });

    it('should NOT flag if exact match (not a substring case)', () => {
      const pkg = SAMPLE_TOP_100[0];
      const result = detectTyposquatting(pkg, createMockSnapshot(pkg, 100, 5));
      expect(result.confidence).toBe('safe');
    });
  });

  describe('scoped packages', () => {
    it('should detect 1-char scope typos as critical', () => {
      // @typess/node vs @types/node (assuming "types" is in OFFICIAL_SCOPES)
      const result = detectTyposquatting(
        '@typess/node',
        createMockSnapshot('@typess/node', 5, 1)
      );
      expect(result.confidence).toBe('critical');
      expect(result.targetPackage).toContain('@types/');
    });

    it('should detect 2-char scope typos as high', () => {
      // @babbeel/core vs @babel/core (distance 2: delete 'b' and 'e')
      const result = detectTyposquatting(
        '@babbeel/core',
        createMockSnapshot('@babbeel/core', 10, 1)
      );
      expect(result.confidence).toBe('high');
      expect(result.targetPackage).toContain('@babel/');
    });

    it('should NOT flag legitimate scoped packages', () => {
      const result = detectTyposquatting(
        '@myorg/my-lib',
        createMockSnapshot('@myorg/my-lib', 100, 2)
      );
      expect(result.confidence).toBe('safe');
    });

    it('should NOT flag official scoped packages', () => {
      // Assuming @types/node exists in top packages or has exact base name match
      const result = detectTyposquatting(
        '@types/node',
        createMockSnapshot('@types/node', 500, 10)
      );
      expect(result.confidence).toBe('safe');
    });

    it('should NOT flag scoped packages with exact base name match', () => {
      // @types/chalk should be safe (base name "chalk" is exact match to popular package)
      const result = detectTyposquatting(
        '@types/chalk',
        createMockSnapshot('@types/chalk', 500, 10)
      );
      expect(result.confidence).toBe('safe');
    });
  });

  describe('edge cases', () => {
    it('should handle very short package names', () => {
      const result = detectTyposquatting('ab', createMockSnapshot('ab', 5, 1));
      // Should not crash, should have reasonable result
      expect(result).toBeDefined();
      expect(result.confidence).toBeDefined();
    });

    it('should handle packages with hyphens and underscores', () => {
      const result = detectTyposquatting(
        'some-package_name',
        createMockSnapshot('some-package_name', 100, 2)
      );
      expect(result).toBeDefined();
    });

    it('should handle long package names', () => {
      const longName = 'very-long-package-name-that-is-unusual';
      const result = detectTyposquatting(longName, createMockSnapshot(longName, 100, 2));
      expect(result).toBeDefined();
    });
  });

  describe('real-world scenarios', () => {
    it('should detect known typosquat patterns', () => {
      // lodassh (1 char from lodash)
      const result = detectTyposquatting('lodassh', createMockSnapshot('lodassh', 2, 1));
      expect(result.confidence).toBe('critical');
      expect(result.targetPackage).toBe('lodash');
    });

    it('should allow legitimate packages despite similarity', () => {
      // lodash-es is a real, legitimate package (established, multiple maintainers)
      const result = detectTyposquatting('lodash-es', createMockSnapshot('lodash-es', 1000, 10));
      expect(result.confidence).toBe('safe');
    });

    it('should not promote distance-2 top-500 match to "high" when publish date is unknown and package has multiple maintainers', () => {
      // Regression: before the fix, epoch-fallback publishedAt made
      // `packageAge < 30` true (Date.now() >> epoch gives a huge positive
      // age — but the OLD code used `Date.now()` fallback which produced
      // age=0, satisfying `age < 30` and forcing an instant-F). With the
      // fix, unknown dates drop the age signal entirely so we fall through
      // to the maintainer-count gate.
      const target = SAMPLE_TOP_500[0];
      const typo = typosquat(target, 2);
      const snapshot = createMockSnapshot(typo, 500, 3); // 3 maintainers
      // Simulate unknown publish date post-fix.
      snapshot.publishedAtKnown = false;
      snapshot.publishedAt = new Date(0);

      const result = detectTyposquatting(typo, snapshot);

      // Should NOT be 'high' (age gate can't fire; maintainer count > 1).
      // Falls through to medium (distance ≤2 from top-1000).
      expect(result.confidence).not.toBe('high');
      expect(result.confidence).toBe('medium');
    });

    it('should not let a closer low-tier match shadow a higher-tier match', () => {
      // "flattens" is distance 1 from "flatten" (top-1000 only)
      // and distance 2 from "flatted" (top-500).
      // With suspicious signals (new package, 1 maintainer), the top-500
      // match should trigger "high" — not be shadowed by the closer top-1000 match.
      const result = detectTyposquatting('flattens', createMockSnapshot('flattens', 5, 1));
      expect(result.confidence).toBe('high');
      expect(result.targetPackage).toBe('flatted');
    });
  });
});
