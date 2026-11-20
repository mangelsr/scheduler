import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { BlockedSlot, CourseSelectionItem, DayOfWeek, SessionBlock } from '../shared/types';
import { ORDERED_DAYS } from '../shared/types';

export interface CoursePalette {
  bg: string;
  border: string;
  text: string;
}

const PALETTE: CoursePalette[] = [
  { bg: '#dbeafe', border: '#2563eb', text: '#1e3a8a' },
  { bg: '#dcfce7', border: '#16a34a', text: '#14532d' },
  { bg: '#fef3c7', border: '#d97706', text: '#78350f' },
  { bg: '#f3e8ff', border: '#9333ea', text: '#581c87' },
  { bg: '#ffe4e6', border: '#e11d48', text: '#881337' },
  { bg: '#cffafe', border: '#0891b2', text: '#164e63' },
  { bg: '#ffedd5', border: '#ea580c', text: '#7c2d12' },
  { bg: '#e0e7ff', border: '#4f46e5', text: '#312e81' },
];

export function getCourseColor(index: number): CoursePalette {
  return PALETTE[index % PALETTE.length];
}

interface PositionedBlock {
  key: string;
  courseCode: string;
  courseName: string;
  parallelLabel: string;
  isPractical: boolean;
  isPreview: boolean;
  hasConflict: boolean;
  professor: string;
  seats: string;
  session: SessionBlock;
  color: CoursePalette;
  colIndex: number;
  colTotal: number;
}

interface WeeklyGridProps {
  items: CourseSelectionItem[];
  previewItem?: CourseSelectionItem | null;
  blockedDays: DayOfWeek[];
  blockedSlots: BlockedSlot[];
  courseColorMap: Map<string, CoursePalette>;
  onRemoveCourse?: (courseCode: string) => void;
}

const START_HOUR = 7;
const END_HOUR = 21;

function formatHour(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

function layoutDayBlocks(raw: Omit<PositionedBlock, 'colIndex' | 'colTotal'>[]): PositionedBlock[] {
  const sorted = [...raw].sort((a, b) => a.session.startMinutes - b.session.startMinutes);
  const placed: PositionedBlock[] = sorted.map((item) => ({
    ...item,
    colIndex: 0,
    colTotal: 1,
  }));

  for (let i = 0; i < placed.length; i++) {
    const overlapping = [placed[i]];
    for (let j = 0; j < placed.length; j++) {
      if (i === j) continue;
      const a = placed[i].session;
      const b = placed[j].session;
      if (a.startMinutes < b.endMinutes && b.startMinutes < a.endMinutes) {
        overlapping.push(placed[j]);
      }
    }
    if (overlapping.length > 1) {
      overlapping.sort((a, b) => a.key.localeCompare(b.key));
      const nonPreviewCount = overlapping.filter((b) => !b.isPreview).length;
      overlapping.forEach((blk, idx) => {
        blk.colIndex = idx;
        blk.colTotal = overlapping.length;
        if (nonPreviewCount > 1) {
          blk.hasConflict = true;
        }
      });
    }
  }

  return placed;
}

export function WeeklyGrid({
  items,
  previewItem = null,
  blockedDays,
  blockedSlots,
  courseColorMap,
  onRemoveCourse,
}: WeeklyGridProps) {
  const startMin = START_HOUR * 60;
  const endMin = END_HOUR * 60;
  const totalHours = END_HOUR - START_HOUR;
  const blockedDaySet = new Set(blockedDays);

  const rawByDay = new Map<DayOfWeek, Omit<PositionedBlock, 'colIndex' | 'colTotal'>[]>();
  for (const day of ORDERED_DAYS) rawByDay.set(day, []);

  const pushItem = (item: CourseSelectionItem, isPreview: boolean) => {
    const color = courseColorMap.get(item.course.code) ?? PALETTE[0];
    const pNum = item.parallel.parallelNumber;

    for (const s of item.parallel.sessions) {
      rawByDay.get(s.day)?.push({
        key: `${isPreview ? 'PREV-' : ''}${item.course.code}-T-${pNum}-${s.day}-${s.startTime}`,
        courseCode: item.course.code,
        courseName: item.course.name,
        parallelLabel: `P${pNum} Teórico`,
        isPractical: false,
        isPreview,
        hasConflict: false,
        professor: item.parallel.professor,
        seats: `${item.parallel.available}/${item.parallel.capacity}`,
        session: s,
        color,
      });
    }

    if (item.practical) {
      for (const s of item.practical.sessions) {
        rawByDay.get(s.day)?.push({
          key: `${isPreview ? 'PREV-' : ''}${item.course.code}-P-${item.practical.code}-${s.day}-${s.startTime}`,
          courseCode: item.course.code,
          courseName: item.course.name,
          parallelLabel: `P${pNum} · Prác. ${item.practical.code}`,
          isPractical: true,
          isPreview,
          hasConflict: false,
          professor: item.practical.professor,
          seats: `${item.practical.available}/${item.practical.capacity}`,
          session: s,
          color,
        });
      }
    }
  };

  for (const item of items) {
    if (previewItem && previewItem.course.code === item.course.code) continue;
    pushItem(item, false);
  }
  if (previewItem) {
    pushItem(previewItem, true);
  }

  const hours = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);

  return (
    <div className="print-break-inside-avoid overflow-hidden rounded-lg border border-border bg-card shadow-xs print:overflow-visible print:shadow-none">
      {/* ESPOL Académico style navy header */}
      <div className="grid grid-cols-[64px_repeat(5,1fr)] bg-espol-navy text-xs font-bold text-white">
        <div className="border-r border-white/15 px-2 py-2.5 text-center">Hora</div>
        {ORDERED_DAYS.map((day) => (
          <div
            key={day}
            className={cn(
              'flex items-center justify-center gap-1.5 border-r border-white/15 px-2 py-2.5 text-center last:border-r-0',
              blockedDaySet.has(day) && 'bg-slate-700',
            )}
          >
            <span>{day}</span>
            {blockedDaySet.has(day) && (
              <Badge className="bg-espol-gold px-1.5 py-0 text-[10px] font-bold text-espol-navy">
                Libre
              </Badge>
            )}
          </div>
        ))}
      </div>

      <div
        className="relative grid grid-cols-[64px_repeat(5,1fr)]"
        style={{ height: `calc(var(--grid-hour-h, 48px) * ${totalHours})` }}
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

        {ORDERED_DAYS.map((day) => {
          const dayBlocks = layoutDayBlocks(rawByDay.get(day) ?? []);
          const dayBlockedSlots = blockedSlots.filter((b) => b.day === day);
          const isDayBlocked = blockedDaySet.has(day);

          return (
            <div
              key={day}
              className={cn(
                'relative border-r border-slate-200 last:border-r-0',
                isDayBlocked && 'espol-day-blocked',
              )}
            >
              {hours.slice(0, -1).map((h) => (
                <div
                  key={h}
                  className="border-b border-slate-100"
                  style={{ height: 'var(--grid-hour-h, 48px)' }}
                />
              ))}

              {dayBlockedSlots.map((slot, idx) => {
                const startHours = (Math.max(slot.startMinutes, startMin) - startMin) / 60;
                const endHours = (Math.min(slot.endMinutes, endMin) - startMin) / 60;
                if (endHours <= startHours) return null;
                return (
                  <div
                    key={`blocked-${idx}`}
                    className="pointer-events-none absolute right-0.5 left-0.5 flex items-center justify-center rounded border border-dashed border-slate-400 bg-slate-300/30 text-[10px] font-medium text-slate-600"
                    style={{
                      top: `calc(var(--grid-hour-h, 48px) * ${startHours})`,
                      height: `calc(var(--grid-hour-h, 48px) * ${endHours - startHours})`,
                    }}
                    title={`Bloqueado ${day}`}
                  >
                    Bloqueado
                  </div>
                );
              })}

              {dayBlocks.map((b) => {
                const clampedStart = Math.max(b.session.startMinutes, startMin);
                const clampedEnd = Math.min(b.session.endMinutes, endMin);
                const topHours = (clampedStart - startMin) / 60;
                const durationHours = (clampedEnd - clampedStart) / 60;
                const widthPct = 100 / b.colTotal;
                const leftPct = b.colIndex * widthPct;

                return (
                  <div
                    key={b.key}
                    className={cn(
                      'absolute flex flex-col gap-0.5 overflow-hidden rounded-md border-l-4 px-1.5 py-1 text-[11px] shadow-xs transition-opacity print:gap-0 print:py-0.5 print:leading-tight',
                      b.isPractical && 'border-l-dashed',
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
                    title={`${b.courseCode} - ${b.courseName}\n${b.parallelLabel}\nProf: ${b.professor}\n${b.session.startTime} - ${b.session.endTime}\nAula: ${b.session.classroom} (${b.session.block})\nCupos: ${b.seats}`}
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
                      {b.session.startTime}–{b.session.endTime} · {b.session.classroom || 'S/A'}
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
