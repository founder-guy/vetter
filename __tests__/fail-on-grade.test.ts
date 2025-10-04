import { describe, it, expect } from 'vitest';
import { isGradeAtOrBelowThreshold } from '../src/grading.js';
import type { Grade } from '../src/types.js';

describe('Grade Comparison', () => {
  describe('isGradeAtOrBelowThreshold', () => {
    it('should return true when grade equals threshold', () => {
      expect(isGradeAtOrBelowThreshold('A', 'A')).toBe(true);
      expect(isGradeAtOrBelowThreshold('C', 'C')).toBe(true);
      expect(isGradeAtOrBelowThreshold('F', 'F')).toBe(true);
    });

    it('should return true when grade is worse than threshold', () => {
      expect(isGradeAtOrBelowThreshold('B', 'A')).toBe(true);
      expect(isGradeAtOrBelowThreshold('D', 'C')).toBe(true);
      expect(isGradeAtOrBelowThreshold('F', 'E')).toBe(true);
      expect(isGradeAtOrBelowThreshold('F', 'A')).toBe(true);
    });

    it('should return false when grade is better than threshold', () => {
      expect(isGradeAtOrBelowThreshold('A', 'B')).toBe(false);
      expect(isGradeAtOrBelowThreshold('C', 'D')).toBe(false);
      expect(isGradeAtOrBelowThreshold('E', 'F')).toBe(false);
      expect(isGradeAtOrBelowThreshold('A', 'F')).toBe(false);
    });

    it('should handle all grade combinations correctly', () => {
      // Test threshold C - should fail on C, D, E, F
      expect(isGradeAtOrBelowThreshold('A', 'C')).toBe(false);
      expect(isGradeAtOrBelowThreshold('B', 'C')).toBe(false);
      expect(isGradeAtOrBelowThreshold('C', 'C')).toBe(true);
      expect(isGradeAtOrBelowThreshold('D', 'C')).toBe(true);
      expect(isGradeAtOrBelowThreshold('E', 'C')).toBe(true);
      expect(isGradeAtOrBelowThreshold('F', 'C')).toBe(true);
    });
  });

  describe('Threshold Scenarios', () => {
    it('should correctly identify packages that fail threshold A', () => {
      // Threshold A - only A passes
      expect(isGradeAtOrBelowThreshold('A', 'A')).toBe(true);
      expect(isGradeAtOrBelowThreshold('B', 'A')).toBe(true);
      expect(isGradeAtOrBelowThreshold('C', 'A')).toBe(true);
    });

    it('should correctly identify packages that fail threshold C', () => {
      // Threshold C - A and B pass, C/D/E/F fail
      expect(isGradeAtOrBelowThreshold('A', 'C')).toBe(false); // passes
      expect(isGradeAtOrBelowThreshold('B', 'C')).toBe(false); // passes
      expect(isGradeAtOrBelowThreshold('C', 'C')).toBe(true);  // fails
      expect(isGradeAtOrBelowThreshold('D', 'C')).toBe(true);  // fails
    });

    it('should correctly identify packages that fail threshold F', () => {
      // Threshold F - only F fails
      expect(isGradeAtOrBelowThreshold('A', 'F')).toBe(false);
      expect(isGradeAtOrBelowThreshold('E', 'F')).toBe(false);
      expect(isGradeAtOrBelowThreshold('F', 'F')).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle best and worst grades', () => {
      // Best grade (A) vs worst threshold (F)
      expect(isGradeAtOrBelowThreshold('A', 'F')).toBe(false);

      // Worst grade (F) vs best threshold (A)
      expect(isGradeAtOrBelowThreshold('F', 'A')).toBe(true);
    });

    it('should handle adjacent grades', () => {
      expect(isGradeAtOrBelowThreshold('A', 'B')).toBe(false);
      expect(isGradeAtOrBelowThreshold('B', 'A')).toBe(true);
      expect(isGradeAtOrBelowThreshold('B', 'C')).toBe(false);
      expect(isGradeAtOrBelowThreshold('C', 'B')).toBe(true);
    });
  });
});

describe('CLI Integration Scenarios', () => {
  it('should understand --fail-on-grade C use case', () => {
    // Common CI scenario: fail on C or worse
    const threshold: Grade = 'C';

    // These should pass
    expect(isGradeAtOrBelowThreshold('A', threshold)).toBe(false);
    expect(isGradeAtOrBelowThreshold('B', threshold)).toBe(false);

    // These should fail
    expect(isGradeAtOrBelowThreshold('C', threshold)).toBe(true);
    expect(isGradeAtOrBelowThreshold('D', threshold)).toBe(true);
    expect(isGradeAtOrBelowThreshold('E', threshold)).toBe(true);
    expect(isGradeAtOrBelowThreshold('F', threshold)).toBe(true);
  });

  it('should understand --fail-on-grade D use case', () => {
    // Lenient CI scenario: only fail on D or worse
    const threshold: Grade = 'D';

    // These should pass
    expect(isGradeAtOrBelowThreshold('A', threshold)).toBe(false);
    expect(isGradeAtOrBelowThreshold('B', threshold)).toBe(false);
    expect(isGradeAtOrBelowThreshold('C', threshold)).toBe(false);

    // These should fail
    expect(isGradeAtOrBelowThreshold('D', threshold)).toBe(true);
    expect(isGradeAtOrBelowThreshold('E', threshold)).toBe(true);
    expect(isGradeAtOrBelowThreshold('F', threshold)).toBe(true);
  });

  it('should understand strict --fail-on-grade B use case', () => {
    // Strict CI scenario: only accept A, fail on B or worse
    const threshold: Grade = 'B';

    // Only A passes
    expect(isGradeAtOrBelowThreshold('A', threshold)).toBe(false);

    // All others fail
    expect(isGradeAtOrBelowThreshold('B', threshold)).toBe(true);
    expect(isGradeAtOrBelowThreshold('C', threshold)).toBe(true);
    expect(isGradeAtOrBelowThreshold('D', threshold)).toBe(true);
  });
});
