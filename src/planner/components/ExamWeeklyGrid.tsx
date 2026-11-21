import { useEffect, useState } from 'react';
import { CalendarDays, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  buildExamCalendarData,
  EXAM_TYPES,
  formatExamLocation,
  formatShortDate,
} from '../../shared/examCalendar';
import type { CourseSelectionItem, DayOfWeek, ExamType } from '../../shared/types';
import { getCourseColor, layoutDayBlocks, type CoursePalette, type PositionedBlock } from '../WeeklyGrid';

interface ExamWeeklyGridProps {
  items: CourseSelectionItem[];
  previewItem?: CourseSelectionItem | null;
  courseColorMap: Map<string, CoursePalette>;
  onRemoveCourse?: (courseCode: string) => void;
}

const DEFAULT_START_HOUR = 7;
const DEFAULT_END_HOUR = 21;

function formatHour(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

export function ExamWeeklyGrid({
  items,
  previewItem = null,
  courseColorMap,
  onRemoveCourse,
}: ExamWeeklyGridProps) {
  const [selectedType, setSelectedType] = useState<ExamType>('Parcial');
  const [weekIndex, setWeekIndex] = useState(0);

  const calendarData = buildExamCalendarData(items, previewItem, selectedType);

  useEffect(() => {
    if (
      calendarData.availableTypes.length > 0 &&
      !calendarData.availableTypes.includes(selectedType)
    ) {
      setSelectedType(calendarData.availableTypes[0]);
    }
  }, [calendarData.availableTypes, selectedType]);

  useEffect(() => {
    setWeekIndex(0);
  }, [selectedType, calendarData.weeks.length]);

  const activeWeek = calendarData.weeks[weekIndex] ?? calendarData.weeks[0] ?? null;

  return (
    <div className="flex flex-col gap-3">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {EXAM_TYPES.map((type) => {
            const hasExams = calendarData.availableTypes.includes(type);
            const active = selectedType === type;
            return (
              <Button
                key={type}
                type="button"
                size="sm"
                variant={active ? 'default' : 'outline'}
                className={cn(
                  active && 'bg-espol-navy text-white hover:bg-espol-navy-hover',
                  !hasExams && !active && 'opacity-55',
                )}
                onClick={() => setSelectedType(type)}
              >
                {type}
              </Button>
            );
          })}
        </div>

        {activeWeek && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CalendarDays className="size-3.5 text-espol-navy" />
            <span>
              Semana de <strong>{selectedType}</strong>: {activeWeek.weekLabel}
            </span>
            {calendarData.weeks.length > 1 && (
              <div className="flex items-center gap-1">
                {calendarData.weeks.map((w, idx) => (
                  <Button
                    key={w.weekStartIso}
                    type="button"
                    size="xs"
                    variant={idx === weekIndex ? 'secondary' : 'outline'}
                    onClick={() => setWeekIndex(idx)}
                  >
                    Sem {idx + 1}
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {!activeWeek ? (
        <Card className="border-dashed bg-card shadow-none">
          <CardContent className="py-8 text-center text-xs text-muted-foreground">
            No hay exámenes de tipo <strong>{selectedType}</strong> con fecha y horario registrados
            para las materias seleccionadas.
          </CardContent>
        </Card>
      ) : (
        <ExamWeekGridBody
          columns={activeWeek.columns}
          entries={activeWeek.entries}
          examType={selectedType}
          courseColorMap={courseColorMap}
          onRemoveCourse={onRemoveCourse}
        />
      )}

      {calendarData.unscheduledCourses.length > 0 && activeWeek && (
        <div className="rounded-md border border-border bg-card px-3 py-2 text-[11px] text-muted-foreground">
          <strong className="text-foreground">Sin fecha en {selectedType}:</strong>{' '}
          {calendarData.unscheduledCourses
            .map((c) => `${c.courseCode} (${c.rawText})`)
            .join(' · ')}
        </div>
      )}
    </div>
  );
}

function ExamWeekGridBody({
  columns,
  entries,
  examType,
  courseColorMap,
  onRemoveCourse,
}: {
  columns: { day: DayOfWeek; dateIso: string; shortDate: string }[];
  entries: ReturnType<typeof buildExamCalendarData>['weeks'][number]['entries'];
  examType: ExamType;
  courseColorMap: Map<string, CoursePalette>;
  onRemoveCourse?: (courseCode: string) => void;
}) {
  const rawByDay = new Map<DayOfWeek, Omit<PositionedBlock, 'colIndex' | 'colTotal'>[]>();
  for (const col of columns) rawByDay.set(col.day, []);

  let minHour = DEFAULT_START_HOUR;
  let maxHour = DEFAULT_END_HOUR;

  for (const entry of entries) {
    minHour = Math.min(minHour, Math.floor(entry.startMinutes / 60));
    maxHour = Math.max(maxHour, Math.ceil(entry.endMinutes / 60));

    const color = courseColorMap.get(entry.item.course.code) ?? getCourseColor(0);
    const location = formatExamLocation(entry.exam.classroom);

    rawByDay.get(entry.day)?.push({
      key: `${entry.isPreview ? 'PREV-' : ''}EXAM-${examType}-${entry.item.course.code}-${entry.date}-${entry.startTime}`,
      courseCode: entry.item.course.code,
      courseName: entry.item.course.name,
      parallelLabel: `P${entry.item.parallel.parallelNumber} · ${examType}`,
      isPractical: false,
      isPreview: entry.isPreview,
      hasConflict: false,
      professor: entry.item.parallel.professor,
      modality: entry.item.parallel.modality,
      seats: `${entry.item.parallel.available}/${entry.item.parallel.capacity}`,
      session: {
        day: entry.day,
        startTime: entry.startTime,
        endTime: entry.endTime,
        startMinutes: entry.startMinutes,
        endMinutes: entry.endMinutes,
        classroom: location,
        block: entry.exam.classroom,
      },
      color,
    });
  }

  const startHour = Math.max(0, minHour);
  const endHour = Math.min(24, maxHour);
  const startMin = startHour * 60;
  const endMin = endHour * 60;
  const totalHours = endHour - startHour;
  const hours = Array.from({ length: totalHours + 1 }, (_, i) => startHour + i);
  const gridTemplateColumns = `64px repeat(${columns.length}, minmax(0, 1fr))`;

  return (
    <div className="print-break-inside-avoid overflow-hidden rounded-lg border border-border bg-card shadow-xs print:overflow-visible print:shadow-none">
      <div
        className="grid bg-espol-navy text-xs font-bold text-white"
        style={{ gridTemplateColumns }}
      >
        <div className="border-r border-white/15 px-2 py-2.5 text-center">Hora</div>
        {columns.map((col) => (
          <div
            key={col.dateIso}
            className="flex flex-col items-center justify-center border-r border-white/15 px-2 py-1.5 text-center last:border-r-0"
          >
            <span>{col.day}</span>
            <Badge className="mt-0.5 bg-white/15 px-1.5 py-0 text-[10px] font-semibold text-espol-gold-soft">
              {col.shortDate}
            </Badge>
          </div>
        ))}
      </div>

      <div
        className="relative grid"
        style={{
          gridTemplateColumns,
          height: `calc(var(--grid-hour-h, 48px) * ${totalHours})`,
        }}
      >
        <div className="border-r border-border bg-slate-50">
          {hours.slice(0, -1).map((h) => (
            <div
              key={h}
              className="border-b border-slate-200 pt-1 pr-1.5 text-right text-[11px] text-muted-foreground"
              style={{ height: 'var(--grid-hour-h, 48px)' }}
            >
              {formatHour(h)}
            </div>
          ))}
        </div>

        {columns.map((col) => {
          const dayBlocks = layoutDayBlocks(rawByDay.get(col.day) ?? []);
          return (
            <div key={col.dateIso} className="relative border-r border-slate-200 last:border-r-0">
              {hours.slice(0, -1).map((h) => (
                <div
                  key={h}
                  className="border-b border-slate-100"
                  style={{ height: 'var(--grid-hour-h, 48px)' }}
                />
              ))}

              {dayBlocks.map((b) => {
                const clampedStart = Math.max(b.session.startMinutes, startMin);
                const clampedEnd = Math.min(b.session.endMinutes, endMin);
                if (clampedEnd <= clampedStart) return null;
                const topHours = (clampedStart - startMin) / 60;
                const durationHours = (clampedEnd - clampedStart) / 60;
                const isCompact = durationHours <= 1;
                const widthPct = 100 / b.colTotal;
                const leftPct = b.colIndex * widthPct;

                return (
                  <div
                    key={b.key}
                    className={cn(
                      'absolute flex flex-col overflow-hidden rounded-md border-l-4 px-1.5 text-[11px] shadow-xs transition-opacity print:gap-0 print:py-0.5 print:leading-tight',
                      isCompact ? 'gap-0 py-0.5 leading-tight' : 'gap-0.5 py-1',
                      b.isPreview && 'z-10 border-2 border-dashed border-espol-navy opacity-70',
                      b.hasConflict && 'ring-2 ring-destructive',
                    )}
                    style={{
                      top: `calc(var(--grid-hour-h, 48px) * ${topHours})`,
                      height: `calc(var(--grid-hour-h, 48px) * ${durationHours} - 2px)`,
                      minHeight: '22px',
                      left: `calc(${leftPct}% + 2px)`,
                      width: `calc(${widthPct}% - 4px)`,
                      backgroundColor: b.color.bg,
                      borderLeftColor: b.hasConflict ? '#dc2626' : b.color.border,
                      color: b.color.text,
                    }}
                    title={`${b.courseCode} - ${b.courseName}\n${b.parallelLabel}\nFecha: ${formatShortDate(col.dateIso)} · ${b.session.startTime} - ${b.session.endTime}\nAula: ${b.session.block || 'S/A'}`}
                  >
                    <div className="flex items-center justify-between gap-1 text-[11px]">
                      <strong className="truncate">{b.courseCode}</strong>
                      <div className="flex min-w-0 items-center gap-1">
                        <span className="truncate text-[10px] font-medium opacity-90">
                          {b.parallelLabel}
                        </span>
                        {onRemoveCourse && !b.isPreview && (
                          <button
                            type="button"
                            className="no-print inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded bg-slate-900/15 text-current transition-colors hover:bg-destructive hover:text-white"
                            title={`Quitar ${b.courseCode}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onRemoveCourse(b.courseCode);
                            }}
                          >
                            <X className="size-2.5" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="truncate font-semibold">{b.courseName}</div>
                    <div className="truncate text-[10px] opacity-85">
                      {b.session.startTime}–{b.session.endTime} · {b.session.classroom}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
