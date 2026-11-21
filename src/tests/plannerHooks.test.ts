import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePlannerState } from '../planner/hooks/usePlannerState';
import { useSeatRefresh } from '../planner/hooks/useSeatRefresh';
import { SAMPLE_COURSES } from '../shared/sampleData';

describe('usePlannerState and useSeatRefresh hooks', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('toggles selections, exclusions, blocked days/slots, manual options, course removal, and storage sync', async () => {
    localStorage.setItem('espol_scheduler_courses_v1', JSON.stringify(SAMPLE_COURSES));
    const onStatus = vi.fn();
    const { result } = renderHook(() => usePlannerState(onStatus));

    await waitFor(() => {
      expect(result.current.courses).toHaveLength(SAMPLE_COURSES.length);
    });

    act(() => {
      // Toggle manual option on, then toggle same option off
      result.current.toggleManualOption('DING2040', '1', '101');
    });
    expect(result.current.manualEntries).toHaveLength(1);

    act(() => {
      result.current.toggleManualOption('DING2040', '1', '101');
    });
    expect(result.current.manualEntries).toHaveLength(0);

    act(() => {
      result.current.toggleManualOption('MATG1045', '1', '101');
      result.current.removeManualCourse('MATG1045');
    });
    expect(result.current.manualEntries).toHaveLength(0);

    // Course selection, expand, excluded parallel & practical
    act(() => {
      result.current.toggleCourseSelection('DING2040');
      result.current.toggleCourseSelection('DING2040');
      result.current.toggleExpanded('DING2040');
      result.current.toggleExpanded('DING2040');
      result.current.toggleExcludedParallel('DING2040', '1');
      result.current.toggleExcludedParallel('DING2040', '1');
      result.current.toggleExcludedPractical('DING2040', '1', '101');
      result.current.toggleExcludedPractical('DING2040', '1', '101');
      result.current.toggleBlockedDay('Viernes');
      result.current.toggleBlockedDay('Viernes');
      result.current.addBlockedSlot({ day: 'Lunes', startMinutes: 420, endMinutes: 540 });
      result.current.removeBlockedSlot(0);
    });

    expect(result.current.constraints.excludedParallelKeys).toEqual([]);
    expect(result.current.constraints.excludedPracticalKeys).toEqual([]);
    expect(result.current.constraints.blockedDays).toEqual([]);
    expect(result.current.constraints.blockedSlots).toEqual([]);

    // Remove single course
    await act(async () => {
      await result.current.handleRemoveCourse('INDG1033');
    });
    expect(result.current.courses.some((c) => c.code === 'INDG1033')).toBe(false);

    // External storage event updates courses & constraints
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'espol_scheduler_courses_v1',
          newValue: JSON.stringify([SAMPLE_COURSES[0], SAMPLE_COURSES[3]]),
        }),
      );
    });
    expect(result.current.courses.map((c) => c.code)).toEqual(['DING2040', 'INDG1033']);
  });

  it('refreshes seats successfully and updates courses', async () => {
    const validHtml = `
      <html><head><title>Materia</title></head><body>
        <span id="ctl00_contenido_lbltexto">PAO 2026-2</span>
        <span id="ctl00_contenido_LabelNombreMateria">TALLER ACTUALIZADO</span>
        <span id="ctl00_contenido_LabelParalelo">1</span>
        <span id="ctl00_contenido_LabelCupo">30</span>
        <span id="ctl00_contenido_LabelDisponible">14</span>
        <table id="ctl00_contenido_TableHorarios">
          <tbody><tr><td>Lunes</td><td>09:00:00</td><td>11:00:00</td><td>A1</td><td>3M</td></tr></tbody>
        </table>
      </body></html>
    `;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        url: SAMPLE_COURSES[0].parallels[0].url,
        text: async () => validHtml,
      }),
    );

    const onCoursesUpdated = vi.fn();
    const onStatus = vi.fn();
    const { result } = renderHook(() => useSeatRefresh(onCoursesUpdated, onStatus));

    // Empty courses no-op
    await act(async () => {
      await result.current.refreshSeats([]);
    });
    expect(onCoursesUpdated).not.toHaveBeenCalled();

    const oneParallelCourse = {
      ...SAMPLE_COURSES[0],
      parallels: [SAMPLE_COURSES[0].parallels[0]],
    };
    await act(async () => {
      await result.current.refreshSeats([oneParallelCourse]);
    });

    expect(onCoursesUpdated).toHaveBeenCalledTimes(1);
    expect(onStatus).toHaveBeenLastCalledWith('Cupos actualizados para 1 paralelo(s).');
  });
});
