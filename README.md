# ESPOL Scheduler

Extensión de Chrome / Edge (Manifest V3) para extraer materias planificadas desde **ESPOL Académico** y armar horarios de clases y exámenes de forma **manual** o mediante **recomendaciones automáticas** sin salir del navegador.

## Características

- **Extractor automático en ESPOL Académico:**
  - Inyecta checkboxes directamente en la tabla `#ctl00_contenido_tbHorarios` de `ConsultaPlanificacion.aspx` y conserva las materias marcadas entre páginas de *DataTables*.
  - Descarga en segundo plano de forma secuencial con pausas aleatorias entre peticiones (`700–1600 ms`, simulando navegación humana) usando la sesión activa del navegador, incluyendo **horarios teóricos**, **paralelos prácticos asociados** (`div.tabla_horario`), **cupos**, **profesores**, **modalidad** (presencial, híbrida o virtual) y **fechas de exámenes** (`Parcial`, `Final` y `Mejoramiento`).
  - Soporta cursos **virtuales** (síncronos con `VRA CAMPUS VIRTUAL` y asíncronos sin sesiones fijas).
  - Incluye visor de **Logs** en la barra superior y widget rápido para guardar paralelos individuales al navegar directo a `MateriaPlanificada.aspx`.
- **Calendario de Clases y Exámenes (pestañas dedicadas):**
  - Pestaña **Horario de clases**: grilla semanal adaptativa (Lunes a Viernes, ampliando automáticamente a **Sábado/Domingo** y fuera de `07:00–21:00` si hay sesiones) con tarjetas que muestran aula y bloque (p. ej. `A104 (9M)` o `VRA-002 (Virtual)`).
  - Pestaña **Horario de exámenes**: visualiza las semanas de **Parcial**, **Final** y **Mejoramiento** en formato de calendario semanal con las fechas reales de cada día.
  - Previsualización al pasar el cursor en **Armado Manual**, detección en vivo de **choques de clases** y **choques de exámenes**, renderizado lado a lado para solapamientos y botón **Auto-completar restantes**.
- **Revisión de distancias y traslados en campus:**
  - Catálogo local con coordenadas de bloques de ESPOL extraídas del mapa oficial (204 entradas de bloques).
  - Estima la distancia caminando y el tiempo de traslado entre clases presenciales consecutivas del mismo día, alerta sobre **traslados ajustados** (hueco insuficiente para la distancia) y ofrece enlaces directos para ubicar cada bloque en el mapa.
- **Recomendaciones Automáticas:**
  - Motor combinatorio (*backtracking* con poda *branch-and-bound*, detección incremental de choques de exámenes y retención Top-K) que evalúa combinaciones `(Teórico + Práctico)` válidas.
  - Filtros por cupo disponible (`> 0`), choques de exámenes, **evitar caminatas largas sin hueco**, días libres obligatorios, franjas horarias bloqueadas y exclusión puntual de paralelos o prácticos.
  - Ordenamiento por menos horas huecas, más días libres, salir más temprano, entrar más tarde o **menor distancia entre bloques**.
  - Botón **Editar manualmente** para llevar cualquier opción recomendada al tablero manual.
- **Utilidades:**
  - Actualización de cupos en vivo (`Actualizar cupos`) desde el planificador.
  - Exportación e importación de catálogo en JSON con validación de esquema, confirmación en dos clics al limpiar el catálogo, copia del resumen al portapapeles, impresión/PDF (clases o exámenes) y datos de ejemplo (`Cargar ejemplo`) para probar la interfaz sin sesión estudiantil.

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
2. Busca las materias que te interesen, márcalas con el checkbox de la columna **Plan** (puedes cambiar de página en la tabla manteniendo la selección) y pulsa **Extraer seleccionadas**.
3. Repite las búsquedas que necesites (las materias se acumulan localmente en `chrome.storage.local`) y pulsa **Abrir Planificador**.
4. Arma tu horario en **Armado Manual** o cambia a **Recomendaciones** para explorar combinaciones automáticas, y alterna entre **Horario de clases** y **Horario de exámenes**.

## Desarrollo y Pruebas

```bash
pnpm test        # Ejecuta pruebas unitarias en Vitest
pnpm typecheck   # Verifica tipos con TypeScript
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
- `src/background/`: *Service worker* (`index.ts`) para abrir o enfocar la pestaña del planificador mediante mensajes tipados.
- `src/shared/`:
  - `types.ts`: Tipos de dominio (`Course`, `TheoreticalParallel`, `PracticalParallel`, `CampusTransition`, restricciones).
  - `parser.ts`: Parser DOM de `#ctl00_contenido_tbHorarios` y `MateriaPlanificada.aspx`, además de helpers de modalidad virtual y formato de ubicación.
  - `academicClient.ts`: Cliente HTTP compartido con detección de sesión expirada y pausas aleatorias entre peticiones.
  - `scheduler.ts`: Motor combinatorio, cálculo de métricas y detección de conflictos.
  - `campusMap.ts` y `campusMapData.ts`: Coordenadas de bloques ESPOL, cálculo de distancias peatonales y análisis de traslados entre clases.
  - `examCalendar.ts`: Agrupación de exámenes por semana calendario (`Parcial`, `Final`, `Mejoramiento`).
  - `storage.ts`: Persistencia y sincronización en `chrome.storage.local` (con *fallback* a `localStorage` y `StorageEvent` en modo dev).
  - `validation.ts`: Validación de esquema para importación de catálogos JSON.
  - `messages.ts`: Contrato tipado de mensajería MV3.
  - `sampleData.ts`: Catálogo de ejemplo para pruebas locales.
- `src/planner/`: Interfaz React del planificador (`App.tsx`, `WeeklyGrid.tsx`, `utils.ts`, `hooks/` y `components/` como `PlannerHeader.tsx`, `ManualCourseSidebar.tsx`, `AutoConstraintsSidebar.tsx`, `ScheduleSummaryBar.tsx`, `ExamWeeklyGrid.tsx`, `CampusTransitionsCard.tsx` y `ExamDetailsTable.tsx`), estilizada con Tailwind CSS (`src/index.css`) y `shadcn/ui` (`src/components/ui/`).
- `src/popup/`: Popup de acceso rápido de la extensión (`main.tsx`, `popup.css`).
- `src/tests/`: Pruebas unitarias en Vitest (`academicClient.test.ts`, `campusMap.test.ts`, `examCalendar.test.ts`, `messages.test.ts`, `parser.test.ts`, `scheduler.test.ts`, `storage.test.ts`, `validation.test.ts`, `weeklyGrid.test.ts`).

## Licencia

Distribuido bajo la licencia MIT. Consulta el archivo [LICENSE](LICENSE) para más información.
