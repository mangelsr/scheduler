import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  FileText,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
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
    <div className="print-full flex h-screen flex-col overflow-hidden bg-background text-foreground max-[960px]:h-auto max-[960px]:min-h-screen max-[960px]:overflow-visible">
      {/* Institutional ESPOL Académico Topbar */}
      <header className="no-print flex shrink-0 flex-wrap items-center justify-between gap-3 border-b-[3px] border-espol-gold bg-espol-navy px-5 py-2.5 text-white shadow-sm">
        <div className="flex flex-wrap items-center gap-3.5">
          <div className="flex items-center gap-2.5">
            <span className="rounded-md bg-espol-gold px-2.5 py-1 text-xs font-extrabold tracking-wide text-espol-navy">
              ESPOL
            </span>
            <div>
              <h1 className="text-base leading-tight font-bold text-white">
                Académico · Planificador de Horarios
              </h1>
              <p className="text-[11px] text-slate-300">
                {courses.length} materia(s) extraída(s) · {manualItems.length} en horario manual
              </p>
            </div>
          </div>

          <Tabs value={mode} onValueChange={(v) => setMode(v as PlannerMode)} className="ml-1">
            <TabsList className="h-8 border border-white/15 bg-white/15 p-0.5 text-slate-100">
              <TabsTrigger
                value="manual"
                className="h-7 px-3 text-xs font-semibold text-slate-100 hover:bg-white/10 hover:text-white data-[state=active]:bg-espol-gold data-[state=active]:font-bold data-[state=active]:text-espol-navy"
              >
                <Calendar className="size-3.5" />
                Armado Manual
              </TabsTrigger>
              <TabsTrigger
                value="auto"
                className="h-7 px-3 text-xs font-semibold text-slate-100 hover:bg-white/10 hover:text-white data-[state=active]:bg-espol-gold data-[state=active]:font-bold data-[state=active]:text-espol-navy"
              >
                <Sparkles className="size-3.5" />
                Recomendaciones
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {statusMessage && (
            <Badge className="border-white/20 bg-white/15 px-2.5 py-1 text-[11px] text-espol-gold-soft">
              {statusMessage}
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="border border-white/15 bg-white/10 text-white hover:bg-white/20 hover:text-white"
            onClick={handleLoadSample}
          >
            <FileText className="size-3.5" />
            Cargar ejemplo
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="border border-white/15 bg-white/10 text-white hover:bg-white/20 hover:text-white"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="size-3.5" />
            Importar JSON
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            hidden
            onChange={handleImportJson}
          />
          <Button
            variant="ghost"
            size="sm"
            className="border border-white/15 bg-white/10 text-white hover:bg-white/20 hover:text-white"
            disabled={courses.length === 0}
            onClick={handleExportJson}
          >
            <Download className="size-3.5" />
            Exportar JSON
          </Button>
          <Button
            size="sm"
            className="bg-espol-gold font-semibold text-espol-navy hover:bg-espol-gold/90"
            disabled={refreshingSeats || courses.length === 0}
            onClick={handleRefreshSeats}
          >
            <RefreshCw className={cn('size-3.5', refreshingSeats && 'animate-spin')} />
            {refreshingSeats ? 'Actualizando...' : 'Actualizar cupos'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="border border-red-300/35 bg-red-600/30 text-white hover:bg-red-600/50 hover:text-white"
            disabled={courses.length === 0}
            onClick={handleClearAll}
          >
            <Trash2 className="size-3.5" />
            Limpiar
          </Button>
        </div>
      </header>

      {/* Main Split Workspace */}
      <div className="grid min-h-0 flex-1 grid-cols-[340px_1fr] max-[960px]:block max-[960px]:grid-cols-1">
        {/* Left Sidebar with independent scroll */}
        <aside className="no-print flex min-h-0 flex-col border-r border-border bg-card max-[960px]:border-r-0 max-[960px]:border-b">
          <ScrollArea className="min-h-0 flex-1 overflow-hidden">
            <div className="flex flex-col gap-5 p-4">
              {mode === 'manual' ? (
                <section className="flex flex-col gap-2.5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xs font-bold tracking-wider text-espol-navy uppercase">
                      Armado Manual
                    </h2>
                    {manualEntries.length > 0 && (
                      <Button
                        variant="link"
                        size="xs"
                        className="h-auto p-0 text-xs text-blue-600"
                        onClick={() => setManualEntries([])}
                      >
                        Vaciar horario
                      </Button>
                    )}
                  </div>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Pasa el cursor sobre un paralelo para previsualizarlo y haz clic para fijarlo en
                    tu horario.
                  </p>

                  {courses.length === 0 ? (
                    <Card className="border-dashed bg-slate-50 shadow-none">
                      <CardContent className="p-3 text-xs leading-relaxed">
                        <p className="font-medium text-foreground">
                          No hay materias guardadas todavía.
                        </p>
                        <p className="mt-1 text-muted-foreground">
                          Extrae materias desde <strong>Consulta de Planificación</strong> en
                          Académico o pulsa <strong>Cargar ejemplo</strong>.
                        </p>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {courses.map((course) => {
                        const isExpanded = expandedCourses.has(course.code);
                        const picked = manualByCode.get(course.code);
                        const color = courseColorMap.get(course.code);

                        return (
                          <Card
                            key={course.code}
                            className={cn(
                              'gap-0 overflow-hidden py-0 shadow-none transition-colors',
                              picked ? 'border-blue-300 bg-card' : 'bg-slate-50/70',
                            )}
                          >
                            <div
                              className="flex cursor-pointer items-center justify-between gap-1.5 px-2.5 py-2 hover:bg-slate-100/70"
                              onClick={() => toggleExpanded(course.code)}
                            >
                              <div className="flex min-w-0 flex-1 items-center gap-2">
                                <span
                                  className="size-2.5 shrink-0 rounded-full"
                                  style={{ backgroundColor: color?.border ?? '#001c43' }}
                                />
                                <div className="flex min-w-0 flex-col">
                                  <div className="flex items-center gap-1.5">
                                    <strong className="text-xs font-bold text-espol-navy">
                                      {course.code}
                                    </strong>
                                    {picked && (
                                      <Badge className="bg-espol-navy px-1.5 py-0 text-[10px] font-bold text-espol-gold-soft">
                                        P{picked.parallelNumber}
                                        {picked.practicalCode ? `+${picked.practicalCode}` : ''}
                                      </Badge>
                                    )}
                                  </div>
                                  <span className="truncate text-[11px] text-muted-foreground">
                                    {course.name}
                                  </span>
                                </div>
                              </div>

                              <div
                                className="flex shrink-0 items-center gap-0.5"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {picked && (
                                  <Button
                                    variant="ghost"
                                    size="icon-xs"
                                    title="Quitar del horario"
                                    onClick={() => removeManualCourse(course.code)}
                                  >
                                    <RotateCcw className="size-3 text-slate-600" />
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon-xs"
                                  title="Mostrar/ocultar paralelos"
                                  onClick={() => toggleExpanded(course.code)}
                                >
                                  {isExpanded ? (
                                    <ChevronDown className="size-3.5 text-slate-600" />
                                  ) : (
                                    <ChevronRight className="size-3.5 text-slate-600" />
                                  )}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon-xs"
                                  className="hover:bg-red-100 hover:text-red-700"
                                  title="Eliminar materia del catálogo"
                                  onClick={() => handleRemoveCourse(course.code)}
                                >
                                  <X className="size-3.5" />
                                </Button>
                              </div>
                            </div>

                            {isExpanded && (
                              <div className="flex flex-col gap-1.5 border-t border-border bg-card p-2">
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
                                        className={cn(
                                          'flex w-full cursor-pointer flex-col gap-0.5 rounded-md border px-2.5 py-1.5 text-left transition-colors',
                                          isPicked
                                            ? 'border-2 border-espol-navy bg-blue-50/80'
                                            : classHits.length > 0
                                              ? 'border-red-300 bg-red-50/70 hover:border-red-400'
                                              : 'border-border bg-slate-50/70 hover:border-blue-400 hover:bg-blue-50/50',
                                        )}
                                        onMouseEnter={() => setHoveredPreview(variant)}
                                        onMouseLeave={() => setHoveredPreview(null)}
                                        onClick={() =>
                                          toggleManualOption(course.code, p.parallelNumber, prCode)
                                        }
                                      >
                                        <div className="flex items-center justify-between text-xs text-foreground">
                                          <span>
                                            <strong>P{p.parallelNumber}</strong>
                                            {prCode ? ` · Prác. ${prCode}` : ''}
                                          </span>
                                          <Badge
                                            className={cn(
                                              'px-1.5 py-0 text-[10px] font-semibold',
                                              minSeats > 0
                                                ? 'border-emerald-200 bg-emerald-100 text-emerald-900'
                                                : 'border-red-200 bg-red-100 text-red-900',
                                            )}
                                          >
                                            Cupo {minSeats}
                                          </Badge>
                                        </div>
                                        <div className="truncate text-[11px] text-muted-foreground">
                                          {p.professor || 'Profesor por asignar'}
                                        </div>
                                        <div className="text-[11px] font-medium text-slate-700">
                                          {formatSessionsShort(variant) || 'Sin horario'}
                                        </div>
                                        {(classHits.length > 0 || examHits.length > 0) && (
                                          <div className="mt-0.5 flex flex-wrap gap-1">
                                            {classHits.length > 0 && (
                                              <Badge className="rounded border-red-200 bg-red-100 px-1.5 py-0 text-[10px] text-red-900">
                                                Choca clase: {classHits.join(', ')}
                                              </Badge>
                                            )}
                                            {examHits.length > 0 && (
                                              <Badge className="rounded border-amber-200 bg-amber-100 px-1.5 py-0 text-[10px] text-amber-900">
                                                Choca {examHits[0].examType}
                                              </Badge>
                                            )}
                                          </div>
                                        )}
                                      </button>
                                    );
                                  });
                                })}
                              </div>
                            )}
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </section>
              ) : (
                <>
                  <section className="flex flex-col gap-2.5">
                    <h2 className="text-xs font-bold tracking-wider text-espol-navy uppercase">
                      Materias a combinar
                    </h2>
                    {courses.length === 0 ? (
                      <Card className="border-dashed bg-slate-50 shadow-none">
                        <CardContent className="p-3 text-xs leading-relaxed">
                          <p className="font-medium text-foreground">
                            No hay materias guardadas todavía.
                          </p>
                          <p className="mt-1 text-muted-foreground">
                            Extrae materias desde ESPOL Académico o pulsa{' '}
                            <strong>Cargar ejemplo</strong>.
                          </p>
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {courses.map((course) => {
                          const isSelected = constraints.selectedCourseCodes.includes(course.code);
                          const isExpanded = expandedCourses.has(course.code);
                          const isPinned = respectManualPins && manualByCode.has(course.code);
                          const color = courseColorMap.get(course.code);

                          return (
                            <Card
                              key={course.code}
                              className={cn(
                                'gap-0 overflow-hidden py-0 shadow-none',
                                isSelected ? 'border-blue-300 bg-card' : 'bg-slate-50/70',
                              )}
                            >
                              <div className="flex items-center justify-between gap-1.5 px-2.5 py-2">
                                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                                  <Checkbox
                                    checked={isSelected}
                                    onCheckedChange={() => toggleCourseSelection(course.code)}
                                  />
                                  <span
                                    className="size-2.5 shrink-0 rounded-full"
                                    style={{ backgroundColor: color?.border ?? '#001c43' }}
                                  />
                                  <div className="flex min-w-0 flex-col">
                                    <div className="flex items-center gap-1.5">
                                      <strong className="text-xs font-bold text-espol-navy">
                                        {course.code}
                                      </strong>
                                      {isPinned && (
                                        <Badge className="bg-espol-navy px-1.5 py-0 text-[10px] font-bold text-espol-gold-soft">
                                          Fijada
                                        </Badge>
                                      )}
                                    </div>
                                    <span className="truncate text-[11px] text-muted-foreground">
                                      {course.name}
                                    </span>
                                  </div>
                                </label>
                                <div className="flex shrink-0 items-center gap-0.5">
                                  <Button
                                    variant="ghost"
                                    size="icon-xs"
                                    title="Ver paralelos"
                                    onClick={() => toggleExpanded(course.code)}
                                  >
                                    {isExpanded ? (
                                      <ChevronDown className="size-3.5 text-slate-600" />
                                    ) : (
                                      <ChevronRight className="size-3.5 text-slate-600" />
                                    )}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon-xs"
                                    className="hover:bg-red-100 hover:text-red-700"
                                    title="Eliminar materia"
                                    onClick={() => handleRemoveCourse(course.code)}
                                  >
                                    <X className="size-3.5" />
                                  </Button>
                                </div>
                              </div>

                              {isExpanded && (
                                <div className="flex flex-col gap-2 border-t border-border bg-card p-2.5">
                                  {course.parallels.map((p) => {
                                    const pKey = `${course.code}::${p.parallelNumber}`;
                                    const pEnabled = !constraints.excludedParallelKeys.includes(pKey);
                                    return (
                                      <div key={p.parallelNumber} className="text-[11px]">
                                        <label className="flex cursor-pointer items-center gap-2">
                                          <Checkbox
                                            checked={pEnabled}
                                            onCheckedChange={() =>
                                              toggleExcludedParallel(course.code, p.parallelNumber)
                                            }
                                          />
                                          <div className="flex flex-1 items-center justify-between gap-1.5">
                                            <span className="truncate">
                                              <strong>P{p.parallelNumber}</strong> ·{' '}
                                              {p.professor || 'S/P'}
                                            </span>
                                            <Badge
                                              className={cn(
                                                'px-1.5 py-0 text-[10px]',
                                                p.available > 0
                                                  ? 'border-emerald-200 bg-emerald-100 text-emerald-900'
                                                  : 'border-red-200 bg-red-100 text-red-900',
                                              )}
                                            >
                                              {p.available}/{p.capacity}
                                            </Badge>
                                          </div>
                                        </label>

                                        {pEnabled && p.practicals.length > 0 && (
                                          <div className="mt-1 ml-6 flex flex-col gap-1 text-muted-foreground">
                                            {p.practicals.map((pr) => {
                                              const prKey = `${course.code}::${p.parallelNumber}::${pr.code}`;
                                              const prEnabled =
                                                !constraints.excludedPracticalKeys.includes(prKey);
                                              const slotTxt = pr.sessions
                                                .map(
                                                  (s) =>
                                                    `${s.day.slice(0, 3)} ${s.startTime}-${s.endTime}`,
                                                )
                                                .join(', ');
                                              return (
                                                <label
                                                  key={pr.code}
                                                  className="flex cursor-pointer items-center gap-1.5"
                                                >
                                                  <Checkbox
                                                    checked={prEnabled}
                                                    onCheckedChange={() =>
                                                      toggleExcludedPractical(
                                                        course.code,
                                                        p.parallelNumber,
                                                        pr.code,
                                                      )
                                                    }
                                                  />
                                                  <span>
                                                    Prác. {pr.code} ({slotTxt}) ·{' '}
                                                    <strong
                                                      className={
                                                        pr.available > 0
                                                          ? 'text-emerald-700'
                                                          : 'text-red-700'
                                                      }
                                                    >
                                                      {pr.available}/{pr.capacity}
                                                    </strong>
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
                            </Card>
                          );
                        })}
                      </div>
                    )}
                  </section>

                  <Separator />

                  <section className="flex flex-col gap-3">
                    <h2 className="text-xs font-bold tracking-wider text-espol-navy uppercase">
                      Filtros y Preferencias
                    </h2>

                    {manualEntries.length > 0 && (
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span>Fijar elegidas en Manual ({manualEntries.length})</span>
                        <Switch
                          checked={respectManualPins}
                          onCheckedChange={setRespectManualPins}
                        />
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span>Solo paralelos con cupo (&gt; 0)</span>
                      <Switch
                        checked={constraints.onlyWithSeats}
                        onCheckedChange={(checked) =>
                          setConstraints((prev) => ({ ...prev, onlyWithSeats: checked }))
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span>Evitar choques de exámenes</span>
                      <Switch
                        checked={constraints.avoidExamConflicts}
                        onCheckedChange={(checked) =>
                          setConstraints((prev) => ({ ...prev, avoidExamConflicts: checked }))
                        }
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-slate-700">
                        Ordenar opciones por
                      </label>
                      <Select
                        value={constraints.sortBy}
                        onValueChange={(value) =>
                          setConstraints((prev) => ({
                            ...prev,
                            sortBy: value as SortPreference,
                          }))
                        }
                      >
                        <SelectTrigger className="h-8 w-full text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="minGaps">Menos horas huecas</SelectItem>
                          <SelectItem value="maxFreeDays">Más días libres</SelectItem>
                          <SelectItem value="earliestFinish">Salir más temprano</SelectItem>
                          <SelectItem value="latestStart">Entrar más tarde</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-slate-700">
                        Días libres obligatorios
                      </label>
                      <div className="flex flex-wrap gap-1">
                        {ORDERED_DAYS.map((day) => {
                          const active = constraints.blockedDays.includes(day);
                          return (
                            <Button
                              key={day}
                              type="button"
                              size="xs"
                              variant={active ? 'default' : 'outline'}
                              onClick={() => toggleBlockedDay(day)}
                            >
                              {day.slice(0, 3)}
                            </Button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-slate-700">
                        Bloquear franja horaria
                      </label>
                      <form className="flex items-center gap-1" onSubmit={addBlockedSlot}>
                        <Select
                          value={slotDay}
                          onValueChange={(val) => setSlotDay(val as DayOfWeek)}
                        >
                          <SelectTrigger className="h-8 w-[72px] px-2 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ORDERED_DAYS.map((d) => (
                              <SelectItem key={d} value={d}>
                                {d.slice(0, 3)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <input
                          type="time"
                          className="h-8 flex-1 rounded-md border border-input bg-card px-1.5 text-xs"
                          value={slotStart}
                          onChange={(e) => setSlotStart(e.target.value)}
                        />
                        <input
                          type="time"
                          className="h-8 flex-1 rounded-md border border-input bg-card px-1.5 text-xs"
                          value={slotEnd}
                          onChange={(e) => setSlotEnd(e.target.value)}
                        />
                        <Button type="submit" size="icon-sm" title="Agregar franja bloqueada">
                          <Plus className="size-3.5" />
                        </Button>
                      </form>

                      {constraints.blockedSlots.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {constraints.blockedSlots.map((slot, i) => (
                            <Badge key={i} variant="secondary" className="gap-1 pr-1 text-[11px]">
                              {slot.day.slice(0, 3)} {formatClock(slot.startMinutes)}–
                              {formatClock(slot.endMinutes)}
                              <button
                                type="button"
                                className="ml-0.5 cursor-pointer rounded-full p-0.5 hover:bg-slate-300"
                                onClick={() => removeBlockedSlot(i)}
                              >
                                <X className="size-2.5" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </section>
                </>
              )}
            </div>
          </ScrollArea>
        </aside>

        {/* Right Main Panel with independent scroll */}
        <main className="flex min-h-0 flex-col bg-background">
          <ScrollArea className="min-h-0 flex-1 overflow-hidden">
            <div className="flex flex-col gap-4 p-4">
              {mode === 'manual' ? (
                <>
                  <Card className="no-print gap-0 py-0 shadow-xs">
                    <CardContent className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <strong className="text-sm font-bold text-espol-navy">
                          Horario Manual ({manualItems.length} materia(s))
                        </strong>
                        {courses.length > manualItems.length && (
                          <Button size="sm" onClick={handleAutoCompleteFromManual}>
                            <Sparkles className="size-3.5" />
                            Auto-completar restantes
                          </Button>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="secondary" className="px-2.5 py-1 text-xs">
                          Clases:{' '}
                          <strong className="ml-1">
                            {formatMinutesAsDuration(manualMetrics.totalWeeklyMinutes)}
                          </strong>
                        </Badge>
                        <Badge variant="secondary" className="px-2.5 py-1 text-xs">
                          Huecos:{' '}
                          <strong className="ml-1">
                            {formatMinutesAsDuration(manualMetrics.totalGapMinutes)}
                          </strong>
                        </Badge>
                        <Badge variant="secondary" className="px-2.5 py-1 text-xs">
                          Días libres: <strong className="ml-1">{manualMetrics.freeDaysCount}</strong>
                        </Badge>
                        {manualItems.length > 0 && (
                          <Badge
                            className={cn(
                              'px-2.5 py-1 text-xs',
                              manualClassConflicts.length === 0 &&
                                manualMetrics.examConflicts.length === 0
                                ? 'border-emerald-200 bg-emerald-100 text-emerald-900'
                                : 'border-red-200 bg-red-100 text-red-900',
                            )}
                          >
                            Choques:{' '}
                            <strong className="ml-1">
                              {manualClassConflicts.length + manualMetrics.examConflicts.length}
                            </strong>
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={manualItems.length === 0}
                          onClick={() => copySummaryToClipboard(manualItems)}
                        >
                          <Copy className="size-3.5" />
                          Copiar resumen
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => window.print()}>
                          <Printer className="size-3.5" />
                          Imprimir / PDF
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

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

                  <WeeklyGrid
                    items={manualItems}
                    previewItem={hoveredPreview}
                    blockedDays={[]}
                    blockedSlots={[]}
                    courseColorMap={courseColorMap}
                    onRemoveCourse={removeManualCourse}
                  />

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
                        {constraints.avoidExamConflicts ? ' o en fechas de exámenes' : ''}. Prueba
                        desactivar una materia opcional, quitar el fijado manual o permitir choques
                        de exámenes.
                      </p>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <>
                  <Card className="no-print gap-0 py-0 shadow-xs">
                    <CardContent className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <Button
                          size="sm"
                          disabled={activeIndex === 0}
                          onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}
                        >
                          <ArrowLeft className="size-3.5" />
                          Anterior
                        </Button>
                        <span className="text-xs text-slate-700">
                          Opción <strong>{activeIndex + 1}</strong> de{' '}
                          <strong>{generation.schedules.length}</strong>
                          {generation.truncated ? '+' : ''}
                        </span>
                        <Button
                          size="sm"
                          disabled={activeIndex >= generation.schedules.length - 1}
                          onClick={() =>
                            setActiveIndex((i) => Math.min(generation.schedules.length - 1, i + 1))
                          }
                        >
                          Siguiente
                          <ArrowRight className="size-3.5" />
                        </Button>
                      </div>

                      {activeAutoSchedule && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant="secondary" className="px-2.5 py-1 text-xs">
                            Clases:{' '}
                            <strong className="ml-1">
                              {formatMinutesAsDuration(
                                activeAutoSchedule.metrics.totalWeeklyMinutes,
                              )}
                            </strong>
                          </Badge>
                          <Badge variant="secondary" className="px-2.5 py-1 text-xs">
                            Huecos:{' '}
                            <strong className="ml-1">
                              {formatMinutesAsDuration(activeAutoSchedule.metrics.totalGapMinutes)}
                            </strong>
                          </Badge>
                          <Badge variant="secondary" className="px-2.5 py-1 text-xs">
                            Días libres:{' '}
                            <strong className="ml-1">
                              {activeAutoSchedule.metrics.freeDaysCount}
                            </strong>
                          </Badge>
                          <Badge variant="secondary" className="px-2.5 py-1 text-xs">
                            Jornada:{' '}
                            <strong className="ml-1">
                              {formatClock(activeAutoSchedule.metrics.earliestStartMinutes)}–
                              {formatClock(activeAutoSchedule.metrics.latestEndMinutes)}
                            </strong>
                          </Badge>
                          <Badge
                            className={cn(
                              'px-2.5 py-1 text-xs',
                              activeAutoSchedule.metrics.minAvailableSeats > 0
                                ? 'border-emerald-200 bg-emerald-100 text-emerald-900'
                                : 'border-red-200 bg-red-100 text-red-900',
                            )}
                          >
                            Cupo mín.:{' '}
                            <strong className="ml-1">
                              {activeAutoSchedule.metrics.minAvailableSeats}
                            </strong>
                          </Badge>
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          className="bg-espol-gold font-semibold text-espol-navy hover:bg-espol-gold/90"
                          onClick={applyAutoScheduleToManual}
                        >
                          Editar manualmente
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!activeAutoSchedule}
                          onClick={() =>
                            activeAutoSchedule && copySummaryToClipboard(activeAutoSchedule.items)
                          }
                        >
                          <Copy className="size-3.5" />
                          Copiar resumen
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => window.print()}>
                          <Printer className="size-3.5" />
                          Imprimir / PDF
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

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

              {/* ESPOL Académico styled details & exams table */}
              {displayedItems.length > 0 && displayedMetrics && (
                <Card className="gap-2 py-3.5 shadow-xs">
                  <CardHeader className="px-4 py-0">
                    <CardTitle className="text-sm font-bold text-espol-navy">
                      Detalle de paralelos y exámenes{' '}
                      {mode === 'auto' ? `(Opción ${activeIndex + 1})` : '(Horario Manual)'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pt-1">
                    {displayedMetrics.examConflicts.length > 0 && mode === 'auto' && (
                      <Alert variant="destructive" className="mb-3 border-red-300 bg-red-50 text-red-900">
                        <AlertTriangle className="size-4" />
                        <AlertTitle>Choques de examen detectados</AlertTitle>
                        <AlertDescription>
                          <ul className="mt-1 list-disc pl-4 text-xs">
                            {displayedMetrics.examConflicts.map((c, idx) => (
                              <li key={idx}>
                                {c.examType} ({c.date}): {c.courseA} [{c.timeA}] vs {c.courseB} [
                                {c.timeB}]
                              </li>
                            ))}
                          </ul>
                        </AlertDescription>
                      </Alert>
                    )}

                    <div className="overflow-hidden rounded-md border border-border">
                      <Table className="text-xs">
                        <TableHeader className="bg-espol-navy [&_th]:h-9 [&_th]:text-white">
                          <TableRow className="border-none hover:bg-espol-navy">
                            <TableHead>Materia</TableHead>
                            <TableHead>Paralelo</TableHead>
                            <TableHead>Profesor</TableHead>
                            <TableHead>Cupo</TableHead>
                            <TableHead>Parcial</TableHead>
                            <TableHead>Final</TableHead>
                            <TableHead>Mejoramiento</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {displayedItems.map((item, idx) => {
                            const examByType = (t: 'Parcial' | 'Final' | 'Mejoramiento') =>
                              item.parallel.exams.find((e) => e.type === t)?.raw ?? '—';
                            const color = courseColorMap.get(item.course.code);
                            return (
                              <TableRow
                                key={item.course.code}
                                className={idx % 2 === 1 ? 'bg-secondary/60' : 'bg-card'}
                              >
                                <TableCell className="whitespace-normal">
                                  <span
                                    className="mr-1.5 inline-block size-2.5 rounded-full"
                                    style={{ backgroundColor: color?.border ?? '#001c43' }}
                                  />
                                  <strong className="text-espol-navy">{item.course.code}</strong> ·{' '}
                                  {item.course.name}
                                </TableCell>
                                <TableCell className="font-medium">
                                  P{item.parallel.parallelNumber}
                                  {item.practical ? ` + Prác. ${item.practical.code}` : ''}
                                </TableCell>
                                <TableCell className="whitespace-normal">
                                  {item.parallel.professor || '—'}
                                </TableCell>
                                <TableCell>
                                  {item.parallel.available}/{item.parallel.capacity}
                                  {item.practical
                                    ? ` (Prác: ${item.practical.available}/${item.practical.capacity})`
                                    : ''}
                                </TableCell>
                                <TableCell>{examByType('Parcial')}</TableCell>
                                <TableCell>{examByType('Final')}</TableCell>
                                <TableCell>{examByType('Mejoramiento')}</TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </ScrollArea>
        </main>
      </div>
    </div>
  );
}
