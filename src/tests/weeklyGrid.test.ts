import { describe, expect, it } from 'vitest';
import { getVisibleDays, layoutDayBlocks, type PositionedBlock } from '../planner/WeeklyGrid';
import type { Course, CourseSelectionItem, DayOfWeek } from '../shared/types';

function makeRawBlock(
  key: string,
  startMinutes: number,
  endMinutes: number,
  isPreview = false,
): Omit<PositionedBlock, 'colIndex' | 'colTotal'> {
  return {
    key,
    courseCode: key,
    courseName: key,
    parallelLabel: 'P1 Teórico',
    isPractical: false,
    isPreview,
    hasConflict: false,
    professor: 'PROF',
    seats: '10/30',
    session: {
      day: 'Lunes',
      startTime: '08:00',
      endTime: '10:00',
      startMinutes,
      endMinutes,
      classroom: 'A1',
      block: 'B1',
    },
    color: { bg: '#dbeafe', border: '#2563eb', text: '#1e3a8a' },
  };
}

function makeCourseItem(day: DayOfWeek): CourseSelectionItem {
  const course: Course = {
    code: 'TEST101',
    name: 'TEST',
    periodLabel: '2026',
    extractedAt: '2026-11-21T00:00:00.000Z',
    parallels: [
      {
        idCurso: '1',
        idMateria: '1',
        periodId: '606',
        parallelNumber: '1',
        url: 'https://example.com',
        professor: 'PROF',
        modality: 'PRESENCIAL',
        capacity: 20,
        available: 5,
        directedNote: '',
        timeNote: '',
        exams: [],
        sessions: [
          {
            day,
            startTime: '09:00',
            endTime: '11:00',
            startMinutes: 540,
            endMinutes: 660,
            classroom: 'A1',
            block: 'B1',
          },
        ],
        practicals: [],
      },
    ],
  };
  return { course, parallel: course.parallels[0], practical: null };
}

describe('WeeklyGrid layout and visible days', () => {
  it('assigns consistent columns and reuses space across transitive overlap chains', () => {
    // A (08:00-10:00) overlaps B (09:00-11:00), and B overlaps C (10:00-12:00),
    // while A and C do not overlap each other.
    const laidOut = layoutDayBlocks([
      makeRawBlock('A', 480, 600),
      makeRawBlock('B', 540, 660),
      makeRawBlock('C', 600, 720),
    ]);

    const byKey = new Map(laidOut.map((b) => [b.key, b]));
    expect(byKey.get('A')?.colTotal).toBe(2);
    expect(byKey.get('B')?.colTotal).toBe(2);
    expect(byKey.get('C')?.colTotal).toBe(2);

    expect(byKey.get('A')?.colIndex).toBe(0);
    expect(byKey.get('B')?.colIndex).toBe(1);
    expect(byKey.get('C')?.colIndex).toBe(0);

    expect(byKey.get('A')?.hasConflict).toBe(true);
    expect(byKey.get('B')?.hasConflict).toBe(true);
    expect(byKey.get('C')?.hasConflict).toBe(true);
  });

  it('does not mark placed blocks as conflicting when bridged only by a preview block', () => {
    const laidOut = layoutDayBlocks([
      makeRawBlock('A', 480, 600, false),
      makeRawBlock('B-PREV', 540, 660, true),
      makeRawBlock('C', 600, 720, false),
    ]);

    const byKey = new Map(laidOut.map((b) => [b.key, b]));
    expect(byKey.get('A')?.hasConflict).toBe(false);
    expect(byKey.get('B-PREV')?.hasConflict).toBe(false);
    expect(byKey.get('C')?.hasConflict).toBe(false);
  });

  it('keeps weekdays by default and includes Sábado/Domingo only when present', () => {
    expect(getVisibleDays([], null, [], [])).toEqual([
      'Lunes',
      'Martes',
      'Miércoles',
      'Jueves',
      'Viernes',
    ]);

    expect(getVisibleDays([makeCourseItem('Sábado')], null, [], [])).toEqual([
      'Lunes',
      'Martes',
      'Miércoles',
      'Jueves',
      'Viernes',
      'Sábado',
    ]);

    expect(getVisibleDays([], makeCourseItem('Domingo'), [], [])).toEqual([
      'Lunes',
      'Martes',
      'Miércoles',
      'Jueves',
      'Viernes',
      'Domingo',
    ]);
  });
});
