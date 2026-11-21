import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SAMPLE_COURSES } from '../shared/sampleData';
import {
  clearAllCourses,
  DEFAULT_CONSTRAINTS,
  loadConstraints,
  loadCourses,
  loadManualSelections,
  removeCourse,
  saveConstraints,
  saveCourses,
  saveManualSelections,
  subscribeCoursesChanged,
  upsertCourses,
} from '../shared/storage';

describe('storage (localStorage fallback)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
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

  it('handles corrupt localStorage JSON and non-matching storage events gracefully', async () => {
    localStorage.setItem('espol_scheduler_courses_v1', '{bad json');
    localStorage.setItem('espol_scheduler_constraints_v1', '{bad json');
    localStorage.setItem('espol_scheduler_manual_v1', '{bad json');

    expect(await loadCourses()).toEqual([]);
    expect(await loadConstraints()).toEqual(DEFAULT_CONSTRAINTS);
    expect(await loadManualSelections()).toEqual([]);

    const listener = vi.fn();
    const unsub = subscribeCoursesChanged(listener);
    window.dispatchEvent(new StorageEvent('storage', { key: 'other_key', newValue: '[]' }));
    expect(listener).not.toHaveBeenCalled();

    window.dispatchEvent(
      new StorageEvent('storage', { key: 'espol_scheduler_courses_v1', newValue: '{bad' }),
    );
    expect(listener).toHaveBeenCalledWith([]);

    window.dispatchEvent(
      new StorageEvent('storage', { key: 'espol_scheduler_courses_v1', newValue: '{"not":"array"}' }),
    );
    expect(listener).toHaveBeenLastCalledWith([]);
    unsub();
  });

  it('uses chrome.storage.local and chrome.storage.onChanged when available', async () => {
    const store: Record<string, unknown> = {};
    const listeners: Array<
      (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void
    > = [];

    const chromeMock = {
      storage: {
        local: {
          get: vi.fn(async (key: string) => ({ [key]: store[key] })),
          set: vi.fn(async (items: Record<string, unknown>) => {
            Object.assign(store, items);
          }),
        },
        onChanged: {
          addListener: vi.fn((fn) => listeners.push(fn)),
          removeListener: vi.fn((fn) => {
            const idx = listeners.indexOf(fn);
            if (idx >= 0) listeners.splice(idx, 1);
          }),
        },
      },
    };
    vi.stubGlobal('chrome', chromeMock);

    expect(await loadCourses()).toEqual([]);
    await saveCourses([SAMPLE_COURSES[0]]);
    expect(await loadCourses()).toEqual([SAMPLE_COURSES[0]]);

    expect(await loadConstraints()).toEqual(DEFAULT_CONSTRAINTS);
    await saveConstraints({ ...DEFAULT_CONSTRAINTS, onlyWithSeats: true });
    expect((await loadConstraints()).onlyWithSeats).toBe(true);

    expect(await loadManualSelections()).toEqual([]);
    await saveManualSelections([{ courseCode: 'DING2040', parallelNumber: '1', practicalCode: null }]);
    expect(await loadManualSelections()).toHaveLength(1);

    const sub = vi.fn();
    const unsub = subscribeCoursesChanged(sub);
    expect(chromeMock.storage.onChanged.addListener).toHaveBeenCalledTimes(1);

    listeners[0]({ espol_scheduler_courses_v1: { newValue: [SAMPLE_COURSES[1]] } }, 'sync');
    expect(sub).not.toHaveBeenCalled();

    listeners[0](
      { espol_scheduler_courses_v1: { newValue: [SAMPLE_COURSES[1]], oldValue: [] } },
      'local',
    );
    expect(sub).toHaveBeenCalledWith([SAMPLE_COURSES[1]]);

    listeners[0]({ espol_scheduler_courses_v1: { newValue: 'not-an-array' } }, 'local');
    expect(sub).toHaveBeenLastCalledWith([]);

    unsub();
    expect(chromeMock.storage.onChanged.removeListener).toHaveBeenCalledTimes(1);
  });
});
