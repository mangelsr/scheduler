import {
  ALL_DAYS,
  ORDERED_DAYS,
  type BlockedSlot,
  type ClassConflict,
  type Course,
  type CourseSelectionItem,
  type DayOfWeek,
  type ExamConflict,
  type GeneratedSchedule,
  type ManualSelectionEntry,
  type ScheduleMetrics,
  type SchedulerConstraints,
  type SessionBlock,
  type SortPreference,
} from './types';

function intervalsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function getOptionSessions(item: CourseSelectionItem): SessionBlock[] {
  return item.practical
    ? [...item.parallel.sessions, ...item.practical.sessions]
    : [...item.parallel.sessions];
}

export function sessionsCollide(a: SessionBlock[], b: SessionBlock[]): boolean {
  for (const sa of a) {
    for (const sb of b) {
      if (sa.day === sb.day && intervalsOverlap(sa.startMinutes, sa.endMinutes, sb.startMinutes, sb.endMinutes)) {
        return true;
      }
    }
  }
  return false;
}

export function findClassConflicts(items: CourseSelectionItem[]): ClassConflict[] {
  const conflicts: ClassConflict[] = [];
  for (let i = 0; i < items.length; i++) {
    const a = items[i];
    const saList = getOptionSessions(a);
    for (let j = i + 1; j < items.length; j++) {
      const b = items[j];
      const sbList = getOptionSessions(b);
      for (const sa of saList) {
        for (const sb of sbList) {
          if (
            sa.day === sb.day &&
            intervalsOverlap(sa.startMinutes, sa.endMinutes, sb.startMinutes, sb.endMinutes)
          ) {
            const overlapStart = Math.max(sa.startMinutes, sb.startMinutes);
            const overlapEnd = Math.min(sa.endMinutes, sb.endMinutes);
            const fmt = (m: number) =>
              `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
            conflicts.push({
              day: sa.day,
              timeRange: `${fmt(overlapStart)}-${fmt(overlapEnd)}`,
              courseA: `${a.course.code} P${a.parallel.parallelNumber}`,
              courseB: `${b.course.code} P${b.parallel.parallelNumber}`,
            });
          }
        }
      }
    }
  }
  return conflicts;
}

export function resolveManualEntries(
  courses: Course[],
  entries: ManualSelectionEntry[],
): CourseSelectionItem[] {
  const byCode = new Map(courses.map((c) => [c.code, c]));
  const items: CourseSelectionItem[] = [];
  for (const entry of entries) {
    const course = byCode.get(entry.courseCode);
    if (!course) continue;
    const parallel = course.parallels.find((p) => p.parallelNumber === entry.parallelNumber);
    if (!parallel) continue;
    const practical =
      entry.practicalCode !== null
        ? parallel.practicals.find((pr) => pr.code === entry.practicalCode) ?? null
        : null;
    if (entry.practicalCode !== null && !practical) continue;
    items.push({ course, parallel, practical });
  }
  return items;
}

export function hitsBlockedConstraints(
  sessions: SessionBlock[],
  blockedDays: Set<DayOfWeek>,
  blockedSlots: BlockedSlot[],
): boolean {
  for (const s of sessions) {
    if (blockedDays.has(s.day)) return true;
    for (const slot of blockedSlots) {
      if (s.day === slot.day && intervalsOverlap(s.startMinutes, s.endMinutes, slot.startMinutes, slot.endMinutes)) {
        return true;
      }
    }
  }
  return false;
}

export function findExamConflicts(items: CourseSelectionItem[]): ExamConflict[] {
  const conflicts: ExamConflict[] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      for (const ea of a.parallel.exams) {
        if (!ea.date || ea.startMinutes === null || ea.endMinutes === null) continue;
        for (const eb of b.parallel.exams) {
          if (!eb.date || eb.startMinutes === null || eb.endMinutes === null) continue;
          if (
            ea.date === eb.date &&
            intervalsOverlap(ea.startMinutes, ea.endMinutes, eb.startMinutes, eb.endMinutes)
          ) {
            conflicts.push({
              examType: ea.type,
              date: ea.date,
              courseA: `${a.course.code} (P${a.parallel.parallelNumber})`,
              courseB: `${b.course.code} (P${b.parallel.parallelNumber})`,
              timeA: `${ea.startTime}-${ea.endTime}`,
              timeB: `${eb.startTime}-${eb.endTime}`,
            });
          }
        }
      }
    }
  }
  return conflicts;
}

export function computeMetrics(items: CourseSelectionItem[]): ScheduleMetrics {
  const byDay = new Map<DayOfWeek, SessionBlock[]>();
  for (const day of ALL_DAYS) {
    byDay.set(day, []);
  }

  let totalWeeklyMinutes = 0;
  let earliestStartMinutes = 24 * 60;
  let latestEndMinutes = 0;
  let minAvailableSeats = Number.POSITIVE_INFINITY;

  for (const item of items) {
    const seats = item.practical
      ? Math.min(item.parallel.available, item.practical.available)
      : item.parallel.available;
    if (seats < minAvailableSeats) minAvailableSeats = seats;

    for (const s of getOptionSessions(item)) {
      totalWeeklyMinutes += s.endMinutes - s.startMinutes;
      if (s.startMinutes < earliestStartMinutes) earliestStartMinutes = s.startMinutes;
      if (s.endMinutes > latestEndMinutes) latestEndMinutes = s.endMinutes;
      const list = byDay.get(s.day);
      if (list) list.push(s);
    }
  }

  const weekdaySet = new Set<DayOfWeek>(ORDERED_DAYS);
  let totalGapMinutes = 0;
  let activeDaysCount = 0;
  let activeWeekdaysCount = 0;

  for (const day of ALL_DAYS) {
    const daySessions = (byDay.get(day) ?? []).sort((a, b) => a.startMinutes - b.startMinutes);
    if (daySessions.length === 0) continue;
    activeDaysCount++;
    if (weekdaySet.has(day)) activeWeekdaysCount++;
    for (let i = 1; i < daySessions.length; i++) {
      const gap = daySessions[i].startMinutes - daySessions[i - 1].endMinutes;
      if (gap > 0) totalGapMinutes += gap;
    }
  }

  const freeDaysCount = ORDERED_DAYS.length - activeWeekdaysCount;
  const examConflicts = findExamConflicts(items);

  return {
    totalWeeklyMinutes,
    totalGapMinutes,
    freeDaysCount,
    activeDaysCount,
    earliestStartMinutes: earliestStartMinutes === 24 * 60 ? 0 : earliestStartMinutes,
    latestEndMinutes,
    minAvailableSeats: Number.isFinite(minAvailableSeats) ? minAvailableSeats : 0,
    examConflicts,
  };
}

function scoreMetrics(metrics: ScheduleMetrics, sortBy: SortPreference): number {
  const examPenalty = metrics.examConflicts.length * 10000;
  switch (sortBy) {
    case 'minGaps':
      return metrics.totalGapMinutes + metrics.activeDaysCount * 15 + examPenalty;
    case 'maxFreeDays':
      return metrics.activeDaysCount * 1000 + metrics.totalGapMinutes + examPenalty;
    case 'earliestFinish':
      return metrics.latestEndMinutes + metrics.totalGapMinutes * 0.25 + examPenalty;
    case 'latestStart':
      return -metrics.earliestStartMinutes + metrics.totalGapMinutes * 0.25 + examPenalty;
  }
}

function buildOptionsForCourse(
  course: Course,
  constraints: SchedulerConstraints,
  blockedDays: Set<DayOfWeek>,
): { option: CourseSelectionItem; sessions: SessionBlock[] }[] {
  const excludedParallels = new Set(constraints.excludedParallelKeys);
  const excludedPracticals = new Set(constraints.excludedPracticalKeys);
  const candidates: { option: CourseSelectionItem; sessions: SessionBlock[] }[] = [];

  for (const parallel of course.parallels) {
    const pKey = `${course.code}::${parallel.parallelNumber}`;
    if (excludedParallels.has(pKey)) continue;
    if (constraints.onlyWithSeats && parallel.available <= 0) continue;

    if (parallel.practicals.length === 0) {
      const option: CourseSelectionItem = { course, parallel, practical: null };
      const sessions = getOptionSessions(option);
      if (sessions.length > 0 && !hitsBlockedConstraints(sessions, blockedDays, constraints.blockedSlots)) {
        candidates.push({ option, sessions });
      }
    } else {
      for (const practical of parallel.practicals) {
        const prKey = `${course.code}::${parallel.parallelNumber}::${practical.code}`;
        if (excludedPracticals.has(prKey)) continue;
        if (constraints.onlyWithSeats && practical.available <= 0) continue;

        const option: CourseSelectionItem = { course, parallel, practical };
        const sessions = getOptionSessions(option);
        if (sessions.length > 0 && !hitsBlockedConstraints(sessions, blockedDays, constraints.blockedSlots)) {
          candidates.push({ option, sessions });
        }
      }
    }
  }

  return candidates;
}

export interface GenerationResult {
  schedules: GeneratedSchedule[];
  truncated: boolean;
  emptyCourseCodes: string[];
}

const EXPLORATION_CAP = 1500;

export function generateSchedules(
  courses: Course[],
  constraints: SchedulerConstraints,
): GenerationResult {
  const selectedSet = new Set(constraints.selectedCourseCodes);
  const activeCourses = courses.filter((c) => selectedSet.has(c.code));
  if (activeCourses.length === 0) {
    return { schedules: [], truncated: false, emptyCourseCodes: [] };
  }

  const pinnedByCode = new Map<string, ManualSelectionEntry>(
    (constraints.pinnedSelections ?? []).map((p) => [p.courseCode, p]),
  );

  const blockedDays = new Set(constraints.blockedDays);
  const perCourseOptions = activeCourses.map((course) => {
    const pinned = pinnedByCode.get(course.code);
    if (pinned) {
      const parallel = course.parallels.find((p) => p.parallelNumber === pinned.parallelNumber);
      if (!parallel) return { course, options: [] };
      const practical =
        pinned.practicalCode !== null
          ? parallel.practicals.find((pr) => pr.code === pinned.practicalCode) ?? null
          : null;
      if (pinned.practicalCode !== null && !practical) return { course, options: [] };
      const option: CourseSelectionItem = { course, parallel, practical };
      return { course, options: [{ option, sessions: getOptionSessions(option) }] };
    }
    return {
      course,
      options: buildOptionsForCourse(course, constraints, blockedDays),
    };
  });

  const emptyCourseCodes = perCourseOptions
    .filter((entry) => entry.options.length === 0)
    .map((entry) => entry.course.code);

  if (emptyCourseCodes.length > 0) {
    return { schedules: [], truncated: false, emptyCourseCodes };
  }

  // Most-constrained courses first speeds up backtracking substantially
  perCourseOptions.sort((a, b) => a.options.length - b.options.length);

  const chosen: { option: CourseSelectionItem; sessions: SessionBlock[] }[] = [];
  const results: GeneratedSchedule[] = [];
  let truncated = false;

  function backtrack(index: number) {
    if (results.length >= EXPLORATION_CAP) {
      truncated = true;
      return;
    }
    if (index === perCourseOptions.length) {
      const items = chosen.map((c) => c.option);
      const metrics = computeMetrics(items);
      if (constraints.avoidExamConflicts && metrics.examConflicts.length > 0) {
        return;
      }
      const id = items
        .map((it) => `${it.course.code}-${it.parallel.parallelNumber}${it.practical ? `-${it.practical.code}` : ''}`)
        .sort()
        .join('|');
      results.push({
        id,
        items,
        metrics,
        score: scoreMetrics(metrics, constraints.sortBy),
      });
      return;
    }

    for (const candidate of perCourseOptions[index].options) {
      const hasClassConflict = chosen.some((c) => sessionsCollide(c.sessions, candidate.sessions));
      if (hasClassConflict) continue;

      chosen.push(candidate);
      backtrack(index + 1);
      chosen.pop();
      if (truncated) return;
    }
  }

  backtrack(0);

  results.sort((a, b) => a.score - b.score);
  return {
    schedules: results.slice(0, constraints.maxResults),
    truncated,
    emptyCourseCodes: [],
  };
}
