# ESPOL Scheduler

Extensión de Chrome / Edge (Manifest V3) para extraer materias planificadas desde **ESPOL Académico** y armar horarios de forma **manual** o mediante **recomendaciones automáticas** sin salir del navegador.

## Características

- **Extractor automático en ESPOL Académico:**
  - Inyecta checkboxes directamente en la tabla `#ctl00_contenido_tbHorarios` de `ConsultaPlanificacion.aspx`.
  - Descarga en segundo plano (secuencialmente usando la sesión activa del navegador) todos los paralelos `[1]`, `[2]`, etc. desde `MateriaPlanificada.aspx`, incluyendo **horarios teóricos**, **paralelos prácticos asociados** (`div.tabla_horario`), **cupos**, **profesores** y **fechas de exámenes** (Parcial, Final y Mejoramiento).
  - Incluye visor de **Logs** en la barra superior y botón rápido para guardar paralelos individuales al navegar directo a `MateriaPlanificada.aspx`.
- **Armado Manual (modo por defecto):**
  - Previsualización en la grilla semanal (Lunes a Viernes, 07:00–21:00) al pasar el cursor sobre cualquier paralelo o práctico.
  - Detección en vivo de **choques de clases** y **choques de exámenes** antes de seleccionar, y visualización lado a lado si dos materias se cruzan.
  - Botón **Auto-completar restantes** para fijar las materias ya elegidas y generar opciones válidas para el resto.
- **Recomendaciones Automáticas:**
  - Motor combinatorio (*backtracking*) que evalúa combinaciones `(Teórico + Práctico)` sin choques de clases ni exámenes.
  - Filtros por cupo disponible (`> 0`), días libres obligatorios, franjas horarias bloqueadas, exclusión puntual de paralelos/prácticos y ordenamiento por menos horas huecas, más días libres, salir más temprano o entrar más tarde.
  - Botón **Editar manualmente** para llevar cualquier combinación recomendada al tablero manual.
- **Utilidades:**
  - Actualización de cupos en vivo (`Actualizar cupos`) desde el planificador.
  - Exportación / importación de catálogo en JSON, copia rápida del resumen al portapapeles, impresión/PDF y datos de ejemplo (`Cargar ejemplo`) para probar la interfaz sin sesión estudiantil.

## Instalación en Chrome / Edge

1. Instala dependencias y compila la extensión:

   ```bash
   pnpm install
   pnpm build
   ```

2. Abre `chrome://extensions` (o `edge://extensions`).
3. Activa **Modo de desarrollador**.
4. Haz clic en **Cargar descomprimida** (*Load unpacked*) y selecciona la carpeta `dist/`.

## Uso

1. Inicia sesión en **ESPOL Académico** y ve a **Registros → Horarios Planificados** (`ConsultaPlanificacion.aspx`).
2. Busca las materias que te interesen, márcalas con el checkbox de la columna **Plan** y pulsa **Extraer seleccionadas**.
3. Repite las búsquedas que necesites (las materias se van acumulando localmente en `chrome.storage.local`) y pulsa **Abrir Planificador**.
4. Arma tu horario en **Armado Manual** o cambia a **Recomendaciones** para explorar combinaciones automáticas.

## Desarrollo y Pruebas

```bash
pnpm test        # Ejecuta tests unitarios (parser HTML y motor de horarios)
pnpm typecheck
pnpm build       # Verifica tipos y genera el bundle de la extensión en dist/
```

Para probar la interfaz del planificador en modo desarrollo sin cargar la extensión:

```bash
pnpm dev
# Abre http://localhost:5173/planner.html y pulsa "Cargar ejemplo"
```

## Estructura del proyecto

- `public/manifest.json`: Manifiesto MV3 de la extensión.
- `scripts/build.mjs`: Script de compilación (Vite para `planner.html` y `popup.html`, esbuild IIFE/ESM para `content.js` y `background.js`).
- `src/content/`: *Content script* (`index.ts`, `content.css`) inyectado en `/UI/Registros/*`.
- `src/background/`: *Service worker* para abrir o enfocar la pestaña del planificador.
- `src/shared/`:
  - `types.ts`: Tipos de dominio (`Course`, `TheoreticalParallel`, `PracticalParallel`, restricciones).
  - `parser.ts`: Parser DOM de `#ctl00_contenido_tbHorarios` y `MateriaPlanificada.aspx`.
  - `scheduler.ts`: Motor de combinaciones, cálculo de métricas y detección de conflictos.
  - `storage.ts`: Persistencia en `chrome.storage.local` (con fallback a `localStorage` en modo dev).
  - `sampleData.ts`: Catálogo de ejemplo para pruebas locales.
- `src/planner/`: Interfaz React del planificador (`App.tsx`, `WeeklyGrid.tsx`, `planner.css`).
- `src/popup/`: Popup de acceso rápido de la extensión.
- `src/tests/`: Pruebas unitarias en Vitest (`parser.test.ts`, `scheduler.test.ts`).

## Licencia

Distribuido bajo la licencia MIT. Consulta el archivo [LICENSE](LICENSE) para más información.
