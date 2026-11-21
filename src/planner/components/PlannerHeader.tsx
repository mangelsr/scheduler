import React, { useEffect, useRef, useState } from 'react';
import { Calendar, Download, FileText, RefreshCw, Sparkles, Trash2, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

export type PlannerMode = 'manual' | 'auto';

interface PlannerHeaderProps {
  mode: PlannerMode;
  onModeChange: (mode: PlannerMode) => void;
  coursesCount: number;
  manualCount: number;
  statusMessage: string;
  refreshingSeats: boolean;
  onLoadSample: () => void;
  onImportJson: (file: File) => void;
  onExportJson: () => void;
  onRefreshSeats: () => void;
  onClearAll: () => void;
}

export function PlannerHeader({
  mode,
  onModeChange,
  coursesCount,
  manualCount,
  statusMessage,
  refreshingSeats,
  onLoadSample,
  onImportJson,
  onExportJson,
  onRefreshSeats,
  onClearAll,
}: PlannerHeaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    if (!confirmClear) return;
    const timer = window.setTimeout(() => setConfirmClear(false), 4000);
    return () => window.clearTimeout(timer);
  }, [confirmClear]);

  useEffect(() => {
    if (coursesCount === 0) setConfirmClear(false);
  }, [coursesCount]);

  const handleClearClick = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    setConfirmClear(false);
    onClearAll();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onImportJson(file);
    e.target.value = '';
  };

  return (
    <header className="no-print flex shrink-0 flex-wrap items-center justify-between gap-3 border-b-[3px] border-espol-gold bg-espol-navy px-5 py-2.5 text-white shadow-sm">
      <div className="flex flex-wrap items-center gap-3.5">
        <div className="flex items-center gap-2.5">
          <span className="rounded-md bg-espol-gold px-2.5 py-1 text-xs font-extrabold tracking-wide text-espol-navy">
            ESPOL
          </span>
          <div>
            <h1 className="text-base leading-tight font-bold text-white">
              Académico · Planificador de Horarios
            </h1>
            <p className="text-[11px] text-slate-300">
              {coursesCount} materia(s) extraída(s) · {manualCount} en horario manual
            </p>
          </div>
        </div>

        <Tabs value={mode} onValueChange={(v) => onModeChange(v as PlannerMode)} className="ml-1">
          <TabsList className="h-8 border border-white/15 bg-white/15 p-0.5 text-slate-100">
            <TabsTrigger
              value="manual"
              className="h-7 px-3 text-xs font-semibold text-slate-100 hover:bg-white/10 hover:text-white data-[state=active]:bg-espol-gold data-[state=active]:font-bold data-[state=active]:text-espol-navy"
            >
              <Calendar className="size-3.5" />
              Armado Manual
            </TabsTrigger>
            <TabsTrigger
              value="auto"
              className="h-7 px-3 text-xs font-semibold text-slate-100 hover:bg-white/10 hover:text-white data-[state=active]:bg-espol-gold data-[state=active]:font-bold data-[state=active]:text-espol-navy"
            >
              <Sparkles className="size-3.5" />
              Recomendaciones
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {statusMessage && (
          <Badge className="border-white/20 bg-white/15 px-2.5 py-1 text-[11px] text-espol-gold-soft">
            {statusMessage}
          </Badge>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="border border-white/15 bg-white/10 text-white hover:bg-white/20 hover:text-white"
          onClick={onLoadSample}
        >
          <FileText className="size-3.5" />
          Cargar ejemplo
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="border border-white/15 bg-white/10 text-white hover:bg-white/20 hover:text-white"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="size-3.5" />
          Importar JSON
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          hidden
          onChange={handleFileChange}
        />
        <Button
          variant="ghost"
          size="sm"
          className="border border-white/15 bg-white/10 text-white hover:bg-white/20 hover:text-white"
          disabled={coursesCount === 0}
          onClick={onExportJson}
        >
          <Download className="size-3.5" />
          Exportar JSON
        </Button>
        <Button
          size="sm"
          className="bg-espol-gold font-semibold text-espol-navy hover:bg-espol-gold/90"
          disabled={refreshingSeats || coursesCount === 0}
          onClick={onRefreshSeats}
        >
          <RefreshCw className={cn('size-3.5', refreshingSeats && 'animate-spin')} />
          {refreshingSeats ? 'Actualizando...' : 'Actualizar cupos'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'border text-white hover:text-white',
            confirmClear
              ? 'border-red-200 bg-red-600 font-semibold hover:bg-red-700'
              : 'border-red-300/35 bg-red-600/30 hover:bg-red-600/50',
          )}
          disabled={coursesCount === 0}
          title={
            confirmClear
              ? 'Haz clic de nuevo para confirmar el borrado completo'
              : 'Limpiar todas las materias guardadas'
          }
          onClick={handleClearClick}
          onBlur={() => setConfirmClear(false)}
        >
          <Trash2 className="size-3.5" />
          {confirmClear ? '¿Confirmar?' : 'Limpiar'}
        </Button>
      </div>
    </header>
  );
}
