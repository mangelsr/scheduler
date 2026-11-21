import { parsePlannedCourseHtml, parseSearchTable } from '../shared/parser';
import { loadCourses, upsertCourses } from '../shared/storage';
import type { Course, SearchCourseRow, TheoreticalParallel } from '../shared/types';

const WRAP_ID = 'espol-sched-wrap';
const BAR_ID = 'espol-sched-toolbar';
const LOG_ID = 'espol-sched-log';
const COL_CLASS = 'espol-sched-col';
const REQUEST_DELAY_MS = 180;

const selectedRows = new Map<string, SearchCourseRow>();
let visibleRowMap = new Map<string, SearchCourseRow>();
let savedCourseMap = new Map<string, Course>();
let isExtracting = false;
let isSyncing = false;
let showLogs = false;
let tableObserver: MutationObserver | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function appendLog(text: string, level: 'info' | 'ok' | 'err' = 'info'): void {
  const stamp = new Date().toLocaleTimeString('es-EC', { hour12: false });
  const line = `[${stamp}] ${text}`;
  if (level === 'err') console.error('[ESPOL Scheduler]', line);
  else console.log('[ESPOL Scheduler]', line);

  const logEl = document.getElementById(LOG_ID);
  if (!logEl) return;

  const entry = document.createElement('div');
  if (level === 'err') entry.className = 'espol-sched-log-err';
  if (level === 'ok') entry.className = 'espol-sched-log-ok';
  entry.textContent = line;
  logEl.appendChild(entry);
  logEl.scrollTop = logEl.scrollHeight;

  if (level === 'err' && !showLogs) {
    showLogs = true;
    logEl.hidden = false;
  }
}

function openPlannerTab(): void {
  chrome.runtime.sendMessage({ type: 'OPEN_PLANNER' });
}

async function refreshSavedMap(): Promise<void> {
  const courses = await loadCourses();
  savedCourseMap = new Map(courses.map((c) => [c.code, c]));
}

function updateToolbarStatus(message?: string): void {
  const bar = document.getElementById(BAR_ID);
  if (!bar) return;

  const statusEl = bar.querySelector('.espol-sched-status');
  const extractBtn = bar.querySelector<HTMLButtonElement>('[data-action="extract-selected"]');
  const savedCountEl = bar.querySelector('[data-role="saved-count"]');

  if (savedCountEl) {
    savedCountEl.textContent = `${savedCourseMap.size} materia(s) guardada(s)`;
  }

  if (statusEl) {
    if (message) {
      statusEl.textContent = message;
    } else {
      statusEl.textContent =
        selectedRows.size > 0
          ? `${selectedRows.size} seleccionada(s) para extraer`
          : 'Marca las materias que quieras enviar al planificador';
    }
  }

  if (extractBtn) {
    extractBtn.disabled = isExtracting || selectedRows.size === 0;
  }
}

async function extractSelectedRows(): Promise<void> {
  if (isExtracting) return;

  const visibleRows = parseSearchTable(document, window.location.href);
  const visibleByCode = new Map(visibleRows.map((r) => [r.code, r]));
  for (const code of selectedRows.keys()) {
    const fresh = visibleByCode.get(code);
    if (fresh) selectedRows.set(code, fresh);
  }
  const targets = Array.from(selectedRows.values());

  appendLog(
    `Click en extraer: ${selectedRows.size} marcada(s), ${visibleRows.length} fila(s) visibles, ${targets.length} lista(s) para extraer.`,
  );

  if (targets.length === 0) {
    updateToolbarStatus('No se encontraron paralelos para las materias seleccionadas (revisa Logs).');
    appendLog('No hubo materias con paralelos válidos en selectedRows.', 'err');
    return;
  }

  isExtracting = true;
  updateToolbarStatus('Iniciando extracción...');

  const totalParallels = targets.reduce((sum, r) => sum + r.parallels.length, 0);
  let processed = 0;
  const extractedCourses: Course[] = [];
  let failedCount = 0;
  let finalStatusMessage = '';

  try {
    for (const row of targets) {
      const parsedParallels: TheoreticalParallel[] = [];
      let periodLabel = '';
      let courseName = row.name;

      for (const pRef of row.parallels) {
        processed++;
        updateToolbarStatus(
          `Extrayendo ${row.code} [${pRef.parallelNumber}] (${processed}/${totalParallels})...`,
        );
        appendLog(`GET ${row.code} P${pRef.parallelNumber} -> ${pRef.url}`);

        try {
          const res = await fetch(pRef.url, {
            credentials: 'include',
            redirect: 'follow',
          });
          appendLog(`HTTP ${res.status} (${res.url})`);

          if (!res.ok) {
            failedCount++;
            appendLog(`Error HTTP ${res.status} en ${row.code} P${pRef.parallelNumber}`, 'err');
            continue;
          }

          const html = await res.text();
          const parsed = parsePlannedCourseHtml(html, res.url || pRef.url);

          if (!parsed.courseName && parsed.parallel.sessions.length === 0) {
            const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
            const title = titleMatch ? titleMatch[1].trim() : 'sin <title>';
            appendLog(
              `HTML inesperado en ${row.code} P${pRef.parallelNumber} (título: "${title}", len: ${html.length})`,
              'err',
            );
            failedCount++;
            continue;
          }

          appendLog(
            `OK ${row.code} P${parsed.parallel.parallelNumber}: "${parsed.courseName}", ${parsed.parallel.sessions.length} sesión(es), ${parsed.parallel.practicals.length} práctico(s), cupo ${parsed.parallel.available}/${parsed.parallel.capacity}`,
            'ok',
          );

          if (parsed.periodLabel) periodLabel = parsed.periodLabel;
          if (parsed.courseName) courseName = parsed.courseName;
          parsedParallels.push(parsed.parallel);
        } catch (err) {
          failedCount++;
          appendLog(
            `Excepción en ${row.code} P${pRef.parallelNumber}: ${err instanceof Error ? err.message : String(err)}`,
            'err',
          );
        }

        if (processed < totalParallels) {
          await sleep(REQUEST_DELAY_MS);
        }
      }

      if (parsedParallels.length > 0) {
        extractedCourses.push({
          code: row.code,
          name: courseName,
          periodLabel,
          extractedAt: new Date().toISOString(),
          parallels: parsedParallels,
        });
      }
    }

    if (extractedCourses.length > 0) {
      const merged = await upsertCourses(extractedCourses);
      savedCourseMap = new Map(merged.map((c) => [c.code, c]));
      appendLog(`Guardado en storage: ${merged.length} materia(s) en total.`, 'ok');
    }

    selectedRows.clear();
    syncTableEnhancements();

    const suffix = failedCount > 0 ? ` (${failedCount} paralelo(s) fallaron)` : '';
    finalStatusMessage = `Listo: ${extractedCourses.length} materia(s) extraída(s)${suffix}.`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    appendLog(`Error general en extracción: ${msg}`, 'err');
    finalStatusMessage = `Error al extraer: ${msg}`;
  } finally {
    isExtracting = false;
    updateToolbarStatus(finalStatusMessage || undefined);
  }
}

function ensureToolbar(table: HTMLTableElement): void {
  let wrap = document.getElementById(WRAP_ID);
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = WRAP_ID;
    wrap.className = 'espol-sched-wrap';
    wrap.innerHTML = `
      <div id="${BAR_ID}" class="espol-sched-bar">
        <div class="espol-sched-bar-left">
          <span class="espol-sched-brand">ESPOL Scheduler</span>
          <span class="espol-sched-status"></span>
          <span class="espol-sched-status" data-role="saved-count"></span>
        </div>
        <div class="espol-sched-actions">
          <button type="button" class="espol-sched-btn espol-sched-btn-ghost" data-action="select-all">Marcar visibles</button>
          <button type="button" class="espol-sched-btn espol-sched-btn-primary" data-action="extract-selected">Extraer seleccionadas</button>
          <button type="button" class="espol-sched-btn espol-sched-btn-ghost" data-action="toggle-logs">Logs</button>
          <button type="button" class="espol-sched-btn espol-sched-btn-secondary" data-action="open-planner">Abrir Planificador</button>
        </div>
      </div>
      <div id="${LOG_ID}" class="espol-sched-log" hidden></div>
    `;

    const wrapper = table.closest('.dataTables_wrapper') ?? table;
    wrapper.parentElement?.insertBefore(wrap, wrapper);

    wrap.querySelector('[data-action="open-planner"]')?.addEventListener('click', openPlannerTab);

    wrap.querySelector('[data-action="toggle-logs"]')?.addEventListener('click', () => {
      showLogs = !showLogs;
      const logEl = document.getElementById(LOG_ID);
      if (logEl) logEl.hidden = !showLogs;
    });

    wrap.querySelector<HTMLButtonElement>('[data-action="select-all"]')?.addEventListener('click', () => {
      const rows = parseSearchTable(document, window.location.href);
      const allVisibleSelected = rows.length > 0 && rows.every((r) => selectedRows.has(r.code));
      if (allVisibleSelected) {
        rows.forEach((r) => selectedRows.delete(r.code));
      } else {
        rows.forEach((r) => selectedRows.set(r.code, r));
      }
      syncTableEnhancements();
    });

    wrap.querySelector<HTMLButtonElement>('[data-action="extract-selected"]')?.addEventListener('click', () => {
      void extractSelectedRows();
    });

    const initialRows = parseSearchTable(document, window.location.href);
    appendLog(`Tabla detectada: ${initialRows.length} materia(s) visibles.`);
  }

  updateToolbarStatus();
}

function syncTableEnhancements(): void {
  if (isSyncing) return;
  const table = document.querySelector<HTMLTableElement>('#ctl00_contenido_tbHorarios');
  if (!table) return;

  isSyncing = true;
  try {
    ensureToolbar(table);

    const visibleRows = parseSearchTable(document, window.location.href);
    visibleRowMap = new Map(visibleRows.map((r) => [r.code, r]));

    // Add header checkbox column if missing
    const headerRow = table.querySelector('thead tr');
    if (headerRow && !headerRow.querySelector(`.${COL_CLASS}`)) {
      const th = document.createElement('th');
      th.className = COL_CLASS;
      th.textContent = 'Plan';
      headerRow.insertBefore(th, headerRow.firstChild);
    }

    const bodyRows = Array.from(table.querySelectorAll<HTMLTableRowElement>('tbody tr'));
    for (const tr of bodyRows) {
      if (tr.querySelector('.dataTables_empty')) continue;

      const existingCol = tr.querySelector(`.${COL_CLASS}`);
      const codeCellIndex = existingCol ? 1 : 0;
      const code = tr.cells[codeCellIndex]?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      const nameCell = tr.cells[codeCellIndex + 1];
      if (!code) continue;

      const parsedRow = visibleRowMap.get(code);
      if (parsedRow && selectedRows.has(code)) {
        selectedRows.set(code, parsedRow);
      }

      let checkCell = existingCol as HTMLTableCellElement | null;
      if (!checkCell) {
        checkCell = document.createElement('td');
        checkCell.className = COL_CLASS;
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'espol-sched-checkbox';
        checkbox.dataset.courseCode = code;
        checkbox.addEventListener('change', () => {
          if (checkbox.checked) {
            const row =
              visibleRowMap.get(code) ??
              parseSearchTable(document, window.location.href).find((r) => r.code === code);
            if (row) {
              selectedRows.set(code, row);
            } else {
              checkbox.checked = false;
              appendLog(`La fila ${code} no tiene paralelos extraíbles.`, 'err');
            }
          } else {
            selectedRows.delete(code);
          }
          updateToolbarStatus();
        });
        checkCell.appendChild(checkbox);
        tr.insertBefore(checkCell, tr.firstChild);
      }

      const checkbox = checkCell.querySelector<HTMLInputElement>('input[type="checkbox"]');
      const shouldCheck = selectedRows.has(code);
      if (checkbox && checkbox.checked !== shouldCheck) {
        checkbox.checked = shouldCheck;
      }

      if (nameCell) {
        const existingBadge = nameCell.querySelector('.espol-sched-badge');
        const saved = savedCourseMap.get(code);
        if (saved) {
          const label = `✓ Guardada (${saved.parallels.length}P)`;
          if (existingBadge) {
            if (existingBadge.textContent !== label) {
              existingBadge.textContent = label;
            }
          } else {
            const badge = document.createElement('span');
            badge.className = 'espol-sched-badge';
            badge.textContent = label;
            nameCell.appendChild(badge);
          }
        } else if (existingBadge) {
          existingBadge.remove();
        }
      }
    }
  } finally {
    // Discard mutations caused by our own DOM updates before re-enabling the observer
    tableObserver?.takeRecords();
    isSyncing = false;
  }
}

function setupSingleParallelWidget(): void {
  const nameEl = document.querySelector('#ctl00_contenido_LabelNombreMateria');
  if (!nameEl || document.getElementById('espol-sched-single-widget')) return;

  const widget = document.createElement('div');
  widget.id = 'espol-sched-single-widget';
  widget.className = 'espol-sched-floating-single';
  widget.innerHTML = `
    <span class="espol-sched-brand">ESPOL Scheduler</span>
    <input type="text" placeholder="Código (ej. DING2040)" style="width:120px;padding:5px 8px;border-radius:5px;border:none;font-size:12px;" data-role="code-input" />
    <button type="button" class="espol-sched-btn espol-sched-btn-primary" data-action="save-single">Guardar paralelo</button>
    <button type="button" class="espol-sched-btn espol-sched-btn-secondary" data-action="open-planner">Planificador</button>
  `;

  document.body.appendChild(widget);

  widget.querySelector('[data-action="open-planner"]')?.addEventListener('click', openPlannerTab);

  const saveBtn = widget.querySelector<HTMLButtonElement>('[data-action="save-single"]');
  const codeInput = widget.querySelector<HTMLInputElement>('[data-role="code-input"]');

  saveBtn?.addEventListener('click', async () => {
    const parsed = parsePlannedCourseHtml(document.documentElement.outerHTML, window.location.href);
    await refreshSavedMap();

    const matchedByMateria = parsed.parallel.idMateria
      ? Array.from(savedCourseMap.values()).find((c) =>
          c.parallels.some((p) => p.idMateria === parsed.parallel.idMateria),
        )
      : undefined;

    const code =
      codeInput?.value.trim().toUpperCase() ||
      matchedByMateria?.code ||
      `MAT-${parsed.parallel.idMateria || parsed.parallel.idCurso || Date.now()}`;

    const existing = savedCourseMap.get(code);
    const others = (existing?.parallels ?? []).filter(
      (p) => p.parallelNumber !== parsed.parallel.parallelNumber,
    );

    const updated: Course = {
      code,
      name: parsed.courseName || existing?.name || code,
      periodLabel: parsed.periodLabel || existing?.periodLabel || '',
      extractedAt: new Date().toISOString(),
      parallels: [...others, parsed.parallel].sort(
        (a, b) => Number(a.parallelNumber) - Number(b.parallelNumber),
      ),
    };

    const merged = await upsertCourses([updated]);
    savedCourseMap = new Map(merged.map((c) => [c.code, c]));
    if (saveBtn) {
      saveBtn.textContent = `✓ Guardado (${code} P${parsed.parallel.parallelNumber})`;
    }
  });
}

async function init(): Promise<void> {
  await refreshSavedMap();

  const searchTable = document.querySelector('#ctl00_contenido_tbHorarios');
  if (searchTable) {
    syncTableEnhancements();

    // Observe only direct row replacements on tbody (e.g. DataTables pagination/filtering)
    tableObserver = new MutationObserver(() => {
      if (!isSyncing) syncTableEnhancements();
    });
    const tbody = searchTable.querySelector('tbody') ?? searchTable;
    tableObserver.observe(tbody, { childList: true });
  }

  if (window.location.pathname.includes('MateriaPlanificada.aspx')) {
    setupSingleParallelWidget();
  }
}

void init();
