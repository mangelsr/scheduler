import React, { useEffect, useMemo, useRef, useState } from 'react';
import { parsePlannedCourseHtml } from '../shared/parser';
import { SAMPLE_COURSES } from '../shared/sampleData';
import {
  computeMetrics,
  findClassConflicts,
  findExamConflicts,
  generateSchedules,
  getOptionSessions,
  resolveManualEntries,
  sessionsCollide,
} from '../shared/scheduler';
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
import {
  ORDERED_DAYS,
  type BlockedSlot,
  type Course,
  type CourseSelectionItem,
  type DayOfWeek,
  type ManualSelectionEntry,
  type SchedulerConstraints,
  type SortPreference,
} from '../shared/types';
import { getCourseColor, WeeklyGrid } from './WeeklyGrid';

type PlannerMode = 'manual' | 'auto';

function formatMinutesAsDuration(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatClock(mins: number): string {
  if (!mins) return '--:--';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function parseClockInput(val: string): number | null {
  const m = val.match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function formatSessionsShort(item: CourseSelectionItem): string {
  return getOptionSessions(item)
    .map((s) => `${s.day.slice(0, 3)} ${s.startTime}-${s.endTime}`)
    .join(' · ');
}

export function App() {
  const [mode, setMode] = useState<PlannerMode>('manual');
  const [courses, setCourses] = useState<Course[]>([]);
  const [constraints, setConstraints] = useState<SchedulerConstraints>(DEFAULT_CONSTRAINTS);
  const [manualEntries, setManualEntries] = useState<ManualSelectionEntry[]>([]);
  const [respectManualPins, setRespectManualPins] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  const [activeIndex, setActiveIndex] = useState(0);
  const [expandedCourses, setExpandedCourses] = useState<Set<string>>(new Set());
  const [hoveredPreview, setHoveredPreview] = useState<CourseSelectionItem | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [refreshingSeats, setRefreshingSeats] = useState(false);

  // Blocked slot quick form
  const [slotDay, setSlotDay] = useState<DayOfWeek>('Lunes');
  const [slotStart, setSlotStart] = useState('07:00');
  const [slotEnd, setSlotEnd] = useState('09:00');

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([loadCourses(), loadConstraints(), loadManualSelections()]).then(
      ([loadedCourses, loadedConstraints, loadedManual]) => {
        setCourses(loadedCourses);
        const existingCodes = new Set(loadedCourses.map((c) => c.code));
        const validSelected = loadedConstraints.selectedCourseCodes.filter((code) =>
          existingCodes.has(code),
        );
        const initialSelected =
          validSelected.length > 0 ? validSelected : loadedCourses.map((c) => c.code);
        setConstraints({ ...loadedConstraints, selectedCourseCodes: initialSelected });
        setManualEntries(loadedManual.filter((e) => existingCodes.has(e.courseCode)));
        // Expand first couple courses by default so manual picking is immediate
        setExpandedCourses(new Set(loadedCourses.slice(0, 4).map((c) => c.code)));
        setHydrated(true);
      },
    );

    const unsub = subscribeCoursesChanged((nextCourses) => {
      setCourses(nextCourses);
      const nextCodes = nextCourses.map((c) => c.code);
      setConstraints((prev) => {
        const prevSet = new Set(prev.selectedCourseCodes);
        const added = nextCodes.filter((code) => !prevSet.has(code));
        const filtered = prev.selectedCourseCodes.filter((code) => nextCodes.includes(code));
        return { ...prev, selectedCourseCodes: [...filtered, ...added] };
      });
      setManualEntries((prev) => prev.filter((e) => nextCodes.includes(e.courseCode)));
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void saveConstraints(constraints);
  }, [constraints, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    void saveManualSelections(manualEntries);
  }, [manualEntries, hydrated]);

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

  const toggleManualOption = (
    courseCode: string,
    parallelNumber: string,
    practicalCode: string | null,
  ) => {
    setManualEntries((prev) => {
      const current = prev.find((e) => e.courseCode === courseCode);
      const isSame =
        current &&
        current.parallelNumber === parallelNumber &&
        current.practicalCode === practicalCode;
      if (isSame) {
        return prev.filter((e) => e.courseCode !== courseCode);
      }
      return [
        ...prev.filter((e) => e.courseCode !== courseCode),
        { courseCode, parallelNumber, practicalCode },
      ];
    });
  };

  const removeManualCourse = (courseCode: string) => {
    setManualEntries((prev) => prev.filter((e) => e.courseCode !== courseCode));
  };

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
          ? Array.from(new Set([...prev.selectedCourseCodes, ...manualEntries.map((e) => e.courseCode)]))
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

  const toggleCourseSelection = (code: string) => {
    setConstraints((prev) => {
      const exists = prev.selectedCourseCodes.includes(code);
      return {
        ...prev,
        selectedCourseCodes: exists
          ? prev.selectedCourseCodes.filter((c) => c !== code)
          : [...prev.selectedCourseCodes, code],
      };
    });
  };

  const toggleExpanded = (code: string) => {
    setExpandedCourses((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const toggleExcludedParallel = (courseCode: string, parallelNumber: string) => {
    const key = `${courseCode}::${parallelNumber}`;
    setConstraints((prev) => {
      const exists = prev.excludedParallelKeys.includes(key);
      return {
        ...prev,
        excludedParallelKeys: exists
          ? prev.excludedParallelKeys.filter((k) => k !== key)
          : [...prev.excludedParallelKeys, key],
      };
    });
  };

  const toggleExcludedPractical = (
    courseCode: string,
    parallelNumber: string,
    practicalCode: string,
  ) => {
    const key = `${courseCode}::${parallelNumber}::${practicalCode}`;
    setConstraints((prev) => {
      const exists = prev.excludedPracticalKeys.includes(key);
      return {
        ...prev,
        excludedPracticalKeys: exists
          ? prev.excludedPracticalKeys.filter((k) => k !== key)
          : [...prev.excludedPracticalKeys, key],
      };
    });
  };

  const toggleBlockedDay = (day: DayOfWeek) => {
    setConstraints((prev) => {
      const exists = prev.blockedDays.includes(day);
      return {
        ...prev,
        blockedDays: exists ? prev.blockedDays.filter((d) => d !== day) : [...prev.blockedDays, day],
      };
    });
  };

  const addBlockedSlot = (e: React.FormEvent) => {
    e.preventDefault();
    const startMinutes = parseClockInput(slotStart);
    const endMinutes = parseClockInput(slotEnd);
    if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
      setStatusMessage('Rango horario inválido para bloquear.');
      return;
    }
    const nextSlot: BlockedSlot = { day: slotDay, startMinutes, endMinutes };
    setConstraints((prev) => ({
      ...prev,
      blockedSlots: [...prev.blockedSlots, nextSlot],
    }));
    setStatusMessage('');
  };

  const removeBlockedSlot = (index: number) => {
    setConstraints((prev) => ({
      ...prev,
      blockedSlots: prev.blockedSlots.filter((_, i) => i !== index),
    }));
  };

  const handleLoadSample = async () => {
    const merged = await upsertCourses(SAMPLE_COURSES);
    setCourses(merged);
    setConstraints((prev) => ({
      ...prev,
      selectedCourseCodes: SAMPLE_COURSES.map((c) => c.code),
    }));
    setExpandedCourses(new Set(SAMPLE_COURSES.map((c) => c.code)));
    setStatusMessage('Datos de ejemplo cargados (4 materias).');
  };

  const handleRemoveCourse = async (code: string) => {
    const next = await removeCourse(code);
    setCourses(next);
    setConstraints((prev) => ({
      ...prev,
      selectedCourseCodes: prev.selectedCourseCodes.filter((c) => c !== code),
    }));
    setManualEntries((prev) => prev.filter((e) => e.courseCode !== code));
  };

  const handleClearAll = async () => {
    await clearAllCourses();
    setCourses([]);
    setConstraints((prev) => ({ ...prev, selectedCourseCodes: [] }));
    setManualEntries([]);
    setStatusMessage('Catálogo limpiado.');
  };

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(courses, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `espol-materias-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Course[];
      if (!Array.isArray(parsed)) throw new Error('Formato inválido');
      const merged = await upsertCourses(parsed);
      setCourses(merged);
      setConstraints((prev) => ({
        ...prev,
        selectedCourseCodes: Array.from(
          new Set([...prev.selectedCourseCodes, ...parsed.map((c) => c.code)]),
        ),
      }));
      setExpandedCourses(new Set(merged.slice(0, 4).map((c) => c.code)));
      setStatusMessage(`Importadas ${parsed.length} materia(s) correctamente.`);
    } catch {
      setStatusMessage('No se pudo leer el archivo JSON.');
    } finally {
      e.target.value = '';
    }
  };

  const handleRefreshSeats = async () => {
    const targetCourses =
      mode === 'manual' && manualItems.length > 0
        ? courses.filter((c) => manualByCode.has(c.code))
        : courses.filter((c) => constraints.selectedCourseCodes.includes(c.code));

    if (targetCourses.length === 0 || refreshingSeats) return;
    const targetCodes = new Set(targetCourses.map((c) => c.code));

    setRefreshingSeats(true);
    let updatedCount = 0;
    let errorCount = 0;
    const nextCourses = structuredClone(courses);

    try {
      for (const course of nextCourses) {
        if (!targetCodes.has(course.code)) continue;
        for (let i = 0; i < course.parallels.length; i++) {
          const p = course.parallels[i];
          setStatusMessage(`Actualizando ${course.code} P${p.parallelNumber}...`);
          try {
            const res = await fetch(p.url, { credentials: 'include', redirect: 'follow' });
            if (!res.ok || res.url.toLowerCase().includes('login')) {
              errorCount++;
              continue;
            }
            const html = await res.text();
            const parsed = parsePlannedCourseHtml(html, res.url || p.url);
            if (parsed.parallel.parallelNumber) {
              course.parallels[i] = parsed.parallel;
              updatedCount++;
            } else {
              errorCount++;
            }
          } catch {
            errorCount++;
          }
          await new Promise((r) => setTimeout(r, 180));
        }
        course.extractedAt = new Date().toISOString();
      }

      await saveCourses(nextCourses);
      setCourses(nextCourses);
      setStatusMessage(
        errorCount > 0
          ? `Actualizados ${updatedCount} paralelos (${errorCount} fallaron — revisa tu sesión en Académico).`
          : `Cupos actualizados para ${updatedCount} paralelo(s).`,
      );
    } finally {
      setRefreshingSeats(false);
    }
  };

  const getManualOptionConflict = (candidate: CourseSelectionItem) => {
    const others = manualItems.filter((it) => it.course.code !== candidate.course.code);
    const candSessions = getOptionSessions(candidate);
    const classHits = others
      .filter((o) => sessionsCollide(getOptionSessions(o), candSessions))
      .map((o) => o.course.code);
    const examHits = others.flatMap((o) => findExamConflicts([o, candidate]));
    return { classHits, examHits };
  };

  const displayedItems =
    mode === 'manual' ? manualItems : (activeAutoSchedule?.items ?? []);
  const displayedMetrics =
    mode === 'manual' ? manualMetrics : (activeAutoSchedule?.metrics ?? null);

  return (
    <div className="planner-layout">
      <header className="planner-topbar no-print">
        <div className="topbar-left">
          <div className="brand-badge">ESPOL</div>
          <div>
            <h1>Planificador de Horarios</h1>
            <span className="topbar-subtitle">
              {courses.length} materia(s) extraída(s) · {manualItems.length} en horario manual
            </span>
          </div>

          <div className="mode-switcher" role="tablist" aria-label="Modo de planificación">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'manual'}
              className={`mode-tab ${mode === 'manual' ? 'active' : ''}`}
              onClick={() => setMode('manual')}
            >
              Armado Manual
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'auto'}
              className={`mode-tab ${mode === 'auto' ? 'active' : ''}`}
              onClick={() => setMode('auto')}
            >
              Recomendaciones
            </button>
          </div>
        </div>

        <div className="topbar-actions">
          {statusMessage && <span className="status-pill">{statusMessage}</span>}
          <button type="button" className="btn btn-ghost" onClick={handleLoadSample}>
            Cargar ejemplo
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => fileInputRef.current?.click()}
          >
            Importar JSON
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            hidden
            onChange={handleImportJson}
          />
          <button
            type="button"
            className="btn btn-ghost"
            disabled={courses.length === 0}
            onClick={handleExportJson}
          >
            Exportar JSON
          </button>
          <button
            type="button"
            className="btn btn-gold"
            disabled={refreshingSeats || courses.length === 0}
            onClick={handleRefreshSeats}
          >
            {refreshingSeats ? 'Actualizando...' : 'Actualizar cupos'}
          </button>
          <button
            type="button"
            className="btn btn-danger-ghost"
            disabled={courses.length === 0}
            onClick={handleClearAll}
          >
            Limpiar
          </button>
        </div>
      </header>

      <div className="planner-body">
        <aside className="planner-sidebar no-print">
          {mode === 'manual' ? (
            <section className="sidebar-section">
              <div className="section-head-row">
                <h2>Armado Manual</h2>
                {manualEntries.length > 0 && (
                  <button
                    type="button"
                    className="text-link-btn"
                    onClick={() => setManualEntries([])}
                  >
                    Vaciar horario
                  </button>
                )}
              </div>
              <p className="sidebar-hint">
                Pasa el cursor sobre un paralelo para previsualizarlo y haz clic para fijarlo en tu
                horario.
              </p>

              {courses.length === 0 ? (
                <div className="empty-sidebar-box">
                  <p>No hay materias guardadas todavía.</p>
                  <p className="muted">
                    Extrae materias desde <strong>Consulta de Planificación</strong> en Académico
                    o pulsa <strong>Cargar ejemplo</strong>.
                  </p>
                </div>
              ) : (
                <div className="course-list">
                  {courses.map((course) => {
                    const isExpanded = expandedCourses.has(course.code);
                    const picked = manualByCode.get(course.code);
                    const color = courseColorMap.get(course.code);

                    return (
                      <div
                        key={course.code}
                        className={`course-card ${picked ? 'active' : ''}`}
                      >
                        <div
                          className="course-card-header clickable-header"
                          onClick={() => toggleExpanded(course.code)}
                        >
                          <div className="course-check">
                            <span
                              className="color-dot"
                              style={{ backgroundColor: color?.border ?? '#001c43' }}
                            />
                            <div className="course-title-group">
                              <div className="course-code-row">
                                <strong>{course.code}</strong>
                                {picked && (
                                  <span className="picked-pill">
                                    P{picked.parallelNumber}
                                    {picked.practicalCode ? `+${picked.practicalCode}` : ''}
                                  </span>
                                )}
                              </div>
                              <span>{course.name}</span>
                            </div>
                          </div>
                          <div
                            className="course-card-btns"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {picked && (
                              <button
                                type="button"
                                className="icon-btn"
                                title="Quitar del horario"
                                onClick={() => removeManualCourse(course.code)}
                              >
                                ↺
                              </button>
                            )}
                            <button
                              type="button"
                              className="icon-btn"
                              title="Mostrar/ocultar paralelos"
                              onClick={() => toggleExpanded(course.code)}
                            >
                              {isExpanded ? '▾' : '▸'}
                            </button>
                            <button
                              type="button"
                              className="icon-btn icon-btn-del"
                              title="Eliminar materia del catálogo"
                              onClick={() => handleRemoveCourse(course.code)}
                            >
                              ×
                            </button>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="manual-options-list">
                            {course.parallels.map((p) => {
                              const variants: CourseSelectionItem[] =
                                p.practicals.length > 0
                                  ? p.practicals.map((pr) => ({
                                      course,
                                      parallel: p,
                                      practical: pr,
                                    }))
                                  : [{ course, parallel: p, practical: null }];

                              return variants.map((variant) => {
                                const prCode = variant.practical?.code ?? null;
                                const isPicked =
                                  picked?.parallelNumber === p.parallelNumber &&
                                  picked?.practicalCode === prCode;
                                const { classHits, examHits } = getManualOptionConflict(variant);
                                const minSeats = variant.practical
                                  ? Math.min(p.available, variant.practical.available)
                                  : p.available;

                                return (
                                  <button
                                    key={`${p.parallelNumber}-${prCode ?? 'none'}`}
                                    type="button"
                                    className={`manual-option-btn ${isPicked ? 'selected' : ''} ${
                                      classHits.length > 0 && !isPicked ? 'has-conflict' : ''
                                    }`}
                                    onMouseEnter={() => setHoveredPreview(variant)}
                                    onMouseLeave={() => setHoveredPreview(null)}
                                    onClick={() =>
                                      toggleManualOption(course.code, p.parallelNumber, prCode)
                                    }
                                  >
                                    <div className="manual-option-top">
                                      <span>
                                        <strong>P{p.parallelNumber}</strong>
                                        {prCode ? ` · Prác. ${prCode}` : ''}
                                      </span>
                                      <span
                                        className={`seat-badge ${minSeats > 0 ? 'seat-ok' : 'seat-zero'}`}
                                      >
                                        Cupo {minSeats}
                                      </span>
                                    </div>
                                    <div className="manual-option-prof">
                                      {p.professor || 'Profesor por asignar'}
                                    </div>
                                    <div className="manual-option-times">
                                      {formatSessionsShort(variant) || 'Sin horario'}
                                    </div>
                                    {(classHits.length > 0 || examHits.length > 0) && (
                                      <div className="manual-option-conflicts">
                                        {classHits.length > 0 && (
                                          <span className="conflict-tag-class">
                                            Choca clase: {classHits.join(', ')}
                                          </span>
                                        )}
                                        {examHits.length > 0 && (
                                          <span className="conflict-tag-exam">
                                            Choca {examHits[0].examType}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </button>
                                );
                              });
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          ) : (
            <>
              <section className="sidebar-section">
                <h2>Materias a combinar</h2>
                {courses.length === 0 ? (
                  <div className="empty-sidebar-box">
                    <p>No hay materias guardadas todavía.</p>
                    <p className="muted">
                      Extrae materias desde ESPOL Académico o pulsa <strong>Cargar ejemplo</strong>.
                    </p>
                  </div>
                ) : (
                  <div className="course-list">
                    {courses.map((course) => {
                      const isSelected = constraints.selectedCourseCodes.includes(course.code);
                      const isExpanded = expandedCourses.has(course.code);
                      const isPinned = respectManualPins && manualByCode.has(course.code);
                      const color = courseColorMap.get(course.code);

                      return (
                        <div
                          key={course.code}
                          className={`course-card ${isSelected ? 'active' : ''}`}
                        >
                          <div className="course-card-header">
                            <label className="course-check">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleCourseSelection(course.code)}
                              />
                              <span
                                className="color-dot"
                                style={{ backgroundColor: color?.border ?? '#001c43' }}
                              />
                              <div className="course-title-group">
                                <div className="course-code-row">
                                  <strong>{course.code}</strong>
                                  {isPinned && <span className="picked-pill">Fijada</span>}
                                </div>
                                <span>{course.name}</span>
                              </div>
                            </label>
                            <div className="course-card-btns">
                              <button
                                type="button"
                                className="icon-btn"
                                title="Ver paralelos"
                                onClick={() => toggleExpanded(course.code)}
                              >
                                {isExpanded ? '▾' : '▸'}
                              </button>
                              <button
                                type="button"
                                className="icon-btn icon-btn-del"
                                title="Eliminar materia"
                                onClick={() => handleRemoveCourse(course.code)}
                              >
                                ×
                              </button>
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="parallel-list">
                              {course.parallels.map((p) => {
                                const pKey = `${course.code}::${p.parallelNumber}`;
                                const pEnabled = !constraints.excludedParallelKeys.includes(pKey);
                                return (
                                  <div key={p.parallelNumber} className="parallel-item">
                                    <label className="parallel-row">
                                      <input
                                        type="checkbox"
                                        checked={pEnabled}
                                        onChange={() =>
                                          toggleExcludedParallel(course.code, p.parallelNumber)
                                        }
                                      />
                                      <div className="parallel-info">
                                        <span>
                                          <strong>P{p.parallelNumber}</strong> ·{' '}
                                          {p.professor || 'S/P'}
                                        </span>
                                        <span
                                          className={`seat-badge ${p.available > 0 ? 'seat-ok' : 'seat-zero'}`}
                                        >
                                          Cupo {p.available}/{p.capacity}
                                        </span>
                                      </div>
                                    </label>

                                    {pEnabled && p.practicals.length > 0 && (
                                      <div className="practical-sublist">
                                        {p.practicals.map((pr) => {
                                          const prKey = `${course.code}::${p.parallelNumber}::${pr.code}`;
                                          const prEnabled =
                                            !constraints.excludedPracticalKeys.includes(prKey);
                                          const slotTxt = pr.sessions
                                            .map((s) => `${s.day.slice(0, 3)} ${s.startTime}-${s.endTime}`)
                                            .join(', ');
                                          return (
                                            <label key={pr.code} className="practical-row">
                                              <input
                                                type="checkbox"
                                                checked={prEnabled}
                                                onChange={() =>
                                                  toggleExcludedPractical(
                                                    course.code,
                                                    p.parallelNumber,
                                                    pr.code,
                                                  )
                                                }
                                              />
                                              <span>
                                                Prác. {pr.code} ({slotTxt}) ·{' '}
                                                <em className={pr.available > 0 ? 'txt-ok' : 'txt-zero'}>
                                                  {pr.available}/{pr.capacity}
                                                </em>
                                              </span>
                                            </label>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="sidebar-section">
                <h2>Filtros y Preferencias</h2>

                {manualEntries.length > 0 && (
                  <label className="toggle-row">
                    <input
                      type="checkbox"
                      checked={respectManualPins}
                      onChange={(e) => setRespectManualPins(e.target.checked)}
                    />
                    <span>Fijar elegidas en Manual ({manualEntries.length})</span>
                  </label>
                )}

                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={constraints.onlyWithSeats}
                    onChange={(e) =>
                      setConstraints((prev) => ({ ...prev, onlyWithSeats: e.target.checked }))
                    }
                  />
                  <span>Solo paralelos con cupo (&gt; 0)</span>
                </label>

                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={constraints.avoidExamConflicts}
                    onChange={(e) =>
                      setConstraints((prev) => ({ ...prev, avoidExamConflicts: e.target.checked }))
                    }
                  />
                  <span>Evitar choques de exámenes</span>
                </label>

                <div className="field-group">
                  <label htmlFor="sort-select">Ordenar opciones por</label>
                  <select
                    id="sort-select"
                    value={constraints.sortBy}
                    onChange={(e) =>
                      setConstraints((prev) => ({
                        ...prev,
                        sortBy: e.target.value as SortPreference,
                      }))
                    }
                  >
                    <option value="minGaps">Menos horas huecas</option>
                    <option value="maxFreeDays">Más días libres</option>
                    <option value="earliestFinish">Salir más temprano</option>
                    <option value="latestStart">Entrar más tarde</option>
                  </select>
                </div>

                <div className="field-group">
                  <label>Días libres obligatorios</label>
                  <div className="day-pills">
                    {ORDERED_DAYS.map((day) => {
                      const active = constraints.blockedDays.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          className={`day-pill ${active ? 'active' : ''}`}
                          onClick={() => toggleBlockedDay(day)}
                        >
                          {day.slice(0, 3)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="field-group">
                  <label>Bloquear franja horaria</label>
                  <form className="slot-form" onSubmit={addBlockedSlot}>
                    <select
                      value={slotDay}
                      onChange={(e) => setSlotDay(e.target.value as DayOfWeek)}
                    >
                      {ORDERED_DAYS.map((d) => (
                        <option key={d} value={d}>
                          {d.slice(0, 3)}
                        </option>
                      ))}
                    </select>
                    <input
                      type="time"
                      value={slotStart}
                      onChange={(e) => setSlotStart(e.target.value)}
                    />
                    <input
                      type="time"
                      value={slotEnd}
                      onChange={(e) => setSlotEnd(e.target.value)}
                    />
                    <button type="submit" className="btn btn-small">
                      +
                    </button>
                  </form>

                  {constraints.blockedSlots.length > 0 && (
                    <div className="blocked-chips">
                      {constraints.blockedSlots.map((slot, i) => (
                        <span key={i} className="blocked-chip">
                          {slot.day.slice(0, 3)} {formatClock(slot.startMinutes)}–
                          {formatClock(slot.endMinutes)}
                          <button type="button" onClick={() => removeBlockedSlot(i)}>
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </>
          )}
        </aside>

        <main className="planner-main">
          {mode === 'manual' ? (
            <>
              <div className="results-bar no-print">
                <div className="combo-nav">
                  <strong className="manual-title">
                    Horario Manual ({manualItems.length} materia(s))
                  </strong>
                  {courses.length > manualItems.length && (
                    <button
                      type="button"
                      className="btn btn-nav"
                      onClick={handleAutoCompleteFromManual}
                    >
                      Auto-completar restantes →
                    </button>
                  )}
                </div>

                <div className="metrics-pills">
                  <span className="metric-pill">
                    Clases: <strong>{formatMinutesAsDuration(manualMetrics.totalWeeklyMinutes)}</strong>
                  </span>
                  <span className="metric-pill">
                    Huecos: <strong>{formatMinutesAsDuration(manualMetrics.totalGapMinutes)}</strong>
                  </span>
                  <span className="metric-pill">
                    Días libres: <strong>{manualMetrics.freeDaysCount}</strong>
                  </span>
                  {manualItems.length > 0 && (
                    <span
                      className={`metric-pill ${
                        manualClassConflicts.length === 0 && manualMetrics.examConflicts.length === 0
                          ? 'pill-ok'
                          : 'pill-warn'
                      }`}
                    >
                      Choques:{' '}
                      <strong>
                        {manualClassConflicts.length + manualMetrics.examConflicts.length}
                      </strong>
                    </span>
                  )}
                </div>

                <div className="results-bar-right">
                  <button
                    type="button"
                    className="btn btn-ghost-dark"
                    disabled={manualItems.length === 0}
                    onClick={() => copySummaryToClipboard(manualItems)}
                  >
                    Copiar resumen
                  </button>
                  <button type="button" className="btn btn-ghost-dark" onClick={() => window.print()}>
                    Imprimir / PDF
                  </button>
                </div>
              </div>

              {(manualClassConflicts.length > 0 || manualMetrics.examConflicts.length > 0) && (
                <div className="conflict-banner">
                  <strong>Conflictos en tu horario manual:</strong>
                  <ul>
                    {manualClassConflicts.map((c, idx) => (
                      <li key={`cc-${idx}`}>
                        Clase ({c.day} {c.timeRange}): {c.courseA} choca con {c.courseB}
                      </li>
                    ))}
                    {manualMetrics.examConflicts.map((c, idx) => (
                      <li key={`ec-${idx}`}>
                        Examen {c.examType} ({c.date}): {c.courseA} [{c.timeA}] vs {c.courseB} [
                        {c.timeB}]
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <WeeklyGrid
                items={manualItems}
                previewItem={hoveredPreview}
                blockedDays={[]}
                blockedSlots={[]}
                courseColorMap={courseColorMap}
                onRemoveCourse={removeManualCourse}
              />

              {manualItems.length === 0 && courses.length > 0 && !hoveredPreview && (
                <div className="manual-empty-tip">
                  Selecciona un paralelo en el panel izquierdo para armar tu horario manualmente, o
                  cambia a <strong>Recomendaciones</strong> arriba para generar combinaciones
                  automáticas.
                </div>
              )}
            </>
          ) : constraints.selectedCourseCodes.length === 0 ? (
            <div className="empty-state">
              <h2>Selecciona al menos una materia</h2>
              <p>
                Marca las materias que deseas combinar en el panel izquierdo (o pulsa{' '}
                <strong>Cargar ejemplo</strong> arriba para probar el generador).
              </p>
            </div>
          ) : !generation || generation.schedules.length === 0 ? (
            <div className="empty-state">
              <h2>Sin combinaciones posibles</h2>
              {generation && generation.emptyCourseCodes.length > 0 ? (
                <p>
                  Las siguientes materias no tienen paralelos disponibles bajo los filtros actuales:{' '}
                  <strong>{generation.emptyCourseCodes.join(', ')}</strong>. Prueba desactivar{' '}
                  <em>Solo paralelos con cupo</em> o revisar los días/franjas bloqueadas.
                </p>
              ) : (
                <p>
                  Todas las combinaciones chocan en horario de clases
                  {constraints.avoidExamConflicts ? ' o en fechas de exámenes' : ''}. Prueba
                  desactivar una materia opcional, quitar el fijado manual o permitir choques de
                  exámenes.
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="results-bar no-print">
                <div className="combo-nav">
                  <button
                    type="button"
                    className="btn btn-nav"
                    disabled={activeIndex === 0}
                    onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}
                  >
                    ← Anterior
                  </button>
                  <span className="combo-counter">
                    Opción <strong>{activeIndex + 1}</strong> de{' '}
                    <strong>{generation.schedules.length}</strong>
                    {generation.truncated ? '+' : ''}
                  </span>
                  <button
                    type="button"
                    className="btn btn-nav"
                    disabled={activeIndex >= generation.schedules.length - 1}
                    onClick={() =>
                      setActiveIndex((i) => Math.min(generation.schedules.length - 1, i + 1))
                    }
                  >
                    Siguiente →
                  </button>
                </div>

                {activeAutoSchedule && (
                  <div className="metrics-pills">
                    <span className="metric-pill">
                      Clases:{' '}
                      <strong>
                        {formatMinutesAsDuration(activeAutoSchedule.metrics.totalWeeklyMinutes)}
                      </strong>
                    </span>
                    <span className="metric-pill">
                      Huecos:{' '}
                      <strong>
                        {formatMinutesAsDuration(activeAutoSchedule.metrics.totalGapMinutes)}
                      </strong>
                    </span>
                    <span className="metric-pill">
                      Días libres: <strong>{activeAutoSchedule.metrics.freeDaysCount}</strong>
                    </span>
                    <span className="metric-pill">
                      Jornada:{' '}
                      <strong>
                        {formatClock(activeAutoSchedule.metrics.earliestStartMinutes)}–
                        {formatClock(activeAutoSchedule.metrics.latestEndMinutes)}
                      </strong>
                    </span>
                    <span
                      className={`metric-pill ${
                        activeAutoSchedule.metrics.minAvailableSeats > 0 ? 'pill-ok' : 'pill-warn'
                      }`}
                    >
                      Cupo mín.: <strong>{activeAutoSchedule.metrics.minAvailableSeats}</strong>
                    </span>
                  </div>
                )}

                <div className="results-bar-right">
                  <button
                    type="button"
                    className="btn btn-gold"
                    onClick={applyAutoScheduleToManual}
                  >
                    Editar manualmente
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost-dark"
                    disabled={!activeAutoSchedule}
                    onClick={() =>
                      activeAutoSchedule && copySummaryToClipboard(activeAutoSchedule.items)
                    }
                  >
                    Copiar resumen
                  </button>
                  <button type="button" className="btn btn-ghost-dark" onClick={() => window.print()}>
                    Imprimir / PDF
                  </button>
                </div>
              </div>

              {activeAutoSchedule && (
                <WeeklyGrid
                  items={activeAutoSchedule.items}
                  blockedDays={constraints.blockedDays}
                  blockedSlots={constraints.blockedSlots}
                  courseColorMap={courseColorMap}
                />
              )}
            </>
          )}

          {displayedItems.length > 0 && displayedMetrics && (
            <section className="details-card">
              <h3>
                Detalle de paralelos y exámenes{' '}
                {mode === 'auto' ? `(Opción ${activeIndex + 1})` : '(Horario Manual)'}
              </h3>
              {displayedMetrics.examConflicts.length > 0 && mode === 'auto' && (
                <div className="conflict-banner">
                  <strong>Choques de examen detectados:</strong>
                  <ul>
                    {displayedMetrics.examConflicts.map((c, idx) => (
                      <li key={idx}>
                        {c.examType} ({c.date}): {c.courseA} [{c.timeA}] vs {c.courseB} [{c.timeB}]
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="details-table-wrap">
                <table className="details-table">
                  <thead>
                    <tr>
                      <th>Materia</th>
                      <th>Paralelo</th>
                      <th>Profesor</th>
                      <th>Cupo</th>
                      <th>Parcial</th>
                      <th>Final</th>
                      <th>Mejoramiento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedItems.map((item) => {
                      const examByType = (t: 'Parcial' | 'Final' | 'Mejoramiento') =>
                        item.parallel.exams.find((e) => e.type === t)?.raw ?? '—';
                      const color = courseColorMap.get(item.course.code);
                      return (
                        <tr key={item.course.code}>
                          <td>
                            <span
                              className="color-dot inline-dot"
                              style={{ backgroundColor: color?.border ?? '#001c43' }}
                            />
                            <strong>{item.course.code}</strong> · {item.course.name}
                          </td>
                          <td>
                            P{item.parallel.parallelNumber}
                            {item.practical ? ` + Prác. ${item.practical.code}` : ''}
                          </td>
                          <td>{item.parallel.professor || '—'}</td>
                          <td>
                            {item.parallel.available}/{item.parallel.capacity}
                            {item.practical
                              ? ` (Prác: ${item.practical.available}/${item.practical.capacity})`
                              : ''}
                          </td>
                          <td>{examByType('Parcial')}</td>
                          <td>{examByType('Final')}</td>
                          <td>{examByType('Mejoramiento')}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
