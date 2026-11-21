import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SAMPLE_COURSES } from '../shared/sampleData';
import {
  clearAllCourses,
  DEFAULT_CONSTRAINTS,
  loadConstraints,
  loadCourses,
  loadManualSelections,
  removeCourse,
  saveConstraints,
  saveManualSelections,
  subscribeCoursesChanged,
  upsertCourses,
} from '../shared/storage';

describe('storage (localStorage fallback)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('upserts, sorts, removes, and clears courses cleanly', async () => {
    const first = await upsertCourses([SAMPLE_COURSES[1]]);
    expect(first.map((c) => c.code)).toEqual([SAMPLE_COURSES[1].code]);

    const merged = await upsertCourses([SAMPLE_COURSES[0], SAMPLE_COURSES[1]]);
    expect(merged).toHaveLength(2);
    expect(merged.map((c) => c.code)).toEqual(
      [SAMPLE_COURSES[0].code, SAMPLE_COURSES[1].code].sort((a, b) => a.localeCompare(b)),
    );

    const afterRemove = await removeCourse(SAMPLE_COURSES[0].code);
    expect(afterRemove.map((c) => c.code)).toEqual([SAMPLE_COURSES[1].code]);

    await clearAllCourses();
    expect(await loadCourses()).toEqual([]);
  });

  it('persists constraints and manual selections with defaults', async () => {
    expect(await loadConstraints()).toEqual(DEFAULT_CONSTRAINTS);
    await saveConstraints({ ...DEFAULT_CONSTRAINTS, onlyWithSeats: true, sortBy: 'maxFreeDays' });
    const loaded = await loadConstraints();
    expect(loaded.onlyWithSeats).toBe(true);
    expect(loaded.sortBy).toBe('maxFreeDays');

    await saveManualSelections([
      { courseCode: 'DING2040', parallelNumber: '1', practicalCode: '101' },
    ]);
    expect(await loadManualSelections()).toEqual([
      { courseCode: 'DING2040', parallelNumber: '1', practicalCode: '101' },
    ]);
  });

  it('notifies subscribers on window storage events in localStorage mode', () => {
    const listener = vi.fn();
    const unsub = subscribeCoursesChanged(listener);

    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'espol_scheduler_courses_v1',
        newValue: JSON.stringify([SAMPLE_COURSES[0]]),
      }),
    );

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith([SAMPLE_COURSES[0]]);
    unsub();
  });
});
