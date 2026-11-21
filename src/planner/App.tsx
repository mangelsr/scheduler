import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Calendar, CalendarCheck2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { computeMetrics, findClassConflicts, generateSchedules, resolveManualEntries } from '../shared/scheduler';
import { ALL_DAYS, ORDERED_DAYS, type CourseSelectionItem, type DayOfWeek, type SchedulerConstraints } from '../shared/types';
import { AutoConstraintsSidebar } from './components/AutoConstraintsSidebar';
import { CampusTransitionsCard } from './components/CampusTransitionsCard';
import { ExamDetailsTable } from './components/ExamDetailsTable';
import { ExamWeeklyGrid } from './components/ExamWeeklyGrid';
import { ManualCourseSidebar } from './components/ManualCourseSidebar';
import { PlannerHeader, type PlannerMode } from './components/PlannerHeader';
import { AutoSummaryBar, ManualSummaryBar } from './components/ScheduleSummaryBar';
import { usePlannerState } from './hooks/usePlannerState';
import { useSeatRefresh } from './hooks/useSeatRefresh';
import { getCourseColor, WeeklyGrid } from './WeeklyGrid';

export function App() {
  const [mode, setMode] = useState<PlannerMode>('manual');
  const [scheduleView, setScheduleView] = useState<'classes' | 'exams'>('classes');
  const [respectManualPins, setRespectManualPins] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [hoveredPreview, setHoveredPreview] = useState<CourseSelectionItem | null>(null);
  const [statusMessage, setStatusMessage] = useState('');

  const state = usePlannerState(setStatusMessage);
  const {
    courses,
    setCourses,
    constraints,
    setConstraints,
    manualEntries,
    setManualEntries,
    expandedCourses,
  } = state;

  const { refreshingSeats, refreshSeats } = useSeatRefresh(setCourses, setStatusMessage);

  const manualItems = useMemo(
    () => resolveManualEntries(courses, manualEntries),
    [courses, manualEntries],
  );

  const manualByCode = useMemo(
    () => new Map(manualEntries.map((e) => [e.courseCode, e])),
    [manualEntries],
  );

  const manualMetrics = useMemo(() => computeMetrics(manualItems), [manualItems]);
  const manualClassConflicts = useMemo(() => findClassConflicts(manualItems), [manualItems]);

  const effectiveConstraints = useMemo<SchedulerConstraints>(
    () => ({
      ...constraints,
      pinnedSelections: respectManualPins ? manualEntries : [],
    }),
    [constraints, respectManualPins, manualEntries],
  );

  const generation = useMemo(
    () => (mode === 'auto' ? generateSchedules(courses, effectiveConstraints) : null),
    [mode, courses, effectiveConstraints],
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [generation?.schedules.length, effectiveConstraints]);

  useEffect(() => {
    if (mode !== 'auto' || !generation) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (e.key === 'ArrowRight') {
        setActiveIndex((idx) => Math.min(idx + 1, Math.max(0, generation.schedules.length - 1)));
      } else if (e.key === 'ArrowLeft') {
        setActiveIndex((idx) => Math.max(0, idx - 1));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mode, generation]);

  const activeAutoSchedule = generation?.schedules[activeIndex] ?? null;

  const courseColorMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof getCourseColor>>();
    courses.forEach((c, idx) => map.set(c.code, getCourseColor(idx)));
    return map;
  }, [courses]);

  const availableDays = useMemo(() => {
    const used = new Set<DayOfWeek>(ORDERED_DAYS);
    for (const c of courses) {
      for (const p of c.parallels) {
        for (const s of p.sessions) used.add(s.day);
        for (const pr of p.practicals) {
          for (const s of pr.sessions) used.add(s.day);
        }
      }
    }
    for (const d of constraints.blockedDays) used.add(d);
    for (const s of constraints.blockedSlots) used.add(s.day);
    return ALL_DAYS.filter((d) => used.has(d));
  }, [courses, constraints.blockedDays, constraints.blockedSlots]);

  const applyAutoScheduleToManual = () => {
    if (!activeAutoSchedule) return;
    setManualEntries(
      activeAutoSchedule.items.map((item) => ({
        courseCode: item.course.code,
        parallelNumber: item.parallel.parallelNumber,
        practicalCode: item.practical?.code ?? null,
      })),
    );
    setMode('manual');
    setStatusMessage(`Opción ${activeIndex + 1} cargada en Armado Manual para editar.`);
  };

  const handleAutoCompleteFromManual = () => {
    setRespectManualPins(true);
    setConstraints((prev) => ({
      ...prev,
      selectedCourseCodes:
        prev.selectedCourseCodes.length > 0
          ? Array.from(
              new Set([...prev.selectedCourseCodes, ...manualEntries.map((e) => e.courseCode)]),
            )
          : courses.map((c) => c.code),
    }));
    setMode('auto');
  };

  const copySummaryToClipboard = async (items: CourseSelectionItem[]) => {
    if (items.length === 0) return;
    const text = items
      .map(
        (it) =>
          `${it.course.code} (${it.course.name}): Paralelo ${it.parallel.parallelNumber}${
            it.practical ? ` + Práctico ${it.practical.code}` : ''
          }`,
      )
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setStatusMessage('Resumen copiado al portapapeles.');
    } catch {
      setStatusMessage('No se pudo copiar al portapapeles.');
    }
  };

  const handleRefreshSeats = () => {
    const targetCourses =
      mode === 'manual' && manualItems.length > 0
        ? courses.filter((c) => manualByCode.has(c.code))
        : courses.filter((c) => constraints.selectedCourseCodes.includes(c.code));
    void refreshSeats(targetCourses);
  };

  const displayedItems = mode === 'manual' ? manualItems : (activeAutoSchedule?.items ?? []);
  const displayedMetrics = mode === 'manual' ? manualMetrics : (activeAutoSchedule?.metrics ?? null);

  const scheduleViewTabs = (
    <div className="no-print flex items-center justify-between gap-2">
      <Tabs
        value={scheduleView}
        onValueChange={(v) => setScheduleView(v as 'classes' | 'exams')}
      >
        <TabsList className="h-8 border border-border bg-card p-0.5 shadow-2xs">
          <TabsTrigger
            value="classes"
            className="h-7 px-3 text-xs font-semibold data-[state=active]:bg-espol-navy data-[state=active]:text-white"
          >
            <Calendar className="size-3.5" />
            Horario de clases
          </TabsTrigger>
          <TabsTrigger
            value="exams"
            className="h-7 px-3 text-xs font-semibold data-[state=active]:bg-espol-navy data-[state=active]:text-white"
          >
            <CalendarCheck2 className="size-3.5" />
            Horario de exámenes
            {displayedMetrics && displayedMetrics.examConflicts.length > 0 && (
              <Badge className="ml-1 border-red-200 bg-red-100 px-1.5 py-0 text-[10px] text-red-900">
                {displayedMetrics.examConflicts.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );

  return (
    <div className="print-full flex h-screen flex-col overflow-hidden bg-background text-foreground max-[960px]:h-auto max-[960px]:min-h-screen max-[960px]:overflow-visible">
      <PlannerHeader
        mode={mode}
        onModeChange={setMode}
        coursesCount={courses.length}
        manualCount={manualItems.length}
        statusMessage={statusMessage}
        refreshingSeats={refreshingSeats}
        onLoadSample={() => void state.handleLoadSample()}
        onImportJson={(file) => void state.handleImportJson(file)}
        onExportJson={state.handleExportJson}
        onRefreshSeats={handleRefreshSeats}
        onClearAll={() => void state.handleClearAll()}
      />

      <div className="print-block grid min-h-0 flex-1 grid-cols-[340px_1fr] max-[960px]:block max-[960px]:grid-cols-1">
        <aside className="no-print flex min-h-0 flex-col border-r border-border bg-card max-[960px]:border-r-0 max-[960px]:border-b">
          <ScrollArea className="min-h-0 flex-1 overflow-hidden">
            <div className="flex flex-col gap-5 p-4">
              {mode === 'manual' ? (
                <ManualCourseSidebar
                  courses={courses}
                  manualEntries={manualEntries}
                  manualItems={manualItems}
                  manualByCode={manualByCode}
                  expandedCourses={expandedCourses}
                  courseColorMap={courseColorMap}
                  onClearManual={() => setManualEntries([])}
                  onToggleExpanded={state.toggleExpanded}
                  onToggleManualOption={state.toggleManualOption}
                  onRemoveManualCourse={state.removeManualCourse}
                  onRemoveCatalogCourse={(code) => void state.handleRemoveCourse(code)}
                  onHoverPreview={setHoveredPreview}
                />
              ) : (
                <AutoConstraintsSidebar
                  courses={courses}
                  constraints={constraints}
                  availableDays={availableDays}
                  expandedCourses={expandedCourses}
                  manualByCode={manualByCode}
                  manualCount={manualEntries.length}
                  respectManualPins={respectManualPins}
                  courseColorMap={courseColorMap}
                  onRespectManualPinsChange={setRespectManualPins}
                  onUpdateConstraints={setConstraints}
                  onToggleCourseSelection={state.toggleCourseSelection}
                  onToggleExpanded={state.toggleExpanded}
                  onToggleExcludedParallel={state.toggleExcludedParallel}
                  onToggleExcludedPractical={state.toggleExcludedPractical}
                  onRemoveCatalogCourse={(code) => void state.handleRemoveCourse(code)}
                  onToggleBlockedDay={state.toggleBlockedDay}
                  onAddBlockedSlot={(slot) => {
                    state.addBlockedSlot(slot);
                    setStatusMessage('');
                  }}
                  onRemoveBlockedSlot={state.removeBlockedSlot}
                  onInvalidSlot={() => setStatusMessage('Rango horario inválido para bloquear.')}
                />
              )}
            </div>
          </ScrollArea>
        </aside>

        <main className="print-block flex min-h-0 flex-col bg-background print:bg-white">
          <ScrollArea className="min-h-0 flex-1 overflow-hidden">
            <div className="flex flex-col gap-4 p-4 print:p-0">
              <div className="hidden border-b-2 border-espol-gold pb-2 print:flex print:items-center print:justify-between">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-espol-navy px-2 py-0.5 text-xs font-bold text-espol-gold">
                    ESPOL
                  </span>
                  <strong className="text-sm text-espol-navy">
                    {scheduleView === 'classes' ? 'Horario de Clases' : 'Horario de Exámenes'} (
                    {mode === 'manual' ? 'Armado Manual' : `Opción ${activeIndex + 1}`})
                  </strong>
                </div>
                <span className="text-xs text-slate-600">{displayedItems.length} materia(s)</span>
              </div>

              {mode === 'manual' ? (
                <>
                  <ManualSummaryBar
                    selectedCount={manualItems.length}
                    totalCoursesCount={courses.length}
                    metrics={manualMetrics}
                    classConflictsCount={manualClassConflicts.length}
                    onAutoComplete={handleAutoCompleteFromManual}
                    onCopySummary={() => void copySummaryToClipboard(manualItems)}
                    onPrint={() => window.print()}
                  />

                  {(manualClassConflicts.length > 0 || manualMetrics.examConflicts.length > 0) && (
                    <Alert variant="destructive" className="border-red-300 bg-red-50 text-red-900">
                      <AlertTriangle className="size-4" />
                      <AlertTitle>Conflictos en tu horario manual</AlertTitle>
                      <AlertDescription>
                        <ul className="mt-1 list-disc pl-4 text-xs">
                          {manualClassConflicts.map((c, idx) => (
                            <li key={`cc-${idx}`}>
                              Clase ({c.day} {c.timeRange}): {c.courseA} choca con {c.courseB}
                            </li>
                          ))}
                          {manualMetrics.examConflicts.map((c, idx) => (
                            <li key={`ec-${idx}`}>
                              Examen {c.examType} ({c.date}): {c.courseA} [{c.timeA}] vs{' '}
                              {c.courseB} [{c.timeB}]
                            </li>
                          ))}
                        </ul>
                      </AlertDescription>
                    </Alert>
                  )}

                  {(manualItems.length > 0 || hoveredPreview !== null) && scheduleViewTabs}

                  {scheduleView === 'classes' ? (
                    <WeeklyGrid
                      items={manualItems}
                      previewItem={hoveredPreview}
                      blockedDays={[]}
                      blockedSlots={[]}
                      courseColorMap={courseColorMap}
                      onRemoveCourse={state.removeManualCourse}
                    />
                  ) : (
                    <ExamWeeklyGrid
                      items={manualItems}
                      previewItem={hoveredPreview}
                      courseColorMap={courseColorMap}
                      onRemoveCourse={state.removeManualCourse}
                    />
                  )}

                  {manualItems.length === 0 && courses.length > 0 && !hoveredPreview && (
                    <Card className="border-dashed bg-card shadow-none">
                      <CardContent className="py-4 text-center text-xs text-muted-foreground">
                        Selecciona un paralelo en el panel izquierdo para armar tu horario
                        manualmente, o cambia a <strong>Recomendaciones</strong> arriba para generar
                        combinaciones automáticas.
                      </CardContent>
                    </Card>
                  )}
                </>
              ) : constraints.selectedCourseCodes.length === 0 ? (
                <Card className="mx-auto my-10 max-w-xl text-center">
                  <CardHeader>
                    <CardTitle className="text-lg text-espol-navy">
                      Selecciona al menos una materia
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    Marca las materias que deseas combinar en el panel izquierdo (o pulsa{' '}
                    <strong>Cargar ejemplo</strong> arriba para probar el generador).
                  </CardContent>
                </Card>
              ) : !generation || generation.schedules.length === 0 ? (
                <Card className="mx-auto my-10 max-w-xl text-center">
                  <CardHeader>
                    <CardTitle className="text-lg text-espol-navy">
                      Sin combinaciones posibles
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    {generation && generation.emptyCourseCodes.length > 0 ? (
                      <p>
                        Las siguientes materias no tienen paralelos disponibles bajo los filtros
                        actuales: <strong>{generation.emptyCourseCodes.join(', ')}</strong>. Prueba
                        desactivar <em>Solo paralelos con cupo</em> o revisar los días/franjas
                        bloqueadas.
                      </p>
                    ) : (
                      <p>
                        Todas las combinaciones chocan en horario de clases
                        {constraints.avoidExamConflicts ? ', en fechas de exámenes' : ''}
                        {constraints.avoidLongWalks ? ' o tienen caminatas largas sin hueco' : ''}.
                        Prueba desactivar una materia opcional, quitar el fijado manual o relajar
                        los filtros.
                      </p>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <>
                  <AutoSummaryBar
                    activeIndex={activeIndex}
                    totalCount={generation.schedules.length}
                    truncated={generation.truncated}
                    schedule={activeAutoSchedule}
                    onPrev={() => setActiveIndex((i) => Math.max(0, i - 1))}
                    onNext={() =>
                      setActiveIndex((i) => Math.min(generation.schedules.length - 1, i + 1))
                    }
                    onApplyToManual={applyAutoScheduleToManual}
                    onCopySummary={() =>
                      activeAutoSchedule && void copySummaryToClipboard(activeAutoSchedule.items)
                    }
                    onPrint={() => window.print()}
                  />

                  {activeAutoSchedule && (
                    <>
                      {scheduleViewTabs}
                      {scheduleView === 'classes' ? (
                        <WeeklyGrid
                          items={activeAutoSchedule.items}
                          blockedDays={constraints.blockedDays}
                          blockedSlots={constraints.blockedSlots}
                          courseColorMap={courseColorMap}
                        />
                      ) : (
                        <ExamWeeklyGrid
                          items={activeAutoSchedule.items}
                          courseColorMap={courseColorMap}
                        />
                      )}
                    </>
                  )}
                </>
              )}

              {displayedMetrics && displayedMetrics.transitions.length > 0 && (
                <CampusTransitionsCard transitions={displayedMetrics.transitions} />
              )}

              {displayedMetrics && (
                <ExamDetailsTable
                  items={displayedItems}
                  examConflicts={displayedMetrics.examConflicts}
                  showExamConflictAlert={mode === 'auto'}
                  subtitle={mode === 'auto' ? `(Opción ${activeIndex + 1})` : '(Horario Manual)'}
                  courseColorMap={courseColorMap}
                />
              )}
            </div>
          </ScrollArea>
        </main>
      </div>
    </div>
  );
}
