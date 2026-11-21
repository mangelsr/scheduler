import { describe, expect, it } from 'vitest';
import {
  normalizeDay,
  parseExamInfo,
  parseIntSafe,
  parsePlannedCourseHtml,
  parseSearchTable,
  parseTimeToMinutes,
} from '../shared/parser';

const SEARCH_HTML = `
<table id="ctl00_contenido_tbHorarios" class="display test">
  <thead>
    <tr><th>Código</th><th>Materia</th><th>Paralelos</th></tr>
  </thead>
  <tbody>
    <tr class="gradeA even">
      <td>DING2039       </td>
      <td>TALLER DE DISEÑO I</td>
      <td><a class="myLink" href="MateriaPlanificada.aspx?idMateria=7115&amp;numeroParalelo=1&amp;p=606&amp;idCurso=181152">[1]</a>&nbsp;</td>
    </tr>
    <tr class="gradeA odd">
      <td>DING2040       </td>
      <td>TALLER DE DISEÑO II</td>
      <td>
        <a class="myLink" href="MateriaPlanificada.aspx?idMateria=7116&amp;numeroParalelo=1&amp;p=606&amp;idCurso=181217">[1]</a>
        <a class="myLink" href="MateriaPlanificada.aspx?idMateria=7116&amp;numeroParalelo=2&amp;p=606&amp;idCurso=181219">[2]</a>
      </td>
    </tr>
  </tbody>
</table>
`;

const COURSE_DETAIL_HTML = `
<div id="container">
  <h1><span id="ctl00_contenido_lbltexto">Planificación PAO 2026-2 2026</span></h1>
  <span id="ctl00_contenido_LabelNombreMateria">TALLER DE DISEÑO IV</span>
  <span id="ctl00_contenido_LabelParalelo">1</span>
  <span id="ctl00_contenido_LabelProfesor">RODRIGUEZ GRANDA ANDY ROBINSSON</span>
  <span id="ctl00_contenido_modo_curso">CURSO A DICTARSE EN MODALIDAD PRESENCIAL</span>
  <span id="ctl00_contenido_timecurso"></span>
  <span id="ctl00_contenido_LabelDirigido"></span>
  <span id="ctl00_contenido_LabelCupo">30</span>
  <span id="ctl00_contenido_LabelDisponible">0</span>
  <span id="ctl00_contenido_LabelParcial">17/11/2026 - 09:00 a 11:00</span>
  <span id="ctl00_contenido_aulaParcial">A102-3M  CAMPUS GUSTAVO GALINDO Modalidad: Presencial</span>
  <span id="ctl00_contenido_LabelFinal">12/01/2027 - 09:00 a 11:00</span>
  <span id="ctl00_contenido_aulaFinal">A102-3M  CAMPUS GUSTAVO GALINDO Modalidad: Presencial</span>
  <span id="ctl00_contenido_LabelMejora">26/01/2027 - 09:00 a 11:00</span>
  <span id="ctl00_contenido_aulaMej">A102-3M  CAMPUS GUSTAVO GALINDO Modalidad: Presencial</span>

  <table id="ctl00_contenido_TableHorarios">
    <thead>
      <tr><th>Día</th><th>Hora Inico</th><th>Hora Fin</th><th>Aula</th><th></th></tr>
    </thead>
    <tbody>
      <tr>
        <td>Martes</td><td>09:00:00</td><td>11:00:00</td><td>A001</td><td>3M  CAMPUS GUSTAVO GALINDO</td>
      </tr>
    </tbody>
  </table>

  <div style="display:none" class="display tabla_horario" id="tabla_101">
    <table>
      <tbody>
        <tr>
          <td><b>Profesor:&nbsp;&nbsp;</b> RODRIGUEZ GRANDA ANDY ROBINSSON</td>
          <td><b>Paralelo::&nbsp;&nbsp;</b>101</td>
        </tr>
        <tr>
          <td><b>Capacidad:&nbsp;&nbsp;</b>16</td>
          <td><b>Cupo disponible:&nbsp;&nbsp;</b>2</td>
        </tr>
        <tr>
          <td colspan="2"><b>CURSO A DICTARSE EN MODALIDAD PRESENCIAL</b></td>
        </tr>
      </tbody>
    </table>
    <table>
      <thead><tr><th>Día</th><th>Hora Inicio.</th><th>Hora Fin</th><th>Aula</th><th>Bloque</th></tr></thead>
      <tbody>
        <tr><td>Jueves</td><td>09:00:00</td><td>11:00:00</td><td>A001</td><td>3M CAMPUS GUSTAVO GALINDO</td></tr>
      </tbody>
    </table>
  </div>

  <div style="display:none" class="display tabla_horario" id="tabla_102">
    <table>
      <tbody>
        <tr>
          <td><b>Profesor:&nbsp;&nbsp;</b> RODRIGUEZ GRANDA ANDY ROBINSSON</td>
          <td><b>Paralelo::&nbsp;&nbsp;</b>102</td>
        </tr>
        <tr>
          <td><b>Capacidad:&nbsp;&nbsp;</b>14</td>
          <td><b>Cupo disponible:&nbsp;&nbsp;</b>0</td>
        </tr>
      </tbody>
    </table>
    <table>
      <thead><tr><th>Día</th><th>Hora Inicio.</th><th>Hora Fin</th><th>Aula</th><th>Bloque</th></tr></thead>
      <tbody>
        <tr><td>Viernes</td><td>09:00:00</td><td>11:00:00</td><td>A001</td><td>3M CAMPUS GUSTAVO GALINDO</td></tr>
      </tbody>
    </table>
  </div>
</div>
`;

describe('ESPOL HTML parser', () => {
  it('parses search table rows and resolves parallel URLs', () => {
    const doc = new DOMParser().parseFromString(SEARCH_HTML, 'text/html');
    const rows = parseSearchTable(
      doc,
      'https://www.academico.espol.edu.ec/UI/Registros/ConsultaPlanificacion.aspx',
    );

    expect(rows).toHaveLength(2);
    expect(rows[0].code).toBe('DING2039');
    expect(rows[0].parallels[0].idCurso).toBe('181152');
    expect(rows[1].code).toBe('DING2040');
    expect(rows[1].parallels).toHaveLength(2);
    expect(rows[1].parallels[1].url).toBe(
      'https://www.academico.espol.edu.ec/UI/Registros/MateriaPlanificada.aspx?idMateria=7116&numeroParalelo=2&p=606&idCurso=181219',
    );
  });

  it('ignores injected espol-sched-col checkbox cells when parsing search table', () => {
    const htmlWithInjectedCol = SEARCH_HTML.replace(
      '<tr><th>Código</th>',
      '<tr><th class="espol-sched-col">Plan</th><th>Código</th>',
    ).replaceAll(
      '<tr class="gradeA',
      '<tr class="gradeA',
    ).replaceAll(
      '<td>DING',
      '<td class="espol-sched-col"><input type="checkbox" /></td><td>DING',
    );
    const doc = new DOMParser().parseFromString(htmlWithInjectedCol, 'text/html');
    const rows = parseSearchTable(
      doc,
      'https://www.academico.espol.edu.ec/UI/Registros/ConsultaPlanificacion.aspx',
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].code).toBe('DING2039');
    expect(rows[1].code).toBe('DING2040');
    expect(rows[1].parallels).toHaveLength(2);
  });

  it('parses MateriaPlanificada HTML including hidden practical parallels', () => {
    const url =
      'https://www.academico.espol.edu.ec/UI/Registros/MateriaPlanificada.aspx?idMateria=7118&numeroParalelo=1&p=606&idCurso=181282';
    const parsed = parsePlannedCourseHtml(COURSE_DETAIL_HTML, url);

    expect(parsed.periodLabel).toBe('Planificación PAO 2026-2 2026');
    expect(parsed.courseName).toBe('TALLER DE DISEÑO IV');
    expect(parsed.parallel.parallelNumber).toBe('1');
    expect(parsed.parallel.professor).toBe('RODRIGUEZ GRANDA ANDY ROBINSSON');
    expect(parsed.parallel.capacity).toBe(30);
    expect(parsed.parallel.available).toBe(0);
    expect(parsed.parallel.exams).toHaveLength(3);
    expect(parsed.parallel.exams[0].date).toBe('2026-11-17');
    expect(parsed.parallel.exams[0].startMinutes).toBe(540);
    expect(parsed.parallel.exams[0].endMinutes).toBe(660);

    expect(parsed.parallel.sessions).toEqual([
      {
        day: 'Martes',
        startTime: '09:00',
        endTime: '11:00',
        startMinutes: 540,
        endMinutes: 660,
        classroom: 'A001',
        block: '3M CAMPUS GUSTAVO GALINDO',
      },
    ]);

    expect(parsed.parallel.practicals).toHaveLength(2);
    expect(parsed.parallel.practicals[0].code).toBe('101');
    expect(parsed.parallel.practicals[0].available).toBe(2);
    expect(parsed.parallel.practicals[0].sessions[0].day).toBe('Jueves');
    expect(parsed.parallel.practicals[1].code).toBe('102');
    expect(parsed.parallel.practicals[1].sessions[0].day).toBe('Viernes');
  });

  it('discards malformed or empty practical blocks without code/metadata', () => {
    const html = `
      <div>
        <span id="ctl00_contenido_LabelNombreMateria">CALCULO</span>
        <span id="ctl00_contenido_LabelParalelo">1</span>
        <div class="tabla_horario">
          <table><tbody><tr><td></td></tr></tbody></table>
          <table><tbody></tbody></table>
        </div>
        <div class="tabla_horario" id="tabla_103">
          <table><tbody></tbody></table>
          <table><tbody></tbody></table>
        </div>
      </div>
    `;
    const parsed = parsePlannedCourseHtml(
      html,
      'https://www.academico.espol.edu.ec/UI/Registros/MateriaPlanificada.aspx?idMateria=1&numeroParalelo=1&p=606&idCurso=2',
    );
    expect(parsed.parallel.practicals).toEqual([]);
  });

  it('parses virtual E-learning courses with VRA CAMPUS VIRTUAL and practicals', () => {
    const virtualHtml = `
      <div id="container">
        <h1><span id="ctl00_contenido_lbltexto">Planificación PAO 2026-2 2026</span></h1>
        <span id="ctl00_contenido_LabelNombreMateria">COMUNICACIÓN</span>
        <span id="ctl00_contenido_LabelParalelo">1</span>
        <span id="ctl00_contenido_LabelProfesor">BAÑOS DE MORA MONICA CECIBEL</span>
        <tr id="ctl00_contenido_ver_virtual">
          <td><span id="ctl00_contenido_modo_curso">CURSO A DICTARSE EN MODALIDAD VIRTUAL - E-LEARNING</span></td>
        </tr>
        <span id="ctl00_contenido_LabelCupo">51</span>
        <span id="ctl00_contenido_LabelDisponible">2</span>
        <span id="ctl00_contenido_LabelParcial">17/11/2026 - 11:30 a 13:30</span>
        <span id="ctl00_contenido_aulaParcial">Modalidad: Virtual</span>
        <span id="ctl00_contenido_LabelFinal">12/01/2027 - 11:30 a 13:30</span>
        <span id="ctl00_contenido_aulaFinal">Modalidad: Virtual</span>
        <span id="ctl00_contenido_LabelMejora">26/01/2027 - 11:30 a 13:30</span>
        <span id="ctl00_contenido_aulaMej">Modalidad: Virtual</span>
        <table id="ctl00_contenido_TableHorarios">
          <thead><tr><th>Día</th><th>Hora Inico</th><th>Hora Fin</th><th>Aula</th><th></th></tr></thead>
          <tbody>
            <tr><td>Lunes</td><td>07:00:00</td><td>09:00:00</td><td>VRA-002</td><td>VRA CAMPUS VIRTUAL</td></tr>
          </tbody>
        </table>
        <div style="display:none" class=" display tabla_horario" id="tabla_101">
          <table><tbody>
            <tr><td><b>Profesor:</b> BAÑOS DE MORA MONICA CECIBEL</td><td><b>Paralelo::</b>101</td></tr>
            <tr><td><b>Capacidad:</b>51</td><td><b>Cupo disponible:</b>2</td></tr>
            <tr><td colspan="2"><b>CURSO A DICTARSE EN MODALIDAD VIRTUAL - E-LEARNING</b></td></tr>
          </tbody></table>
          <table>
            <thead><tr><th>Día</th><th>Hora Inicio.</th><th>Hora Fin</th><th>Aula</th><th>Bloque</th></tr></thead>
            <tbody>
              <tr><td>Miércoles</td><td>07:00:00</td><td>09:00:00</td><td>VRA-002</td><td>VRA CAMPUS VIRTUAL</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
    const parsed = parsePlannedCourseHtml(
      virtualHtml,
      'https://www.academico.espol.edu.ec/UI/Registros/MateriaPlanificada.aspx?idCurso=184515&idMateria=7319&p=606',
    );

    expect(parsed.courseName).toBe('COMUNICACIÓN');
    expect(parsed.parallel.parallelNumber).toBe('1');
    expect(parsed.parallel.modality).toBe('CURSO A DICTARSE EN MODALIDAD VIRTUAL - E-LEARNING');
    expect(parsed.parallel.available).toBe(2);
    expect(parsed.parallel.exams[0].classroom).toBe('Modalidad: Virtual');
    expect(parsed.parallel.sessions[0]).toMatchObject({
      day: 'Lunes',
      startTime: '07:00',
      endTime: '09:00',
      classroom: 'VRA-002',
      block: 'VRA CAMPUS VIRTUAL',
    });
    expect(parsed.parallel.practicals).toHaveLength(1);
    expect(parsed.parallel.practicals[0].code).toBe('101');
    expect(parsed.parallel.practicals[0].modality).toBe(
      'CURSO A DICTARSE EN MODALIDAD VIRTUAL - E-LEARNING',
    );
    expect(parsed.parallel.practicals[0].sessions[0]).toMatchObject({
      day: 'Miércoles',
      classroom: 'VRA-002',
      block: 'VRA CAMPUS VIRTUAL',
    });
  });

  it('handles primitive helpers, malformed rows, missing tables, and ver_virtual fallback', () => {
    expect(normalizeDay('miércoles')).toBe('Miércoles');
    expect(normalizeDay('sabado')).toBe('Sábado');
    expect(normalizeDay('domingo')).toBe('Domingo');
    expect(normalizeDay('feriado')).toBeNull();

    expect(parseTimeToMinutes('invalid')).toBeNull();
    expect(parseTimeToMinutes('25:00')).toBeNull();
    expect(parseTimeToMinutes('10:65')).toBeNull();
    expect(parseTimeToMinutes('8:05')).toEqual({ time: '08:05', minutes: 485 });

    expect(parseIntSafe('sin numero')).toBe(0);
    expect(parseIntSafe('Cupos: -3')).toBe(-3);
    expect(parseExamInfo('Parcial', 'Por definir', 'S/A')).toMatchObject({
      type: 'Parcial',
      raw: 'Por definir',
      date: null,
      startMinutes: null,
      endMinutes: null,
    });

    const emptyDoc = new DOMParser().parseFromString('<div></div>', 'text/html');
    expect(parseSearchTable(emptyDoc, 'https://example.com')).toEqual([]);

    const edgeSearchHtml = `
      <table id="ctl00_contenido_tbHorarios">
        <tbody>
          <tr><td colspan="3" class="dataTables_empty">Sin registros</td></tr>
          <tr><td>SOLO1</td><td>DOS</td></tr>
          <tr><td>BAD100</td><td>SIN ENLACE</td><td><a class="myLink" href="">[1]</a></td></tr>
        </tbody>
      </table>
    `;
    const edgeDoc = new DOMParser().parseFromString(edgeSearchHtml, 'text/html');
    expect(parseSearchTable(edgeDoc, 'https://example.com')).toEqual([]);

    const edgeCourseHtml = `
      <div>
        <span id="ctl00_contenido_LabelNombreMateria">ELECTIVA</span>
        <span id="ctl00_contenido_ver_virtual">MODALIDAD VIRTUAL</span>
        <table id="ctl00_contenido_TableHorarios">
          <tbody>
            <tr><td>Lunes</td><td>09:00</td></tr>
            <tr><td>Lunes</td><td>11:00</td><td>09:00</td><td>A1</td><td>B1</td></tr>
          </tbody>
        </table>
        <div class="tabla_horario" id="tabla_201">
          <table><tbody><tr><td><b>Capacidad:</b> 10</td></tr></tbody></table>
        </div>
        <div class="tabla_horario" id="tabla_202">
          <table><tbody><tr><td><b>Capacidad:</b> 12</td><td><b>Cupo disponible:</b> 4</td></tr></tbody></table>
          <table><tbody><tr><td>Viernes</td><td>14:00</td><td>16:00</td><td>A2</td><td>B2</td></tr></tbody></table>
        </div>
      </div>
    `;
    const parsed = parsePlannedCourseHtml(edgeCourseHtml, '::invalid-url');
    expect(parsed.parallel.modality).toBe('MODALIDAD VIRTUAL');
    expect(parsed.parallel.sessions).toEqual([]);
    expect(parsed.parallel.practicals).toHaveLength(1);
    expect(parsed.parallel.practicals[0].code).toBe('202');
  });
});
