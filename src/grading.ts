import type { Grade } from './types.js';

/**
 * Valid grade values in order from best to worst
 */
export const VALID_GRADES: readonly Grade[] = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

/**
 * Check if a string is a valid grade
 */
export function isValidGrade(value: string): value is Grade {
  return VALID_GRADES.includes(value as Grade);
}

/**
 * Compare two grades - returns true if actual grade is worse than or equal to threshold
 * @param actual The actual grade received
 * @param threshold The threshold grade to compare against
 * @returns true if actual grade fails the threshold (is at or below it)
 *
 * @example
 * isGradeAtOrBelowThreshold('C', 'C') // true - C fails threshold C
 * isGradeAtOrBelowThreshold('D', 'C') // true - D is worse than C
 * isGradeAtOrBelowThreshold('B', 'C') // false - B is better than C
 */
export function isGradeAtOrBelowThreshold(actual: Grade, threshold: Grade): boolean {
  const gradeValues: Record<Grade, number> = { A: 0, B: 1, C: 2, D: 3, E: 4, F: 5 };
  return gradeValues[actual] >= gradeValues[threshold];
}
