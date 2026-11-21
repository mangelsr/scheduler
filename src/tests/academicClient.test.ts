import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ACADEMIC_REQUEST_DELAY_RANGE_MS,
  fetchPlannedParallel,
  getAcademicRequestDelayMs,
  looksLikeLoginPage,
  refreshCoursesSeats,
  sleep,
} from '../shared/academicClient';
import { SAMPLE_COURSES } from '../shared/sampleData';

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

  it('handles http errors, unexpected HTML, and network rejections in fetchPlannedParallel', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 503,
        url: 'https://www.academico.espol.edu.ec/error',
      }),
    );
    const httpErr = await fetchPlannedParallel('https://www.academico.espol.edu.ec/a');
    expect(httpErr.ok).toBe(false);
    expect(httpErr.reason).toBe('http_error');
    expect(httpErr.status).toBe(503);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        url: 'https://www.academico.espol.edu.ec/ok',
        text: async () => '<html><body><p>Empty</p></body></html>',
      }),
    );
    const unexpected = await fetchPlannedParallel('https://www.academico.espol.edu.ec/ok');
    expect(unexpected.ok).toBe(false);
    expect(unexpected.reason).toBe('unexpected_html');
    expect(unexpected.errorMessage).toContain('sin <title>');

    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('Failed to fetch')));
    const netErr = await fetchPlannedParallel('https://www.academico.espol.edu.ec/net');
    expect(netErr.ok).toBe(false);
    expect(netErr.reason).toBe('network_error');
    expect(netErr.errorMessage).toBe('Failed to fetch');

    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce('string error'));
    const strErr = await fetchPlannedParallel('https://www.academico.espol.edu.ec/str');
    expect(strErr.ok).toBe(false);
    expect(strErr.errorMessage).toBe('string error');
  });

  it('detects login via auth URLs and acceso titles, and sleeps for requested duration', async () => {
    expect(looksLikeLoginPage('https://auth.espol.edu.ec/cas', '<html></html>')).toBe(true);
    expect(
      looksLikeLoginPage('https://www.academico.espol.edu.ec/page', '<title>Acceso Denegado</title>'),
    ).toBe(true);

    vi.useFakeTimers();
    const p = sleep(25);
    await vi.advanceTimersByTimeAsync(25);
    await p;
    vi.useRealTimers();
  });

  it('refreshes seats across parallels with progress, delays, and auth/error tracking', async () => {
    const validHtml = `
      <html><head><title>Materia</title></head><body>
        <span id="ctl00_contenido_lbltexto">PAO 2026-3</span>
        <span id="ctl00_contenido_LabelNombreMateria">NUEVO NOMBRE</span>
        <span id="ctl00_contenido_LabelParalelo">1</span>
        <span id="ctl00_contenido_LabelCupo">45</span>
        <span id="ctl00_contenido_LabelDisponible">19</span>
        <table id="ctl00_contenido_TableHorarios">
          <tbody><tr><td>Lunes</td><td>07:00:00</td><td>09:00:00</td><td>A1</td><td>B1</td></tr></tbody>
        </table>
      </body></html>
    `;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        url: SAMPLE_COURSES[0].parallels[0].url,
        text: async () => validHtml,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        url: 'https://www.academico.espol.edu.ec/login.aspx',
        text: async () => '<html><title>Login</title></html>',
      });
    vi.stubGlobal('fetch', fetchMock);

    const progressEvents: number[] = [];
    const res = await refreshCoursesSeats(
      [SAMPLE_COURSES[0]],
      (prog) => progressEvents.push(prog.processed),
      1,
    );

    expect(progressEvents).toEqual([1, 2]);
    expect(res.updatedCount).toBe(1);
    expect(res.errorCount).toBe(1);
    expect(res.authError).toBe(true);
    expect(res.updatedCourses).toHaveLength(1);
    expect(res.updatedCourses[0].name).toBe('NUEVO NOMBRE');
    expect(res.updatedCourses[0].periodLabel).toBe('PAO 2026-3');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        url: 'https://www.academico.espol.edu.ec/err',
      }),
    );
    const allFail = await refreshCoursesSeats([SAMPLE_COURSES[0]], undefined, () => 0);
    expect(allFail.updatedCourses).toEqual([]);
    expect(allFail.updatedCount).toBe(0);
    expect(allFail.errorCount).toBe(2);
    expect(allFail.authError).toBe(false);
  });
});
