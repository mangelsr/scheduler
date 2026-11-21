import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ACADEMIC_REQUEST_DELAY_RANGE_MS,
  fetchPlannedParallel,
  getAcademicRequestDelayMs,
  looksLikeLoginPage,
} from '../shared/academicClient';

describe('academicClient', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('detects login redirects by URL or HTML title', () => {
    expect(
      looksLikeLoginPage('https://www.academico.espol.edu.ec/Login.aspx', '<html></html>'),
    ).toBe(true);
    expect(
      looksLikeLoginPage(
        'https://www.academico.espol.edu.ec/UI/Registros/MateriaPlanificada.aspx',
        '<html><head><title>Iniciar Sesión - ESPOL</title></head></html>',
      ),
    ).toBe(true);
    expect(
      looksLikeLoginPage(
        'https://www.academico.espol.edu.ec/UI/Registros/MateriaPlanificada.aspx',
        '<html><head><title>Materia Planificada</title></head></html>',
      ),
    ).toBe(false);
  });

  it('reports login_redirect when fetch redirects to login', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        url: 'https://www.academico.espol.edu.ec/login.aspx',
        text: async () => '<html><title>Login</title></html>',
      }),
    );

    const res = await fetchPlannedParallel(
      'https://www.academico.espol.edu.ec/UI/Registros/MateriaPlanificada.aspx?idCurso=1',
    );
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('login_redirect');
  });

  it('parses valid planned course HTML cleanly', async () => {
    const validHtml = `
      <html>
        <head><title>Materia</title></head>
        <body>
          <span id="ctl00_contenido_lbltexto">PAO 2026-2</span>
          <span id="ctl00_contenido_LabelNombreMateria">FISICA I</span>
          <span id="ctl00_contenido_LabelParalelo">2</span>
          <span id="ctl00_contenido_LabelCupo">40</span>
          <span id="ctl00_contenido_LabelDisponible">12</span>
          <table id="ctl00_contenido_TableHorarios">
            <tbody><tr><td>Lunes</td><td>07:00:00</td><td>09:00:00</td><td>A1</td><td>B1</td></tr></tbody>
          </table>
        </body>
      </html>
    `;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        url: 'https://www.academico.espol.edu.ec/UI/Registros/MateriaPlanificada.aspx?idCurso=10',
        text: async () => validHtml,
      }),
    );

    const res = await fetchPlannedParallel(
      'https://www.academico.espol.edu.ec/UI/Registros/MateriaPlanificada.aspx?idCurso=10',
    );
    expect(res.ok).toBe(true);
    expect(res.courseName).toBe('FISICA I');
    expect(res.parallel?.parallelNumber).toBe('2');
    expect(res.parallel?.available).toBe(12);
    expect(res.parallel?.sessions).toHaveLength(1);
  });

  it('generates randomized request delays within the configured human-like range', () => {
    for (let i = 0; i < 50; i++) {
      const delay = getAcademicRequestDelayMs();
      expect(Number.isInteger(delay)).toBe(true);
      expect(delay).toBeGreaterThanOrEqual(ACADEMIC_REQUEST_DELAY_RANGE_MS.min);
      expect(delay).toBeLessThanOrEqual(ACADEMIC_REQUEST_DELAY_RANGE_MS.max);
    }
  });
});
