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
});
