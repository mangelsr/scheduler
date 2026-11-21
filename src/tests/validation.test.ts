import { describe, expect, it } from 'vitest';
import { SAMPLE_COURSES } from '../shared/sampleData';
import { validateImportedCourses } from '../shared/validation';

describe('validateImportedCourses', () => {
  it('accepts valid exported course catalogs', () => {
    const result = validateImportedCourses(SAMPLE_COURSES);
    expect(result.error).toBeUndefined();
    expect(result.courses).toHaveLength(SAMPLE_COURSES.length);
    expect(result.courses[0].code).toBe(SAMPLE_COURSES[0].code);
  });

  it('rejects non-array payloads', () => {
    const result = validateImportedCourses({ code: 'ABC' });
    expect(result.error).toBeDefined();
    expect(result.courses).toEqual([]);
  });

  it('rejects courses missing required fields or containing invalid sessions', () => {
    const missingCode = validateImportedCourses([{ name: 'Materia', parallels: [] }]);
    expect(missingCode.error).toContain('code');

    const badSession = validateImportedCourses([
      {
        code: 'TEST101',
        name: 'Test',
        parallels: [
          {
            parallelNumber: '1',
            sessions: [
              {
                day: 'Lunes',
                startTime: '11:00',
                endTime: '09:00',
                startMinutes: 660,
                endMinutes: 540,
              },
            ],
          },
        ],
      },
    ]);
    expect(badSession.error).toContain('TEST101');
  });

  it('rejects malformed elements, parallels, exams, and practicals while filling optional defaults', () => {
    expect(validateImportedCourses(['not-an-object']).error).toContain('Elemento #1');
    expect(
      validateImportedCourses([{ code: 'A1', name: 'Materia', parallels: 'bad' }]).error,
    ).toContain('requiere');

    expect(
      validateImportedCourses([{ code: 'A1', name: 'Materia', parallels: ['bad'] }]).error,
    ).toContain('Paralelo #1');

    expect(
      validateImportedCourses([
        {
          code: 'A1',
          name: 'Materia',
          parallels: [{ parallelNumber: '1', sessions: ['bad'] }],
        },
      ]).error,
    ).toContain('Paralelo #1');

    expect(
      validateImportedCourses([
        {
          code: 'A1',
          name: 'Materia',
          parallels: [
            {
              parallelNumber: '1',
              sessions: [{ day: 'Feriado', startTime: '09:00', endTime: '11:00', startMinutes: 540, endMinutes: 660 }],
            },
          ],
        },
      ]).error,
    ).toContain('Paralelo #1');

    expect(
      validateImportedCourses([
        {
          code: 'A1',
          name: 'Materia',
          parallels: [
            {
              parallelNumber: '1',
              sessions: [{ day: 'Lunes', startTime: 900, endTime: '11:00', startMinutes: 540, endMinutes: 660 }],
            },
          ],
        },
      ]).error,
    ).toContain('Paralelo #1');

    expect(
      validateImportedCourses([
        {
          code: 'A1',
          name: 'Materia',
          parallels: [{ parallelNumber: '1', sessions: [], exams: 'bad' }],
        },
      ]).error,
    ).toContain('Paralelo #1');

    expect(
      validateImportedCourses([
        {
          code: 'A1',
          name: 'Materia',
          parallels: [{ parallelNumber: '1', sessions: [], exams: [{ type: 'Otro' }] }],
        },
      ]).error,
    ).toContain('Paralelo #1');

    expect(
      validateImportedCourses([
        {
          code: 'A1',
          name: 'Materia',
          parallels: [{ parallelNumber: '1', sessions: [], practicals: 'bad' }],
        },
      ]).error,
    ).toContain('Paralelo #1');

    expect(
      validateImportedCourses([
        {
          code: 'A1',
          name: 'Materia',
          parallels: [
            {
              parallelNumber: '1',
              sessions: [],
              practicals: [{ code: '101', sessions: ['bad'] }],
            },
          ],
        },
      ]).error,
    ).toContain('Paralelo #1');

    expect(
      validateImportedCourses([
        {
          code: 'A1',
          name: 'Materia',
          parallels: [{ parallelNumber: '1', sessions: [], practicals: ['bad'] }],
        },
      ]).error,
    ).toContain('Paralelo #1');

    const validMinimal = validateImportedCourses([
      {
        code: 'A1',
        name: 'Materia',
        parallels: [
          {
            parallelNumber: '1',
            sessions: [],
            exams: [{ type: 'Parcial' }],
            practicals: [{ code: '101', sessions: [] }],
          },
        ],
      },
    ]);
    expect(validMinimal.error).toBeUndefined();
    expect(validMinimal.courses[0].parallels[0].capacity).toBe(0);
    expect(validMinimal.courses[0].parallels[0].exams[0].date).toBeNull();
    expect(validMinimal.courses[0].parallels[0].practicals[0].available).toBe(0);
  });
});
