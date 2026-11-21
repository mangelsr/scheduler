import React, { useEffect, useState } from 'react';
import { Calendar, ExternalLink } from 'lucide-react';
import { createRoot } from 'react-dom/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import '../index.css';
import { requestOpenPlanner } from '../shared/messages';
import { loadCourses, subscribeCoursesChanged } from '../shared/storage';
import type { Course } from '../shared/types';

function PopupApp() {
  const [courses, setCourses] = useState<Course[]>([]);

  useEffect(() => {
    void loadCourses().then(setCourses);
    return subscribeCoursesChanged(setCourses);
  }, []);

  const totalParallels = courses.reduce((sum, c) => sum + c.parallels.length, 0);

  const openPlanner = async () => {
    await requestOpenPlanner();
    window.close();
  };

  const openAcademic = () => {
    const url = 'https://www.academico.espol.edu.ec/UI/Registros/ConsultaPlanificacion.aspx';
    if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
      chrome.tabs.create({ url });
      window.close();
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="flex w-[320px] flex-col bg-background text-foreground">
      <header className="flex items-center justify-between border-b-[3px] border-espol-gold bg-espol-navy px-3.5 py-2.5 text-white shadow-xs">
        <div className="flex items-center gap-2">
          <span className="rounded bg-espol-gold px-2 py-0.5 text-[11px] font-extrabold tracking-wide text-espol-navy">
            ESPOL
          </span>
          <span className="text-sm font-bold tracking-tight">Scheduler</span>
        </div>
        <Badge className="border-white/20 bg-white/15 px-2 py-0 text-[10px] font-semibold text-espol-gold-soft">
          v0.1.0
        </Badge>
      </header>

      <div className="flex flex-col gap-3 p-3.5">
        <div className="grid grid-cols-2 gap-2.5">
          <Card className="gap-0 py-2.5 text-center shadow-2xs">
            <CardContent className="flex flex-col items-center px-2">
              <strong className="text-xl leading-tight font-extrabold text-espol-navy">
                {courses.length}
              </strong>
              <span className="text-[11px] font-medium text-muted-foreground">Materias</span>
            </CardContent>
          </Card>
          <Card className="gap-0 py-2.5 text-center shadow-2xs">
            <CardContent className="flex flex-col items-center px-2">
              <strong className="text-xl leading-tight font-extrabold text-espol-navy">
                {totalParallels}
              </strong>
              <span className="text-[11px] font-medium text-muted-foreground">Paralelos</span>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-2">
          <Button
            type="button"
            className="w-full bg-espol-navy font-semibold text-white hover:bg-espol-navy-hover"
            onClick={() => void openPlanner()}
          >
            <Calendar className="size-4" />
            Abrir Planificador de Horarios
          </Button>
          <Button type="button" variant="outline" className="w-full" onClick={openAcademic}>
            <ExternalLink className="size-3.5" />
            Ir a Consulta de Planificación
          </Button>
        </div>

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          En Consulta de Planificación, marca las materias en la tabla y pulsa{' '}
          <strong className="text-foreground">Extraer seleccionadas</strong>.
        </p>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PopupApp />
  </React.StrictMode>,
);
