import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SAMPLE_COURSES } from '../shared/sampleData';

const VALID_DETAIL_HTML = `
  <html>
    <head><title>Materia</title></head>
    <body>
      <span id="ctl00_contenido_lbltexto">PAO 2026-2</span>
      <span id="ctl00_contenido_LabelNombreMateria">TALLER DE DISEÑO II</span>
      <span id="ctl00_contenido_LabelParalelo">1</span>
      <span id="ctl00_contenido_LabelProfesor">PROF TEST</span>
      <span id="ctl00_contenido_modo_curso">MODALIDAD PRESENCIAL</span>
      <span id="ctl00_contenido_LabelCupo">30</span>
      <span id="ctl00_contenido_LabelDisponible">5</span>
      <table id="ctl00_contenido_TableHorarios">
        <tbody><tr><td>Lunes</td><td>09:00:00</td><td>11:00:00</td><td>A1</td><td>3M CAMPUS GUSTAVO GALINDO</td></tr></tbody>
      </table>
    </body>
  </html>
`;

const SEARCH_PAGE_HTML = `
  <div class="dataTables_wrapper">
    <table id="ctl00_contenido_tbHorarios">
      <thead><tr><th>Código</th><th>Materia</th><th>Paralelos</th></tr></thead>
      <tbody>
        <tr>
          <td>DING2040</td>
          <td>TALLER DE DISEÑO II</td>
          <td>
            <a class="myLink" href="MateriaPlanificada.aspx?idMateria=7116&numeroParalelo=1&p=606&idCurso=181217">[1]</a>
          </td>
        </tr>
        <tr>
          <td>BAD100</td>
          <td>SIN PARALELOS</td>
          <td></td>
        </tr>
      </tbody>
    </table>
  </div>
`;

describe('content script', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
    window.history.replaceState({}, '', '/');
  });

  it('enhances search table, handles selection, logs, planner open, extraction, and MutationObserver', async () => {
    localStorage.setItem('espol_scheduler_courses_v1', JSON.stringify([SAMPLE_COURSES[0]]));
    window.history.replaceState({}, '', '/UI/Registros/ConsultaPlanificacion.aspx');
    document.body.innerHTML = SEARCH_PAGE_HTML;

    const sendMessage = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: 'Tab error' })
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        url: 'https://www.academico.espol.edu.ec/UI/Registros/MateriaPlanificada.aspx?idMateria=7116&numeroParalelo=1&p=606&idCurso=181217',
        text: async () => VALID_DETAIL_HTML,
      }),
    );

    vi.resetModules();
    await import('../content/index');
    await vi.waitFor(() => {
      expect(document.getElementById('espol-sched-toolbar')).not.toBeNull();
    });

    // Saved badge is rendered on DING2040
    expect(document.querySelector('.espol-sched-badge')?.textContent).toContain('Guardada');

    // Toggle logs button
    const logsBtn = document.querySelector<HTMLButtonElement>('[data-action="toggle-logs"]')!;
    const logEl = document.getElementById('espol-sched-log')!;
    expect(logEl.hidden).toBe(true);
    logsBtn.click();
    expect(logEl.hidden).toBe(false);
    logsBtn.click();
    expect(logEl.hidden).toBe(true);

    // Open planner (first failure triggers error log & reveals logs, second succeeds)
    const openBtn = document.querySelector<HTMLButtonElement>('[data-action="open-planner"]')!;
    openBtn.click();
    await vi.waitFor(() => {
      expect(logEl.textContent).toContain('Tab error');
    });
    openBtn.click();

    // Selecting row with no parallels unchecks itself and logs error
    const badCheckbox = document.querySelector<HTMLInputElement>(
      'input[data-course-code="BAD100"]',
    )!;
    badCheckbox.checked = true;
    badCheckbox.dispatchEvent(new Event('change'));
    expect(badCheckbox.checked).toBe(false);
    expect(logEl.textContent).toContain('no tiene paralelos extraíbles');

    // Select all visible, then deselect all, then check single row
    const selectAllBtn = document.querySelector<HTMLButtonElement>('[data-action="select-all"]')!;
    selectAllBtn.click();
    const dingCheckbox = document.querySelector<HTMLInputElement>(
      'input[data-course-code="DING2040"]',
    )!;
    expect(dingCheckbox.checked).toBe(true);
    selectAllBtn.click();
    expect(dingCheckbox.checked).toBe(false);

    // Check DING2040 manually and extract
    dingCheckbox.checked = true;
    dingCheckbox.dispatchEvent(new Event('change'));
    expect(document.querySelector('.espol-sched-status')?.textContent).toContain('1 seleccionada');

    const extractBtn = document.querySelector<HTMLButtonElement>(
      '[data-action="extract-selected"]',
    )!;
    extractBtn.click();

    await vi.waitFor(() => {
      expect(document.querySelector('.espol-sched-status')?.textContent).toContain('Listo: 1 materia(s)');
    });

    // Mutate tbody to trigger MutationObserver (remove saved course badge check & empty row check)
    localStorage.removeItem('espol_scheduler_courses_v1');
    const tbody = document.querySelector('#ctl00_contenido_tbHorarios tbody')!;
    const emptyTr = document.createElement('tr');
    emptyTr.innerHTML = '<td colspan="3" class="dataTables_empty">Empty</td>';
    tbody.appendChild(emptyTr);

    await new Promise((r) => setTimeout(r, 20));
    expect(document.querySelectorAll('.espol-sched-checkbox').length).toBeGreaterThanOrEqual(2);
  });

  it('handles failed parallel extraction cleanly', async () => {
    window.history.replaceState({}, '', '/UI/Registros/ConsultaPlanificacion.aspx');
    document.body.innerHTML = SEARCH_PAGE_HTML;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        url: 'https://www.academico.espol.edu.ec/err',
      }),
    );

    vi.resetModules();
    await import('../content/index');
    await vi.waitFor(() => {
      expect(document.getElementById('espol-sched-toolbar')).not.toBeNull();
    });

    document.querySelector<HTMLButtonElement>('[data-action="select-all"]')!.click();
    document.querySelector<HTMLButtonElement>('[data-action="extract-selected"]')!.click();

    await vi.waitFor(() => {
      expect(document.querySelector('.espol-sched-status')?.textContent).toContain(
        '1 paralelo(s) fallaron',
      );
    });
  });

  it('injects single-parallel floating widget on MateriaPlanificada.aspx and saves parallel', async () => {
    localStorage.setItem('espol_scheduler_courses_v1', JSON.stringify([SAMPLE_COURSES[0]]));
    window.history.replaceState(
      {},
      '',
      '/UI/Registros/MateriaPlanificada.aspx?idMateria=7116&numeroParalelo=3&p=606&idCurso=181999',
    );
    document.body.innerHTML = VALID_DETAIL_HTML;
    vi.stubGlobal('chrome', {
      runtime: { sendMessage: vi.fn().mockResolvedValue({ ok: true }) },
    });

    vi.resetModules();
    await import('../content/index');
    await vi.waitFor(() => {
      expect(document.getElementById('espol-sched-single-widget')).not.toBeNull();
    });

    const saveBtn = document.querySelector<HTMLButtonElement>('[data-action="save-single"]')!;
    const codeInput = document.querySelector<HTMLInputElement>('[data-role="code-input"]')!;
    codeInput.value = 'ding2040';
    saveBtn.click();

    await vi.waitFor(() => {
      expect(saveBtn.textContent).toContain('Guardado (DING2040 P1)');
    });

    // Also test empty input fallback matching by idMateria / MAT- prefix
    codeInput.value = '';
    saveBtn.click();
    await vi.waitFor(() => {
      expect(saveBtn.textContent).toContain('Guardado (');
    });

    document.querySelector<HTMLButtonElement>('#espol-sched-single-widget [data-action="open-planner"]')!.click();
  });
});
