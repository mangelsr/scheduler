export type DayOfWeek =
  | 'Lunes'
  | 'Martes'
  | 'Miércoles'
  | 'Jueves'
  | 'Viernes'
  | 'Sábado'
  | 'Domingo';

export const ORDERED_DAYS: DayOfWeek[] = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
];

export type ExamType = 'Parcial' | 'Final' | 'Mejoramiento';

export interface SessionBlock {
  day: DayOfWeek;
  startTime: string; // "09:00"
  endTime: string; // "11:00"
  startMinutes: number;
  endMinutes: number;
  classroom: string;
  block: string;
}

export interface ExamInfo {
  type: ExamType;
  raw: string;
  date: string | null; // "YYYY-MM-DD"
  startTime: string | null; // "09:00"
  endTime: string | null; // "11:00"
  startMinutes: number | null;
  endMinutes: number | null;
  classroom: string;
}

export interface PracticalParallel {
  code: string; // e.g. "101"
  professor: string;
  capacity: number;
  available: number;
  modality: string;
  sessions: SessionBlock[];
}

export interface TheoreticalParallel {
  idCurso: string;
  idMateria: string;
  periodId: string;
  parallelNumber: string;
  url: string;
  professor: string;
  modality: string;
  capacity: number;
  available: number;
  directedNote: string;
  timeNote: string;
  exams: ExamInfo[];
  sessions: SessionBlock[];
  practicals: PracticalParallel[];
}

export interface Course {
  code: string;
  name: string;
  periodLabel: string;
  extractedAt: string;
  parallels: TheoreticalParallel[];
}

export interface SearchParallelRef {
  parallelNumber: string;
  url: string;
  idMateria: string;
  idCurso: string;
  periodId: string;
}

export interface SearchCourseRow {
  code: string;
  name: string;
  parallels: SearchParallelRef[];
}

export interface CourseSelectionItem {
  course: Course;
  parallel: TheoreticalParallel;
  practical: PracticalParallel | null;
}

export interface ManualSelectionEntry {
  courseCode: string;
  parallelNumber: string;
  practicalCode: string | null;
}

export interface ClassConflict {
  day: DayOfWeek;
  timeRange: string;
  courseA: string;
  courseB: string;
}

export interface ScheduleMetrics {
  totalWeeklyMinutes: number;
  totalGapMinutes: number;
  freeDaysCount: number;
  activeDaysCount: number;
  earliestStartMinutes: number;
  latestEndMinutes: number;
  minAvailableSeats: number;
  examConflicts: ExamConflict[];
}

export interface ExamConflict {
  examType: ExamType;
  date: string;
  courseA: string;
  courseB: string;
  timeA: string;
  timeB: string;
}

export interface GeneratedSchedule {
  id: string;
  items: CourseSelectionItem[];
  metrics: ScheduleMetrics;
  score: number;
}

export type SortPreference =
  | 'minGaps'
  | 'maxFreeDays'
  | 'earliestFinish'
  | 'latestStart';

export interface BlockedSlot {
  day: DayOfWeek;
  startMinutes: number;
  endMinutes: number;
}

export interface SchedulerConstraints {
  selectedCourseCodes: string[];
  excludedParallelKeys: string[]; // `${courseCode}::${parallelNumber}`
  excludedPracticalKeys: string[]; // `${courseCode}::${parallelNumber}::${practicalCode}`
  onlyWithSeats: boolean;
  avoidExamConflicts: boolean;
  blockedDays: DayOfWeek[];
  blockedSlots: BlockedSlot[];
  sortBy: SortPreference;
  maxResults: number;
  pinnedSelections?: ManualSelectionEntry[];
}
