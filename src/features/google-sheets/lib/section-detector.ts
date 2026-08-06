// Keyword sets per known dashboard section
const SECTION_KEYWORDS: [string, string[]][] = [
  [
    'Vacaciones',
    [
      'vacacion',
      'vacaciones',
      'ausencia',
      'licencia',
      'dias_tomados',
      'dias_disponibles',
      'dias_libre',
      'permiso',
      'saldo',
      'goce'
    ]
  ],
  [
    'Legajo',
    [
      'nombre_apellido',
      'nombre',
      'empleado',
      'fecha_ingreso',
      'fecha_egreso',
      'dni',
      'cuil',
      'legajo',
      'activo',
      'ingreso',
      'nacimiento',
      'contacto_emergencia',
      'email',
      'mail',
      'direccion',
      'movilidad'
    ]
  ],
  [
    'Sueldos',
    [
      'sueldo',
      'salario',
      'neto',
      'bruto',
      'haberes',
      'remuneracion',
      'descuento',
      'adicional',
      'bono',
      'monto',
      // Require "nombre" or "empleado" together with financial keywords
      // — intentionally NOT including 'moneda' or 'pesos' alone since
      // those appear in non-salary financial sheets too
      'sueldo',
      'salario'
    ]
  ],
  [
    'Asistencia',
    [
      'asistencia',
      'presente',
      'ausente',
      'tardanza',
      'hora_entrada',
      'hora_salida',
      'fichaje',
      'home_office',
      'dia_semana',
      // Single-letter day columns (HO sheet: Lu Ma Mi Ju Vi)
      'lunes',
      'martes',
      'miercoles',
      'jueves',
      'viernes',
      'lu',
      'ma',
      'mi',
      'ju',
      'vi'
    ]
  ],
  [
    'Flota',
    [
      'celular',
      'laptop',
      'dispositivo',
      'numero_serie',
      'imei',
      'modelo',
      'marca',
      'linea',
      'movil',
      'numero',
      'telefono',
      'asignado',
      'procesador',
      'ram',
      'bios',
      'fabricante'
    ]
  ],
  [
    'People',
    ['reunion', 'meeting', 'feedback', 'performance', 'objetivo', 'capacitacion', 'entrenamiento']
  ]
];

// Keywords that belong to Flota but NOT Legajo — prevents "equipo ingreso" from
// scoring for Flota when it clearly means employee team, not device assignment
const FLOTA_REQUIRES_NON_EMPLOYEE = true;

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

import { parseMonthYearHeader } from './parse-spreadsheet';

function matchesKeyword(normalizedHeader: string, keyword: string): boolean {
  const headerTokens = normalizedHeader.split('_').filter(Boolean);
  const keywordTokens = keyword.split('_').filter(Boolean);
  // Keywords de 1-2 letras (los días Lu/Ma/Mi/Ju/Vi de Asistencia) exigen token
  // exacto: con includes() "marzo" matcheaba "ma" y una grilla de sueldos se
  // clasificaba como Asistencia (y no importaba nada).
  return keywordTokens.every((kt) =>
    headerTokens.some((ht) => (kt.length <= 2 ? ht === kt : ht.includes(kt)))
  );
}

// Minimum header-keyword matches required to classify (prevents false positives
// from tabs that have one generic matching column like "moneda" or "equipo")
const MIN_SCORE = 2;

export function suggestSection(headers: string[], tabName?: string): string | null {
  const normalized = headers.map(normalize);

  // Tab name exact / strong match takes absolute priority
  if (tabName) {
    const normalizedTab = normalize(tabName);
    for (const [section, keywords] of SECTION_KEYWORDS) {
      const tabScore = keywords.filter((kw) => matchesKeyword(normalizedTab, kw)).length;
      if (tabScore >= 2) return section;
    }
  }

  // Grilla pivote persona × meses (ej. "Pesos Arg", "USD", "Sueldos ... 20"):
  // las keywords de negocio no la detectan porque sus columnas son meses. Si hay
  // ≥4 columnas-mes y una columna de nombre, es Sueldos (o Vacaciones por nombre).
  const monthLike = headers.filter((h) => parseMonthYearHeader(h)?.month != null).length;
  if (monthLike >= 4) {
    const hasName = normalized.some(
      (h) => matchesKeyword(h, 'nombre') || matchesKeyword(h, 'empleado')
    );
    if (hasName) {
      if (tabName && normalize(tabName).includes('vacacion')) return 'Vacaciones';
      return 'Sueldos';
    }
  }

  let bestSection: string | null = null;
  let bestScore = 0;

  for (const [section, keywords] of SECTION_KEYWORDS) {
    let score = keywords.filter((kw) => normalized.some((h) => matchesKeyword(h, kw))).length;

    // Flota: "equipo" in a clearly employee-data context (has dni/nombre/fecha_ingreso)
    // should NOT score for Flota. Penalise if strong Legajo signals also present.
    if (FLOTA_REQUIRES_NON_EMPLOYEE && section === 'Flota') {
      const legajoSignals = ['dni', 'nacimiento', 'fecha_ingreso', 'contacto_emergencia'];
      const hasStrongLegajo = legajoSignals.some((kw) =>
        normalized.some((h) => matchesKeyword(h, kw))
      );
      if (hasStrongLegajo) score = 0;
    }

    if (score > bestScore) {
      bestScore = score;
      bestSection = section;
    }
  }

  // Require at least MIN_SCORE header matches; otherwise try tab name as weak signal
  if (bestScore < MIN_SCORE) {
    if (tabName) {
      const normalizedTab = normalize(tabName);
      for (const [section, keywords] of SECTION_KEYWORDS) {
        if (keywords.some((kw) => matchesKeyword(normalizedTab, kw))) {
          return section;
        }
      }
    }
    return null;
  }

  return bestSection;
}
