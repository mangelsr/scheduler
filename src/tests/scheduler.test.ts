import { describe, expect, it } from 'vitest';
import { SAMPLE_COURSES } from '../shared/sampleData';
import {
  computeMetrics,
  findClassConflicts,
  generateSchedules,
  resolveManualEntries,
} from '../shared/scheduler';
import { DEFAULT_CONSTRAINTS } from '../shared/storage';
import type { Course, CourseSelectionItem, SchedulerConstraints } from '../shared/types';

function makeConstraints(overrides: Partial<SchedulerConstraints>): SchedulerConstraints {
  return {
    ...DEFAULT_CONSTRAINTS,
    selectedCourseCodes: SAMPLE_COURSES.map((c) => c.code),
    ...overrides,
  };
}

describe('generateSchedules', () => {
  it('generates valid combinations without class or exam collisions', () => {
    const result = generateSchedules(SAMPLE_COURSES, makeConstraints({}));
    expect(result.emptyCourseCodes).toEqual([]);
    expect(result.schedules.length).toBeGreaterThan(0);

    for (const sched of result.schedules) {
      expect(sched.items).toHaveLength(SAMPLE_COURSES.length);
      expect(sched.metrics.examConflicts).toEqual([]);
    }
  });

  it('filters out zero-seat practicals when onlyWithSeats is enabled', () => {
    const result = generateSchedules(
      SAMPLE_COURSES,
      makeConstraints({ onlyWithSeats: true }),
    );
    expect(result.schedules.length).toBeGreaterThan(0);
    for (const sched of result.schedules) {
      expect(sched.metrics.minAvailableSeats).toBeGreaterThan(0);
    }
  });

  it('respects blockedDays constraints', () => {
    const result = generateSchedules(
      SAMPLE_COURSES,
      makeConstraints({ blockedDays: ['Viernes'] }),
    );
    // All schedules must have no classes on Viernes
    for (const sched of result.schedules) {
      for (const item of sched.items) {
        const allSessions = [
          ...item.parallel.sessions,
          ...(item.practical?.sessions ?? []),
        ];
        expect(allSessions.some((s) => s.day === 'Viernes')).toBe(false);
      }
    }
  });

  it('reports exam conflicts when avoidExamConflicts is false', () => {
    // DING2040 P1/P2 exam is 2026-11-17 14:00-16:00 and CCPG1043 P2 exam is 2026-11-17 14:30-16:30
    const strict = generateSchedules(
      SAMPLE_COURSES,
      makeConstraints({
        selectedCourseCodes: ['DING2040', 'CCPG1043'],
        excludedParallelKeys: ['CCPG1043::1'],
        avoidExamConflicts: true,
      }),
    );
    expect(strict.schedules).toHaveLength(0);

    const relaxed = generateSchedules(
      SAMPLE_COURSES,
      makeConstraints({
        selectedCourseCodes: ['DING2040', 'CCPG1043'],
        excludedParallelKeys: ['CCPG1043::1'],
        avoidExamConflicts: false,
      }),
    );
    expect(relaxed.schedules.length).toBeGreaterThan(0);
    expect(relaxed.schedules[0].metrics.examConflicts.length).toBeGreaterThan(0);
  });

  it('respects pinnedSelections for auto-completing manual schedules', () => {
    const result = generateSchedules(
      SAMPLE_COURSES,
      makeConstraints({
        pinnedSelections: [
          { courseCode: 'DING2040', parallelNumber: '2', practicalCode: '101' },
        ],
      }),
    );
    expect(result.schedules.length).toBeGreaterThan(0);
    for (const sched of result.schedules) {
      const ding = sched.items.find((it) => it.course.code === 'DING2040');
      expect(ding?.parallel.parallelNumber).toBe('2');
      expect(ding?.practical?.code).toBe('101');
    }
  });

  it('detects manual class conflicts via resolveManualEntries and findClassConflicts', () => {
    // DING2040 P1 (Lun 09-11) vs MATG1045 P3 (Mar/Jue 09-11) -> no class conflict;
    // DING2040 P2 (Mar/Jue 14-16) vs itself or overlapping practicals:
    // MATG1045 P1 + Prác 102 (Jue 11-13) overlaps with CCPG1043 P2 (Mar/Jue 11-13)
    const items = resolveManualEntries(SAMPLE_COURSES, [
      { courseCode: 'MATG1045', parallelNumber: '1', practicalCode: '102' },
      { courseCode: 'CCPG1043', parallelNumber: '2', practicalCode: null },
    ]);
    expect(items).toHaveLength(2);
    const conflicts = findClassConflicts(items);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].day).toBe('Jueves');
    expect(conflicts[0].timeRange).toBe('11:00-13:00');
  });

  it('includes weekend sessions in totalGapMinutes and activeDaysCount while preserving weekday freeDaysCount', () => {
    const weekendCourse: Course = {
      code: 'FIN1001',
      name: 'SEMINARIO SABATINO',
      periodLabel: '2026-2',
      extractedAt: '2026-11-21T00:00:00.000Z',
      parallels: [
        {
          idCurso: '1',
          idMateria: '1',
          periodId: '606',
          parallelNumber: '1',
          url: 'https://example.com',
          professor: 'DOCENTE',
          modality: 'PRESENCIAL',
          capacity: 30,
          available: 10,
          directedNote: '',
          timeNote: '',
          exams: [],
          sessions: [
            {
              day: 'Sábado',
              startTime: '08:00',
              endTime: '10:00',
              startMinutes: 480,
              endMinutes: 600,
              classroom: 'A1',
              block: 'B1',
            },
            {
              day: 'Sábado',
              startTime: '11:30',
              endTime: '13:30',
              startMinutes: 690,
              endMinutes: 810,
              classroom: 'A1',
              block: 'B1',
            },
          ],
          practicals: [],
        },
      ],
    };

    const items: CourseSelectionItem[] = [
      {
        course: weekendCourse,
        parallel: weekendCourse.parallels[0],
        practical: null,
      },
    ];
    const metrics = computeMetrics(items);
    expect(metrics.totalWeeklyMinutes).toBe(240);
    expect(metrics.totalGapMinutes).toBe(90);
    expect(metrics.activeDaysCount).toBe(1);
    expect(metrics.freeDaysCount).toBe(5);
  });

  it('retains the optimal schedules when bounded by maxResults', () => {
    const result = generateSchedules(
      SAMPLE_COURSES,
      makeConstraints({ sortBy: 'maxFreeDays', maxResults: 3 }),
    );
    expect(result.schedules).toHaveLength(3);
    expect(result.schedules[0].score).toBeLessThanOrEqual(result.schedules[1].score);
    expect(result.schedules[1].score).toBeLessThanOrEqual(result.schedules[2].score);
  });
});
