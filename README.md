# ESPOL Scheduler — Extractor y Planificador de Horarios

Extensión de Chrome / Edge (Manifest V3) para extraer materias planificadas de **ESPOL Académico** (`ConsultaPlanificacion.aspx` y `MateriaPlanificada.aspx`) y generar automáticamente todas las combinaciones de horarios sin choques de clases ni exámenes.

## Estructura del proyecto

- `src/content/index.ts`: *Content script* que inyecta checkboxes en `#ctl00_contenido_tbHorarios` y extrae secuencialmente cada paralelo `[1]`, `[2]`, etc. junto con sus prácticos asociados ocultos (`div.tabla_horario`).
- `src/shared/parser.ts`: Parser DOM de la tabla de búsqueda y de `MateriaPlanificada.aspx`.
- `src/shared/scheduler.ts`: Motor combinatorio (backtracking) que expande `(Teórico + Práctico)` y filtra por choques de clase, choques de exámenes, cupos, días libres y franjas bloqueadas.
- `src/planner/`: Interfaz React del planificador con grilla semanal, tabla de exámenes, exportación/importación JSON y datos de ejemplo.
- `src/popup/`: Popup rápido de la extensión.

## Desarrollo y Pruebas

```bash
npm install
npm test        # Corre tests unitarios del parser y del generador de horarios
npm run build   # Compila la extensión lista en dist/
```

Para probar la interfaz del planificador en navegador sin cargar aún en Académico:

```bash
npm run dev
# Abre http://localhost:5173/planner.html y pulsa "Cargar ejemplo"
```

## Cómo instalar la extensión en Chrome / Edge

1. Ejecuta `npm run build` para generar la carpeta `dist/`.
2. Abre `chrome://extensions` (o `edge://extensions`).
3. Activa **Modo de desarrollador**.
4. Haz clic en **Cargar descomprimida** (*Load unpacked*) y selecciona la carpeta `dist/`.
5. Entra a **Consulta de planificación** en ESPOL Académico, marca las materias en la tabla y pulsa **Extraer seleccionadas** → **Abrir Planificador**.
