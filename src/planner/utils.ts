import { getOptionSessions } from '../shared/scheduler';
import type { CourseSelectionItem, SessionBlock } from '../shared/types';

export function formatMinutesAsDuration(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function formatClock(mins: number): string {
  if (!mins) return '--:--';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function parseClockInput(val: string): number | null {
  const m = val.match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function formatSessionBlocksShort(sessions: SessionBlock[]): string {
  return sessions
    .map((s) => `${s.day.slice(0, 3)} ${s.startTime}-${s.endTime}`)
    .join(' · ');
}

export function formatSessionsShort(item: CourseSelectionItem): string {
  return formatSessionBlocksShort(getOptionSessions(item));
}
