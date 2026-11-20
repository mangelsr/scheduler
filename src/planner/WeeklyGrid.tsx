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
const HOUR_HEIGHT = 48;

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

  // Cluster overlapping intervals and assign side-by-side columns
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
  const totalHeight = (END_HOUR - START_HOUR) * HOUR_HEIGHT;
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
    <div className="weekly-grid-wrapper">
      <div className="weekly-grid-header">
        <div className="time-gutter-header">Hora</div>
        {ORDERED_DAYS.map((day) => (
          <div
            key={day}
            className={`day-header ${blockedDaySet.has(day) ? 'day-header-blocked' : ''}`}
          >
            {day}
            {blockedDaySet.has(day) && <span className="blocked-tag">Libre</span>}
          </div>
        ))}
      </div>

      <div className="weekly-grid-body" style={{ height: `${totalHeight}px` }}>
        <div className="time-gutter">
          {hours.slice(0, -1).map((h) => (
            <div key={h} className="time-slot-label" style={{ height: `${HOUR_HEIGHT}px` }}>
              <span>{formatHour(h)}</span>
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
              className={`day-column ${isDayBlocked ? 'day-column-blocked' : ''}`}
            >
              {hours.slice(0, -1).map((h) => (
                <div key={h} className="hour-cell" style={{ height: `${HOUR_HEIGHT}px` }} />
              ))}

              {dayBlockedSlots.map((slot, idx) => {
                const top = ((Math.max(slot.startMinutes, startMin) - startMin) / 60) * HOUR_HEIGHT;
                const bottom = ((Math.min(slot.endMinutes, endMin) - startMin) / 60) * HOUR_HEIGHT;
                if (bottom <= top) return null;
                return (
                  <div
                    key={`blocked-${idx}`}
                    className="blocked-slot-overlay"
                    style={{ top: `${top}px`, height: `${bottom - top}px` }}
                    title={`Bloqueado ${day}`}
                  >
                    Bloqueado
                  </div>
                );
              })}

              {dayBlocks.map((b) => {
                const clampedStart = Math.max(b.session.startMinutes, startMin);
                const clampedEnd = Math.min(b.session.endMinutes, endMin);
                const top = ((clampedStart - startMin) / 60) * HOUR_HEIGHT;
                const height = Math.max(24, ((clampedEnd - clampedStart) / 60) * HOUR_HEIGHT - 2);
                const widthPct = 100 / b.colTotal;
                const leftPct = b.colIndex * widthPct;

                return (
                  <div
                    key={b.key}
                    className={`class-block ${b.isPractical ? 'class-block-practical' : ''} ${b.isPreview ? 'class-block-preview' : ''} ${b.hasConflict ? 'class-block-conflict' : ''}`}
                    style={{
                      top: `${top}px`,
                      height: `${height}px`,
                      left: `calc(${leftPct}% + 2px)`,
                      width: `calc(${widthPct}% - 4px)`,
                      backgroundColor: b.color.bg,
                      borderLeftColor: b.hasConflict ? '#dc2626' : b.color.border,
                      color: b.color.text,
                    }}
                    title={`${b.courseCode} - ${b.courseName}\n${b.parallelLabel}\nProf: ${b.professor}\n${b.session.startTime} - ${b.session.endTime}\nAula: ${b.session.classroom} (${b.session.block})\nCupos: ${b.seats}`}
                  >
                    <div className="class-block-top">
                      <strong>{b.courseCode}</strong>
                      <div className="class-block-top-right">
                        <span>{b.parallelLabel}</span>
                        {onRemoveCourse && !b.isPreview && (
                          <button
                            type="button"
                            className="block-remove-btn no-print"
                            title={`Quitar ${b.courseCode}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onRemoveCourse(b.courseCode);
                            }}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="class-block-name">{b.courseName}</div>
                    <div className="class-block-meta">
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
