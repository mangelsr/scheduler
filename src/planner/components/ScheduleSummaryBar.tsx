import { ArrowLeft, ArrowRight, Copy, Printer, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { GeneratedSchedule, ScheduleMetrics } from '../../shared/types';
import { formatClock, formatMinutesAsDuration } from '../utils';

interface ManualSummaryBarProps {
  selectedCount: number;
  totalCoursesCount: number;
  metrics: ScheduleMetrics;
  classConflictsCount: number;
  onAutoComplete: () => void;
  onCopySummary: () => void;
  onPrint: () => void;
}

export function ManualSummaryBar({
  selectedCount,
  totalCoursesCount,
  metrics,
  classConflictsCount,
  onAutoComplete,
  onCopySummary,
  onPrint,
}: ManualSummaryBarProps) {
  const totalConflicts = classConflictsCount + metrics.examConflicts.length;

  return (
    <Card className="no-print gap-0 py-0 shadow-xs">
      <CardContent className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <strong className="text-sm font-bold text-espol-navy">
            Horario Manual ({selectedCount} materia(s))
          </strong>
          {totalCoursesCount > selectedCount && (
            <Button size="sm" onClick={onAutoComplete}>
              <Sparkles className="size-3.5" />
              Auto-completar restantes
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary" className="px-2.5 py-1 text-xs">
            Clases:{' '}
            <strong className="ml-1">{formatMinutesAsDuration(metrics.totalWeeklyMinutes)}</strong>
          </Badge>
          <Badge variant="secondary" className="px-2.5 py-1 text-xs">
            Huecos:{' '}
            <strong className="ml-1">{formatMinutesAsDuration(metrics.totalGapMinutes)}</strong>
          </Badge>
          <Badge variant="secondary" className="px-2.5 py-1 text-xs">
            Días libres: <strong className="ml-1">{metrics.freeDaysCount}</strong>
          </Badge>
          {metrics.transitions.length > 0 && (
            <Badge
              className={cn(
                'px-2.5 py-1 text-xs',
                metrics.tightTransitionsCount > 0
                  ? 'border-amber-300 bg-amber-100 text-amber-950'
                  : 'border-slate-200 bg-secondary text-secondary-foreground',
              )}
            >
              {metrics.tightTransitionsCount > 0 ? (
                <>
                  Traslados ajustados: <strong className="ml-1">{metrics.tightTransitionsCount}</strong>
                </>
              ) : (
                <>
                  Traslado máx.:{' '}
                  <strong className="ml-1">
                    {metrics.maxTransitionWalkMeters >= 1000
                      ? `${(metrics.maxTransitionWalkMeters / 1000).toFixed(1)} km`
                      : `${metrics.maxTransitionWalkMeters} m`}
                  </strong>
                </>
              )}
            </Badge>
          )}
          {selectedCount > 0 && (
            <Badge
              className={cn(
                'px-2.5 py-1 text-xs',
                totalConflicts === 0
                  ? 'border-emerald-200 bg-emerald-100 text-emerald-900'
                  : 'border-red-200 bg-red-100 text-red-900',
              )}
            >
              Choques: <strong className="ml-1">{totalConflicts}</strong>
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={selectedCount === 0} onClick={onCopySummary}>
            <Copy className="size-3.5" />
            Copiar resumen
          </Button>
          <Button variant="outline" size="sm" onClick={onPrint}>
            <Printer className="size-3.5" />
            Imprimir / PDF
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

interface AutoSummaryBarProps {
  activeIndex: number;
  totalCount: number;
  truncated: boolean;
  schedule: GeneratedSchedule | null;
  onPrev: () => void;
  onNext: () => void;
  onApplyToManual: () => void;
  onCopySummary: () => void;
  onPrint: () => void;
}

export function AutoSummaryBar({
  activeIndex,
  totalCount,
  truncated,
  schedule,
  onPrev,
  onNext,
  onApplyToManual,
  onCopySummary,
  onPrint,
}: AutoSummaryBarProps) {
  return (
    <Card className="no-print gap-0 py-0 shadow-xs">
      <CardContent className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <Button size="sm" disabled={activeIndex === 0} onClick={onPrev}>
            <ArrowLeft className="size-3.5" />
            Anterior
          </Button>
          <span className="text-xs text-slate-700">
            Opción <strong>{activeIndex + 1}</strong> de <strong>{totalCount}</strong>
            {truncated ? '+' : ''}
          </span>
          <Button size="sm" disabled={activeIndex >= totalCount - 1} onClick={onNext}>
            Siguiente
            <ArrowRight className="size-3.5" />
          </Button>
        </div>

        {schedule && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="px-2.5 py-1 text-xs">
              Clases:{' '}
              <strong className="ml-1">
                {formatMinutesAsDuration(schedule.metrics.totalWeeklyMinutes)}
              </strong>
            </Badge>
            <Badge variant="secondary" className="px-2.5 py-1 text-xs">
              Huecos:{' '}
              <strong className="ml-1">
                {formatMinutesAsDuration(schedule.metrics.totalGapMinutes)}
              </strong>
            </Badge>
            <Badge variant="secondary" className="px-2.5 py-1 text-xs">
              Días libres: <strong className="ml-1">{schedule.metrics.freeDaysCount}</strong>
            </Badge>
            <Badge variant="secondary" className="px-2.5 py-1 text-xs">
              Jornada:{' '}
              <strong className="ml-1">
                {formatClock(schedule.metrics.earliestStartMinutes)}–
                {formatClock(schedule.metrics.latestEndMinutes)}
              </strong>
            </Badge>
            <Badge
              className={cn(
                'px-2.5 py-1 text-xs',
                schedule.metrics.minAvailableSeats > 0
                  ? 'border-emerald-200 bg-emerald-100 text-emerald-900'
                  : 'border-red-200 bg-red-100 text-red-900',
              )}
            >
              Cupo mín.: <strong className="ml-1">{schedule.metrics.minAvailableSeats}</strong>
            </Badge>
            {schedule.metrics.transitions.length > 0 && (
              <Badge
                className={cn(
                  'px-2.5 py-1 text-xs',
                  schedule.metrics.tightTransitionsCount > 0
                    ? 'border-amber-300 bg-amber-100 text-amber-950'
                    : 'border-slate-200 bg-secondary text-secondary-foreground',
                )}
              >
                {schedule.metrics.tightTransitionsCount > 0 ? (
                  <>
                    Traslados ajustados:{' '}
                    <strong className="ml-1">{schedule.metrics.tightTransitionsCount}</strong>
                  </>
                ) : (
                  <>
                    Traslado máx.:{' '}
                    <strong className="ml-1">
                      {schedule.metrics.maxTransitionWalkMeters >= 1000
                        ? `${(schedule.metrics.maxTransitionWalkMeters / 1000).toFixed(1)} km`
                        : `${schedule.metrics.maxTransitionWalkMeters} m`}
                    </strong>
                  </>
                )}
              </Badge>
            )}
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className="bg-espol-gold font-semibold text-espol-navy hover:bg-espol-gold/90"
            onClick={onApplyToManual}
          >
            Editar manualmente
          </Button>
          <Button variant="outline" size="sm" disabled={!schedule} onClick={onCopySummary}>
            <Copy className="size-3.5" />
            Copiar resumen
          </Button>
          <Button variant="outline" size="sm" onClick={onPrint}>
            <Printer className="size-3.5" />
            Imprimir / PDF
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
