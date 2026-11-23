import { useState, type ReactNode } from 'react';
import { ArrowLeft, ChevronDown, ChevronRight, RotateCcw, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { isVirtualModality } from '../../shared/parser';
import { findExamConflicts, getOptionSessions, sessionsCollide } from '../../shared/scheduler';
import type {
  Course,
  CourseSelectionItem,
  ExamConflict,
  ManualSelectionEntry,
} from '../../shared/types';
import { formatSessionBlocksShort, formatSessionsShort } from '../utils';
import type { CoursePalette } from '../WeeklyGrid';

interface ManualCourseSidebarProps {
  courses: Course[];
  manualEntries: ManualSelectionEntry[];
  manualItems: CourseSelectionItem[];
  manualByCode: Map<string, ManualSelectionEntry>;
  expandedCourses: Set<string>;
  courseColorMap: Map<string, CoursePalette>;
  onClearManual: () => void;
  onToggleExpanded: (code: string) => void;
  onToggleManualOption: (
    courseCode: string,
    parallelNumber: string,
    practicalCode: string | null,
  ) => void;
  onRemoveManualCourse: (code: string) => void;
  onRemoveCatalogCourse: (code: string) => void;
  onHoverPreview: (item: CourseSelectionItem | null) => void;
}

interface ManualOptionCardProps {
  title: ReactNode;
  badges?: ReactNode;
  seats: number;
  professor: string;
  sessionsText: string;
  isPicked: boolean;
  classHits: string[];
  examHits: ExamConflict[];
  footerHint?: ReactNode;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onClick: () => void;
}

function ManualOptionCard({
  title,
  badges,
  seats,
  professor,
  sessionsText,
  isPicked,
  classHits,
  examHits,
  footerHint,
  onMouseEnter,
  onMouseLeave,
  onClick,
}: ManualOptionCardProps) {
  return (
    <button
      type="button"
      className={cn(
        'flex w-full min-w-0 cursor-pointer flex-col gap-0.5 rounded-md border px-2.5 py-1.5 text-left transition-colors',
        isPicked
          ? 'border-2 border-espol-navy bg-blue-50/80'
          : classHits.length > 0
            ? 'border-red-300 bg-red-50/70 hover:border-red-400'
            : 'border-border bg-slate-50/70 hover:border-blue-400 hover:bg-blue-50/50',
      )}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
    >
      <div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-1 text-xs text-foreground">
        <span className="flex flex-wrap items-center gap-1.5">
          {title}
          {badges}
        </span>
        <Badge
          className={cn(
            'px-1.5 py-0 text-[10px] font-semibold',
            seats > 0
              ? 'border-emerald-200 bg-emerald-100 text-emerald-900'
              : 'border-red-200 bg-red-100 text-red-900',
          )}
        >
          Cupo {seats}
        </Badge>
      </div>
      <div className="truncate text-[11px] text-muted-foreground">{professor}</div>
      <div className="text-[11px] font-medium text-slate-700">{sessionsText}</div>
      {footerHint}
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
}

export function ManualCourseSidebar({
  courses,
  manualEntries,
  manualItems,
  manualByCode,
  expandedCourses,
  courseColorMap,
  onClearManual,
  onToggleExpanded,
  onToggleManualOption,
  onRemoveManualCourse,
  onRemoveCatalogCourse,
  onHoverPreview,
}: ManualCourseSidebarProps) {
  const [stepParallelByCourse, setStepParallelByCourse] = useState<Record<string, string | null>>(
    {},
  );

  const setCourseStepParallel = (courseCode: string, parallelNumber: string | null) => {
    setStepParallelByCourse((prev) => ({ ...prev, [courseCode]: parallelNumber }));
  };

  const handleToggleCourseExpanded = (courseCode: string, currentlyExpanded: boolean) => {
    if (currentlyExpanded) {
      setCourseStepParallel(courseCode, null);
    }
    onToggleExpanded(courseCode);
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

  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-bold tracking-wider text-espol-navy uppercase">Armado Manual</h2>
        {manualEntries.length > 0 && (
          <Button
            variant="link"
            size="xs"
            className="h-auto p-0 text-xs text-blue-600"
            onClick={onClearManual}
          >
            Vaciar horario
          </Button>
        )}
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Pasa el cursor sobre un paralelo para previsualizarlo y haz clic para fijarlo en tu horario.
      </p>

      {courses.length === 0 ? (
        <Card className="border-dashed bg-slate-50 shadow-none">
          <CardContent className="p-3 text-xs leading-relaxed">
            <p className="font-medium text-foreground">No hay materias guardadas todavía.</p>
            <p className="mt-1 text-muted-foreground">
              Extrae materias desde <strong>Consulta de Planificación</strong> en Académico o pulsa{' '}
              <strong>Cargar ejemplo</strong>.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {courses.map((course) => {
            const isExpanded = expandedCourses.has(course.code);
            const picked = manualByCode.get(course.code);
            const color = courseColorMap.get(course.code);
            const activeParallelNumber = stepParallelByCourse[course.code] ?? null;
            const activeParallel = activeParallelNumber
              ? course.parallels.find(
                  (p) => p.parallelNumber === activeParallelNumber && p.practicals.length > 1,
                ) ?? null
              : null;

            return (
              <Card
                key={course.code}
                className={cn(
                  'gap-0 overflow-hidden py-0 shadow-none transition-colors',
                  picked ? 'border-blue-300 bg-card' : 'bg-slate-50/70',
                )}
              >
                <div className="flex items-center justify-between gap-1.5 px-2.5 py-2 hover:bg-slate-100/70">
                  <button
                    type="button"
                    aria-expanded={isExpanded}
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
                    onClick={() => handleToggleCourseExpanded(course.code, isExpanded)}
                  >
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: color?.border ?? '#001c43' }}
                    />
                    <div className="flex min-w-0 flex-col">
                      <div className="flex items-center gap-1.5">
                        <strong className="text-xs font-bold text-espol-navy">{course.code}</strong>
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
                  </button>

                  <div className="flex shrink-0 items-center gap-0.5">
                    {picked && (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        title="Quitar del horario"
                        aria-label={`Quitar ${course.code} del horario`}
                        onClick={() => onRemoveManualCourse(course.code)}
                      >
                        <RotateCcw className="size-3 text-slate-600" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      title="Mostrar/ocultar paralelos"
                      aria-label={`Mostrar u ocultar paralelos de ${course.code}`}
                      aria-expanded={isExpanded}
                      onClick={() => handleToggleCourseExpanded(course.code, isExpanded)}
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
                      aria-label={`Eliminar ${course.code} del catálogo`}
                      onClick={() => onRemoveCatalogCourse(course.code)}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                </div>

                {isExpanded && activeParallel && (
                  <div className="flex flex-col gap-1.5 border-t border-border bg-card p-2">
                    <div className="flex flex-col gap-1 rounded-md border border-blue-200 bg-blue-50/60 p-2">
                      <div className="flex items-center justify-between gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          className="h-6 px-1.5 text-[11px] font-semibold text-espol-navy hover:bg-blue-100"
                          onClick={() => {
                            onHoverPreview(null);
                            setCourseStepParallel(course.code, null);
                          }}
                        >
                          <ArrowLeft className="size-3" />
                          Cambiar teórico
                        </Button>
                        <Badge className="bg-espol-navy px-1.5 py-0 text-[10px] font-bold text-espol-gold-soft">
                          Paso 2/2 · P{activeParallel.parallelNumber}
                        </Badge>
                      </div>
                      <div className="text-[11px] text-slate-700">
                        <div className="truncate font-medium">
                          {activeParallel.professor || 'Profesor por asignar'}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          Teórico:{' '}
                          {formatSessionBlocksShort(activeParallel.sessions) || 'Sin horario'} ·
                          Cupo {activeParallel.available}
                        </div>
                      </div>
                    </div>

                    {activeParallel.practicals.map((pr) => {
                      const variant: CourseSelectionItem = {
                        course,
                        parallel: activeParallel,
                        practical: pr,
                      };
                      const isPicked =
                        picked?.parallelNumber === activeParallel.parallelNumber &&
                        picked?.practicalCode === pr.code;
                      const { classHits, examHits } = getManualOptionConflict(variant);
                      const minSeats = Math.min(activeParallel.available, pr.available);
                      const isVirtual =
                        isVirtualModality(activeParallel.modality) ||
                        isVirtualModality(pr.modality);

                      return (
                        <ManualOptionCard
                          key={`${activeParallel.parallelNumber}-${pr.code}`}
                          title={<strong>Prác. {pr.code}</strong>}
                          badges={
                            isVirtual ? (
                              <Badge className="border-sky-200 bg-sky-100 px-1 py-0 text-[9px] font-semibold text-sky-900">
                                Virtual
                              </Badge>
                            ) : undefined
                          }
                          seats={minSeats}
                          professor={
                            pr.professor || activeParallel.professor || 'Profesor por asignar'
                          }
                          sessionsText={formatSessionBlocksShort(pr.sessions) || 'Sin horario'}
                          isPicked={isPicked}
                          classHits={classHits}
                          examHits={examHits}
                          onMouseEnter={() => onHoverPreview(variant)}
                          onMouseLeave={() => onHoverPreview(null)}
                          onClick={() => {
                            onToggleManualOption(course.code, activeParallel.parallelNumber, pr.code);
                            onHoverPreview(null);
                            setCourseStepParallel(course.code, null);
                          }}
                        />
                      );
                    })}
                  </div>
                )}

                {isExpanded && !activeParallel && (
                  <div className="flex flex-col gap-1.5 border-t border-border bg-card p-2">
                    {course.parallels.map((p) => {
                      if (p.practicals.length > 1) {
                        const isPickedTheoretical = picked?.parallelNumber === p.parallelNumber;
                        const pickedPractical =
                          isPickedTheoretical && picked?.practicalCode
                            ? p.practicals.find((pr) => pr.code === picked.practicalCode) ?? null
                            : null;
                        const candidate: CourseSelectionItem = {
                          course,
                          parallel: p,
                          practical: pickedPractical,
                        };
                        const { classHits, examHits } = getManualOptionConflict(candidate);
                        const displaySeats = pickedPractical
                          ? Math.min(p.available, pickedPractical.available)
                          : p.available;
                        const isVirtual =
                          isVirtualModality(p.modality) ||
                          isVirtualModality(pickedPractical?.modality);

                        return (
                          <ManualOptionCard
                            key={p.parallelNumber}
                            title={
                              <span>
                                <strong>P{p.parallelNumber}</strong>
                                {pickedPractical ? ` · Prác. ${pickedPractical.code}` : ''}
                              </span>
                            }
                            badges={
                              <>
                                <Badge className="border-slate-200 bg-slate-100 px-1 py-0 text-[9px] font-semibold text-slate-700">
                                  {p.practicals.length} prácticos
                                </Badge>
                                {isVirtual && (
                                  <Badge className="border-sky-200 bg-sky-100 px-1 py-0 text-[9px] font-semibold text-sky-900">
                                    Virtual
                                  </Badge>
                                )}
                              </>
                            }
                            seats={displaySeats}
                            professor={p.professor || 'Profesor por asignar'}
                            sessionsText={formatSessionsShort(candidate) || 'Sin horario'}
                            isPicked={Boolean(pickedPractical)}
                            classHits={classHits}
                            examHits={examHits}
                            footerHint={
                              <div className="mt-0.5 flex items-center justify-between text-[10px] font-medium text-espol-navy">
                                <span>
                                  {pickedPractical
                                    ? `Cambiar práctico (${p.practicals.length} opciones)`
                                    : 'Paso 1: elige para ver prácticos'}
                                </span>
                                <ChevronRight className="size-3 shrink-0" />
                              </div>
                            }
                            onMouseEnter={() => onHoverPreview(candidate)}
                            onMouseLeave={() => onHoverPreview(null)}
                            onClick={() => {
                              onHoverPreview(null);
                              setCourseStepParallel(course.code, p.parallelNumber);
                            }}
                          />
                        );
                      }

                      const singlePractical = p.practicals[0] ?? null;
                      const prCode = singlePractical?.code ?? null;
                      const variant: CourseSelectionItem = {
                        course,
                        parallel: p,
                        practical: singlePractical,
                      };
                      const isPicked =
                        picked?.parallelNumber === p.parallelNumber &&
                        picked?.practicalCode === prCode;
                      const { classHits, examHits } = getManualOptionConflict(variant);
                      const minSeats = singlePractical
                        ? Math.min(p.available, singlePractical.available)
                        : p.available;
                      const isVirtual =
                        isVirtualModality(p.modality) ||
                        isVirtualModality(singlePractical?.modality);

                      return (
                        <ManualOptionCard
                          key={`${p.parallelNumber}-${prCode ?? 'none'}`}
                          title={
                            <span>
                              <strong>P{p.parallelNumber}</strong>
                              {prCode ? ` · Prác. ${prCode}` : ''}
                            </span>
                          }
                          badges={
                            isVirtual ? (
                              <Badge className="border-sky-200 bg-sky-100 px-1 py-0 text-[9px] font-semibold text-sky-900">
                                Virtual
                              </Badge>
                            ) : undefined
                          }
                          seats={minSeats}
                          professor={p.professor || 'Profesor por asignar'}
                          sessionsText={formatSessionsShort(variant) || 'Sin horario'}
                          isPicked={isPicked}
                          classHits={classHits}
                          examHits={examHits}
                          onMouseEnter={() => onHoverPreview(variant)}
                          onMouseLeave={() => onHoverPreview(null)}
                          onClick={() =>
                            onToggleManualOption(course.code, p.parallelNumber, prCode)
                          }
                        />
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
  );
}
