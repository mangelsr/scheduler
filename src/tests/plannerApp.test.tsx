import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../planner/App';
import { SAMPLE_COURSES } from '../shared/sampleData';

describe('Planner App integration', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('loads sample courses, exports/imports JSON, switches between manual and auto modes, and copies/prints', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    const createObjectURL = vi.fn(() => 'blob:mock-url');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const { container } = render(<App />);

    // Load sample data
    fireEvent.click(screen.getByRole('button', { name: /Cargar ejemplo/i }));
    await waitFor(() => {
      expect(screen.getByText('Datos de ejemplo cargados (4 materias).')).toBeTruthy();
    });

    // Export JSON
    fireEvent.click(screen.getByRole('button', { name: /Exportar JSON/i }));
    expect(createObjectURL).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');

    // Import invalid JSON, empty JSON array, and valid JSON
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const makeJsonFile = (name: string, content: string) => {
      const f = new File([content], name, { type: 'application/json' });
      Object.defineProperty(f, 'text', { value: async () => content });
      return f;
    };

    fireEvent.change(fileInput, {
      target: { files: [makeJsonFile('bad.json', '{not json')] },
    });
    await waitFor(() => {
      expect(screen.getByText('No se pudo leer el archivo JSON.')).toBeTruthy();
    });

    fireEvent.change(fileInput, {
      target: { files: [makeJsonFile('empty.json', '[]')] },
    });
    await waitFor(() => {
      expect(screen.getByText('El archivo JSON no contiene materias.')).toBeTruthy();
    });

    fireEvent.change(fileInput, {
      target: { files: [makeJsonFile('schema-err.json', '{"a":1}')] },
    });
    await waitFor(() => {
      expect(screen.getByText('El archivo JSON debe contener un arreglo de materias.')).toBeTruthy();
    });

    fireEvent.change(fileInput, {
      target: { files: [makeJsonFile('valid.json', JSON.stringify([SAMPLE_COURSES[0]]))] },
    });
    await waitFor(() => {
      expect(screen.getByText('Importadas 1 materia(s) correctamente.')).toBeTruthy();
    });

    // Pick a manual parallel and test exam view + copy + print
    const optionButtons = Array.from(container.querySelectorAll('aside button')).filter((b) =>
      b.textContent?.includes('Prác. 101'),
    );
    fireEvent.click(optionButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/Horario Manual \(1 materia\(s\)\)/i)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /Copiar resumen/i }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalled();
      expect(screen.getByText('Resumen copiado al portapapeles.')).toBeTruthy();
    });

    // Clipboard rejection branch
    writeText.mockRejectedValueOnce(new Error('denied'));
    fireEvent.click(screen.getByRole('button', { name: /Copiar resumen/i }));
    await waitFor(() => {
      expect(screen.getByText('No se pudo copiar al portapapeles.')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /Imprimir \/ PDF/i }));
    expect(printSpy).toHaveBeenCalled();

    // Switch to exam schedule tab in manual mode
    const examsTab = screen.getByRole('tab', { name: /Horario de exámenes/i });
    fireEvent.mouseDown(examsTab);
    fireEvent.click(examsTab);
    expect(screen.getByText(/Semana de/i)).toBeTruthy();

    // Auto-complete from manual -> switches to auto mode
    fireEvent.click(screen.getByRole('button', { name: /Auto-completar restantes/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Editar manualmente/i })).toBeTruthy();
    });

    // Keyboard navigation in auto mode (ignored on input, works on window)
    const timeInput = container.querySelector('input[type="time"]') as HTMLInputElement;
    fireEvent.keyDown(timeInput, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'ArrowLeft' });

    // Toggle schedule back to classes in auto mode
    const classesTab = screen.getByRole('tab', { name: /Horario de clases/i });
    fireEvent.mouseDown(classesTab);
    fireEvent.click(classesTab);

    // Apply auto option back to manual
    fireEvent.click(screen.getByRole('button', { name: /Editar manualmente/i }));
    await waitFor(() => {
      expect(screen.getByText(/cargada en Armado Manual para editar/i)).toBeTruthy();
    });
  });

  it('refreshes seats and handles clearing all courses', async () => {
    const oneParallelCourse = {
      ...SAMPLE_COURSES[0],
      parallels: [SAMPLE_COURSES[0].parallels[0]],
    };
    localStorage.setItem('espol_scheduler_courses_v1', JSON.stringify([oneParallelCourse]));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        url: 'https://www.academico.espol.edu.ec/login.aspx',
        text: async () => '<title>Login</title>',
      }),
    );

    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('DING2040')).toBeTruthy();
    });

    // Refresh seats (hits authError path)
    fireEvent.click(screen.getByRole('button', { name: /Actualizar cupos/i }));
    await waitFor(() => {
      expect(screen.getByText(/sesión expirada en ESPOL Académico/i)).toBeTruthy();
    });

    // Clear all courses (2-click confirm)
    fireEvent.click(screen.getByRole('button', { name: /Limpiar/i }));
    fireEvent.click(screen.getByRole('button', { name: /¿Confirmar\?/i }));
    await waitFor(() => {
      expect(screen.getByText('Catálogo limpiado.')).toBeTruthy();
    });
  });

  it('handles auto mode empty states and planner entrypoint main.tsx', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    localStorage.setItem('espol_scheduler_courses_v1', JSON.stringify([SAMPLE_COURSES[0]]));
    localStorage.setItem(
      'espol_scheduler_constraints_v1',
      JSON.stringify({ selectedCourseCodes: [] }),
    );

    await import('../planner/main');

    await waitFor(() => {
      expect(screen.getByText('DING2040')).toBeTruthy();
    });

    // Switch to Recomendaciones tab
    const autoTab = screen.getByRole('tab', { name: /Recomendaciones/i });
    fireEvent.mouseDown(autoTab);
    fireEvent.click(autoTab);

    // Block Lunes and Martes so both P1 (Lun) and P2 (Mar) are excluded -> "Sin combinaciones posibles"
    fireEvent.click(screen.getByRole('button', { name: 'Lun' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mar' }));
    await waitFor(() => {
      expect(screen.getByText('Sin combinaciones posibles')).toBeTruthy();
    });
  });
});
