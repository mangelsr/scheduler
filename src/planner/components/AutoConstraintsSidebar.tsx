import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Plus, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import type {
  BlockedSlot,
  Course,
  DayOfWeek,
  ManualSelectionEntry,
  SchedulerConstraints,
  SortPreference,
} from '../../shared/types';
import { formatClock, parseClockInput } from '../utils';
import type { CoursePalette } from '../WeeklyGrid';

interface AutoConstraintsSidebarProps {
  courses: Course[];
  constraints: SchedulerConstraints;
  availableDays: DayOfWeek[];
  expandedCourses: Set<string>;
  manualByCode: Map<string, ManualSelectionEntry>;
  manualCount: number;
  respectManualPins: boolean;
  courseColorMap: Map<string, CoursePalette>;
  onRespectManualPinsChange: (val: boolean) => void;
  onUpdateConstraints: (updater: (prev: SchedulerConstraints) => SchedulerConstraints) => void;
  onToggleCourseSelection: (code: string) => void;
  onToggleExpanded: (code: string) => void;
  onToggleExcludedParallel: (courseCode: string, parallelNumber: string) => void;
  onToggleExcludedPractical: (
    courseCode: string,
    parallelNumber: string,
    practicalCode: string,
  ) => void;
  onRemoveCatalogCourse: (code: string) => void;
  onToggleBlockedDay: (day: DayOfWeek) => void;
  onAddBlockedSlot: (slot: BlockedSlot) => void;
  onRemoveBlockedSlot: (index: number) => void;
  onInvalidSlot: () => void;
}

export function AutoConstraintsSidebar({
  courses,
  constraints,
  availableDays,
  expandedCourses,
  manualByCode,
  manualCount,
  respectManualPins,
  courseColorMap,
  onRespectManualPinsChange,
  onUpdateConstraints,
  onToggleCourseSelection,
  onToggleExpanded,
  onToggleExcludedParallel,
  onToggleExcludedPractical,
  onRemoveCatalogCourse,
  onToggleBlockedDay,
  onAddBlockedSlot,
  onRemoveBlockedSlot,
  onInvalidSlot,
}: AutoConstraintsSidebarProps) {
  const [slotDay, setSlotDay] = useState<DayOfWeek>('Lunes');
  const [slotStart, setSlotStart] = useState('07:00');
  const [slotEnd, setSlotEnd] = useState('09:00');

  const handleSubmitSlot = (e: React.FormEvent) => {
    e.preventDefault();
    const startMinutes = parseClockInput(slotStart);
    const endMinutes = parseClockInput(slotEnd);
    if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
      onInvalidSlot();
      return;
    }
    onAddBlockedSlot({ day: slotDay, startMinutes, endMinutes });
  };

  return (
    <>
      <section className="flex flex-col gap-2.5">
        <h2 className="text-xs font-bold tracking-wider text-espol-navy uppercase">
          Materias a combinar
        </h2>
        {courses.length === 0 ? (
          <Card className="border-dashed bg-slate-50 shadow-none">
            <CardContent className="p-3 text-xs leading-relaxed">
              <p className="font-medium text-foreground">No hay materias guardadas todavía.</p>
              <p className="mt-1 text-muted-foreground">
                Extrae materias desde ESPOL Académico o pulsa <strong>Cargar ejemplo</strong>.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {courses.map((course) => {
              const isSelected = constraints.selectedCourseCodes.includes(course.code);
              const isExpanded = expandedCourses.has(course.code);
              const isPinned = respectManualPins && manualByCode.has(course.code);
              const color = courseColorMap.get(course.code);

              return (
                <Card
                  key={course.code}
                  className={cn(
                    'gap-0 overflow-hidden py-0 shadow-none',
                    isSelected ? 'border-blue-300 bg-card' : 'bg-slate-50/70',
                  )}
                >
                  <div className="flex items-center justify-between gap-1.5 px-2.5 py-2">
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => onToggleCourseSelection(course.code)}
                      />
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: color?.border ?? '#001c43' }}
                      />
                      <div className="flex min-w-0 flex-col">
                        <div className="flex items-center gap-1.5">
                          <strong className="text-xs font-bold text-espol-navy">
                            {course.code}
                          </strong>
                          {isPinned && (
                            <Badge className="bg-espol-navy px-1.5 py-0 text-[10px] font-bold text-espol-gold-soft">
                              Fijada
                            </Badge>
                          )}
                        </div>
                        <span className="truncate text-[11px] text-muted-foreground">
                          {course.name}
                        </span>
                      </div>
                    </label>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        title="Ver paralelos"
                        onClick={() => onToggleExpanded(course.code)}
                      >
                        {isExpanded ? (
                          <ChevronDown className="size-3.5 text-slate-600" />
                        ) : (
                          <ChevronRight className="size-3.5 text-slate-600" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="hover:bg-red-100 hover:text-red-700"
                        title="Eliminar materia"
                        onClick={() => onRemoveCatalogCourse(course.code)}
                      >
                        <X className="size-3.5" />
                      </Button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="flex flex-col gap-2 border-t border-border bg-card p-2.5">
                      {course.parallels.map((p) => {
                        const pKey = `${course.code}::${p.parallelNumber}`;
                        const pEnabled = !constraints.excludedParallelKeys.includes(pKey);
                        return (
                          <div key={p.parallelNumber} className="text-[11px]">
                            <label className="flex cursor-pointer items-center gap-2">
                              <Checkbox
                                checked={pEnabled}
                                onCheckedChange={() =>
                                  onToggleExcludedParallel(course.code, p.parallelNumber)
                                }
                              />
                              <div className="flex flex-1 items-center justify-between gap-1.5">
                                <span className="truncate">
                                  <strong>P{p.parallelNumber}</strong> · {p.professor || 'S/P'}
                                </span>
                                <Badge
                                  className={cn(
                                    'px-1.5 py-0 text-[10px]',
                                    p.available > 0
                                      ? 'border-emerald-200 bg-emerald-100 text-emerald-900'
                                      : 'border-red-200 bg-red-100 text-red-900',
                                  )}
                                >
                                  {p.available}/{p.capacity}
                                </Badge>
                              </div>
                            </label>

                            {pEnabled && p.practicals.length > 0 && (
                              <div className="mt-1 ml-6 flex flex-col gap-1 text-muted-foreground">
                                {p.practicals.map((pr) => {
                                  const prKey = `${course.code}::${p.parallelNumber}::${pr.code}`;
                                  const prEnabled =
                                    !constraints.excludedPracticalKeys.includes(prKey);
                                  const slotTxt = pr.sessions
                                    .map((s) => `${s.day.slice(0, 3)} ${s.startTime}-${s.endTime}`)
                                    .join(', ');
                                  return (
                                    <label
                                      key={pr.code}
                                      className="flex cursor-pointer items-center gap-1.5"
                                    >
                                      <Checkbox
                                        checked={prEnabled}
                                        onCheckedChange={() =>
                                          onToggleExcludedPractical(
                                            course.code,
                                            p.parallelNumber,
                                            pr.code,
                                          )
                                        }
                                      />
                                      <span>
                                        Prác. {pr.code} ({slotTxt}) ·{' '}
                                        <strong
                                          className={
                                            pr.available > 0 ? 'text-emerald-700' : 'text-red-700'
                                          }
                                        >
                                          {pr.available}/{pr.capacity}
                                        </strong>
                                      </span>
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <Separator />

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-bold tracking-wider text-espol-navy uppercase">
          Filtros y Preferencias
        </h2>

        {manualCount > 0 && (
          <div className="flex items-center justify-between gap-2 text-xs">
            <span>Fijar elegidas en Manual ({manualCount})</span>
            <Switch checked={respectManualPins} onCheckedChange={onRespectManualPinsChange} />
          </div>
        )}

        <div className="flex items-center justify-between gap-2 text-xs">
          <span>Solo paralelos con cupo (&gt; 0)</span>
          <Switch
            checked={constraints.onlyWithSeats}
            onCheckedChange={(checked) =>
              onUpdateConstraints((prev) => ({ ...prev, onlyWithSeats: checked }))
            }
          />
        </div>

        <div className="flex items-center justify-between gap-2 text-xs">
          <span>Evitar choques de exámenes</span>
          <Switch
            checked={constraints.avoidExamConflicts}
            onCheckedChange={(checked) =>
              onUpdateConstraints((prev) => ({ ...prev, avoidExamConflicts: checked }))
            }
          />
        </div>

        <div className="flex items-center justify-between gap-2 text-xs">
          <span>Evitar caminatas largas sin hueco</span>
          <Switch
            checked={Boolean(constraints.avoidLongWalks)}
            onCheckedChange={(checked) =>
              onUpdateConstraints((prev) => ({ ...prev, avoidLongWalks: checked }))
            }
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate-700">Ordenar opciones por</label>
          <Select
            value={constraints.sortBy}
            onValueChange={(value) =>
              onUpdateConstraints((prev) => ({
                ...prev,
                sortBy: value as SortPreference,
              }))
            }
          >
            <SelectTrigger className="h-8 w-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="minGaps">Menos horas huecas</SelectItem>
              <SelectItem value="maxFreeDays">Más días libres</SelectItem>
              <SelectItem value="earliestFinish">Salir más temprano</SelectItem>
              <SelectItem value="latestStart">Entrar más tarde</SelectItem>
              <SelectItem value="minWalking">Menor distancia entre bloques</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate-700">Días libres obligatorios</label>
          <div className="flex flex-wrap gap-1">
            {availableDays.map((day) => {
              const active = constraints.blockedDays.includes(day);
              return (
                <Button
                  key={day}
                  type="button"
                  size="xs"
                  variant={active ? 'default' : 'outline'}
                  onClick={() => onToggleBlockedDay(day)}
                >
                  {day.slice(0, 3)}
                </Button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate-700">Bloquear franja horaria</label>
          <form className="flex items-center gap-1" onSubmit={handleSubmitSlot}>
            <Select value={slotDay} onValueChange={(val) => setSlotDay(val as DayOfWeek)}>
              <SelectTrigger className="h-8 w-[72px] px-2 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableDays.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d.slice(0, 3)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input
              type="time"
              className="h-8 flex-1 rounded-md border border-input bg-card px-1.5 text-xs"
              value={slotStart}
              onChange={(e) => setSlotStart(e.target.value)}
            />
            <input
              type="time"
              className="h-8 flex-1 rounded-md border border-input bg-card px-1.5 text-xs"
              value={slotEnd}
              onChange={(e) => setSlotEnd(e.target.value)}
            />
            <Button type="submit" size="icon-sm" title="Agregar franja bloqueada">
              <Plus className="size-3.5" />
            </Button>
          </form>

          {constraints.blockedSlots.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {constraints.blockedSlots.map((slot, i) => (
                <Badge
                  key={`${slot.day}-${slot.startMinutes}-${slot.endMinutes}-${i}`}
                  variant="secondary"
                  className="gap-1 pr-1 text-[11px]"
                >
                  {slot.day.slice(0, 3)} {formatClock(slot.startMinutes)}–
                  {formatClock(slot.endMinutes)}
                  <button
                    type="button"
                    className="ml-0.5 cursor-pointer rounded-full p-0.5 hover:bg-slate-300"
                    onClick={() => onRemoveBlockedSlot(i)}
                  >
                    <X className="size-2.5" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
