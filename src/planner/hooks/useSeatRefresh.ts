import { useState } from 'react';
import { refreshCoursesSeats } from '../../shared/academicClient';
import { upsertCourses } from '../../shared/storage';
import type { Course } from '../../shared/types';

export function useSeatRefresh(
  onCoursesUpdated: (courses: Course[]) => void,
  onStatus: (msg: string) => void,
) {
  const [refreshingSeats, setRefreshingSeats] = useState(false);

  const refreshSeats = async (targetCourses: Course[]) => {
    if (targetCourses.length === 0 || refreshingSeats) return;
    setRefreshingSeats(true);

    try {
      const result = await refreshCoursesSeats(targetCourses, (progress) => {
        onStatus(
          `Actualizando ${progress.courseCode} P${progress.parallelNumber} (${progress.processed}/${progress.total})...`,
        );
      });

      if (result.updatedCourses.length > 0) {
        const merged = await upsertCourses(result.updatedCourses);
        onCoursesUpdated(merged);
      }

      if (result.errorCount > 0) {
        const hint = result.authError
          ? 'sesión expirada en ESPOL Académico'
          : 'revisa tu sesión en Académico';
        onStatus(
          `Actualizados ${result.updatedCount} paralelos (${result.errorCount} fallaron — ${hint}).`,
        );
      } else {
        onStatus(`Cupos actualizados para ${result.updatedCount} paralelo(s).`);
      }
    } finally {
      setRefreshingSeats(false);
    }
  };

  return { refreshingSeats, refreshSeats };
}
