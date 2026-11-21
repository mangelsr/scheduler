import { useEffect, useState } from 'react';
import { SAMPLE_COURSES } from '../../shared/sampleData';
import {
  clearAllCourses,
  DEFAULT_CONSTRAINTS,
  loadConstraints,
  loadCourses,
  loadManualSelections,
  removeCourse,
  saveConstraints,
  saveManualSelections,
  subscribeCoursesChanged,
  upsertCourses,
} from '../../shared/storage';
import type {
  BlockedSlot,
  Course,
  DayOfWeek,
  ManualSelectionEntry,
  SchedulerConstraints,
} from '../../shared/types';
import { validateImportedCourses } from '../../shared/validation';

export function usePlannerState(onStatus: (msg: string) => void) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [constraints, setConstraints] = useState<SchedulerConstraints>(DEFAULT_CONSTRAINTS);
  const [manualEntries, setManualEntries] = useState<ManualSelectionEntry[]>([]);
  const [expandedCourses, setExpandedCourses] = useState<Set<string>>(new Set());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    Promise.all([loadCourses(), loadConstraints(), loadManualSelections()]).then(
      ([loadedCourses, loadedConstraints, loadedManual]) => {
        setCourses(loadedCourses);
        const existingCodes = new Set(loadedCourses.map((c) => c.code));
        const validSelected = loadedConstraints.selectedCourseCodes.filter((code) =>
          existingCodes.has(code),
        );
        const initialSelected =
          validSelected.length > 0 ? validSelected : loadedCourses.map((c) => c.code);
        setConstraints({ ...loadedConstraints, selectedCourseCodes: initialSelected });
        setManualEntries(loadedManual.filter((e) => existingCodes.has(e.courseCode)));
        setExpandedCourses(new Set(loadedCourses.slice(0, 4).map((c) => c.code)));
        setHydrated(true);
      },
    );

    const unsub = subscribeCoursesChanged((nextCourses) => {
      setCourses(nextCourses);
      const nextCodes = nextCourses.map((c) => c.code);
      setConstraints((prev) => {
        const prevSet = new Set(prev.selectedCourseCodes);
        const added = nextCodes.filter((code) => !prevSet.has(code));
        const filtered = prev.selectedCourseCodes.filter((code) => nextCodes.includes(code));
        return { ...prev, selectedCourseCodes: [...filtered, ...added] };
      });
      setManualEntries((prev) => prev.filter((e) => nextCodes.includes(e.courseCode)));
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void saveConstraints(constraints);
  }, [constraints, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    void saveManualSelections(manualEntries);
  }, [manualEntries, hydrated]);

  const toggleManualOption = (
    courseCode: string,
    parallelNumber: string,
    practicalCode: string | null,
  ) => {
    setManualEntries((prev) => {
      const current = prev.find((e) => e.courseCode === courseCode);
      const isSame =
        current &&
        current.parallelNumber === parallelNumber &&
        current.practicalCode === practicalCode;
      if (isSame) {
        return prev.filter((e) => e.courseCode !== courseCode);
      }
      return [
        ...prev.filter((e) => e.courseCode !== courseCode),
        { courseCode, parallelNumber, practicalCode },
      ];
    });
  };

  const removeManualCourse = (courseCode: string) => {
    setManualEntries((prev) => prev.filter((e) => e.courseCode !== courseCode));
  };

  const toggleCourseSelection = (code: string) => {
    setConstraints((prev) => {
      const exists = prev.selectedCourseCodes.includes(code);
      return {
        ...prev,
        selectedCourseCodes: exists
          ? prev.selectedCourseCodes.filter((c) => c !== code)
          : [...prev.selectedCourseCodes, code],
      };
    });
  };

  const toggleExpanded = (code: string) => {
    setExpandedCourses((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const toggleExcludedParallel = (courseCode: string, parallelNumber: string) => {
    const key = `${courseCode}::${parallelNumber}`;
    setConstraints((prev) => {
      const exists = prev.excludedParallelKeys.includes(key);
      return {
        ...prev,
        excludedParallelKeys: exists
          ? prev.excludedParallelKeys.filter((k) => k !== key)
          : [...prev.excludedParallelKeys, key],
      };
    });
  };

  const toggleExcludedPractical = (
    courseCode: string,
    parallelNumber: string,
    practicalCode: string,
  ) => {
    const key = `${courseCode}::${parallelNumber}::${practicalCode}`;
    setConstraints((prev) => {
      const exists = prev.excludedPracticalKeys.includes(key);
      return {
        ...prev,
        excludedPracticalKeys: exists
          ? prev.excludedPracticalKeys.filter((k) => k !== key)
          : [...prev.excludedPracticalKeys, key],
      };
    });
  };

  const toggleBlockedDay = (day: DayOfWeek) => {
    setConstraints((prev) => {
      const exists = prev.blockedDays.includes(day);
      return {
        ...prev,
        blockedDays: exists ? prev.blockedDays.filter((d) => d !== day) : [...prev.blockedDays, day],
      };
    });
  };

  const addBlockedSlot = (slot: BlockedSlot) => {
    setConstraints((prev) => ({
      ...prev,
      blockedSlots: [...prev.blockedSlots, slot],
    }));
  };

  const removeBlockedSlot = (index: number) => {
    setConstraints((prev) => ({
      ...prev,
      blockedSlots: prev.blockedSlots.filter((_, i) => i !== index),
    }));
  };

  const handleLoadSample = async () => {
    const merged = await upsertCourses(SAMPLE_COURSES);
    setCourses(merged);
    setConstraints((prev) => ({
      ...prev,
      selectedCourseCodes: Array.from(
        new Set([...prev.selectedCourseCodes, ...SAMPLE_COURSES.map((c) => c.code)]),
      ),
    }));
    setExpandedCourses((prev) => new Set([...prev, ...SAMPLE_COURSES.map((c) => c.code)]));
    onStatus('Datos de ejemplo cargados (4 materias).');
  };

  const handleRemoveCourse = async (code: string) => {
    const next = await removeCourse(code);
    setCourses(next);
    setConstraints((prev) => ({
      ...prev,
      selectedCourseCodes: prev.selectedCourseCodes.filter((c) => c !== code),
    }));
    setManualEntries((prev) => prev.filter((e) => e.courseCode !== code));
  };

  const handleClearAll = async () => {
    await clearAllCourses();
    setCourses([]);
    setConstraints((prev) => ({ ...prev, selectedCourseCodes: [] }));
    setManualEntries([]);
    onStatus('Catálogo limpiado.');
  };

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(courses, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `espol-materias-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJson = async (file: File) => {
    try {
      const text = await file.text();
      const rawJson = JSON.parse(text) as unknown;
      const { courses: validated, error } = validateImportedCourses(rawJson);
      if (error) {
        onStatus(error);
        return;
      }
      if (validated.length === 0) {
        onStatus('El archivo JSON no contiene materias.');
        return;
      }

      const merged = await upsertCourses(validated);
      setCourses(merged);
      setConstraints((prev) => ({
        ...prev,
        selectedCourseCodes: Array.from(
          new Set([...prev.selectedCourseCodes, ...validated.map((c) => c.code)]),
        ),
      }));
      setExpandedCourses(new Set(merged.slice(0, 4).map((c) => c.code)));
      onStatus(`Importadas ${validated.length} materia(s) correctamente.`);
    } catch {
      onStatus('No se pudo leer el archivo JSON.');
    }
  };

  return {
    courses,
    setCourses,
    constraints,
    setConstraints,
    manualEntries,
    setManualEntries,
    expandedCourses,
    toggleManualOption,
    removeManualCourse,
    toggleCourseSelection,
    toggleExpanded,
    toggleExcludedParallel,
    toggleExcludedPractical,
    toggleBlockedDay,
    addBlockedSlot,
    removeBlockedSlot,
    handleLoadSample,
    handleRemoveCourse,
    handleClearAll,
    handleExportJson,
    handleImportJson,
  };
}
