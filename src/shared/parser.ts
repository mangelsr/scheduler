import type {
  DayOfWeek,
  ExamInfo,
  ExamType,
  PracticalParallel,
  SearchCourseRow,
  SearchParallelRef,
  SessionBlock,
  TheoreticalParallel,
} from './types';

const DAY_MAP: Record<string, DayOfWeek> = {
  lunes: 'Lunes',
  martes: 'Martes',
  miercoles: 'Miércoles',
  miércoles: 'Miércoles',
  jueves: 'Jueves',
  viernes: 'Viernes',
  sabado: 'Sábado',
  sábado: 'Sábado',
  domingo: 'Domingo',
};

export function normalizeWhitespace(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

export function normalizeDay(raw: string): DayOfWeek | null {
  const key = normalizeWhitespace(raw).toLowerCase();
  return DAY_MAP[key] ?? null;
}

/**
 * Parses "09:00:00" or "09:00" into minutes since midnight and normalized "HH:MM".
 */
export function parseTimeToMinutes(raw: string): { time: string; minutes: number } | null {
  const match = normalizeWhitespace(raw).match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (Number.isNaN(hours) || Number.isNaN(mins) || hours > 23 || mins > 59) return null;
  const hh = String(hours).padStart(2, '0');
  const mm = String(mins).padStart(2, '0');
  return { time: `${hh}:${mm}`, minutes: hours * 60 + mins };
}

export function parseIntSafe(raw: string | null | undefined): number {
  const match = normalizeWhitespace(raw).match(/-?\d+/);
  return match ? Number(match[0]) : 0;
}

/**
 * Parses exam strings like "17/11/2026 - 09:00 a 11:00".
 */
export function parseExamInfo(type: ExamType, rawDateText: string, classroomText: string): ExamInfo {
  const raw = normalizeWhitespace(rawDateText);
  const classroom = normalizeWhitespace(classroomText);
  const match = raw.match(/(\d{2})\/(\d{2})\/(\d{4})\s*-\s*(\d{1,2}:\d{2})\s*a\s*(\d{1,2}:\d{2})/i);
  if (!match) {
    return {
      type,
      raw,
      date: null,
      startTime: null,
      endTime: null,
      startMinutes: null,
      endMinutes: null,
      classroom,
    };
  }

  const [, dd, mm, yyyy, startRaw, endRaw] = match;
  const start = parseTimeToMinutes(startRaw);
  const end = parseTimeToMinutes(endRaw);

  return {
    type,
    raw,
    date: `${yyyy}-${mm}-${dd}`,
    startTime: start?.time ?? null,
    endTime: end?.time ?? null,
    startMinutes: start?.minutes ?? null,
    endMinutes: end?.minutes ?? null,
    classroom,
  };
}

export function isVirtualModality(modality: string | null | undefined): boolean {
  return /\bvirtual\b|\be-?learning\b/i.test(modality ?? '');
}

/**
 * Formats classroom + block omitting the default campus ("Gustavo Galindo")
 * while keeping virtual or alternative campus indicators.
 */
export function formatSessionLocation(
  classroom: string,
  block: string,
  modality = '',
): string {
  const cleanClassroom = normalizeWhitespace(classroom);
  const cleanBlock = normalizeWhitespace(block);

  const campusMatch = cleanBlock.match(/^(.*?)\s*\bCAMPUS\s+(.+)$/i);
  const blockCode = campusMatch ? campusMatch[1].trim() : cleanBlock;
  const campusName = campusMatch ? campusMatch[2].trim() : '';

  const isVirtual =
    /\bvirtual\b/i.test(campusName) ||
    /\bvirtual\b/i.test(cleanBlock) ||
    isVirtualModality(modality);
  const isMainCampus = /gustavo\s+galindo/i.test(campusName);

  const details: string[] = [];
  if (blockCode && !cleanClassroom.toLowerCase().includes(blockCode.toLowerCase())) {
    details.push(blockCode);
  }

  if (isVirtual) {
    if (!/\bvirtual\b/i.test(cleanClassroom)) {
      details.push('Virtual');
    }
  } else if (campusName && !isMainCampus) {
    details.push(campusName);
  }

  if (cleanClassroom && details.length > 0) {
    return `${cleanClassroom} (${details.join(' · ')})`;
  }
  if (cleanClassroom) return cleanClassroom;
  if (details.length > 0) return details.join(' · ');
  return isVirtual ? 'Virtual' : 'S/A';
}

function parseScheduleTable(table: Element | null): SessionBlock[] {
  if (!table) return [];
  const rows = Array.from(table.querySelectorAll('tr')).filter((tr) => !tr.closest('thead'));
  const sessions: SessionBlock[] = [];

  for (const row of rows) {
    const cells = Array.from(row.querySelectorAll('td'));
    if (cells.length < 3) continue;

    const day = normalizeDay(cells[0]?.textContent ?? '');
    const start = parseTimeToMinutes(cells[1]?.textContent ?? '');
    const end = parseTimeToMinutes(cells[2]?.textContent ?? '');
    if (!day || !start || !end || end.minutes <= start.minutes) continue;

    sessions.push({
      day,
      startTime: start.time,
      endTime: end.time,
      startMinutes: start.minutes,
      endMinutes: end.minutes,
      classroom: normalizeWhitespace(cells[3]?.textContent),
      block: normalizeWhitespace(cells[4]?.textContent),
    });
  }

  return sessions;
}

function parseQueryParams(urlStr: string): {
  idMateria: string;
  idCurso: string;
  periodId: string;
  parallelNumber: string;
} {
  try {
    const url = new URL(urlStr, 'https://www.academico.espol.edu.ec/UI/Registros/');
    return {
      idMateria: url.searchParams.get('idMateria') ?? '',
      idCurso: url.searchParams.get('idCurso') ?? '',
      periodId: url.searchParams.get('p') ?? '',
      parallelNumber: url.searchParams.get('numeroParalelo') ?? '',
    };
  } catch {
    return { idMateria: '', idCurso: '', periodId: '', parallelNumber: '' };
  }
}

/**
 * Parses the search results table `#ctl00_contenido_tbHorarios` from Consulta de Planificación.
 */
export function parseSearchTable(doc: Document, baseUrl: string): SearchCourseRow[] {
  const table = doc.querySelector('#ctl00_contenido_tbHorarios');
  if (!table) return [];

  const rows = Array.from(table.querySelectorAll('tbody tr'));
  const results: SearchCourseRow[] = [];

  for (const row of rows) {
    if (row.querySelector('.dataTables_empty')) continue;
    const cells = Array.from(row.querySelectorAll('td')).filter(
      (td) => !td.classList.contains('espol-sched-col'),
    );
    if (cells.length < 3) continue;

    const code = normalizeWhitespace(cells[0]?.textContent);
    const name = normalizeWhitespace(cells[1]?.textContent);
    const links = Array.from(cells[2]?.querySelectorAll('a.myLink, a[href*="MateriaPlanificada"]') ?? []);

    const parallels: SearchParallelRef[] = links
      .map((anchor) => {
        const href = anchor.getAttribute('href') ?? '';
        if (!href) return null;
        const resolvedUrl = new URL(href, baseUrl).toString();
        const params = parseQueryParams(resolvedUrl);
        const textNumber = normalizeWhitespace(anchor.textContent).replace(/[\[\]]/g, '');
        return {
          parallelNumber: params.parallelNumber || textNumber,
          url: resolvedUrl,
          idMateria: params.idMateria,
          idCurso: params.idCurso,
          periodId: params.periodId,
        };
      })
      .filter((item): item is SearchParallelRef => item !== null);

    if (code && name && parallels.length > 0) {
      results.push({ code, name, parallels });
    }
  }

  return results;
}

function parsePracticalBlock(div: Element): PracticalParallel | null {
  const tables = Array.from(div.querySelectorAll('table'));
  if (tables.length < 2) return null;

  const metaText = normalizeWhitespace(tables[0]?.textContent);
  const idFallback = div.id.replace(/^tabla_/i, '').trim();

  let professor = '';
  let code = idFallback;
  let capacity = 0;
  let available = 0;
  let modality = '';

  const metaRows = Array.from(tables[0].querySelectorAll('tr'));
  for (const tr of metaRows) {
    const tds = Array.from(tr.querySelectorAll('td'));
    for (const td of tds) {
      const text = normalizeWhitespace(td.textContent);
      if (/^Profesor:/i.test(text)) {
        professor = normalizeWhitespace(text.replace(/^Profesor:\s*/i, ''));
      } else if (/^Paralelo:+/i.test(text)) {
        code = normalizeWhitespace(text.replace(/^Paralelo:+\s*/i, '')) || idFallback;
      } else if (/^Capacidad:/i.test(text)) {
        capacity = parseIntSafe(text.replace(/^Capacidad:\s*/i, ''));
      } else if (/^Cupo disponible:/i.test(text)) {
        available = parseIntSafe(text.replace(/^Cupo disponible:\s*/i, ''));
      } else if (/MODALIDAD/i.test(text)) {
        modality = text;
      }
    }
  }

  const sessions = parseScheduleTable(tables[1]);
  if (!code || (!metaText && sessions.length === 0)) return null;

  return {
    code,
    professor,
    capacity,
    available,
    modality,
    sessions,
  };
}

export interface ParsedPlannedPage {
  periodLabel: string;
  courseName: string;
  parallel: TheoreticalParallel;
}

/**
 * Parses the full HTML of `MateriaPlanificada.aspx` into theoretical + associated practical parallels.
 */
export function parsePlannedCourseHtml(html: string, sourceUrl: string): ParsedPlannedPage {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const text = (selector: string) => normalizeWhitespace(doc.querySelector(selector)?.textContent);

  const queryParams = parseQueryParams(sourceUrl);
  const periodLabel = text('#ctl00_contenido_lbltexto');
  const courseName = text('#ctl00_contenido_LabelNombreMateria');
  const parallelNumber = text('#ctl00_contenido_LabelParalelo') || queryParams.parallelNumber;

  const exams: ExamInfo[] = [
    parseExamInfo('Parcial', text('#ctl00_contenido_LabelParcial'), text('#ctl00_contenido_aulaParcial')),
    parseExamInfo('Final', text('#ctl00_contenido_LabelFinal'), text('#ctl00_contenido_aulaFinal')),
    parseExamInfo('Mejoramiento', text('#ctl00_contenido_LabelMejora'), text('#ctl00_contenido_aulaMej')),
  ].filter((exam) => exam.raw.length > 0);

  const sessions = parseScheduleTable(doc.querySelector('#ctl00_contenido_TableHorarios'));

  const practicals: PracticalParallel[] = Array.from(doc.querySelectorAll('div.tabla_horario'))
    .map(parsePracticalBlock)
    .filter((p): p is PracticalParallel => p !== null);

  return {
    periodLabel,
    courseName,
    parallel: {
      idCurso: queryParams.idCurso,
      idMateria: queryParams.idMateria,
      periodId: queryParams.periodId,
      parallelNumber,
      url: sourceUrl,
      professor: text('#ctl00_contenido_LabelProfesor'),
      modality: text('#ctl00_contenido_modo_curso') || text('#ctl00_contenido_ver_virtual'),
      capacity: parseIntSafe(text('#ctl00_contenido_LabelCupo')),
      available: parseIntSafe(text('#ctl00_contenido_LabelDisponible')),
      directedNote: text('#ctl00_contenido_LabelDirigido'),
      timeNote: text('#ctl00_contenido_timecurso'),
      exams,
      sessions,
      practicals,
    },
  };
}
