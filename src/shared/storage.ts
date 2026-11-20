import type { Course, ManualSelectionEntry, SchedulerConstraints } from './types';

const COURSES_KEY = 'espol_scheduler_courses_v1';
const CONSTRAINTS_KEY = 'espol_scheduler_constraints_v1';
const MANUAL_KEY = 'espol_scheduler_manual_v1';

export const DEFAULT_CONSTRAINTS: SchedulerConstraints = {
  selectedCourseCodes: [],
  excludedParallelKeys: [],
  excludedPracticalKeys: [],
  onlyWithSeats: false,
  avoidExamConflicts: true,
  blockedDays: [],
  blockedSlots: [],
  sortBy: 'minGaps',
  maxResults: 80,
};

function hasChromeStorage(): boolean {
  return typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);
}

export async function loadCourses(): Promise<Course[]> {
  if (hasChromeStorage()) {
    const res = await chrome.storage.local.get(COURSES_KEY);
    return Array.isArray(res[COURSES_KEY]) ? (res[COURSES_KEY] as Course[]) : [];
  }
  try {
    const raw = localStorage.getItem(COURSES_KEY);
    return raw ? (JSON.parse(raw) as Course[]) : [];
  } catch {
    return [];
  }
}

export async function saveCourses(courses: Course[]): Promise<void> {
  if (hasChromeStorage()) {
    await chrome.storage.local.set({ [COURSES_KEY]: courses });
    return;
  }
  localStorage.setItem(COURSES_KEY, JSON.stringify(courses));
}

export async function upsertCourses(incoming: Course[]): Promise<Course[]> {
  const existing = await loadCourses();
  const byCode = new Map<string, Course>();
  for (const c of existing) byCode.set(c.code, c);
  for (const c of incoming) byCode.set(c.code, c);
  const merged = Array.from(byCode.values()).sort((a, b) => a.code.localeCompare(b.code));
  await saveCourses(merged);
  return merged;
}

export async function removeCourse(code: string): Promise<Course[]> {
  const existing = await loadCourses();
  const next = existing.filter((c) => c.code !== code);
  await saveCourses(next);
  return next;
}

export async function clearAllCourses(): Promise<void> {
  await saveCourses([]);
}

export async function loadConstraints(): Promise<SchedulerConstraints> {
  if (hasChromeStorage()) {
    const res = await chrome.storage.local.get(CONSTRAINTS_KEY);
    return res[CONSTRAINTS_KEY]
      ? { ...DEFAULT_CONSTRAINTS, ...(res[CONSTRAINTS_KEY] as Partial<SchedulerConstraints>) }
      : DEFAULT_CONSTRAINTS;
  }
  try {
    const raw = localStorage.getItem(CONSTRAINTS_KEY);
    return raw
      ? { ...DEFAULT_CONSTRAINTS, ...(JSON.parse(raw) as Partial<SchedulerConstraints>) }
      : DEFAULT_CONSTRAINTS;
  } catch {
    return DEFAULT_CONSTRAINTS;
  }
}

export async function saveConstraints(constraints: SchedulerConstraints): Promise<void> {
  if (hasChromeStorage()) {
    await chrome.storage.local.set({ [CONSTRAINTS_KEY]: constraints });
    return;
  }
  localStorage.setItem(CONSTRAINTS_KEY, JSON.stringify(constraints));
}

export async function loadManualSelections(): Promise<ManualSelectionEntry[]> {
  if (hasChromeStorage()) {
    const res = await chrome.storage.local.get(MANUAL_KEY);
    return Array.isArray(res[MANUAL_KEY]) ? (res[MANUAL_KEY] as ManualSelectionEntry[]) : [];
  }
  try {
    const raw = localStorage.getItem(MANUAL_KEY);
    return raw ? (JSON.parse(raw) as ManualSelectionEntry[]) : [];
  } catch {
    return [];
  }
}

export async function saveManualSelections(entries: ManualSelectionEntry[]): Promise<void> {
  if (hasChromeStorage()) {
    await chrome.storage.local.set({ [MANUAL_KEY]: entries });
    return;
  }
  localStorage.setItem(MANUAL_KEY, JSON.stringify(entries));
}

export function subscribeCoursesChanged(listener: (courses: Course[]) => void): () => void {
  if (hasChromeStorage() && chrome.storage.onChanged) {
    const handler = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName === 'local' && changes[COURSES_KEY]) {
        const next = changes[COURSES_KEY].newValue;
        listener(Array.isArray(next) ? (next as Course[]) : []);
      }
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }
  return () => {};
}
