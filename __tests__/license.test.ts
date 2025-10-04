import { describe, it, expect } from 'vitest';
import { analyzeLicense } from '../src/services/license.js';

describe('analyzeLicense', () => {
  describe('permissive licenses', () => {
    it('should categorize MIT as permissive', () => {
      const result = analyzeLicense('MIT');
      expect(result.category).toBe('permissive');
      expect(result.raw).toBe('MIT');
      expect(result.normalizedSpdx).toBe('MIT');
    });

    it('should categorize Apache-2.0 as permissive', () => {
      const result = analyzeLicense('Apache-2.0');
      expect(result.category).toBe('permissive');
    });

    it('should categorize BSD-3-Clause as permissive', () => {
      const result = analyzeLicense('BSD-3-Clause');
      expect(result.category).toBe('permissive');
    });

    it('should categorize ISC as permissive', () => {
      const result = analyzeLicense('ISC');
      expect(result.category).toBe('permissive');
    });

    it('should categorize Unlicense as permissive', () => {
      const result = analyzeLicense('Unlicense');
      expect(result.category).toBe('permissive');
    });
  });

  describe('strong copyleft licenses', () => {
    it('should categorize GPL-3.0 as strong-copyleft', () => {
      const result = analyzeLicense('GPL-3.0');
      expect(result.category).toBe('strong-copyleft');
      expect(result.raw).toBe('GPL-3.0');
    });

    it('should categorize GPL-2.0 as strong-copyleft', () => {
      const result = analyzeLicense('GPL-2.0');
      expect(result.category).toBe('strong-copyleft');
    });

    it('should categorize GPL-3.0-only as strong-copyleft', () => {
      const result = analyzeLicense('GPL-3.0-only');
      expect(result.category).toBe('strong-copyleft');
    });

    it('should categorize GPL-2.0-or-later as strong-copyleft', () => {
      const result = analyzeLicense('GPL-2.0-or-later');
      expect(result.category).toBe('strong-copyleft');
    });
  });

  describe('network copyleft licenses', () => {
    it('should categorize AGPL-3.0 as network-copyleft', () => {
      const result = analyzeLicense('AGPL-3.0');
      expect(result.category).toBe('network-copyleft');
      expect(result.raw).toBe('AGPL-3.0');
    });

    it('should categorize AGPL-3.0-only as network-copyleft', () => {
      const result = analyzeLicense('AGPL-3.0-only');
      expect(result.category).toBe('network-copyleft');
    });

    it('should categorize AGPL-1.0 as network-copyleft', () => {
      const result = analyzeLicense('AGPL-1.0');
      expect(result.category).toBe('network-copyleft');
    });
  });

  describe('weak copyleft licenses', () => {
    it('should categorize LGPL-2.1 as weak-copyleft', () => {
      const result = analyzeLicense('LGPL-2.1');
      expect(result.category).toBe('weak-copyleft');
    });

    it('should categorize LGPL-3.0 as weak-copyleft', () => {
      const result = analyzeLicense('LGPL-3.0');
      expect(result.category).toBe('weak-copyleft');
    });

    it('should categorize MPL-2.0 as weak-copyleft', () => {
      const result = analyzeLicense('MPL-2.0');
      expect(result.category).toBe('weak-copyleft');
    });

    it('should categorize EPL-2.0 as weak-copyleft', () => {
      const result = analyzeLicense('EPL-2.0');
      expect(result.category).toBe('weak-copyleft');
    });

  });

  describe('deprecated licenses', () => {
    it('should categorize JSON as deprecated', () => {
      const result = analyzeLicense('JSON');
      expect(result.category).toBe('deprecated');
    });

    it('should categorize BSD-4-Clause as deprecated', () => {
      const result = analyzeLicense('BSD-4-Clause');
      expect(result.category).toBe('deprecated');
    });

    it('should categorize CC-BY-NC-4.0 as deprecated', () => {
      const result = analyzeLicense('CC-BY-NC-4.0');
      expect(result.category).toBe('deprecated');
    });
  });

  describe('proprietary licenses', () => {
    it('should categorize UNLICENSED as proprietary', () => {
      const result = analyzeLicense('UNLICENSED');
      expect(result.category).toBe('proprietary');
    });

    it('should categorize PROPRIETARY as proprietary', () => {
      const result = analyzeLicense('PROPRIETARY');
      expect(result.category).toBe('proprietary');
    });

    it('should categorize SEE LICENSE IN as proprietary', () => {
      const result = analyzeLicense('SEE LICENSE IN LICENSE.txt');
      expect(result.category).toBe('proprietary');
    });

    it('should categorize SSPL-1.0 as proprietary', () => {
      const result = analyzeLicense('SSPL-1.0');
      expect(result.category).toBe('proprietary');
    });
  });

  describe('unlicensed packages', () => {
    it('should categorize missing license as unlicensed', () => {
      const result = analyzeLicense(undefined);
      expect(result.category).toBe('unlicensed');
      expect(result.raw).toBeUndefined();
    });

    it('should categorize empty string as unlicensed', () => {
      const result = analyzeLicense('');
      expect(result.category).toBe('unlicensed');
    });

    it('should categorize whitespace-only string as unlicensed', () => {
      const result = analyzeLicense('   ');
      expect(result.category).toBe('unlicensed');
    });
  });

  describe('unknown licenses', () => {
    it('should categorize unrecognized license as unknown', () => {
      const result = analyzeLicense('Custom-License-1.0');
      expect(result.category).toBe('unknown');
      expect(result.raw).toBe('Custom-License-1.0');
    });

    it('should categorize malformed license as unknown', () => {
      const result = analyzeLicense('Not a real license');
      expect(result.category).toBe('unknown');
    });
  });

  describe('SPDX expressions', () => {
    it('should categorize MIT OR Apache-2.0 as permissive (both permissive)', () => {
      const result = analyzeLicense('MIT OR Apache-2.0');
      expect(result.category).toBe('permissive');
    });

    it('should categorize MIT OR GPL-3.0 as permissive (one is safe)', () => {
      const result = analyzeLicense('MIT OR GPL-3.0');
      expect(result.category).toBe('permissive');
    });

    it('should categorize GPL-3.0 OR AGPL-3.0 as network-copyleft (worst case)', () => {
      const result = analyzeLicense('GPL-3.0 OR AGPL-3.0');
      expect(result.category).toBe('network-copyleft');
    });

    it('should categorize GPL-3.0 AND LGPL-3.0 as strong-copyleft (worst case)', () => {
      const result = analyzeLicense('GPL-3.0 AND LGPL-3.0');
      expect(result.category).toBe('strong-copyleft');
    });

    it('should categorize LGPL-2.1 OR MPL-2.0 as weak-copyleft (both weak)', () => {
      const result = analyzeLicense('LGPL-2.1 OR MPL-2.0');
      expect(result.category).toBe('weak-copyleft');
    });

    it('should categorize MIT AND Apache-2.0 as permissive (all permissive)', () => {
      const result = analyzeLicense('MIT AND Apache-2.0');
      expect(result.category).toBe('permissive');
    });
  });

  describe('edge cases', () => {
    it('should handle whitespace in license strings', () => {
      const result = analyzeLicense('  MIT  ');
      expect(result.category).toBe('permissive');
    });

    it('should handle whitespace in SPDX expressions', () => {
      const result = analyzeLicense('MIT  OR  Apache-2.0');
      expect(result.category).toBe('permissive');
    });
  });

  describe('case-insensitive matching', () => {
    it('should handle lowercase MIT', () => {
      const result = analyzeLicense('mit');
      expect(result.category).toBe('permissive');
      expect(result.raw).toBe('mit');
    });

    it('should handle lowercase apache-2.0', () => {
      const result = analyzeLicense('apache-2.0');
      expect(result.category).toBe('permissive');
    });

    it('should handle lowercase isc', () => {
      const result = analyzeLicense('isc');
      expect(result.category).toBe('permissive');
    });

    it('should handle lowercase bsd-3-clause', () => {
      const result = analyzeLicense('bsd-3-clause');
      expect(result.category).toBe('permissive');
    });

    it('should handle lowercase gpl-3.0', () => {
      const result = analyzeLicense('gpl-3.0');
      expect(result.category).toBe('strong-copyleft');
    });

    it('should handle lowercase agpl-3.0', () => {
      const result = analyzeLicense('agpl-3.0');
      expect(result.category).toBe('network-copyleft');
    });

    it('should handle lowercase lgpl-2.1', () => {
      const result = analyzeLicense('lgpl-2.1');
      expect(result.category).toBe('weak-copyleft');
    });

    it('should handle mixed case licenses', () => {
      const result = analyzeLicense('MiT');
      expect(result.category).toBe('permissive');
    });

    it('should handle lowercase SPDX expressions', () => {
      const result = analyzeLicense('mit or apache-2.0');
      expect(result.category).toBe('permissive');
    });

    it('should handle mixed case SPDX expressions', () => {
      const result = analyzeLicense('MiT OR Apache-2.0');
      expect(result.category).toBe('permissive');
    });
  });

  describe('parentheses handling', () => {
    it('should strip wrapping parentheses from single license', () => {
      const result = analyzeLicense('(MIT)');
      expect(result.category).toBe('permissive');
    });

    it('should strip wrapping parentheses from Apache-2.0', () => {
      const result = analyzeLicense('(Apache-2.0)');
      expect(result.category).toBe('permissive');
    });

    it('should strip multiple levels of wrapping parentheses', () => {
      const result = analyzeLicense('((MIT))');
      expect(result.category).toBe('permissive');
    });

    it('should strip wrapping parentheses from OR expression', () => {
      const result = analyzeLicense('(MIT OR Apache-2.0)');
      expect(result.category).toBe('permissive');
    });

    it('should strip wrapping parentheses from AND expression', () => {
      const result = analyzeLicense('(GPL-3.0 AND LGPL-3.0)');
      expect(result.category).toBe('strong-copyleft');
    });

    it('should handle parentheses around individual licenses in OR', () => {
      const result = analyzeLicense('(MIT) OR (Apache-2.0)');
      expect(result.category).toBe('permissive');
    });

    it('should handle parentheses around individual licenses in AND', () => {
      const result = analyzeLicense('(MIT) AND (Apache-2.0)');
      expect(result.category).toBe('permissive');
    });

    it('should handle nested expressions with parentheses', () => {
      const result = analyzeLicense('MIT AND (GPL-2.0 OR LGPL-2.1)');
      // MIT AND (strong-copyleft OR weak-copyleft) = MIT AND strong-copyleft = strong-copyleft
      expect(result.category).toBe('strong-copyleft');
    });

    it('should handle complex nested expressions', () => {
      const result = analyzeLicense('(MIT OR Apache-2.0) AND (GPL-3.0 OR LGPL-2.1)');
      // (permissive) AND (strong-copyleft) = worst case = strong-copyleft
      expect(result.category).toBe('strong-copyleft');
    });

    it('should handle parentheses with mixed case operators', () => {
      const result = analyzeLicense('(mit or apache-2.0)');
      expect(result.category).toBe('permissive');
    });

    it('should handle single license with extra whitespace and parentheses', () => {
      const result = analyzeLicense('  ( MIT )  ');
      expect(result.category).toBe('permissive');
    });

    it('should handle GPL OR MIT (at least one permissive)', () => {
      const result = analyzeLicense('(GPL-3.0 OR MIT)');
      expect(result.category).toBe('permissive');
    });

    it('should handle deeply nested parentheses', () => {
      const result = analyzeLicense('((MIT OR Apache-2.0) AND (BSD-3-Clause OR ISC))');
      expect(result.category).toBe('permissive');
    });

    it('should handle real-world example with parentheses', () => {
      const result = analyzeLicense('(MIT OR GPL-2.0)');
      expect(result.category).toBe('permissive'); // At least one is permissive
    });

    it('should handle GPL-3.0 OR LGPL-2.1 (both copyleft)', () => {
      const result = analyzeLicense('GPL-3.0 OR LGPL-2.1');
      expect(result.category).toBe('strong-copyleft'); // Worst case
    });

    it('should handle (GPL-3.0 OR LGPL-2.1) with parentheses', () => {
      const result = analyzeLicense('(GPL-3.0 OR LGPL-2.1)');
      expect(result.category).toBe('strong-copyleft'); // Worst case
    });
  });

  describe('operator precedence', () => {
    it('should categorize Apache-2.0 correctly', () => {
      const result = analyzeLicense('Apache-2.0');
      expect(result.category).toBe('permissive');
    });

    it('should categorize BSD-2-CLAUSE correctly', () => {
      const result = analyzeLicense('BSD-2-CLAUSE');
      expect(result.category).toBe('permissive');
    });

    it('should handle Apache-2.0 AND BSD-2-CLAUSE', () => {
      const result = analyzeLicense('Apache-2.0 AND BSD-2-CLAUSE');
      expect(result.category).toBe('permissive');
    });

    it('should handle (Apache-2.0 AND BSD-2-CLAUSE)', () => {
      const result = analyzeLicense('(Apache-2.0 AND BSD-2-CLAUSE)');
      expect(result.category).toBe('permissive');
    });

    it('should respect AND binding tighter than OR (no parens)', () => {
      // MIT OR Apache-2.0 AND GPL-3.0 means MIT OR (Apache-2.0 AND GPL-3.0)
      // User can choose MIT (permissive), so result should be permissive
      const result = analyzeLicense('MIT OR Apache-2.0 AND GPL-3.0');
      expect(result.category).toBe('permissive');
    });

    it('should respect AND binding tighter than OR (reverse order)', () => {
      // GPL-3.0 AND Apache-2.0 OR MIT means (GPL-3.0 AND Apache-2.0) OR MIT
      // User can choose MIT (permissive), so result should be permissive
      const result = analyzeLicense('GPL-3.0 AND Apache-2.0 OR MIT');
      expect(result.category).toBe('permissive');
    });

    it('should allow parentheses to override precedence', () => {
      // (MIT OR Apache-2.0) AND GPL-3.0 - parentheses force OR first
      // All branches must be acceptable, worst case is GPL-3.0
      const result = analyzeLicense('(MIT OR Apache-2.0) AND GPL-3.0');
      expect(result.category).toBe('strong-copyleft');
    });

    it('should handle multiple AND operators with single OR', () => {
      // MIT OR Apache-2.0 AND GPL-3.0 AND LGPL-2.1
      // Means MIT OR ((Apache-2.0 AND GPL-3.0) AND LGPL-2.1)
      // User can choose MIT, so permissive
      const result = analyzeLicense('MIT OR Apache-2.0 AND GPL-3.0 AND LGPL-2.1');
      expect(result.category).toBe('permissive');
    });

    it('should handle multiple OR operators with single AND', () => {
      // GPL-3.0 OR MIT OR Apache-2.0 AND LGPL-2.1
      // Means GPL-3.0 OR MIT OR (Apache-2.0 AND LGPL-2.1)
      // At least one branch (MIT) is permissive
      const result = analyzeLicense('GPL-3.0 OR MIT OR Apache-2.0 AND LGPL-2.1');
      expect(result.category).toBe('permissive');
    });

    it('should handle all copyleft with operator precedence', () => {
      // AGPL-3.0 OR GPL-3.0 AND LGPL-2.1
      // Means AGPL-3.0 OR (GPL-3.0 AND LGPL-2.1)
      // All branches are copyleft, worst is network-copyleft
      const result = analyzeLicense('AGPL-3.0 OR GPL-3.0 AND LGPL-2.1');
      expect(result.category).toBe('network-copyleft');
    });

    it('should handle simple AND inside parentheses', () => {
      // (MIT AND Apache-2.0)
      // Both are permissive, result should be permissive
      const result = analyzeLicense('(MIT AND Apache-2.0)');
      expect(result.category).toBe('permissive');
    });

    it('should handle two AND groups joined by OR', () => {
      // (MIT AND Apache-2.0) OR ISC
      // Both branches permissive
      const result = analyzeLicense('(MIT AND Apache-2.0) OR ISC');
      expect(result.category).toBe('permissive');
    });

    it('should handle complex precedence with parentheses', () => {
      // (MIT AND ISC) OR (Apache-2.0 AND BSD-2-CLAUSE)
      // Both branches are permissive AND permissive = permissive
      const result = analyzeLicense('(MIT AND ISC) OR (Apache-2.0 AND BSD-2-CLAUSE)');
      expect(result.category).toBe('permissive');
    });

    it('should handle nested precedence without parens', () => {
      // MIT OR Apache-2.0 AND GPL-3.0 OR ISC
      // Means MIT OR (Apache-2.0 AND GPL-3.0) OR ISC
      // At least one branch (MIT or ISC) is permissive
      const result = analyzeLicense('MIT OR Apache-2.0 AND GPL-3.0 OR ISC');
      expect(result.category).toBe('permissive');
    });
  });
});
