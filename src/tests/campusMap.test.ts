import { describe, expect, it } from 'vitest';
import {
  computeScheduleTransitions,
  ESPOL_MY_MAPS_BASE_URL,
  estimateWalkFromBlocks,
  extractBlockCode,
  getBlockCoords,
  getGoogleMapsBlockUrl,
} from '../shared/campusMap';
import { generateSchedules } from '../shared/scheduler';
import { DEFAULT_CONSTRAINTS } from '../shared/storage';
import type { Course, CourseSelectionItem } from '../shared/types';

function makeCourseAtBlock(
  code: string,
  startTime: string,
  endTime: string,
  startMinutes: number,
  endMinutes: number,
  block: string,
  modality = 'PRESENCIAL',
): Course {
  return {
    code,
    name: code,
    periodLabel: '2026-2',
    extractedAt: '2026-11-21T00:00:00.000Z',
    parallels: [
      {
        idCurso: code,
        idMateria: code,
        periodId: '606',
        parallelNumber: '1',
        url: 'https://example.com',
        professor: 'PROF',
        modality,
        capacity: 30,
        available: 5,
        directedNote: '',
        timeNote: '',
        exams: [],
        sessions: [
          {
            day: 'Lunes',
            startTime,
            endTime,
            startMinutes,
            endMinutes,
            classroom: 'A101',
            block,
          },
        ],
        practicals: [],
      },
    ],
  };
}

describe('ESPOL campus map distances and transitions', () => {
  it('extracts block codes and resolves coordinates from the ESPOL map', () => {
    expect(extractBlockCode('9M CAMPUS GUSTAVO GALINDO')).toBe('9M');
    expect(extractBlockCode('3M  CAMPUS GUSTAVO GALINDO')).toBe('3M');
    expect(extractBlockCode('VRA CAMPUS VIRTUAL')).toBeNull();
    expect(extractBlockCode('9M CAMPUS GUSTAVO GALINDO', 'MODALIDAD VIRTUAL')).toBeNull();

    expect(getBlockCoords('9M CAMPUS GUSTAVO GALINDO')).not.toBeNull();
    expect(getBlockCoords('14G')).not.toBeNull(); // RECOD normalized alias
    expect(getGoogleMapsBlockUrl('9M')).toContain('mid=13yd4eq_vb9gfXl6IxCuv8zybU8voTLw');
    expect(getGoogleMapsBlockUrl('9M')).toContain('&ll=');
  });

  it('estimates realistic walking distances between ESPOL blocks', () => {
    const far = estimateWalkFromBlocks('3M CAMPUS GUSTAVO GALINDO', '9M CAMPUS GUSTAVO GALINDO');
    expect(far).not.toBeNull();
    expect(far!.straightMeters).toBeGreaterThan(1400);
    expect(far!.walkMeters).toBeGreaterThan(far!.straightMeters);
    expect(far!.walkMinutes).toBeGreaterThanOrEqual(20);

    const close = estimateWalkFromBlocks('9M', '11A');
    expect(close).not.toBeNull();
    expect(close!.straightMeters).toBeLessThan(350);

    const same = estimateWalkFromBlocks('3M', '3M CAMPUS GUSTAVO GALINDO');
    expect(same).toEqual({ straightMeters: 0, walkMeters: 0, walkMinutes: 0 });
  });

  it('flags tight back-to-back transitions and skips virtual sessions', () => {
    const c1 = makeCourseAtBlock('DING2040', '09:00', '11:00', 540, 660, '3M CAMPUS GUSTAVO GALINDO');
    const c2 = makeCourseAtBlock('ESTG2004', '11:00', '13:00', 660, 780, '9M CAMPUS GUSTAVO GALINDO');
    const c3 = makeCourseAtBlock(
      'IDIG1007',
      '13:00',
      '15:00',
      780,
      900,
      'VRA CAMPUS VIRTUAL',
      'MODALIDAD VIRTUAL - E-LEARNING',
    );

    const items: CourseSelectionItem[] = [c1, c2, c3].map((course) => ({
      course,
      parallel: course.parallels[0],
      practical: null,
    }));

    const transitions = computeScheduleTransitions(items);
    expect(transitions).toHaveLength(1);
    expect(transitions[0].fromBlock).toBe('3M');
    expect(transitions[0].toBlock).toBe('9M');
    expect(transitions[0].gapMinutes).toBe(0);
    expect(transitions[0].severity).toBe('tight');
  });

  it('can filter out tight long-walk transitions in generateSchedules', () => {
    const c1 = makeCourseAtBlock('DING2040', '09:00', '11:00', 540, 660, '3M CAMPUS GUSTAVO GALINDO');
    const c2 = makeCourseAtBlock('ESTG2004', '11:00', '13:00', 660, 780, '9M CAMPUS GUSTAVO GALINDO');

    const withWalks = generateSchedules([c1, c2], {
      ...DEFAULT_CONSTRAINTS,
      selectedCourseCodes: ['DING2040', 'ESTG2004'],
      avoidLongWalks: false,
    });
    expect(withWalks.schedules).toHaveLength(1);

    const withoutLongWalks = generateSchedules([c1, c2], {
      ...DEFAULT_CONSTRAINTS,
      selectedCourseCodes: ['DING2040', 'ESTG2004'],
      avoidLongWalks: true,
    });
    expect(withoutLongWalks.schedules).toHaveLength(0);
  });

  it('handles unknown/empty blocks, moderate walks, overlaps, same-course blocks, and practicals', () => {
    expect(extractBlockCode('')).toBeNull();
    expect(extractBlockCode('   ')).toBeNull();
    expect(getBlockCoords('BLOQUE_DESCONOCIDO')).toBeNull();
    expect(getGoogleMapsBlockUrl('BLOQUE_DESCONOCIDO')).toBe(ESPOL_MY_MAPS_BASE_URL);
    expect(estimateWalkFromBlocks('BLOQUE_DESCONOCIDO', '9M')).toBeNull();

    // 3M -> 9M (>700m) with gap <= 45 min but enough time to walk -> moderate
    const c1 = makeCourseAtBlock('MAT1', '08:00', '10:00', 480, 600, '3M CAMPUS GUSTAVO GALINDO');
    const c2 = makeCourseAtBlock('MAT2', '11:05', '12:35', 665, 755, '9M CAMPUS GUSTAVO GALINDO');
    // Same course overlapping / back-to-back in same block -> skipped
    c1.parallels[0].practicals = [
      {
        code: '101',
        professor: 'PROF',
        capacity: 20,
        available: 5,
        modality: 'PRESENCIAL',
        sessions: [
          {
            day: 'Lunes',
            startTime: '10:00',
            endTime: '10:30',
            startMinutes: 600,
            endMinutes: 630,
            classroom: 'A102',
            block: '3M CAMPUS GUSTAVO GALINDO',
          },
        ],
      },
    ];
    // Overlapping class should be ignored by transition detector
    const overlap = makeCourseAtBlock('MAT3', '09:00', '10:15', 540, 615, '11A');

    const transitions = computeScheduleTransitions([
      { course: c1, parallel: c1.parallels[0], practical: c1.parallels[0].practicals[0] },
      { course: c2, parallel: c2.parallels[0], practical: null },
      { course: overlap, parallel: overlap.parallels[0], practical: null },
    ]);

    expect(transitions.some((t) => t.severity === 'moderate')).toBe(true);
    expect(transitions.some((t) => t.fromCourseCode === 'MAT1' && t.toCourseCode === 'MAT1')).toBe(false);

    // Close blocks (<100m or ok) -> ok severity
    const nearA = makeCourseAtBlock('N1', '08:00', '10:00', 480, 600, '9M');
    const nearB = makeCourseAtBlock('N2', '10:00', '12:00', 600, 720, '11A');
    const nearTransitions = computeScheduleTransitions([
      { course: nearA, parallel: nearA.parallels[0], practical: null },
      { course: nearB, parallel: nearB.parallels[0], practical: null },
    ]);
    expect(nearTransitions[0].severity).toBe('ok');
  });
});
