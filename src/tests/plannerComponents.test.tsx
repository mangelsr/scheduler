import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AutoConstraintsSidebar } from '../planner/components/AutoConstraintsSidebar';
import { CampusTransitionsCard } from '../planner/components/CampusTransitionsCard';
import { ExamDetailsTable } from '../planner/components/ExamDetailsTable';
import { ExamWeeklyGrid } from '../planner/components/ExamWeeklyGrid';
import { ManualCourseSidebar } from '../planner/components/ManualCourseSidebar';
import { PlannerHeader } from '../planner/components/PlannerHeader';
import { AutoSummaryBar, ManualSummaryBar } from '../planner/components/ScheduleSummaryBar';
import { getCourseColor, WeeklyGrid } from '../planner/WeeklyGrid';
import { SAMPLE_COURSES } from '../shared/sampleData';
import { computeMetrics, resolveManualEntries } from '../shared/scheduler';
import { DEFAULT_CONSTRAINTS } from '../shared/storage';
import type { CampusTransition, Course, CourseSelectionItem } from '../shared/types';

function makeColorMap(courses: Course[]) {
  return new Map(courses.map((c, i) => [c.code, getCourseColor(i)]));
}

describe('Planner UI components', () => {
  it('renders PlannerHeader, handles clear confirmation timeout/blur, and file import', () => {
    vi.useFakeTimers();
    const onClearAll = vi.fn();
    const onImportJson = vi.fn();
    const onModeChange = vi.fn();

    const { container, rerender } = render(
      <PlannerHeader
        mode="manual"
        onModeChange={onModeChange}
        coursesCount={2}
        manualCount={1}
        statusMessage="Estado OK"
        refreshingSeats={false}
        onLoadSample={vi.fn()}
        onImportJson={onImportJson}
        onExportJson={vi.fn()}
        onRefreshSeats={vi.fn()}
        onClearAll={onClearAll}
      />,
    );

    expect(screen.getByText('Estado OK')).toBeTruthy();

    // First click switches to confirm state, second click calls onClearAll
    const clearBtn = screen.getByRole('button', { name: /Limpiar/i });
    fireEvent.click(clearBtn);
    expect(screen.getByRole('button', { name: /¿Confirmar\?/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /¿Confirmar\?/i }));
    expect(onClearAll).toHaveBeenCalledTimes(1);

    // Timeout resets confirm state
    fireEvent.click(screen.getByRole('button', { name: /Limpiar/i }));
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.getByRole('button', { name: /^Limpiar$/i })).toBeTruthy();

    // Blur resets confirm state
    fireEvent.click(screen.getByRole('button', { name: /Limpiar/i }));
    fireEvent.blur(screen.getByRole('button', { name: /¿Confirmar\?/i }));
    expect(screen.getByRole('button', { name: /^Limpiar$/i })).toBeTruthy();

    // Import JSON input
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['[]'], 'courses.json', { type: 'application/json' });
    fireEvent.change(fileInput, { target: { files: [file] } });
    expect(onImportJson).toHaveBeenCalledWith(file);

    // Refreshing state & coursesCount = 0 resets confirm
    rerender(
      <PlannerHeader
        mode="auto"
        onModeChange={onModeChange}
        coursesCount={0}
        manualCount={0}
        statusMessage=""
        refreshingSeats={true}
        onLoadSample={vi.fn()}
        onImportJson={onImportJson}
        onExportJson={vi.fn()}
        onRefreshSeats={vi.fn()}
        onClearAll={onClearAll}
      />,
    );
    expect(screen.getByText('Actualizando...')).toBeTruthy();
    vi.useRealTimers();
  });

  it('renders ManualSummaryBar and AutoSummaryBar with metrics, tight/long walks, and zero seats', () => {
    const items = resolveManualEntries(SAMPLE_COURSES, [
      { courseCode: 'DING2040', parallelNumber: '1', practicalCode: '101' },
      { courseCode: 'MATG1045', parallelNumber: '1', practicalCode: '101' },
    ]);
    const metrics = computeMetrics(items);
    const metricsWithLongWalk = {
      ...metrics,
      transitions: [
        {
          day: 'Lunes' as const,
          fromCourseCode: 'A',
          fromBlock: '3M',
          fromClassroom: 'A1',
          fromEndTime: '09:00',
          toCourseCode: 'B',
          toBlock: '9M',
          toClassroom: 'A2',
          toStartTime: '09:30',
          gapMinutes: 30,
          straightMeters: 1200,
          walkMeters: 1500,
          walkMinutes: 20,
          severity: 'ok' as const,
        },
      ],
      tightTransitionsCount: 0,
      maxTransitionWalkMeters: 1500,
      minAvailableSeats: 0,
    };

    const onAutoComplete = vi.fn();
    const onCopy = vi.fn();
    const onPrint = vi.fn();

    render(
      <ManualSummaryBar
        selectedCount={2}
        totalCoursesCount={4}
        metrics={metricsWithLongWalk}
        classConflictsCount={1}
        onAutoComplete={onAutoComplete}
        onCopySummary={onCopy}
        onPrint={onPrint}
      />,
    );
    expect(screen.getByText('1.5 km')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Auto-completar restantes/i }));
    expect(onAutoComplete).toHaveBeenCalledTimes(1);

    const onPrev = vi.fn();
    const onNext = vi.fn();
    const onApply = vi.fn();
    render(
      <AutoSummaryBar
        activeIndex={0}
        totalCount={2}
        truncated={true}
        schedule={{
          id: 'sched-1',
          items,
          metrics: { ...metricsWithLongWalk, tightTransitionsCount: 2 },
          score: 10,
        }}
        onPrev={onPrev}
        onNext={onNext}
        onApplyToManual={onApply}
        onCopySummary={onCopy}
        onPrint={onPrint}
      />,
    );
    expect(screen.getByText(/Traslados ajustados:/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Siguiente/i }));
    fireEvent.click(screen.getByRole('button', { name: /Editar manualmente/i }));
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it('renders CampusTransitionsCard across severities and returns null when empty', () => {
    const { container } = render(<CampusTransitionsCard transitions={[]} />);
    expect(container.firstChild).toBeNull();

    const transitions: CampusTransition[] = [
      {
        day: 'Lunes',
        fromCourseCode: 'C1',
        fromBlock: '3M',
        fromClassroom: 'A1',
        fromEndTime: '09:00',
        toCourseCode: 'C2',
        toBlock: '9M',
        toClassroom: 'A2',
        toStartTime: '09:05',
        gapMinutes: 5,
        straightMeters: 1200,
        walkMeters: 1500,
        walkMinutes: 20,
        severity: 'tight',
      },
      {
        day: 'Martes',
        fromCourseCode: 'C2',
        fromBlock: '9M',
        fromClassroom: 'A2',
        fromEndTime: '11:00',
        toCourseCode: 'C3',
        toBlock: '11A',
        toClassroom: 'A3',
        toStartTime: '11:30',
        gapMinutes: 30,
        straightMeters: 600,
        walkMeters: 800,
        walkMinutes: 11,
        severity: 'moderate',
      },
      {
        day: 'Miércoles',
        fromCourseCode: 'C3',
        fromBlock: '9M',
        fromClassroom: 'A2',
        fromEndTime: '13:00',
        toCourseCode: 'C4',
        toBlock: '9M',
        toClassroom: 'A5',
        toStartTime: '13:30',
        gapMinutes: 30,
        straightMeters: 0,
        walkMeters: 0,
        walkMinutes: 0,
        severity: 'ok',
      },
    ];

    render(<CampusTransitionsCard transitions={transitions} />);
    expect(screen.getByText('1 traslado(s) ajustado(s)')).toBeTruthy();
    expect(screen.getByText(/~1\.5 km/)).toBeTruthy();
    expect(screen.getByText('Mismo bloque (0 m)')).toBeTruthy();
    expect(screen.getByText('Caminata larga')).toBeTruthy();
    expect(screen.getByText('Cercano')).toBeTruthy();
  });

  it('renders ExamDetailsTable with conflicts and empty state', () => {
    const { container } = render(
      <ExamDetailsTable
        items={[]}
        examConflicts={[]}
        showExamConflictAlert={true}
        subtitle="(Manual)"
        courseColorMap={new Map()}
      />,
    );
    expect(container.firstChild).toBeNull();

    const items = resolveManualEntries(SAMPLE_COURSES, [
      { courseCode: 'DING2040', parallelNumber: '1', practicalCode: '101' },
      { courseCode: 'CCPG1043', parallelNumber: '2', practicalCode: null },
    ]);
    render(
      <ExamDetailsTable
        items={items}
        examConflicts={[
          {
            examType: 'Parcial',
            date: '2026-11-17',
            courseA: 'DING2040 (P1)',
            courseB: 'CCPG1043 (P2)',
            timeA: '14:00-16:00',
            timeB: '14:30-16:30',
          },
        ]}
        showExamConflictAlert={true}
        subtitle="(Opción 1)"
        courseColorMap={makeColorMap(SAMPLE_COURSES)}
      />,
    );
    expect(screen.getByText('Choques de examen detectados')).toBeTruthy();
    expect(screen.getByText(/Prác\. 101/)).toBeTruthy();
  });

  it('renders WeeklyGrid with blocks, preview, blocked days/slots, and course removal', () => {
    const items = resolveManualEntries(SAMPLE_COURSES, [
      { courseCode: 'DING2040', parallelNumber: '1', practicalCode: '101' },
    ]);
    const preview = resolveManualEntries(SAMPLE_COURSES, [
      { courseCode: 'MATG1045', parallelNumber: '1', practicalCode: '101' },
    ])[0];
    const onRemoveCourse = vi.fn();

    render(
      <WeeklyGrid
        items={items}
        previewItem={preview}
        blockedDays={['Viernes']}
        blockedSlots={[
          { day: 'Lunes', startMinutes: 420, endMinutes: 480 },
          { day: 'Lunes', startMinutes: 1300, endMinutes: 1400 },
        ]}
        courseColorMap={makeColorMap(SAMPLE_COURSES)}
        onRemoveCourse={onRemoveCourse}
      />,
    );

    expect(screen.getByText('Libre')).toBeTruthy();
    expect(screen.getByText('Bloqueado')).toBeTruthy();
    const removeBtns = screen.getAllByTitle('Quitar DING2040');
    fireEvent.click(removeBtns[0]);
    expect(onRemoveCourse).toHaveBeenCalledWith('DING2040');
  });

  it('renders ExamWeeklyGrid across empty state, multi-week tabs, type switching, and course removal', () => {
    const { rerender } = render(<ExamWeeklyGrid items={[]} courseColorMap={new Map()} />);
    expect(screen.getByText(/No hay exámenes de tipo/i)).toBeTruthy();

    const multiWeekCourse: Course = {
      ...SAMPLE_COURSES[0],
      code: 'EX100',
      name: 'EXAM MULTI',
      parallels: [
        {
          ...SAMPLE_COURSES[0].parallels[0],
          exams: [
            {
              type: 'Parcial',
              raw: '24/11/2026 - 08:00 a 09:00',
              date: '2026-11-24',
              startTime: '08:00',
              endTime: '09:00',
              startMinutes: 480,
              endMinutes: 540,
              classroom: '9M-101',
            },
          ],
          practicals: [],
        },
      ],
    };

    const items: CourseSelectionItem[] = [
      ...resolveManualEntries(SAMPLE_COURSES, [
        { courseCode: 'DING2040', parallelNumber: '1', practicalCode: '101' },
        { courseCode: 'MATG1045', parallelNumber: '1', practicalCode: '101' },
      ]),
      { course: multiWeekCourse, parallel: multiWeekCourse.parallels[0], practical: null },
    ];
    const onRemoveCourse = vi.fn();

    rerender(
      <ExamWeeklyGrid
        items={items}
        courseColorMap={makeColorMap([...SAMPLE_COURSES, multiWeekCourse])}
        onRemoveCourse={onRemoveCourse}
      />,
    );

    // Multi-week buttons (Sem 1, Sem 2)
    fireEvent.click(screen.getByRole('button', { name: 'Sem 2' }));
    expect(screen.getByTitle(/Quitar EX100/i)).toBeTruthy();

    fireEvent.click(screen.getByTitle('Quitar EX100'));
    expect(onRemoveCourse).toHaveBeenCalledWith('EX100');

    // Switch to Final -> MATG1045 & EX100 appear in unscheduled banner
    fireEvent.click(screen.getByRole('button', { name: 'Final' }));
    expect(screen.getByText(/Sin fecha en Final:/i)).toBeTruthy();
  });

  it('renders ManualCourseSidebar empty and populated states with conflict badges and hover preview', () => {
    const { rerender } = render(
      <ManualCourseSidebar
        courses={[]}
        manualEntries={[]}
        manualItems={[]}
        manualByCode={new Map()}
        expandedCourses={new Set()}
        courseColorMap={new Map()}
        onClearManual={vi.fn()}
        onToggleExpanded={vi.fn()}
        onToggleManualOption={vi.fn()}
        onRemoveManualCourse={vi.fn()}
        onRemoveCatalogCourse={vi.fn()}
        onHoverPreview={vi.fn()}
      />,
    );
    expect(screen.getByText(/No hay materias guardadas todavía/i)).toBeTruthy();

    const virtualCourse: Course = {
      ...SAMPLE_COURSES[3],
      code: 'VIRT101',
      name: 'CURSO VIRTUAL',
      parallels: [
        {
          ...SAMPLE_COURSES[3].parallels[0],
          parallelNumber: '1',
          modality: 'CURSO A DICTARSE EN MODALIDAD VIRTUAL - E-LEARNING',
          available: 0,
        },
      ],
    };
    const allCourses = [...SAMPLE_COURSES, virtualCourse];
    const entries = [
      { courseCode: 'MATG1045', parallelNumber: '1', practicalCode: '102' },
    ];
    const manualItems = resolveManualEntries(allCourses, entries);
    const onHoverPreview = vi.fn();
    const onToggleManualOption = vi.fn();
    const onClearManual = vi.fn();
    const onToggleExpanded = vi.fn();
    const onRemoveManualCourse = vi.fn();
    const onRemoveCatalogCourse = vi.fn();

    rerender(
      <ManualCourseSidebar
        courses={allCourses}
        manualEntries={entries}
        manualItems={manualItems}
        manualByCode={new Map(entries.map((e) => [e.courseCode, e]))}
        expandedCourses={new Set(['CCPG1043', 'VIRT101', 'MATG1045'])}
        courseColorMap={makeColorMap(allCourses)}
        onClearManual={onClearManual}
        onToggleExpanded={onToggleExpanded}
        onToggleManualOption={onToggleManualOption}
        onRemoveManualCourse={onRemoveManualCourse}
        onRemoveCatalogCourse={onRemoveCatalogCourse}
        onHoverPreview={onHoverPreview}
      />,
    );

    expect(screen.getByText('Virtual')).toBeTruthy();
    expect(screen.getByText(/Choca clase:/i)).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Quitar MATG1045 del horario'));
    expect(onRemoveManualCourse).toHaveBeenCalledWith('MATG1045');

    fireEvent.click(screen.getByLabelText('Mostrar u ocultar paralelos de DING2040'));
    expect(onToggleExpanded).toHaveBeenCalledWith('DING2040');

    fireEvent.click(screen.getByLabelText('Eliminar DING2040 del catálogo'));
    expect(onRemoveCatalogCourse).toHaveBeenCalledWith('DING2040');

    const ccpgOption = screen.getByText(/P2/i).closest('button')!;
    fireEvent.mouseEnter(ccpgOption);
    expect(onHoverPreview).toHaveBeenCalled();
    fireEvent.mouseLeave(ccpgOption);
    expect(onHoverPreview).toHaveBeenLastCalledWith(null);
    fireEvent.click(ccpgOption);
    expect(onToggleManualOption).toHaveBeenCalledWith('CCPG1043', '2', null);

    fireEvent.click(screen.getByRole('button', { name: /Vaciar horario/i }));
    expect(onClearManual).toHaveBeenCalled();
  });

  it('renders AutoConstraintsSidebar empty and populated states and invokes constraint callbacks', async () => {
    const { container, rerender } = render(
      <AutoConstraintsSidebar
        courses={[]}
        constraints={DEFAULT_CONSTRAINTS}
        availableDays={['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes']}
        expandedCourses={new Set()}
        manualByCode={new Map()}
        manualCount={0}
        respectManualPins={true}
        courseColorMap={new Map()}
        onRespectManualPinsChange={vi.fn()}
        onUpdateConstraints={vi.fn()}
        onToggleCourseSelection={vi.fn()}
        onToggleExpanded={vi.fn()}
        onToggleExcludedParallel={vi.fn()}
        onToggleExcludedPractical={vi.fn()}
        onRemoveCatalogCourse={vi.fn()}
        onToggleBlockedDay={vi.fn()}
        onAddBlockedSlot={vi.fn()}
        onRemoveBlockedSlot={vi.fn()}
        onInvalidSlot={vi.fn()}
      />,
    );
    expect(screen.getByText(/No hay materias guardadas todavía/i)).toBeTruthy();

    const onUpdateConstraints = vi.fn();
    const onAddBlockedSlot = vi.fn();
    const onInvalidSlot = vi.fn();
    const onRemoveBlockedSlot = vi.fn();
    const onToggleBlockedDay = vi.fn();
    const onToggleCourseSelection = vi.fn();
    const onToggleExpanded = vi.fn();
    const onToggleExcludedParallel = vi.fn();
    const onToggleExcludedPractical = vi.fn();
    const onRemoveCatalogCourse = vi.fn();
    const onRespectManualPinsChange = vi.fn();

    rerender(
      <AutoConstraintsSidebar
        courses={SAMPLE_COURSES}
        constraints={{
          ...DEFAULT_CONSTRAINTS,
          selectedCourseCodes: ['DING2040'],
          blockedDays: ['Viernes'],
          blockedSlots: [{ day: 'Lunes', startMinutes: 420, endMinutes: 540 }],
        }}
        availableDays={['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes']}
        expandedCourses={new Set(['DING2040'])}
        manualByCode={
          new Map([['DING2040', { courseCode: 'DING2040', parallelNumber: '1', practicalCode: '101' }]])
        }
        manualCount={1}
        respectManualPins={true}
        courseColorMap={makeColorMap(SAMPLE_COURSES)}
        onRespectManualPinsChange={onRespectManualPinsChange}
        onUpdateConstraints={onUpdateConstraints}
        onToggleCourseSelection={onToggleCourseSelection}
        onToggleExpanded={onToggleExpanded}
        onToggleExcludedParallel={onToggleExcludedParallel}
        onToggleExcludedPractical={onToggleExcludedPractical}
        onRemoveCatalogCourse={onRemoveCatalogCourse}
        onToggleBlockedDay={onToggleBlockedDay}
        onAddBlockedSlot={onAddBlockedSlot}
        onRemoveBlockedSlot={onRemoveBlockedSlot}
        onInvalidSlot={onInvalidSlot}
      />,
    );

    expect(screen.getByText('Fijada')).toBeTruthy();

    // Toggle course, parallel, practical checkboxes and expand/remove buttons
    const checkboxes = container.querySelectorAll('[role="checkbox"]');
    checkboxes.forEach((cb) => fireEvent.click(cb));
    expect(onToggleCourseSelection).toHaveBeenCalled();
    expect(onToggleExcludedParallel).toHaveBeenCalled();
    expect(onToggleExcludedPractical).toHaveBeenCalled();

    fireEvent.click(screen.getAllByTitle('Ver paralelos')[0]);
    expect(onToggleExpanded).toHaveBeenCalled();

    fireEvent.click(screen.getAllByTitle('Eliminar materia')[0]);
    expect(onRemoveCatalogCourse).toHaveBeenCalled();

    // Open Select dropdown for sortBy and pick maxFreeDays
    const comboboxes = screen.getAllByRole('combobox');
    fireEvent.click(comboboxes[0]);
    const option = await screen.findByText('Más días libres');
    fireEvent.click(option);
    expect(onUpdateConstraints).toHaveBeenCalled();

    // Toggle blocked day
    fireEvent.click(screen.getByRole('button', { name: 'Vie' }));
    expect(onToggleBlockedDay).toHaveBeenCalledWith('Viernes');

    // Submit valid blocked slot
    fireEvent.click(screen.getByTitle('Agregar franja bloqueada'));
    expect(onAddBlockedSlot).toHaveBeenCalledWith({
      day: 'Lunes',
      startMinutes: 420,
      endMinutes: 540,
    });

    // Submit invalid blocked slot (end <= start)
    const timeInputs = container.querySelectorAll('input[type="time"]');
    fireEvent.change(timeInputs[0], { target: { value: '11:00' } });
    fireEvent.change(timeInputs[1], { target: { value: '09:00' } });
    fireEvent.click(screen.getByTitle('Agregar franja bloqueada'));
    expect(onInvalidSlot).toHaveBeenCalledTimes(1);

    // Remove blocked slot badge button
    const slotBadge = screen.getByText(/Lun 07:00–09:00/i);
    fireEvent.click(slotBadge.querySelector('button')!);
    expect(onRemoveBlockedSlot).toHaveBeenCalledWith(0);

    // Toggle switches
    const switches = screen.getAllByRole('switch');
    for (const sw of switches) {
      fireEvent.click(sw);
    }
    expect(onUpdateConstraints).toHaveBeenCalled();
  });
});
