import { normalizeWhitespace } from './parser';
import {
  ALL_DAYS,
  ORDERED_DAYS,
  type CourseSelectionItem,
  type DayOfWeek,
  type ExamInfo,
  type ExamType,
} from './types';

export const EXAM_TYPES: ExamType[] = ['Parcial', 'Final', 'Mejoramiento'];

// JS Date.getDay(): 0 = Domingo, 1 = Lunes, ..., 6 = Sábado
const JS_DAY_TO_ESPOL: DayOfWeek[] = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
];

export function parseIsoDateLocal(dateStr: string): Date | null {
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const d = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (
    Number.isNaN(d.getTime()) ||
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day
  ) {
    return null;
  }
  return d;
}

export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatShortDate(dateStr: string): string {
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}` : dateStr;
}

export function getDayOfWeekFromDate(dateStr: string): DayOfWeek | null {
  const d = parseIsoDateLocal(dateStr);
  return d ? JS_DAY_TO_ESPOL[d.getDay()] : null;
}

/**
 * Returns the ISO date ("YYYY-MM-DD") of the Monday of the week containing `dateStr`.
 */
export function getWeekStartIso(dateStr: string): string | null {
  const d = parseIsoDateLocal(dateStr);
  if (!d) return null;
  const jsDay = d.getDay(); // 0=Sun..6=Sat
  const offsetFromMonday = jsDay === 0 ? 6 : jsDay - 1;
  d.setDate(d.getDate() - offsetFromMonday);
  return toIsoDate(d);
}

export function addDaysIso(dateStr: string, days: number): string {
  const d = parseIsoDateLocal(dateStr);
  if (!d) return dateStr;
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
}

export function formatExamLocation(rawClassroom: string): string {
  const clean = normalizeWhitespace(rawClassroom);
  if (!clean) return 'S/A';
  if (/^Modalidad:\s*Virtual$/i.test(clean)) return 'Virtual';

  const stripped = clean
    .replace(/\s*\bModalidad:\s*Presencial\b/gi, '')
    .replace(/\s*\bCAMPUS\s+GUSTAVO\s+GALINDO\b/gi, '')
    .replace(/\s*\bModalidad:\s*Virtual\b/gi, ' (Virtual)')
    .replace(/\s+/g, ' ')
    .trim();

  return stripped || 'S/A';
}

export interface ScheduledExamEntry {
  item: CourseSelectionItem;
  exam: ExamInfo;
  date: string;
  day: DayOfWeek;
  startMinutes: number;
  endMinutes: number;
  startTime: string;
  endTime: string;
  isPreview: boolean;
}

export interface ExamWeekColumn {
  day: DayOfWeek;
  dateIso: string;
  shortDate: string;
}

export interface ExamWeekGroup {
  weekStartIso: string;
  weekLabel: string;
  columns: ExamWeekColumn[];
  entries: ScheduledExamEntry[];
}

export interface ExamCalendarData {
  availableTypes: ExamType[];
  weeks: ExamWeekGroup[];
  unscheduledCourses: { courseCode: string; courseName: string; rawText: string }[];
}

export function buildExamCalendarData(
  items: CourseSelectionItem[],
  previewItem: CourseSelectionItem | null,
  examType: ExamType,
): ExamCalendarData {
  const effectiveItems: { item: CourseSelectionItem; isPreview: boolean }[] = [];
  for (const item of items) {
    if (previewItem && previewItem.course.code === item.course.code) continue;
    effectiveItems.push({ item, isPreview: false });
  }
  if (previewItem) {
    effectiveItems.push({ item: previewItem, isPreview: true });
  }

  const availableTypesSet = new Set<ExamType>();
  const scheduled: ScheduledExamEntry[] = [];
  const unscheduledCourses: { courseCode: string; courseName: string; rawText: string }[] = [];

  for (const { item, isPreview } of effectiveItems) {
    for (const exam of item.parallel.exams) {
      if (exam.date && exam.startMinutes !== null && exam.endMinutes !== null) {
        availableTypesSet.add(exam.type);
      }
    }

    const match = item.parallel.exams.find((e) => e.type === examType);
    if (
      match &&
      match.date &&
      match.startMinutes !== null &&
      match.endMinutes !== null &&
      match.endMinutes > match.startMinutes
    ) {
      const day = getDayOfWeekFromDate(match.date);
      if (day) {
        scheduled.push({
          item,
          exam: match,
          date: match.date,
          day,
          startMinutes: match.startMinutes,
          endMinutes: match.endMinutes,
          startTime: match.startTime ?? '',
          endTime: match.endTime ?? '',
          isPreview,
        });
        continue;
      }
    }

    unscheduledCourses.push({
      courseCode: item.course.code,
      courseName: item.course.name,
      rawText: match?.raw || 'Sin fecha registrada',
    });
  }

  const byWeek = new Map<string, ScheduledExamEntry[]>();
  for (const entry of scheduled) {
    const weekStart = getWeekStartIso(entry.date);
    if (!weekStart) continue;
    const list = byWeek.get(weekStart) ?? [];
    list.push(entry);
    byWeek.set(weekStart, list);
  }

  const sortedWeekStarts = Array.from(byWeek.keys()).sort((a, b) => a.localeCompare(b));
  const weeks: ExamWeekGroup[] = sortedWeekStarts.map((weekStartIso) => {
    const entries = byWeek.get(weekStartIso) ?? [];
    const usedDays = new Set<DayOfWeek>(ORDERED_DAYS);
    for (const e of entries) usedDays.add(e.day);

    const columns: ExamWeekColumn[] = ALL_DAYS.filter((d) => usedDays.has(d)).map((day) => {
      const offset = ALL_DAYS.indexOf(day);
      const dateIso = addDaysIso(weekStartIso, offset);
      return {
        day,
        dateIso,
        shortDate: formatShortDate(dateIso),
      };
    });

    const firstCol = columns[0];
    const lastCol = columns[columns.length - 1];
    const weekLabel =
      firstCol && lastCol ? `${firstCol.shortDate} – ${lastCol.shortDate}` : weekStartIso;

    return {
      weekStartIso,
      weekLabel,
      columns,
      entries,
    };
  });

  const availableTypes = EXAM_TYPES.filter((t) => availableTypesSet.has(t));
  return { availableTypes, weeks, unscheduledCourses };
}
