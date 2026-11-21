import { describe, expect, it } from 'vitest';
import {
  addDaysIso,
  buildExamCalendarData,
  formatExamLocation,
  formatShortDate,
  getDayOfWeekFromDate,
  getWeekStartIso,
  parseIsoDateLocal,
} from '../shared/examCalendar';
import { SAMPLE_COURSES } from '../shared/sampleData';
import { resolveManualEntries } from '../shared/scheduler';
import type { Course, CourseSelectionItem } from '../shared/types';

describe('examCalendar', () => {
  it('resolves ESPOL DayOfWeek and week Monday ISO from YYYY-MM-DD', () => {
    expect(getDayOfWeekFromDate('2026-11-17')).toBe('Martes');
    expect(getDayOfWeekFromDate('2026-11-21')).toBe('Sábado');
    expect(getWeekStartIso('2026-11-17')).toBe('2026-11-16');
    expect(getWeekStartIso('2026-11-22')).toBe('2026-11-16');
  });

  it('cleans exam location strings cleanly', () => {
    expect(formatExamLocation('A107-14B CAMPUS GUSTAVO GALINDO Modalidad: Presencial')).toBe(
      'A107-14B',
    );
    expect(formatExamLocation('Modalidad: Virtual')).toBe('Virtual');
    expect(formatExamLocation('15A-LAB1 FIEC')).toBe('15A-LAB1 FIEC');
    expect(formatExamLocation('')).toBe('S/A');
  });

  it('groups exams into weekly calendar columns and tracks unscheduled courses', () => {
    const items = resolveManualEntries(SAMPLE_COURSES, [
      { courseCode: 'DING2040', parallelNumber: '1', practicalCode: '101' },
      { courseCode: 'MATG1045', parallelNumber: '1', practicalCode: '101' },
      { courseCode: 'CCPG1043', parallelNumber: '1', practicalCode: null },
    ]);

    const parcial = buildExamCalendarData(items, null, 'Parcial');
    expect(parcial.availableTypes).toContain('Parcial');
    expect(parcial.weeks).toHaveLength(1);
    expect(parcial.weeks[0].weekStartIso).toBe('2026-11-16');
    expect(parcial.weeks[0].columns.map((c) => c.day)).toEqual([
      'Lunes',
      'Martes',
      'Miércoles',
      'Jueves',
      'Viernes',
    ]);
    expect(parcial.weeks[0].columns[1].shortDate).toBe('17/11');
    expect(parcial.weeks[0].entries).toHaveLength(3);
    expect(parcial.unscheduledCourses).toEqual([]);

    const final = buildExamCalendarData(items, null, 'Final');
    expect(final.weeks).toHaveLength(1);
    expect(final.weeks[0].entries).toHaveLength(1); // only DING2040 has Final in SAMPLE_COURSES
    expect(final.unscheduledCourses.map((c) => c.courseCode)).toEqual(['MATG1045', 'CCPG1043']);
  });

  it('includes Saturday column automatically when an exam falls on Saturday', () => {
    const satCourse: Course = {
      code: 'FISG1005',
      name: 'FÍSICA I',
      periodLabel: '2026-2',
      extractedAt: '2026-11-21T00:00:00.000Z',
      parallels: [
        {
          idCurso: '10',
          idMateria: '10',
          periodId: '606',
          parallelNumber: '1',
          url: 'https://example.com',
          professor: 'PROF',
          modality: 'PRESENCIAL',
          capacity: 30,
          available: 5,
          directedNote: '',
          timeNote: '',
          exams: [
            {
              type: 'Parcial',
              raw: '21/11/2026 - 09:00 a 11:00',
              date: '2026-11-21',
              startTime: '09:00',
              endTime: '11:00',
              startMinutes: 540,
              endMinutes: 660,
              classroom: '9M-101 CAMPUS GUSTAVO GALINDO',
            },
          ],
          sessions: [],
          practicals: [],
        },
      ],
    };
    const item: CourseSelectionItem = {
      course: satCourse,
      parallel: satCourse.parallels[0],
      practical: null,
    };

    const data = buildExamCalendarData([item], null, 'Parcial');
    expect(data.weeks[0].columns.map((c) => c.day)).toContain('Sábado');
    expect(data.weeks[0].columns.find((c) => c.day === 'Sábado')?.shortDate).toBe('21/11');
  });

  it('handles invalid dates, Sunday offsets, embedded virtual locations, and preview overrides', () => {
    expect(parseIsoDateLocal('not-a-date')).toBeNull();
    expect(parseIsoDateLocal('2026-02-30')).toBeNull();
    expect(formatShortDate('invalid')).toBe('invalid');
    expect(getDayOfWeekFromDate('2026-11-22')).toBe('Domingo');
    expect(getDayOfWeekFromDate('bad')).toBeNull();
    expect(getWeekStartIso('bad')).toBeNull();
    expect(addDaysIso('bad', 3)).toBe('bad');
    expect(formatExamLocation('AULA 10 Modalidad: Virtual')).toBe('AULA 10 (Virtual)');
    expect(formatExamLocation('Modalidad: Presencial')).toBe('S/A');

    const items = resolveManualEntries(SAMPLE_COURSES, [
      { courseCode: 'DING2040', parallelNumber: '1', practicalCode: '101' },
      { courseCode: 'MATG1045', parallelNumber: '1', practicalCode: '101' },
    ]);
    const previewItem = resolveManualEntries(SAMPLE_COURSES, [
      { courseCode: 'DING2040', parallelNumber: '2', practicalCode: '101' },
    ])[0];

    const data = buildExamCalendarData(items, previewItem, 'Parcial');
    const dingEntry = data.weeks[0].entries.find((e) => e.item.course.code === 'DING2040');
    expect(dingEntry?.isPreview).toBe(true);
    expect(dingEntry?.item.parallel.parallelNumber).toBe('2');
  });
});
