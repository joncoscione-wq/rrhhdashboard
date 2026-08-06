import { supabase } from '@/lib/supabase';
import {
  normalize,
  extractYear,
  parseMonthYearHeader,
  parseDateRangeFromNote
} from './parse-spreadsheet';

// ── types ────────────────────────────────────────────────────────────────────

export type ImportResult = {
  section: string;
  tabName: string;
  created: number;
  updated: number;
  skipped: number;
  error?: string;
};

type ColumnMap = Record<string, string[]>;

// ── normalisation ────────────────────────────────────────────────────────────

function tokens(text: string): string[] {
  return normalize(text).split('_').filter(Boolean);
}

function matchPattern(sheetCol: string, patterns: string[]): boolean {
  const colTokens = tokens(sheetCol);
  return patterns.some((pattern) => {
    const pTokens = tokens(pattern);
    return pTokens.every((pt) => colTokens.some((ct) => ct.includes(pt)));
  });
}

function detectColumns(headers: string[], columnMap: ColumnMap): Record<string, string> {
  const result: Record<string, string> = {};
  for (const header of headers) {
    for (const [dbCol, patterns] of Object.entries(columnMap)) {
      if (result[dbCol]) continue;
      if (matchPattern(header, patterns)) {
        result[dbCol] = header;
        break;
      }
    }
  }
  return result;
}

// ── value parsers ────────────────────────────────────────────────────────────

// Soporta "15/07/2024", "13/3/1995" y años de 2 dígitos ("15/9/25" → 2025).
function parseDate(val: string): string | null {
  if (!val || typeof val !== 'string') return null;
  const ddmmyyyy = val.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (ddmmyyyy) {
    const [, d, m, y] = ddmmyyyy;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(val)) return val.slice(0, 10);
  return null;
}

function parseBool(val: string): boolean | null {
  const clean = val.trim().toLowerCase();
  if (['si', 'sí', 'yes', 'true', 'activo', '1', '✓'].includes(clean)) return true;
  if (['no', 'false', 'inactivo', '0', '✗', 'x', '-'].includes(clean)) return false;
  return null;
}

// "PESOS" | "PESOS ARG" → 'PESOS ARG' · "Dólares" | "USD" → 'USD'
function parseMoneda(raw: string | undefined): 'PESOS ARG' | 'USD' | null {
  if (!raw) return null;
  const n = normalize(raw);
  if (n.includes('usd') || n.includes('dolar')) return 'USD';
  if (n.includes('peso')) return 'PESOS ARG';
  return null;
}

// Soporta tanto "$1.750.000,50" (AR: punto miles, coma decimal) como
// "$1,750,000" (coma miles, sin decimales) — el separador que aparece al
// final con 1 o 2 dígitos se asume decimal; el resto son miles y se descartan.
function parseNumber(val: string): number | null {
  let s = val.trim().replace(/[^0-9.,-]/g, '');
  if (!s) return null;
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (hasComma) {
    const parts = s.split(',');
    const lastPart = parts[parts.length - 1];
    s = parts.length === 2 && lastPart.length <= 2 ? parts.join('.') : parts.join('');
  } else if (hasDot) {
    const parts = s.split('.');
    const lastPart = parts[parts.length - 1];
    if (!(parts.length === 2 && lastPart.length <= 2)) s = parts.join('');
  }
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

// ── FK resolvers ─────────────────────────────────────────────────────────────

async function resolveEmpleadoId(name: string): Promise<number | null> {
  const clean = name.trim();
  if (!clean) return null;

  // Try exact match first
  const { data: exact } = await supabase
    .from('empleados')
    .select('id,nombre_apellido')
    .eq('nombre_apellido', clean)
    .maybeSingle();
  if (exact) return exact.id;

  // Try ilike
  const { data: fuzzy } = await supabase
    .from('empleados')
    .select('id,nombre_apellido')
    .ilike('nombre_apellido', `%${clean}%`)
    .limit(1);
  if (fuzzy && fuzzy.length > 0) return fuzzy[0].id;

  // Try without first name ("BANDIERI, Mariano" → just "Bandieri")
  const surname = clean.split(',')[0].trim();
  if (surname.length >= 3) {
    const { data: bySurname } = await supabase
      .from('empleados')
      .select('id,nombre_apellido')
      .ilike('nombre_apellido', `%${surname}%`)
      .limit(1);
    if (bySurname && bySurname.length > 0) return bySurname[0].id;
  }

  // Nombre y apellido en cualquier orden ("Tubio Eliana" vs "TUBIO, Eliana")
  const inputKey = tokens(clean).toSorted().join('_');
  if (inputKey) {
    const { data: candidatos } = await supabase.from('empleados').select('id,nombre_apellido');
    for (const c of candidatos ?? []) {
      if (tokens(c.nombre_apellido).toSorted().join('_') === inputKey) return c.id;
    }
  }

  return null;
}

// ── column definitions ───────────────────────────────────────────────────────

const LEGAJO_COLUMNS: ColumnMap = {
  nombre_apellido: [
    'Nombre & Apellido',
    'Nombre y Apellido',
    'Apellido y Nombre',
    'nombre_apellido',
    'Empleado',
    'Nombre'
  ],
  activo: ['Activo'],
  fecha_nacimiento: ['Fecha de Nacimiento', 'Nacimiento', 'fecha_nacimiento'],
  dni: ['DNI', 'Documento', 'dni'],
  celular: ['Celular', 'Teléfono', 'celular'],
  contacto_emergencia: ['Contacto Emergencia', 'contacto_emergencia', 'Emergencia'],
  equipo_ingreso: ['Equipo ingreso', 'equipo_ingreso', 'Área', 'Area'],
  fecha_ingreso: ['Fecha de Ingreso', 'fecha_ingreso', 'Ingreso'],
  email: ['Mail Contexto', 'Mail', 'Email', 'Correo', 'email'],
  direccion: ['Dirección', 'Direccion', 'Domicilio', 'direccion'],
  movilidad: ['Movilidad', 'movilidad'],
  modalidad: ['Modalidad', 'modalidad'],
  puesto: ['Puesto de Trabajo', 'Puesto', 'puesto', 'Cargo']
};

// Mínimo de campos de legajo mapeados para CREAR un empleado nuevo. Pestañas
// parciales ("Mails", "Nombre puestos") solo actualizan empleados existentes:
// crear uno nuevo a partir de 1-2 columnas generaba duplicados basura.
const LEGAJO_MIN_CAMPOS_INSERT = 3;

const FLOTA_LINEAS_COLUMNS: ColumnMap = {
  numero: ['Numero', 'Número', 'Línea', 'Linea', 'numero', 'Tel', 'Teléfono'],
  rol: ['Rol', 'rol', 'Uso', 'Tipo'],
  usuario: ['Usuario', 'usuario', 'Empleado', 'Asignado a', 'asignado_a'],
  equipo: ['Equipo', 'equipo', 'Marca', 'Modelo'],
  estado: ['Estado', 'estado', 'Activo']
};

const FLOTA_LAPTOPS_COLUMNS: ColumnMap = {
  marca: ['Marca', 'marca', 'Fabricante'],
  modelo: ['Modelo', 'modelo'],
  numero_serie: ['Numero de Serie', 'Número de Serie', 'Serie', 'numero_serie', 'N° Serie', 'SN'],
  usuario: ['Usuario', 'usuario', 'Empleado', 'Asignado a', 'asignado_a'],
  equipo: ['Equipo', 'equipo', 'Nombre Equipo', 'Hostname'],
  ubicacion: ['Ubicación', 'Ubicacion', 'ubicacion', 'Sede'],
  estado: ['Estado', 'estado', 'Activo'],
  comentarios: ['Comentarios', 'comentarios', 'Notas', 'Observaciones']
};

// ── importers ────────────────────────────────────────────────────────────────

async function importLegajo(
  rows: Record<string, string>[],
  headers: string[]
): Promise<Omit<ImportResult, 'tabName'>> {
  const colMap = detectColumns(headers, LEGAJO_COLUMNS);
  let created = 0,
    updated = 0,
    skipped = 0;

  for (const row of rows) {
    const mapped: Record<string, unknown> = {};

    for (const [dbCol, sheetCol] of Object.entries(colMap)) {
      if (dbCol === 'puesto') continue; // puesto va a su propia tabla
      const raw = (row[sheetCol] ?? '').trim();
      if (!raw) continue;

      if (dbCol === 'fecha_nacimiento' || dbCol === 'fecha_ingreso') {
        const d = parseDate(raw);
        if (d) mapped[dbCol] = d;
      } else if (dbCol === 'activo') {
        const b = parseBool(raw);
        if (b !== null) mapped[dbCol] = b;
      } else if (dbCol === 'email') {
        // Cuando la celda del sheet es un hipervínculo, lo que llega es el href
        // ("mailto:x@y.com") en vez del texto. Quedaron 19 empleados así, y el
        // prefijo además enmascaraba duplicados: dos filas con el mismo mail no
        // chocaban porque una lo tenía con "mailto:" y la otra sin.
        const limpio = raw.replace(/^mailto:/i, '').trim();
        if (limpio && limpio !== '-' && limpio.includes('@')) mapped[dbCol] = limpio;
      } else {
        mapped[dbCol] = raw;
      }
    }

    const puestoVal = colMap.puesto ? (row[colMap.puesto] ?? '').trim() : '';

    if (!mapped.nombre_apellido && !mapped.dni) {
      skipped++;
      continue;
    }

    let existing: { id: number } | null = null;
    if (mapped.dni) {
      const { data } = await supabase
        .from('empleados')
        .select('id')
        .eq('dni', mapped.dni as string)
        .maybeSingle();
      existing = data;
    }
    if (!existing && mapped.nombre_apellido) {
      // Resolución tolerante a formato ("Tomas Rozemberg" ≡ "ROZEMBERG, Tomas")
      const id = await resolveEmpleadoId(mapped.nombre_apellido as string);
      if (id) existing = { id };
    }

    const cantidadCampos = Object.keys(mapped).length;

    if (existing) {
      if (cantidadCampos > 0) {
        const { error } = await supabase.from('empleados').update(mapped).eq('id', existing.id);
        if (error) {
          console.error('[import] empleados update:', error.message);
          skipped++;
          continue;
        }
      }
      if (puestoVal) {
        const { error } = await supabase
          .from('puestos')
          .upsert({ empleado_id: existing.id, puesto: puestoVal }, { onConflict: 'empleado_id' });
        if (error) console.error('[import] puestos upsert:', error.message);
      }
      updated++;
    } else {
      if (cantidadCampos < LEGAJO_MIN_CAMPOS_INSERT) {
        skipped++;
        continue;
      }
      let { data: inserted, error } = await supabase
        .from('empleados')
        .insert({ ...mapped, empresa_id: 1 })
        .select('id')
        .single();

      // La base tiene un índice único sobre el nombre normalizado, así que si
      // este nombre ya existe con otro formato ("Barbara Urrutia" vs
      // "URRUTIA, Barbara") el insert rebota. No es un error: es el mismo
      // empleado, y lo que corresponde es actualizarlo, no descartar la fila.
      if (error?.code === '23505') {
        const id = await resolveEmpleadoId(mapped.nombre_apellido as string);
        if (id) {
          const { error: updateError } = await supabase
            .from('empleados')
            .update(mapped)
            .eq('id', id);
          if (updateError) {
            console.error('[import] empleados update tras duplicado:', updateError.message);
            skipped++;
            continue;
          }
          if (puestoVal) {
            await supabase
              .from('puestos')
              .upsert({ empleado_id: id, puesto: puestoVal }, { onConflict: 'empleado_id' });
          }
          updated++;
          continue;
        }
        console.error('[import] empleados duplicado sin resolver:', mapped.nombre_apellido);
      }

      if (error) {
        console.error('[import] empleados insert:', error.message);
        skipped++;
      } else {
        if (puestoVal && inserted) {
          await supabase
            .from('puestos')
            .upsert({ empleado_id: inserted.id, puesto: puestoVal }, { onConflict: 'empleado_id' });
        }
        created++;
      }
    }
  }

  return { section: 'Legajo', created, updated, skipped };
}

async function importVacaciones(
  rows: Record<string, string>[],
  headers: string[],
  tabName: string,
  yearHints: Record<string, number> = {}
): Promise<Omit<ImportResult, 'tabName'>> {
  let created = 0,
    updated = 0,
    skipped = 0;

  // Año de la pestaña solo como último recurso: las grillas viejas mezclan
  // varios períodos lado a lado y un año único importaba días al año equivocado.
  const tabYearMatch = tabName.match(/\b(20\d{2})\b/);
  const tabYear = tabYearMatch ? parseInt(tabYearMatch[1]) : null;

  // Detect name column (first non-numeric column)
  const sample = rows.slice(0, 8);
  let nameCol: string | null = null;
  for (const h of headers) {
    const vals = sample.map((r) => r[h] ?? '').filter(Boolean);
    if (vals.length === 0) continue;
    const nonNumeric = vals.filter((v) => isNaN(Number(v.replace(/[.,\s]/g, ''))));
    if (nonNumeric.length >= Math.ceil(vals.length * 0.6)) {
      nameCol = h;
      break;
    }
  }
  if (!nameCol) return { section: 'Vacaciones', created: 0, updated: 0, skipped: rows.length };

  // Columnas de mes, cada una con SU año (encabezado "Dic 24", fecha 23/11/2024,
  // o heredado de la fila de grupo mergeada "Periodo 2024 / ...").
  type MonthCol = { header: string; month: number; year: number | null };
  const monthCols: MonthCol[] = [];
  for (const h of headers) {
    if (h === nameCol) continue;
    const my = parseMonthYearHeader(h);
    if (my?.month != null) {
      monthCols.push({ header: h, month: my.month, year: my.year ?? yearHints[h] ?? tabYear });
    }
  }

  // Columnas de saldo: QDIASxx = días correspondientes; última SALDO = saldo
  // actual del período (la grilla trae varias columnas "Saldo"/"SALDO").
  const qdiasCol = headers.find((h) => normalize(h).startsWith('qdias'));
  const saldoCols = headers.filter((h) => /^saldo(_\d+)?$/.test(normalize(h)));
  const saldoCol = saldoCols[saldoCols.length - 1];

  const distinctYears = [
    ...new Set(monthCols.map((c) => c.year).filter((y): y is number => y != null))
  ];
  const balanceYear =
    (qdiasCol ? extractYear(qdiasCol) : null) ??
    tabYear ??
    (distinctYears.length === 1 ? distinctYears[0] : null);

  for (const row of rows) {
    const rawName = (row[nameCol] ?? '').trim();
    if (!rawName) {
      skipped++;
      continue;
    }

    const empleadoId = await resolveEmpleadoId(rawName);
    if (!empleadoId) {
      skipped++;
      continue;
    }

    let registeredFromNote = false;

    for (const mc of monthCols) {
      // La nota de celda trae el rango exacto ("5/3 - 26/3", "4 al 15"…);
      // el mes de contexto es el de la propia columna.
      const noteRaw = row[`${mc.header}__note`] ?? '';
      if (!noteRaw || mc.year == null) continue;

      const range = parseDateRangeFromNote(noteRaw, mc.year, mc.month);
      if (!range) continue;

      // Dedupe real: mismo período de vacaciones ya registrado para ese año
      const { data: vac } = await supabase
        .from('vacaciones')
        .select('id')
        .eq('empleado_id', empleadoId)
        .eq('anio', mc.year)
        .maybeSingle();
      let yaRegistrado = false;
      if (vac) {
        const { data: dia } = await supabase
          .from('vacaciones_dias')
          .select('id')
          .eq('vacaciones_id', vac.id)
          .eq('fecha_inicio', range.inicio)
          .maybeSingle();
        yaRegistrado = !!dia;
      }

      if (!yaRegistrado) {
        await supabase.rpc('registrar_vacaciones', {
          p_empleado_id: empleadoId,
          p_fecha_inicio: range.inicio,
          p_fecha_fin: range.fin,
          p_periodo_anio: mc.year
        });
        created++;
      } else {
        updated++;
      }
      registeredFromNote = true;
    }

    if (registeredFromNote) continue;

    // Sin notas con fecha parseable: actualizar el saldo anual, pero SOLO si el
    // año es atribuible sin ambigüedad. Una grilla con varios períodos mezclados
    // se saltea explícitamente (y se cuenta) en vez de importar al año incorrecto.
    if (balanceYear == null) {
      skipped++;
      continue;
    }

    let totalDias = 0;
    for (const mc of monthCols) {
      if (mc.year !== balanceYear) continue;
      const dias = parseNumber(row[mc.header] ?? '');
      if (dias && dias > 0) totalDias += dias;
    }

    const qdias = qdiasCol ? parseNumber(row[qdiasCol] ?? '') : null;
    const saldoSheet = saldoCol ? parseNumber(row[saldoCol] ?? '') : null;
    const saldoInicial = qdias ?? 14;
    const saldoActual = saldoSheet ?? saldoInicial - totalDias;

    const { data: existing } = await supabase
      .from('vacaciones')
      .select('id')
      .eq('empleado_id', empleadoId)
      .eq('anio', balanceYear)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from('vacaciones')
        .update({
          saldo_actual: saldoActual,
          saldo_inicial: saldoInicial,
          dias_correspondientes: saldoInicial
        })
        .eq('id', existing.id);
      if (error) {
        console.error('[import] vacaciones update:', error.message);
        skipped++;
      } else {
        updated++;
      }
    } else {
      const { error } = await supabase.from('vacaciones').insert({
        empleado_id: empleadoId,
        anio: balanceYear,
        saldo_inicial: saldoInicial,
        dias_correspondientes: saldoInicial,
        saldo_actual: saldoActual
      });
      if (error) {
        console.error('[import] vacaciones insert:', error.message);
        skipped++;
      } else {
        created++;
      }
    }
  }

  return { section: 'Vacaciones', created, updated, skipped };
}

async function importLineasMoviles(
  rows: Record<string, string>[],
  headers: string[]
): Promise<Omit<ImportResult, 'tabName'>> {
  const colMap = detectColumns(headers, FLOTA_LINEAS_COLUMNS);
  let created = 0,
    updated = 0,
    skipped = 0;

  for (const row of rows) {
    const mapped: Record<string, unknown> = {};

    for (const [dbCol, sheetCol] of Object.entries(colMap)) {
      const raw = (row[sheetCol] ?? '').trim();
      if (!raw) continue;
      mapped[dbCol] = raw;
    }

    if (!mapped.numero) {
      skipped++;
      continue;
    }

    // Resolve empleado if usuario name is provided
    if (mapped.usuario && typeof mapped.usuario === 'string') {
      const id = await resolveEmpleadoId(mapped.usuario);
      if (id) mapped.empleado_id = id;
    }

    const { data: existing } = await supabase
      .from('lineas_moviles')
      .select('id')
      .eq('numero', mapped.numero as string)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase.from('lineas_moviles').update(mapped).eq('id', existing.id);
      if (error) {
        console.error('[import] lineas_moviles update:', error.message);
        skipped++;
      } else {
        updated++;
      }
    } else {
      const { error } = await supabase.from('lineas_moviles').insert({ ...mapped, empresa_id: 1 });
      if (error) {
        console.error('[import] lineas_moviles insert:', error.message);
        skipped++;
      } else {
        created++;
      }
    }
  }

  return { section: 'Flota', created, updated, skipped };
}

async function importLaptops(
  rows: Record<string, string>[],
  headers: string[]
): Promise<Omit<ImportResult, 'tabName'>> {
  const colMap = detectColumns(headers, FLOTA_LAPTOPS_COLUMNS);
  let created = 0,
    updated = 0,
    skipped = 0;

  for (const row of rows) {
    const mapped: Record<string, unknown> = {};

    for (const [dbCol, sheetCol] of Object.entries(colMap)) {
      const raw = (row[sheetCol] ?? '').trim();
      if (!raw) continue;
      mapped[dbCol] = raw;
    }

    if (!mapped.numero_serie && !mapped.modelo) {
      skipped++;
      continue;
    }

    if (mapped.usuario && typeof mapped.usuario === 'string') {
      const id = await resolveEmpleadoId(mapped.usuario);
      if (id) mapped.empleado_id = id;
    }

    let existing: { id: number } | null = null;
    if (mapped.numero_serie) {
      const { data } = await supabase
        .from('flota_laptops')
        .select('id')
        .eq('numero_serie', mapped.numero_serie as string)
        .maybeSingle();
      existing = data;
    }

    if (existing) {
      const { error } = await supabase.from('flota_laptops').update(mapped).eq('id', existing.id);
      if (error) {
        console.error('[import] flota_laptops update:', error.message);
        skipped++;
      } else {
        updated++;
      }
    } else {
      const { error } = await supabase.from('flota_laptops').insert(mapped);
      if (error) {
        console.error('[import] flota_laptops insert:', error.message);
        skipped++;
      } else {
        created++;
      }
    }
  }

  return { section: 'Flota', created, updated, skipped };
}

// ── sueldos ──────────────────────────────────────────────────────────────────

// Upsert por (empleado, mes, anio, moneda). En update solo toca los campos
// presentes: un bono no pisa el monto ya cargado y viceversa.
async function upsertSueldo(opts: {
  empleadoId: number;
  mes: number;
  anio: number;
  moneda: 'PESOS ARG' | 'USD';
  monto?: number | null;
  bono?: number | null;
}): Promise<'created' | 'updated' | 'skipped'> {
  const { data: existing } = await supabase
    .from('sueldos')
    .select('id')
    .eq('empleado_id', opts.empleadoId)
    .eq('mes', opts.mes)
    .eq('anio', opts.anio)
    .eq('moneda', opts.moneda)
    .maybeSingle();

  if (existing) {
    const patch: Record<string, unknown> = {};
    if (opts.monto != null) patch.monto = opts.monto;
    if (opts.bono != null) patch.bono_anual = opts.bono;
    if (Object.keys(patch).length === 0) return 'skipped';
    const { error } = await supabase.from('sueldos').update(patch).eq('id', existing.id);
    if (error) {
      console.error('[import] sueldos update:', error.message);
      return 'skipped';
    }
    return 'updated';
  }

  const { error } = await supabase.from('sueldos').insert({
    empresa_id: 1,
    empleado_id: opts.empleadoId,
    mes: opts.mes,
    anio: opts.anio,
    moneda: opts.moneda,
    monto: opts.monto ?? null,
    bono_anual: opts.bono ?? null
  });
  if (error) {
    console.error('[import] sueldos insert:', error.message);
    return 'skipped';
  }
  return 'created';
}

function mode(nums: number[]): number | null {
  if (!nums.length) return null;
  const freq = new Map<number, number>();
  for (const n of nums) freq.set(n, (freq.get(n) ?? 0) + 1);
  let best: number | null = null;
  let bestCount = 0;
  for (const [n, count] of freq) {
    if (count > bestCount) {
      best = n;
      bestCount = count;
    }
  }
  return best;
}

// El bono se registra en junio (convención de la empresa, ver migración
// cargar_bonos) del año que se pueda resolver para esa columna.
const MES_BONO = 6;

async function importSueldos(
  rows: Record<string, string>[],
  headers: string[],
  tabName: string,
  yearHints: Record<string, number> = {}
): Promise<Omit<ImportResult, 'tabName'>> {
  let created = 0,
    updated = 0,
    skipped = 0;

  const normalizedTab = normalize(tabName);
  const tabMoneda = normalizedTab.includes('usd') ? ('USD' as const) : ('PESOS ARG' as const);
  const tabYearMatch = tabName.match(/\b(20\d{2})\b/);
  const tabYear = tabYearMatch ? parseInt(tabYearMatch[1]) : null;

  const monedaCol = headers.find((h) => normalize(h) === 'moneda');

  // Columna de nombres (primera mayormente texto)
  const sample = rows.slice(0, 8);
  let nameCol: string | null = null;
  for (const h of headers) {
    if (h === monedaCol) continue;
    const vals = sample.map((r) => r[h] ?? '').filter(Boolean);
    if (vals.length === 0) continue;
    const nonNumeric = vals.filter((v) => isNaN(Number(v.replace(/[.,\s]/g, ''))));
    if (nonNumeric.length >= Math.ceil(vals.length * 0.6)) {
      nameCol = h;
      break;
    }
  }

  // Columnas de mes y de bono, cada una con su año. La grilla "Pesos Arg"/"USD"
  // trae el año en cada encabezado ("ene-23"); la grilla "Sueldos ... 20" no
  // trae año en los meses y hay que resolverlo por contexto.
  type SueldoCol = { header: string; month: number | null; year: number | null; isBonus: boolean };
  const cols: SueldoCol[] = [];
  for (const h of headers) {
    if (h === nameCol || h === monedaCol) continue;
    const isBonus = /bono|bonus|aguinaldo/.test(normalize(h));
    const my = parseMonthYearHeader(h);
    if (my?.month != null || isBonus) {
      cols.push({
        header: h,
        month: my?.month ?? null,
        year: my?.year ?? yearHints[h] ?? null,
        isBonus
      });
    }
  }

  const explicitYears = cols.map((c) => c.year).filter((y): y is number => y != null);
  const fallbackYear = mode(explicitYears) ?? tabYear ?? mode(Object.values(yearHints));

  // Resolución de año por columna, en orden de izquierda a derecha:
  // propio → fila de grupo → columna anterior (+1 si el mes "da la vuelta" de
  // diciembre a enero, ej. una columna "Enero" extra al final) → fallback.
  let lastYear: number | null = null;
  let lastMonth: number | null = null;
  const resolved = cols.map((c) => {
    let year = c.year;
    if (year == null && lastYear != null) {
      year = c.month != null && lastMonth != null && c.month <= lastMonth ? lastYear + 1 : lastYear;
    }
    if (year == null) year = fallbackYear;
    if (year != null) {
      lastYear = year;
      if (c.month != null) lastMonth = c.month;
    }
    return { ...c, year };
  });

  const monthCols = resolved.filter((c) => !c.isBonus && c.month != null);
  const bonusCols = resolved.filter((c) => c.isBonus);

  const track = (r: 'created' | 'updated' | 'skipped') => {
    if (r === 'created') created++;
    else if (r === 'updated') updated++;
    else skipped++;
  };

  // ── Formato pivote: filas empleado × columnas mes ──────────────────────────
  if (nameCol && monthCols.length > 0) {
    for (const row of rows) {
      const empName = (row[nameCol] ?? '').trim();
      if (!empName) {
        skipped++;
        continue;
      }
      const empleadoId = await resolveEmpleadoId(empName);
      if (!empleadoId) {
        skipped++;
        continue;
      }
      // La moneda puede venir por fila (columna "Moneda") o por pestaña ("USD")
      const moneda = (monedaCol ? parseMoneda(row[monedaCol]) : null) ?? tabMoneda;

      for (const c of monthCols) {
        if (c.year == null || c.month == null) continue;
        const monto = parseNumber(row[c.header] ?? '');
        if (!monto) continue;
        track(await upsertSueldo({ empleadoId, mes: c.month, anio: c.year, moneda, monto }));
      }
      for (const b of bonusCols) {
        const year = b.year ?? fallbackYear;
        if (year == null) continue;
        const bono = parseNumber(row[b.header] ?? '');
        if (bono == null || bono <= 0) continue; // 0 = sin bono, nada que escribir
        track(await upsertSueldo({ empleadoId, mes: MES_BONO, anio: year, moneda, bono }));
      }
    }
    return { section: 'Sueldos', created, updated, skipped };
  }

  // ── Formato plano: columnas empleado/mes/año/monto ─────────────────────────
  // Incluye pestañas dedicadas a bonos ("Bonos Junio 2025": Nombre/Moneda/Monto,
  // sin columna de mes — el año sale del nombre de la pestaña).
  const isBonoTab = /bono/.test(normalizedTab);
  const colMap = detectColumns(headers, {
    nombre: ['Nombre', 'Empleado', 'nombre_apellido', 'Apellido y Nombre'],
    mes: ['Mes', 'mes', 'Periodo'],
    anio: ['Año', 'Anio', 'anio'],
    monto: ['Monto', 'monto', 'Sueldo', 'Neto', 'Salario', 'Total', 'Importe']
  });

  for (const row of rows) {
    const empName = (colMap.nombre ? row[colMap.nombre] : '')?.trim();
    if (!empName) {
      skipped++;
      continue;
    }
    const empleadoId = await resolveEmpleadoId(empName);
    if (!empleadoId) {
      skipped++;
      continue;
    }
    const moneda = (monedaCol ? parseMoneda(row[monedaCol]) : null) ?? tabMoneda;

    if (isBonoTab) {
      if (tabYear == null) {
        skipped++;
        continue;
      }
      const bono = colMap.monto ? parseNumber(row[colMap.monto] ?? '') : null;
      if (bono == null || bono <= 0) continue;
      track(await upsertSueldo({ empleadoId, mes: MES_BONO, anio: tabYear, moneda, bono }));
      continue;
    }

    const mes = colMap.mes ? parseInt(row[colMap.mes] ?? '') : NaN;
    const rowAnio = colMap.anio ? parseInt(row[colMap.anio] ?? '') : (tabYear ?? NaN);
    const monto = colMap.monto ? parseNumber(row[colMap.monto] ?? '') : null;

    if (!monto || isNaN(mes) || mes < 1 || mes > 12 || isNaN(rowAnio)) {
      skipped++;
      continue;
    }

    track(await upsertSueldo({ empleadoId, mes, anio: rowAnio, moneda, monto }));
  }
  return { section: 'Sueldos', created, updated, skipped };
}

// ── main entry ───────────────────────────────────────────────────────────────

export async function importSheetData(
  section: string | null,
  rows: Record<string, string>[],
  headers: string[],
  tabName: string,
  yearHints: Record<string, number> = {}
): Promise<ImportResult | null> {
  if (!section || rows.length === 0) return null;

  let result: Omit<ImportResult, 'tabName'>;

  switch (section) {
    case 'Legajo':
      result = await importLegajo(rows, headers);
      break;
    case 'Vacaciones':
      result = await importVacaciones(rows, headers, tabName, yearHints);
      break;
    case 'Sueldos':
      result = await importSueldos(rows, headers, tabName, yearHints);
      break;
    case 'Flota':
      // Laptops primero: "Numero de serie" también matchea el patrón "Numero"
      // de líneas móviles y desviaba las tabs de equipos (bug de flota_laptops vacía)
      if (headers.some((h) => matchPattern(h, ['Numero de Serie', 'Serie', 'SN']))) {
        result = await importLaptops(rows, headers);
      } else if (headers.some((h) => matchPattern(h, ['Numero', 'Número', 'Línea', 'Linea']))) {
        result = await importLineasMoviles(rows, headers);
      } else {
        result = await importLaptops(rows, headers);
      }
      break;
    default:
      return null;
  }

  return { ...result, tabName };
}
