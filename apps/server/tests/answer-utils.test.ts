import { describe, expect, it } from 'vitest';
import { matchesAnswer, normalizeArabic } from '../src/lib/answer-utils.js';

describe('answer-utils', () => {
  it('normalizes Arabic variants', () => {
    expect(normalizeArabic('أحمد')).toBe('احمد');
    expect(normalizeArabic('مدرسة')).toBe('مدرسه');
  });

  it('matches close answers with alternatives', () => {
    expect(matchesAnswer('الرياض', 'الرياض')).toBe(true);
    expect(matchesAnswer('المانيا', 'ألمانيا')).toBe(true);
    expect(matchesAnswer('امريكا', 'الولايات المتحدة الأمريكية', ['USA', 'امريكا'])).toBe(true);
    expect(matchesAnswer('س', 'الرياض')).toBe(false);
  });
});