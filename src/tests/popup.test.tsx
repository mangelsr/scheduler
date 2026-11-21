import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SAMPLE_COURSES } from '../shared/sampleData';

describe('PopupApp', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<div id="root"></div>';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('renders saved course and parallel counts and triggers planner/academic actions with chrome API', async () => {
    localStorage.setItem('espol_scheduler_courses_v1', JSON.stringify(SAMPLE_COURSES.slice(0, 2)));
    const sendMessage = vi.fn().mockResolvedValue({ ok: true });
    const tabsCreate = vi.fn();
    const closeSpy = vi.spyOn(window, 'close').mockImplementation(() => {});

    vi.stubGlobal('chrome', {
      runtime: { sendMessage },
      tabs: { create: tabsCreate },
    });

    vi.resetModules();
    await import('../popup/main');

    await waitFor(() => {
      expect(screen.getByText('2')).toBeTruthy();
    });
    const expectedParallels = SAMPLE_COURSES.slice(0, 2).reduce(
      (sum, c) => sum + c.parallels.length,
      0,
    );
    expect(screen.getByText(String(expectedParallels))).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Abrir Planificador de Horarios/i }));
    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({ type: 'OPEN_PLANNER' });
      expect(closeSpy).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole('button', { name: /Ir a Consulta de Planificación/i }));
    expect(tabsCreate).toHaveBeenCalledWith({
      url: 'https://www.academico.espol.edu.ec/UI/Registros/ConsultaPlanificacion.aspx',
    });
  });

  it('falls back to window.open when chrome.tabs is unavailable', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    vi.resetModules();
    await import('../popup/main');

    const btn = await screen.findByRole('button', { name: /Ir a Consulta de Planificación/i });
    fireEvent.click(btn);
    expect(openSpy).toHaveBeenCalledWith(
      'https://www.academico.espol.edu.ec/UI/Registros/ConsultaPlanificacion.aspx',
      '_blank',
      'noopener,noreferrer',
    );
  });
});
