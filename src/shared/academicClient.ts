import { parsePlannedCourseHtml } from './parser';
import type { Course, TheoreticalParallel } from './types';

export const ACADEMIC_REQUEST_DELAY_RANGE_MS = {
  min: 700,
  max: 1600,
} as const;

export function getAcademicRequestDelayMs(
  min: number = ACADEMIC_REQUEST_DELAY_RANGE_MS.min,
  max: number = ACADEMIC_REQUEST_DELAY_RANGE_MS.max,
): number {
  const low = Math.ceil(Math.min(min, max));
  const high = Math.floor(Math.max(min, max));
  return Math.floor(Math.random() * (high - low + 1)) + low;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface FetchParallelResult {
  ok: boolean;
  parallel?: TheoreticalParallel;
  periodLabel?: string;
  courseName?: string;
  status?: number;
  finalUrl?: string;
  htmlLength?: number;
  reason?: 'http_error' | 'login_redirect' | 'unexpected_html' | 'network_error';
  errorMessage?: string;
}

function extractHtmlTitle(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? match[1].trim() : 'sin <title>';
}

export function looksLikeLoginPage(finalUrl: string, html: string): boolean {
  const lowerUrl = finalUrl.toLowerCase();
  if (lowerUrl.includes('login') || lowerUrl.includes('autenticacion') || lowerUrl.includes('auth')) {
    return true;
  }
  const title = extractHtmlTitle(html).toLowerCase();
  return title.includes('iniciar sesión') || title.includes('login') || title.includes('acceso');
}

export async function fetchPlannedParallel(url: string): Promise<FetchParallelResult> {
  try {
    const res = await fetch(url, {
      credentials: 'include',
      redirect: 'follow',
    });

    const finalUrl = res.url || url;
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        finalUrl,
        reason: 'http_error',
        errorMessage: `HTTP ${res.status}`,
      };
    }

    const html = await res.text();
    if (looksLikeLoginPage(finalUrl, html)) {
      return {
        ok: false,
        status: res.status,
        finalUrl,
        htmlLength: html.length,
        reason: 'login_redirect',
        errorMessage: `Redirigido a inicio de sesión (${finalUrl})`,
      };
    }

    const parsed = parsePlannedCourseHtml(html, finalUrl);
    if (
      !parsed.parallel.parallelNumber ||
      (!parsed.courseName && parsed.parallel.sessions.length === 0)
    ) {
      const title = extractHtmlTitle(html);
      return {
        ok: false,
        status: res.status,
        finalUrl,
        htmlLength: html.length,
        reason: 'unexpected_html',
        errorMessage: `HTML inesperado (título: "${title}", len: ${html.length})`,
      };
    }

    return {
      ok: true,
      status: res.status,
      finalUrl,
      htmlLength: html.length,
      parallel: parsed.parallel,
      periodLabel: parsed.periodLabel,
      courseName: parsed.courseName,
    };
  } catch (err) {
    return {
      ok: false,
      reason: 'network_error',
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  }
}

export interface RefreshSeatsProgress {
  courseCode: string;
  parallelNumber: string;
  processed: number;
  total: number;
}

export interface RefreshSeatsResult {
  updatedCourses: Course[];
  updatedCount: number;
  errorCount: number;
  authError: boolean;
}

export async function refreshCoursesSeats(
  targetCourses: Course[],
  onProgress?: (progress: RefreshSeatsProgress) => void,
  delayMs: number | (() => number) = getAcademicRequestDelayMs,
): Promise<RefreshSeatsResult> {
  const total = targetCourses.reduce((sum, c) => sum + c.parallels.length, 0);
  let processed = 0;
  let updatedCount = 0;
  let errorCount = 0;
  let authError = false;

  const updatedCourses: Course[] = [];

  for (const originalCourse of targetCourses) {
    const course = structuredClone(originalCourse);
    let courseModified = false;

    for (let i = 0; i < course.parallels.length; i++) {
      const p = course.parallels[i];
      processed++;
      onProgress?.({
        courseCode: course.code,
        parallelNumber: p.parallelNumber,
        processed,
        total,
      });

      const result = await fetchPlannedParallel(p.url);
      if (result.ok && result.parallel) {
        course.parallels[i] = result.parallel;
        if (result.courseName) course.name = result.courseName;
        if (result.periodLabel) course.periodLabel = result.periodLabel;
        updatedCount++;
        courseModified = true;
      } else {
        errorCount++;
        if (result.reason === 'login_redirect') {
          authError = true;
        }
      }

      if (processed < total) {
        const waitMs = typeof delayMs === 'function' ? delayMs() : delayMs;
        if (waitMs > 0) {
          await sleep(waitMs);
        }
      }
    }

    if (courseModified) {
      course.extractedAt = new Date().toISOString();
      updatedCourses.push(course);
    }
  }

  return { updatedCourses, updatedCount, errorCount, authError };
}
