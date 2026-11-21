import {
  ALL_DAYS,
  type Course,
  type DayOfWeek,
  type ExamInfo,
  type ExamType,
  type PracticalParallel,
  type SessionBlock,
  type TheoreticalParallel,
} from './types';

const VALID_DAYS = new Set<string>(ALL_DAYS);
const VALID_EXAM_TYPES = new Set<string>(['Parcial', 'Final', 'Mejoramiento']);

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function asString(val: unknown, fallback = ''): string {
  return typeof val === 'string' ? val : fallback;
}

function asFiniteNumber(val: unknown): number | null {
  return typeof val === 'number' && Number.isFinite(val) ? val : null;
}

function validateSession(raw: unknown): SessionBlock | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.day !== 'string' || !VALID_DAYS.has(raw.day)) return null;
  const startMinutes = asFiniteNumber(raw.startMinutes);
  const endMinutes = asFiniteNumber(raw.endMinutes);
  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) return null;
  if (typeof raw.startTime !== 'string' || typeof raw.endTime !== 'string') return null;

  return {
    day: raw.day as DayOfWeek,
    startTime: raw.startTime,
    endTime: raw.endTime,
    startMinutes,
    endMinutes,
    classroom: asString(raw.classroom),
    block: asString(raw.block),
  };
}

function validateExam(raw: unknown): ExamInfo | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.type !== 'string' || !VALID_EXAM_TYPES.has(raw.type)) return null;

  return {
    type: raw.type as ExamType,
    raw: asString(raw.raw),
    date: typeof raw.date === 'string' ? raw.date : null,
    startTime: typeof raw.startTime === 'string' ? raw.startTime : null,
    endTime: typeof raw.endTime === 'string' ? raw.endTime : null,
    startMinutes: asFiniteNumber(raw.startMinutes),
    endMinutes: asFiniteNumber(raw.endMinutes),
    classroom: asString(raw.classroom),
  };
}

function validatePractical(raw: unknown): PracticalParallel | null {
  if (!isRecord(raw)) return null;
  const code = asString(raw.code).trim();
  if (!code || !Array.isArray(raw.sessions)) return null;

  const sessions: SessionBlock[] = [];
  for (const s of raw.sessions) {
    const valid = validateSession(s);
    if (!valid) return null;
    sessions.push(valid);
  }

  return {
    code,
    professor: asString(raw.professor),
    capacity: asFiniteNumber(raw.capacity) ?? 0,
    available: asFiniteNumber(raw.available) ?? 0,
    modality: asString(raw.modality),
    sessions,
  };
}

function validateParallel(raw: unknown): TheoreticalParallel | null {
  if (!isRecord(raw)) return null;
  const parallelNumber = asString(raw.parallelNumber).trim();
  if (!parallelNumber || !Array.isArray(raw.sessions)) return null;

  const sessions: SessionBlock[] = [];
  for (const s of raw.sessions) {
    const valid = validateSession(s);
    if (!valid) return null;
    sessions.push(valid);
  }

  const exams: ExamInfo[] = [];
  if (raw.exams !== undefined) {
    if (!Array.isArray(raw.exams)) return null;
    for (const e of raw.exams) {
      const valid = validateExam(e);
      if (!valid) return null;
      exams.push(valid);
    }
  }

  const practicals: PracticalParallel[] = [];
  if (raw.practicals !== undefined) {
    if (!Array.isArray(raw.practicals)) return null;
    for (const pr of raw.practicals) {
      const valid = validatePractical(pr);
      if (!valid) return null;
      practicals.push(valid);
    }
  }

  return {
    idCurso: asString(raw.idCurso),
    idMateria: asString(raw.idMateria),
    periodId: asString(raw.periodId),
    parallelNumber,
    url: asString(raw.url),
    professor: asString(raw.professor),
    modality: asString(raw.modality),
    capacity: asFiniteNumber(raw.capacity) ?? 0,
    available: asFiniteNumber(raw.available) ?? 0,
    directedNote: asString(raw.directedNote),
    timeNote: asString(raw.timeNote),
    exams,
    sessions,
    practicals,
  };
}

export interface CourseValidationResult {
  courses: Course[];
  error?: string;
}

export function validateImportedCourses(input: unknown): CourseValidationResult {
  if (!Array.isArray(input)) {
    return { courses: [], error: 'El archivo JSON debe contener un arreglo de materias.' };
  }

  const courses: Course[] = [];
  for (let idx = 0; idx < input.length; idx++) {
    const raw = input[idx];
    if (!isRecord(raw)) {
      return { courses: [], error: `Elemento #${idx + 1} no es un objeto válido.` };
    }

    const code = asString(raw.code).trim();
    const name = asString(raw.name).trim();
    if (!code || !name || !Array.isArray(raw.parallels)) {
      return {
        courses: [],
        error: `La materia #${idx + 1} requiere "code", "name" y una lista "parallels".`,
      };
    }

    const parallels: TheoreticalParallel[] = [];
    for (let pIdx = 0; pIdx < raw.parallels.length; pIdx++) {
      const validP = validateParallel(raw.parallels[pIdx]);
      if (!validP) {
        return {
          courses: [],
          error: `Paralelo #${pIdx + 1} inválido en la materia "${code}".`,
        };
      }
      parallels.push(validP);
    }

    courses.push({
      code,
      name,
      periodLabel: asString(raw.periodLabel),
      extractedAt: asString(raw.extractedAt, new Date().toISOString()),
      parallels,
    });
  }

  return { courses };
}
