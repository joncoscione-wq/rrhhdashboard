import * as XLSX from 'xlsx';

// ── types ────────────────────────────────────────────────────────────────────

export type ParsedTab = {
  name: string;
  index: number;
  headers: string[];
  rows: Record<string, string>[];
  // header label → año resuelto (del propio encabezado "ene-23" o de la fila de
  // grupo superior "2024", teniendo en cuenta celdas mergeadas)
  headerYearHints: Record<string, number>;
  // filas descartadas por ser comentarios/notas fuera de la grilla de datos
  commentRowsSkipped: number;
};

// ── normalización ────────────────────────────────────────────────────────────

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

// ── meses / años ─────────────────────────────────────────────────────────────

const MESES_3: Record<string, number> = {
  ene: 1,
  feb: 2,
  mar: 3,
  abr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  ago: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dic: 12
};

const MESES_FULL: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12
};

// Año desde un texto: "Bono 2025" → 2025, "ene-23" → 2023, "Dic 24" → 2024.
// El año de 2 dígitos exige ir precedido de letra/guion/espacio para NO
// confundir decimales de moneda ("$28,000.00" ≠ año 2000).
// Solo se usa sobre encabezados/filas de grupo, nunca sobre nombres de pestaña
// (un nombre como "Sueldos ... 20" NO debe resolver a 2020).
export function extractYear(text: string): number | null {
  const m4 = text.match(/\b(20\d{2})\b/);
  if (m4) return parseInt(m4[1]);
  const m2 = text.trim().match(/(?:^|[a-zA-Z\-_\s])(\d{2})$/);
  if (m2) return 2000 + parseInt(m2[1]);
  return null;
}

// Detecta si un encabezado representa una columna de mes, y con qué año.
// Soporta: "Enero", "ene-23", "Dic 24", "Sep-24 (2)" y encabezados que son
// una fecha (la empresa rotula los meses con una fecha del mes, ej. 23/11/2024).
export function parseMonthYearHeader(
  header: string
): { month: number | null; year: number | null } | null {
  const norm = normalize(header);
  if (!norm) return null;

  // Encabezado tipo fecha: normalize() convierte "23/11/2024" en "23_11_2024"
  const asDate = norm.match(/^(\d{1,2})_(\d{1,2})_(\d{2,4})$/);
  if (asDate) {
    const month = parseInt(asDate[2]);
    if (month >= 1 && month <= 12) {
      let year = parseInt(asDate[3]);
      if (year < 100) year += 2000;
      return { month, year };
    }
    return null;
  }

  const first = norm.split('_')[0];
  const month = MESES_FULL[first] ?? MESES_3[first.slice(0, 3)] ?? null;
  if (month == null) return null;
  return { month, year: extractYear(header) };
}

// ── rangos de fechas escritos en notas de celda ──────────────────────────────

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toIso(year: number, mes: number, day: number): string {
  return `${year}-${pad(mes)}-${pad(day)}`;
}

const MESES_NOTA: Record<string, number> = {
  enero: 1,
  ene: 1,
  febrero: 2,
  feb: 2,
  marzo: 3,
  mar: 3,
  abril: 4,
  abr: 4,
  mayo: 5,
  may: 5,
  junio: 6,
  jun: 6,
  julio: 7,
  jul: 7,
  agosto: 8,
  ago: 8,
  septiembre: 9,
  setiembre: 9,
  sep: 9,
  sept: 9,
  octubre: 10,
  oct: 10,
  noviembre: 11,
  nov: 11,
  diciembre: 12,
  dic: 12
};

// Parsea rangos escritos a mano en notas de celda. Ejemplos reales del Excel:
//   "5 al 14 de junio" · "3 al 17 de Feb" · "5/6 al 14/6" · "5/3 - 26/3"
//   "23-27/9" (días con mes compartido) · "4 al 15" (mes desde la columna)
// `contextMonth` es el mes de la columna donde está la nota (grilla de meses).
export function parseDateRangeFromNote(
  note: string,
  year: number,
  contextMonth?: number
): { inicio: string; fin: string } | null {
  const text = note.toLowerCase().trim();
  const monNames = Object.keys(MESES_NOTA).join('|');

  // "5 al 14 de junio" / "del 5 al 14 de junio" / "3 al 17 de Feb"
  const namedMonth = text.match(
    new RegExp(`(?:del\\s+)?(\\d{1,2})\\s+al\\s+(\\d{1,2})\\s+de\\s+(${monNames})\\b`)
  );
  if (namedMonth) {
    const mes = MESES_NOTA[namedMonth[3]];
    return {
      inicio: toIso(year, mes, parseInt(namedMonth[1])),
      fin: toIso(year, mes, parseInt(namedMonth[2]))
    };
  }

  // "5/6 al 14/6" · "05-06 al 14-06" · "5/3 - 26/3" · "3/2 al 11/2 *3/2 al 10/2"
  const bothMonths = text.match(/(\d{1,2})[/\-.:](\d{1,2})\s*(?:al|-)\s*(\d{1,2})[/\-.:](\d{1,2})/);
  if (bothMonths) {
    const startDay = parseInt(bothMonths[1]);
    const startMes = parseInt(bothMonths[2]);
    const endDay = parseInt(bothMonths[3]);
    const endMes = parseInt(bothMonths[4]);
    const endYear = endMes < startMes ? year + 1 : year;
    return {
      inicio: toIso(year, startMes, startDay),
      fin: toIso(endYear, endMes, endDay)
    };
  }

  // "23-27/9" — días que comparten un solo mes
  const sharedMonth = text.match(/(\d{1,2})\s*(?:al|-)\s*(\d{1,2})\s*[/\-.](\d{1,2})\b/);
  if (sharedMonth) {
    const mes = parseInt(sharedMonth[3]);
    return {
      inicio: toIso(year, mes, parseInt(sharedMonth[1])),
      fin: toIso(year, mes, parseInt(sharedMonth[2]))
    };
  }

  // "4 al 15" — solo días; el mes lo da la columna de la grilla
  if (contextMonth) {
    const simple = text.match(/(\d{1,2})\s+al\s+(\d{1,2})\b/);
    if (simple) {
      return {
        inicio: toIso(year, contextMonth, parseInt(simple[1])),
        fin: toIso(year, contextMonth, parseInt(simple[2]))
      };
    }
  }

  return null;
}

// ── detección de fila de encabezado ──────────────────────────────────────────

function cellText(cell: XLSX.CellObject | undefined): string {
  if (!cell) return '';
  // Preferir la URL del hipervínculo sobre el texto visible
  if (cell.l?.Target) return String(cell.l.Target).trim();
  if (cell.t === 'd' && cell.v instanceof Date) return cell.v.toLocaleDateString('es-AR');
  return String(XLSX.utils.format_cell(cell)).trim();
}

// ¿Parece un dato (número, moneda, fecha, link) en vez de un rótulo de columna?
function isNumericLike(value: string): boolean {
  const s = value.trim();
  if (!s) return false;
  return (
    /^-?[$€£¥₱]?\s?-?[\d.,]+%?$/.test(s) ||
    /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(s) ||
    /^\d{4}-\d{2}-\d{2}/.test(s) ||
    /^https?:\/\//i.test(s) ||
    /^mailto:/i.test(s)
  );
}

// Los archivos reales de la empresa no tienen el encabezado siempre en la fila
// 1: hay filas de título ("Lineas Movistar"), filas de grupo ("2023 | 2024") y
// filas vacías arriba. Se elige la fila con muchas celdas tipo rótulo seguida
// de filas con datos. Las filas de grupo/título tienen pocas celdas llenas y
// quedan descartadas por el mínimo de 3.
function findHeaderRow(ws: XLSX.WorkSheet, range: XLSX.Range): number {
  let best = range.s.r;
  let bestScore = -1;
  const maxR = Math.min(range.s.r + 10, range.e.r);

  for (let r = range.s.r; r <= maxR; r++) {
    let filled = 0;
    let labels = 0;
    for (let c = range.s.c; c <= range.e.c; c++) {
      const v = cellText(ws[XLSX.utils.encode_cell({ r, c })]);
      if (!v) continue;
      filled++;
      if (!isNumericLike(v) && v.length <= 40) labels++;
    }
    if (filled < 3) continue; // fila vacía, título o fila de grupo

    let nextFilled = 0;
    for (let c = range.s.c; c <= range.e.c; c++) {
      if (cellText(ws[XLSX.utils.encode_cell({ r: r + 1, c })])) nextFilled++;
    }

    const score = labels * 2 + nextFilled;
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  return best;
}

// Valor de una celda teniendo en cuenta merges (las filas de grupo tipo "2024"
// suelen estar mergeadas sobre varias columnas de meses).
function mergedCellText(ws: XLSX.WorkSheet, r: number, c: number): string {
  const direct = cellText(ws[XLSX.utils.encode_cell({ r, c })]);
  if (direct) return direct;
  for (const m of ws['!merges'] ?? []) {
    if (r >= m.s.r && r <= m.e.r && c >= m.s.c && c <= m.e.c) {
      return cellText(ws[XLSX.utils.encode_cell({ r: m.s.r, c: m.s.c })]);
    }
  }
  return '';
}

// ── parser principal ─────────────────────────────────────────────────────────

export function parseSpreadsheet(buffer: ArrayBuffer): ParsedTab[] {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });

  return workbook.SheetNames.map((name, index) => {
    const sheet = workbook.Sheets[name];
    const ref = sheet['!ref'];
    const empty: ParsedTab = {
      name,
      index,
      headers: [],
      rows: [],
      headerYearHints: {},
      commentRowsSkipped: 0
    };
    if (!ref) return empty;

    const range = XLSX.utils.decode_range(ref);
    const headerRow = findHeaderRow(sheet, range);

    // Conteo de celdas con dato por columna debajo del encabezado: sirve para
    // distinguir una columna real sin rótulo (la columna "Nombre" en las
    // planillas de vacaciones) de restos de cálculos sueltos fuera de la
    // grilla (celdas mezcladas que la empresa deja a la derecha de la tabla).
    const dataCountByCol = new Map<number, number>();
    let maxColCount = 0;
    for (let c = range.s.c; c <= range.e.c; c++) {
      let count = 0;
      for (let r = headerRow + 1; r <= range.e.r; r++) {
        if (cellText(sheet[XLSX.utils.encode_cell({ r, c })])) count++;
      }
      dataCountByCol.set(c, count);
      maxColCount = Math.max(maxColCount, count);
    }
    const minDensity = Math.max(3, Math.ceil(maxColCount * 0.25));

    // Encabezados desde la fila detectada. Las columnas con encabezado vacío
    // pero con datos debajo se conservan solo si tienen densidad de datos real.
    const headers: string[] = [];
    const headerCounts = new Map<string, number>();
    const colOfHeader: number[] = [];
    const synthesized = new Set<string>();
    for (let c = range.s.c; c <= range.e.c; c++) {
      let val = cellText(sheet[XLSX.utils.encode_cell({ r: headerRow, c })]);
      if (!val) {
        const dataCount = dataCountByCol.get(c) ?? 0;
        if (dataCount === 0) continue; // columna totalmente vacía
        if (c === range.s.c) {
          val = 'Nombre';
        } else {
          if (dataCount < minDensity) continue; // resto de cálculo suelto
          val = `Columna ${c - range.s.c + 1}`;
        }
        synthesized.add(val);
      }
      const count = headerCounts.get(val) ?? 0;
      headerCounts.set(val, count + 1);
      headers.push(count === 0 ? val : `${val} (${count + 1})`);
      colOfHeader.push(c);
    }
    if (headers.length === 0) return empty;

    // Año por columna: embebido en el encabezado ("ago-24") o heredado de la
    // fila de grupo superior ("2024" mergeada sobre los meses).
    const headerYearHints: Record<string, number> = {};
    const groupRow = headerRow - 1;
    headers.forEach((h, i) => {
      if (synthesized.has(h)) return; // "Nombre"/"Columna N" no llevan año
      const embedded = extractYear(h);
      if (embedded) {
        headerYearHints[h] = embedded;
        return;
      }
      if (groupRow >= range.s.r) {
        const groupVal = mergedCellText(sheet, groupRow, colOfHeader[i]);
        const groupYear = groupVal ? extractYear(groupVal) : null;
        if (groupYear) headerYearHints[h] = groupYear;
      }
    });

    // Filas de datos (empiezan después del encabezado real, no en la fila 2).
    const rows: Record<string, string>[] = [];
    let commentRowsSkipped = 0;
    for (let r = headerRow + 1; r <= range.e.r; r++) {
      const obj: Record<string, string> = {};
      let hasValue = false;
      let filled = 0;
      let longest = 0;
      for (let ci = 0; ci < headers.length; ci++) {
        const cell = sheet[XLSX.utils.encode_cell({ r, c: colOfHeader[ci] })];
        const val = cellText(cell);
        obj[headers[ci]] = val;
        if (val) {
          hasValue = true;
          filled++;
          longest = Math.max(longest, val.length);
        }
        // Notas/comentarios de celda (Google Notes → cell.c en xlsx). Se
        // conservan como "<header>__note" porque contienen los rangos de
        // vacaciones, pero NO se usan como dato de celda.
        if (cell?.c && Array.isArray(cell.c) && cell.c.length > 0) {
          const noteText = (cell.c as Array<{ t?: string }>)
            .map((c) => c.t ?? '')
            .join(' ')
            .trim();
          if (noteText) obj[`${headers[ci]}__note`] = noteText;
        }
      }
      if (!hasValue) continue;
      // Fila comentario: una sola celda con texto largo en una tabla de varias
      // columnas (notas al pie, aclaraciones fuera de la grilla).
      if (headers.length >= 3 && filled === 1 && longest > 50) {
        commentRowsSkipped++;
        continue;
      }
      rows.push(obj);
    }

    return { name, index, headers, rows, headerYearHints, commentRowsSkipped };
  });
}
