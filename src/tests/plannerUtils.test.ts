import { describe, expect, it } from 'vitest';
import { cn } from '../lib/utils';
import {
  formatClock,
  formatMinutesAsDuration,
  formatSessionBlocksShort,
  formatSessionsShort,
  parseClockInput,
} from '../planner/utils';
import { SAMPLE_COURSES } from '../shared/sampleData';
import { resolveManualEntries } from '../shared/scheduler';

describe('planner utils and cn helper', () => {
  it('formats durations, clocks, and parses clock inputs', () => {
    expect(formatMinutesAsDuration(45)).toBe('45m');
    expect(formatMinutesAsDuration(120)).toBe('2h');
    expect(formatMinutesAsDuration(150)).toBe('2h 30m');

    expect(formatClock(0)).toBe('--:--');
    expect(formatClock(545)).toBe('09:05');

    expect(parseClockInput('07:30')).toBe(450);
    expect(parseClockInput('invalid')).toBeNull();
  });

  it('formats short session summaries and merges tailwind class names', () => {
    const items = resolveManualEntries(SAMPLE_COURSES, [
      { courseCode: 'DING2040', parallelNumber: '1', practicalCode: '101' },
    ]);
    expect(formatSessionsShort(items[0])).toBe('Lun 09:00-11:00 · Mié 09:00-11:00');
    expect(formatSessionBlocksShort(items[0].practical!.sessions)).toBe('Mié 09:00-11:00');
    expect(cn('px-2', false && 'hidden', 'px-4')).toBe('px-4');
  });
});
