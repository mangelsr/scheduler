import { AlertTriangle, ExternalLink, Footprints } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ESPOL_MY_MAPS_BASE_URL, getGoogleMapsBlockUrl } from '../../shared/campusMap';
import type { CampusTransition } from '../../shared/types';
import { formatMinutesAsDuration } from '../utils';

interface CampusTransitionsCardProps {
  transitions: CampusTransition[];
}

function formatMeters(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }
  return `${meters} m`;
}

export function CampusTransitionsCard({ transitions }: CampusTransitionsCardProps) {
  if (transitions.length === 0) return null;

  const tightCount = transitions.filter((t) => t.severity === 'tight').length;
  const sorted = [...transitions].sort((a, b) => {
    const rank = { tight: 0, moderate: 1, ok: 2 };
    return rank[a.severity] - rank[b.severity] || b.walkMeters - a.walkMeters;
  });

  return (
    <Card className="print-break-inside-avoid gap-2 py-3.5 shadow-xs print:shadow-none">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 px-4 py-0">
        <CardTitle className="flex items-center gap-2 text-sm font-bold text-espol-navy">
          <Footprints className="size-4" />
          Distancias y traslados entre bloques
          {tightCount > 0 && (
            <Badge className="border-red-200 bg-red-100 px-2 py-0 text-[10px] font-semibold text-red-900">
              {tightCount} traslado(s) ajustado(s)
            </Badge>
          )}
        </CardTitle>
        <a
          href={ESPOL_MY_MAPS_BASE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="no-print inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline"
        >
          Mapa ESPOL
          <ExternalLink className="size-3" />
        </a>
      </CardHeader>
      <CardContent className="px-4 pt-1">
        <div className="flex flex-col gap-1.5">
          {sorted.map((t, idx) => (
            <div
              key={`${t.day}-${t.fromCourseCode}-${t.toCourseCode}-${t.fromEndTime}-${idx}`}
              className={cn(
                'flex flex-wrap items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-xs',
                t.severity === 'tight'
                  ? 'border-red-300 bg-red-50/70 text-red-950'
                  : t.severity === 'moderate'
                    ? 'border-amber-300 bg-amber-50/70 text-amber-950'
                    : 'border-border bg-slate-50/70 text-foreground',
              )}
            >
              <div className="flex flex-wrap items-center gap-1.5">
                {t.severity === 'tight' && (
                  <AlertTriangle className="size-3.5 shrink-0 text-red-600" />
                )}
                <span className="font-semibold text-espol-navy">{t.day.slice(0, 3)}</span>
                <span className="text-muted-foreground">
                  {t.fromEndTime} → {t.toStartTime} (hueco{' '}
                  <strong>{formatMinutesAsDuration(t.gapMinutes)}</strong>)
                </span>
                <span>·</span>
                <span>
                  <strong>{t.fromCourseCode}</strong> (
                  <a
                    href={getGoogleMapsBlockUrl(t.fromBlock)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-blue-700 underline-offset-2 hover:underline"
                    title={`Ubicar bloque ${t.fromBlock} en mapa ESPOL`}
                  >
                    {t.fromBlock}
                  </a>
                  ) → <strong>{t.toCourseCode}</strong> (
                  <a
                    href={getGoogleMapsBlockUrl(t.toBlock)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-blue-700 underline-offset-2 hover:underline"
                    title={`Ubicar bloque ${t.toBlock} en mapa ESPOL`}
                  >
                    {t.toBlock}
                  </a>
                  )
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium">
                  {t.walkMeters === 0
                    ? 'Mismo bloque (0 m)'
                    : `~${formatMeters(t.walkMeters)} · ~${t.walkMinutes} min a pie`}
                </span>
                <Badge
                  className={cn(
                    'px-1.5 py-0 text-[10px]',
                    t.severity === 'tight'
                      ? 'border-red-200 bg-red-100 text-red-900'
                      : t.severity === 'moderate'
                        ? 'border-amber-200 bg-amber-100 text-amber-900'
                        : 'border-emerald-200 bg-emerald-100 text-emerald-900',
                  )}
                >
                  {t.severity === 'tight'
                    ? 'Ajustado'
                    : t.severity === 'moderate'
                      ? 'Caminata larga'
                      : 'Cercano'}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
