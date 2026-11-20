import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { loadCourses } from '../shared/storage';
import type { Course } from '../shared/types';
import './popup.css';

function PopupApp() {
  const [courses, setCourses] = useState<Course[]>([]);

  useEffect(() => {
    void loadCourses().then(setCourses);
  }, []);

  const totalParallels = courses.reduce((sum, c) => sum + c.parallels.length, 0);

  const openPlanner = () => {
    chrome.runtime.sendMessage({ type: 'OPEN_PLANNER' });
    window.close();
  };

  const openAcademic = () => {
    chrome.tabs.create({
      url: 'https://www.academico.espol.edu.ec/UI/Registros/ConsultaPlanificacion.aspx',
    });
    window.close();
  };

  return (
    <div className="popup-root">
      <header className="popup-header">
        <span className="popup-logo">ESPOL Scheduler</span>
        <span className="popup-version">v0.1</span>
      </header>

      <div className="popup-stats">
        <div className="stat-box">
          <strong>{courses.length}</strong>
          <span>Materias</span>
        </div>
        <div className="stat-box">
          <strong>{totalParallels}</strong>
          <span>Paralelos</span>
        </div>
      </div>

      <div className="popup-actions">
        <button type="button" className="btn-primary" onClick={openPlanner}>
          Abrir Planificador de Horarios
        </button>
        <button type="button" className="btn-secondary" onClick={openAcademic}>
          Ir a Consulta de Planificación
        </button>
      </div>

      <p className="popup-hint">
        En Consulta de Planificación, marca las materias en la tabla y pulsa{' '}
        <strong>Extraer seleccionadas</strong>.
      </p>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PopupApp />
  </React.StrictMode>,
);
