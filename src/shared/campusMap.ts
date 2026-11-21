import { ESPOL_BLOCK_COORDS } from './campusMapData';
import { isVirtualModality, normalizeWhitespace } from './parser';
import { ALL_DAYS, type CampusTransition, type CourseSelectionItem, type DayOfWeek } from './types';

export const ESPOL_MY_MAPS_BASE_URL =
  'https://www.google.com/maps/d/viewer?mid=13yd4eq_vb9gfXl6IxCuv8zybU8voTLw&femb=1';

const WALKING_PATH_FACTOR = 1.25;
const WALKING_SPEED_M_PER_MIN = 75; // ~4.5 km/h campus pace

/**
 * Extracts normalized block code (e.g. "9M" from "9M CAMPUS GUSTAVO GALINDO"),
 * returning null for virtual or unparseable blocks.
 */
export function extractBlockCode(block: string, modality = ''): string | null {
  const clean = normalizeWhitespace(block);
  if (!clean || /\bvirtual\b/i.test(clean) || isVirtualModality(modality)) {
    return null;
  }

  const campusMatch = clean.match(/^(.*?)\s*\bCAMPUS\b.*$/i);
  const code = (campusMatch ? campusMatch[1] : clean).trim().toUpperCase();
  return code || null;
}

export function getBlockCoords(
  block: string,
  modality = '',
): readonly [number, number] | null {
  const code = extractBlockCode(block, modality);
  if (!code) return null;

  if (ESPOL_BLOCK_COORDS[code]) {
    return ESPOL_BLOCK_COORDS[code];
  }
  const stripped = code.replace(/[-\s]*RECOD$/i, '').trim();
  return ESPOL_BLOCK_COORDS[stripped] ?? null;
}

export function getGoogleMapsBlockUrl(block: string): string {
  const coords = getBlockCoords(block);
  if (!coords) return ESPOL_MY_MAPS_BASE_URL;
  return `${ESPOL_MY_MAPS_BASE_URL}&ll=${coords[0]}%2C${coords[1]}&z=18`;
}

export function haversineMeters(
  a: readonly [number, number],
  b: readonly [number, number],
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);

  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function estimateWalkFromBlocks(
  fromBlock: string,
  toBlock: string,
): { straightMeters: number; walkMeters: number; walkMinutes: number } | null {
  const fromCoords = getBlockCoords(fromBlock);
  const toCoords = getBlockCoords(toBlock);
  if (!fromCoords || !toCoords) return null;

  const fromCode = extractBlockCode(fromBlock);
  const toCode = extractBlockCode(toBlock);
  if (fromCode && toCode && fromCode === toCode) {
    return { straightMeters: 0, walkMeters: 0, walkMinutes: 0 };
  }

  const straightMeters = Math.round(haversineMeters(fromCoords, toCoords));
  const walkMeters = Math.round(straightMeters * WALKING_PATH_FACTOR);
  const walkMinutes = walkMeters === 0 ? 0 : Math.max(1, Math.round(walkMeters / WALKING_SPEED_M_PER_MIN));
  return { straightMeters, walkMeters, walkMinutes };
}

function classifyTransition(
  walkMeters: number,
  walkMinutes: number,
  gapMinutes: number,
): 'ok' | 'moderate' | 'tight' {
  if (walkMeters < 100) return 'ok';
  if (walkMeters >= 450 && walkMinutes > Math.max(gapMinutes, 5)) {
    return 'tight';
  }
  if (walkMeters >= 700 && gapMinutes <= 45) {
    return 'moderate';
  }
  return 'ok';
}

interface DaySessionRef {
  courseCode: string;
  blockCode: string;
  classroom: string;
  startTime: string;
  endTime: string;
  startMinutes: number;
  endMinutes: number;
}

export function computeScheduleTransitions(items: CourseSelectionItem[]): CampusTransition[] {
  const byDay = new Map<DayOfWeek, DaySessionRef[]>();
  for (const day of ALL_DAYS) byDay.set(day, []);

  for (const item of items) {
    const pushSession = (
      s: CourseSelectionItem['parallel']['sessions'][number],
      modality: string,
    ) => {
      const blockCode = extractBlockCode(s.block, modality);
      if (!blockCode || !getBlockCoords(blockCode)) return;
      byDay.get(s.day)?.push({
        courseCode: item.course.code,
        blockCode,
        classroom: s.classroom,
        startTime: s.startTime,
        endTime: s.endTime,
        startMinutes: s.startMinutes,
        endMinutes: s.endMinutes,
      });
    };

    for (const s of item.parallel.sessions) {
      pushSession(s, item.parallel.modality);
    }
    if (item.practical) {
      const prModality = item.practical.modality || item.parallel.modality;
      for (const s of item.practical.sessions) {
        pushSession(s, prModality);
      }
    }
  }

  const transitions: CampusTransition[] = [];

  for (const day of ALL_DAYS) {
    const list = (byDay.get(day) ?? []).sort(
      (a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes,
    );
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1];
      const next = list[i];
      if (next.startMinutes < prev.endMinutes) continue; // overlapping classes handled by conflict detector
      if (prev.courseCode === next.courseCode && prev.blockCode === next.blockCode) continue;

      const est = estimateWalkFromBlocks(prev.blockCode, next.blockCode);
      if (!est) continue;

      const gapMinutes = next.startMinutes - prev.endMinutes;
      transitions.push({
        day,
        fromCourseCode: prev.courseCode,
        fromBlock: prev.blockCode,
        fromClassroom: prev.classroom,
        fromEndTime: prev.endTime,
        toCourseCode: next.courseCode,
        toBlock: next.blockCode,
        toClassroom: next.classroom,
        toStartTime: next.startTime,
        gapMinutes,
        straightMeters: est.straightMeters,
        walkMeters: est.walkMeters,
        walkMinutes: est.walkMinutes,
        severity: classifyTransition(est.walkMeters, est.walkMinutes, gapMinutes),
      });
    }
  }

  return transitions;
}
