import { supabase } from '@/lib/supabase';

export type AssistantMode = 'chat' | 'build';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export async function buildSystemPrompt(mode: AssistantMode): Promise<string> {
  const [
    sheetsRes,
    syncsRes,
    empleadosRes,
    memoryRes,
    laptopsRes,
    lineasRes,
    vacacionesRes,
    vacacionesDiasRes,
    sueldosRes,
    homeOfficeRes,
    reunionesRes,
    eventosRes,
    manualesRes,
    notificacionesRes,
    reglasRes
  ] = await Promise.all([
    supabase.from('google_sheets').select('name, url'),
    supabase
      .from('sheet_syncs')
      .select('tab_name, suggested_section, headers, synced_at, row_count')
      .order('synced_at', { ascending: false })
      .limit(50),
    supabase
      .from('empleados')
      .select(
        'id, nombre_apellido, activo, dni, equipo_ingreso, fecha_ingreso, fecha_nacimiento, email, celular, direccion, modalidad, movilidad, contacto_emergencia, puesto:puestos(puesto)'
      )
      .order('nombre_apellido'),
    supabase
      .from('ai_context_memory')
      .select('key, value, description')
      .order('updated_at', { ascending: false }),
    supabase
      .from('flota_laptops')
      .select('id, marca, modelo, numero_serie, estado, usuario, equipo, ubicacion, comentarios')
      .order('usuario'),
    supabase
      .from('lineas_moviles')
      .select('id, numero, rol, usuario, equipo, estado')
      .order('usuario'),
    supabase
      .from('vacaciones')
      .select('empleado_id, anio, saldo_inicial, dias_correspondientes, saldo_actual')
      .order('anio', { ascending: false }),
    supabase.rpc('get_vacaciones_calendario'),
    supabase
      .from('sueldos')
      .select('empleado_id, moneda, mes, anio, monto, bono_anual')
      .order('anio', { ascending: false })
      .order('mes', { ascending: false })
      .limit(600),
    supabase
      .from('home_office_semanal')
      .select('empleado_id, dia_semana, modalidad')
      .is('fecha_hasta', null),
    supabase.from('reuniones').select('*').order('fecha', { ascending: false }).limit(50),
    supabase.rpc('get_eventos_calendario'),
    supabase.from('manuales').select('tarea, area, link_manual, nombre_archivo').order('area'),
    supabase
      .from('notificaciones')
      .select('entidad, accion, descripcion, created_at')
      .order('created_at', { ascending: false })
      .limit(15),
    supabase.rpc('ai_schema_rules')
  ]);

  const sheets = sheetsRes.data ?? [];
  const syncs = syncsRes.data ?? [];
  const memory = memoryRes.data ?? [];
  const empleados = empleadosRes.data ?? [];
  const laptops = laptopsRes.data ?? [];
  const lineas = lineasRes.data ?? [];
  const vacaciones = vacacionesRes.data ?? [];
  const vacacionesDias = (vacacionesDiasRes.data ?? []) as Record<string, unknown>[];
  const sueldos = sueldosRes.data ?? [];
  const homeOffice = homeOfficeRes.data ?? [];
  const reuniones = reunionesRes.data ?? [];
  const eventos = (eventosRes.data ?? []) as Record<string, unknown>[];
  const manuales = manualesRes.data ?? [];
  const notificaciones = notificacionesRes.data ?? [];
  const reglas = (reglasRes.data ?? []) as {
    tabla: string;
    tipo_regla: string;
    detalle: string;
  }[];

  // Mapa id → nombre para que la IA no tenga que cruzar ids a mano
  const nombrePorId = new Map(empleados.map((e) => [e.id, e.nombre_apellido]));
  const nombre = (id: number | null) =>
    (id !== null ? nombrePorId.get(id) : null) ?? `empleado_id=${id}`;

  // Deduplicate tabs, keep latest
  const tabMap = new Map<string, (typeof syncs)[0]>();
  for (const s of syncs) {
    if (!tabMap.has(s.tab_name)) tabMap.set(s.tab_name, s);
  }
  const latestTabs = [...tabMap.values()];

  const sheetList = sheets.map((s) => `  - "${s.name}"`).join('\n');

  const hoPorEmpleado = new Map<number, string[]>();
  for (const h of homeOffice) {
    const arr = hoPorEmpleado.get(h.empleado_id) ?? [];
    arr.push(`${h.dia_semana}: ${h.modalidad}`);
    hoPorEmpleado.set(h.empleado_id, arr);
  }

  const empleadosList = empleados
    .map((e) => {
      const puesto = (e.puesto as { puesto: string }[] | { puesto: string } | null) ?? null;
      const puestoStr = Array.isArray(puesto) ? puesto[0]?.puesto : puesto?.puesto;
      const campos = [
        `id=${e.id}`,
        e.nombre_apellido,
        e.activo ? 'activo' : 'inactivo',
        e.dni ? `DNI: ${e.dni}` : null,
        puestoStr ? `puesto: ${puestoStr}` : null,
        e.equipo_ingreso ? `equipo: ${e.equipo_ingreso}` : null,
        e.fecha_ingreso ? `ingreso: ${e.fecha_ingreso}` : null,
        e.fecha_nacimiento ? `nacimiento: ${e.fecha_nacimiento}` : null,
        e.email ? `email: ${e.email}` : null,
        e.celular ? `celular: ${e.celular}` : null,
        e.direccion ? `dirección: ${e.direccion}` : null,
        e.modalidad ? `modalidad: ${e.modalidad}` : null,
        e.movilidad ? `movilidad: ${e.movilidad}` : null,
        e.contacto_emergencia ? `emergencia: ${e.contacto_emergencia}` : null
      ].filter(Boolean);
      const ho = hoPorEmpleado.get(e.id);
      return `  ${campos.join(' | ')}${ho ? `\n    home office semanal → ${ho.join(', ')}` : ''}`;
    })
    .join('\n');

  const tabList = latestTabs
    .map(
      (t) =>
        `  - "${t.tab_name}" → sección: ${t.suggested_section ?? 'sin clasificar'} | columnas: ${(t.headers as string[]).join(', ')}${t.row_count ? ` | filas: ${t.row_count}` : ''}`
    )
    .join('\n');

  const memoryList =
    memory.length > 0
      ? memory
          .map((m) => `  [${m.key}] ${m.description ?? ''}: ${JSON.stringify(m.value)}`)
          .join('\n')
      : '  (sin memoria acumulada)';

  const laptopsList =
    laptops.length > 0
      ? laptops
          .map(
            (l) =>
              `  - marca: ${l.marca ?? 'N/D'} | modelo: ${l.modelo ?? 'N/D'} | serie: ${l.numero_serie ?? 'N/D'} | estado: ${l.estado ?? 'N/D'} | usuario: ${l.usuario ?? 'N/D'} | equipo: ${l.equipo ?? 'N/D'} | ubicación: ${l.ubicacion ?? 'N/D'}${l.comentarios ? ` | comentarios: ${l.comentarios}` : ''}`
          )
          .join('\n')
      : '  (sin laptops registradas en Supabase)';

  const lineasList =
    lineas.length > 0
      ? lineas
          .map(
            (l) =>
              `  - número: ${l.numero ?? 'N/D'} | rol: ${l.rol ?? 'N/D'} | usuario: ${l.usuario ?? 'N/D'} | equipo: ${l.equipo ?? 'N/D'} | estado: ${l.estado ?? 'N/D'}`
          )
          .join('\n')
      : '  (sin líneas móviles registradas en Supabase)';

  const vacacionesList =
    vacaciones.length > 0
      ? vacaciones
          .map(
            (v) =>
              `  ${nombre(v.empleado_id)} | año=${v.anio} | saldo_inicial=${v.saldo_inicial ?? 'N/D'} | días_correspondientes=${v.dias_correspondientes ?? 'N/D'} | saldo_actual=${v.saldo_actual ?? 'N/D'}`
          )
          .join('\n')
      : '  (sin registros de vacaciones en Supabase)';

  const vacacionesDiasList =
    vacacionesDias.length > 0
      ? vacacionesDias
          .map((v) => {
            const fechas =
              v.fecha_inicio && v.fecha_fin ? ` | del ${v.fecha_inicio} al ${v.fecha_fin}` : '';
            return `  ${v.nombre_apellido} | ${MESES[(v.mes as number) - 1]} ${v.anio_uso} | ${v.dias_usados} días${fechas}`;
          })
          .join('\n')
      : '  (sin días de vacaciones registrados)';

  const sueldosList =
    sueldos.length > 0
      ? sueldos
          .map(
            (s) =>
              `  ${nombre(s.empleado_id)} | ${s.moneda} | ${s.mes}/${s.anio} | monto=${s.monto ?? 'N/D'}${s.bono_anual ? ` | bono=${s.bono_anual}` : ''}`
          )
          .join('\n')
      : '  (sin sueldos registrados en Supabase)';

  const reunionesList =
    reuniones.length > 0
      ? reuniones
          .map(
            (r) =>
              `  - ${r.fecha}${r.hora ? ` ${r.hora}` : ''} | ${r.titulo}${r.duracion ? ` | ${r.duracion} min` : ''} | participantes: ${(r.participantes ?? []).join(', ') || 'N/D'}${r.resumen ? ` | resumen: ${r.resumen}` : ''}`
          )
          .join('\n')
      : '  (sin reuniones registradas)';

  const eventosList =
    eventos.length > 0
      ? eventos
          .map(
            (e) =>
              `  - ${e.fecha} | ${e.tipo} | ${e.nombre_apellido}${e.descripcion ? ` | ${e.descripcion}` : ''}`
          )
          .join('\n')
      : '  (sin eventos de calendario registrados)';

  const manualesList =
    manuales.length > 0
      ? manuales
          .map(
            (m) =>
              `  - [${m.area ?? 'sin área'}] ${m.tarea ?? 'N/D'}${m.link_manual ? ` | link: ${m.link_manual}` : ''}${m.nombre_archivo ? ` | archivo: ${m.nombre_archivo}` : ''}`
          )
          .join('\n')
      : '  (sin manuales registrados)';

  // En modo build el agente tiene `query_data` y lee lo que necesita, así que
  // volcarle todo acá solo gasta contexto y le tapa las instrucciones. Se deja
  // la lista de empleados (necesita los ids para todo) y se reemplaza el resto
  // por un puntero. En modo chat se sigue volcando: no encadena consultas.
  // Reglas reales del esquema, leídas de Postgres. Sin esto el modelo adivina
  // los valores permitidos y termina forzando el dato en la columna equivocada.
  const reglasPorTabla = new Map<string, { checks: string[]; obligatorias: string[] }>();
  for (const r of reglas) {
    const entry = reglasPorTabla.get(r.tabla) ?? { checks: [], obligatorias: [] };
    if (r.tipo_regla === 'check') {
      const limpio = r.detalle.replace(/::text/g, '');
      // "CHECK ((tipo = ANY (ARRAY['estudio', 'mudanza'])))" → "tipo: 'estudio' | 'mudanza'"
      const enumerado = limpio.match(/\((\w+)\s*=\s*ANY\s*\(ARRAY\[(.*?)\]\)\)/);
      entry.checks.push(
        enumerado
          ? `${enumerado[1]}: ${enumerado[2].split(', ').join(' | ')}`
          : // "CHECK (((mes >= 1) AND (mes <= 12)))" → "mes >= 1 AND mes <= 12"
            limpio
              .replace(/^CHECK\s*/, '')
              .replace(/[()]/g, ' ')
              .replace(/\s+/g, ' ')
              .trim()
      );
    } else {
      entry.obligatorias.push(r.detalle);
    }
    reglasPorTabla.set(r.tabla, entry);
  }

  const reglasList =
    reglasPorTabla.size > 0
      ? [...reglasPorTabla.entries()]
          .map(([tabla, { checks, obligatorias }]) =>
            [
              `- \`${tabla}\``,
              checks.length > 0 ? `    valores permitidos → ${checks.join(' · ')}` : null,
              obligatorias.length > 0 ? `    obligatorias → ${obligatorias.join(', ')}` : null
            ]
              .filter(Boolean)
              .join('\n')
          )
          .join('\n')
      : '  (no se pudieron leer las reglas del esquema)';

  const bajoDemanda = (lista: string, tabla: string) =>
    mode === 'build' ? `  (consultalo con query_data sobre \`${tabla}\`)` : lista;

  const actividadList =
    notificaciones.length > 0
      ? notificaciones
          .map(
            (n) =>
              `  - ${n.created_at?.slice(0, 10)} | ${n.accion} en ${n.entidad}: ${n.descripcion}`
          )
          .join('\n')
      : '  (sin actividad reciente)';

  const buildModeInstructions =
    mode === 'build'
      ? `
## MODO BUILD — Podés proponer acciones

En modo build proponés acciones concretas llamando a la **herramienta \`propose_action\`**. NO escribas el JSON de la acción en el texto de tu respuesta: usá siempre la tool.
Nunca ejecutes nada directamente. Cada acción propuesta se muestra al usuario para que la confirme antes de ejecutarse, queda registrada con el estado anterior y posterior de las filas, y se puede deshacer.

**Verificá antes de proponer.** Encadená \`query_data\` las veces que haga falta hasta tener certeza, y recién después llamá a \`propose_action\`. Si vas a cargar datos que vienen de un sheet, leelos de \`sheet_rows\` primero: nunca los transcribas de memoria ni del pedido del usuario sin confirmarlos contra la base.

Tipos de acciones que podés proponer:
- \`upsert\`: insertar o actualizar registros en una tabla de negocio
- \`update\`: modificar campos específicos de registros existentes (incluí la \`match_column\`, normalmente \`id\`)
- \`delete\`: marcar registros como inactivos (nunca borrar físicamente empleados)

### Claves de conflicto por tabla (para \`conflict_column\` en upsert)
Si usás la clave natural en vez de \`id\`, el upsert actualiza la fila existente en lugar de duplicarla:
- \`sueldos\` → \`empleado_id,mes,anio,moneda\` — **la moneda es parte de la clave**: un empleado puede cobrar en PESOS ARG y en USD el mismo mes, y son dos filas distintas
- \`vacaciones\` → \`empleado_id,anio\`
- \`vacaciones_dias\` → \`vacaciones_id,anio_uso,mes\`
- \`home_office_semanal\` → \`empleado_id,dia_semana,fecha_desde\`
- \`eventos_calendario\` → \`empleado_id,tipo,fecha\`
- \`puestos\` → \`empleado_id\`
- \`lineas_moviles\` → \`numero\`
- \`empleados\` → \`id\`, o \`empresa_id,dni\` / \`empresa_id,email\`
- \`flota_laptops\`, \`manuales\`, \`reuniones\` → solo \`id\` (no tienen clave natural única; para altas nuevas no mandes \`id\` y se autogenera)

Podés actuar sobre cualquier sección de un legajo: datos personales y de contacto (\`empleados\`), puesto (\`puestos\`), home office (\`home_office_semanal\`), sueldos y bonos (\`sueldos\`), vacaciones (\`vacaciones\`). Usá siempre el \`id\` numérico del empleado, verificado con \`query_data\`.

Reglas de riesgo:
- low: afecta 1 registro, reversible
- medium: afecta múltiples registros o requiere resolución de FK
- high: afecta >20 registros o modifica columnas críticas (moneda, monto, activo)

Ante riesgo HIGH siempre pedí confirmación explícita al usuario antes de llamar propose_action.
`
      : `
## MODO CHAT — Solo lectura

En modo chat podés leer con \`query_data\` pero no podés proponer ni ejecutar escrituras.
Si el usuario pide hacer un cambio, informale que active el Modo Build.
`;

  return `# Asistente de RRHH — PetraLabs Dashboard

Sos el asistente inteligente del dashboard de Recursos Humanos de PetraLabs.
Tu misión es ayudar a interpretar, cruzar y mantener los datos de RRHH.

## ⚠️ REGLA FUNDAMENTAL — NO ALUCINACIÓN

**SOLO podés afirmar datos que aparezcan en este contexto o que hayas leído con \`query_data\`.**

- Si un campo aparece como "N/D" → decí exactamente eso: "no hay dato registrado"
- Si una tabla aparece vacía → informalo, no inventes registros
- Si el dato no está en el contexto, **consultalo con \`query_data\` antes de responder**. Recién si tampoco está ahí, decí que no lo tenés.
- **NUNCA inventes, estimes, interpoles ni completes valores faltantes**
- **NUNCA uses tu conocimiento general del mundo para rellenar datos de negocio** (ej: no asumas marcas, modelos, montos, nombres)
- Ante duda sobre un dato, preguntá antes de asumir
- Cuando el usuario te pregunte algo y los datos no están completos, indicá exactamente qué campos están vacíos

## Fecha actual
${new Date().toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}

## Herramienta de lectura — \`query_data\`

Tenés acceso directo a la base en modo solo lectura. Usala sin pedir permiso, todas las veces que haga falta.

- Sirve para las tablas de negocio y también para \`sheet_rows\`, que tiene las filas crudas de los Google Sheets importados (la columna \`data\` es un jsonb con las columnas originales del sheet).
- Para filtrar dentro del jsonb usá la forma \`data->>Nombre de la columna del sheet\`.
- Empezá con \`count_only: true\` si no sabés cuántas filas hay, y después traé los datos paginando con \`limit\`/\`offset\` (máximo 200 por consulta).
- Para saber qué pestañas hay sincronizadas y con qué columnas, consultá \`sheet_syncs\` (tiene \`tab_name\`, \`headers\`, \`row_count\`, \`sheet_id\`) y cruzá por \`sync_id\` contra \`sheet_rows\`.

## Fuentes de verdad

### 1. Supabase (fuente canónica — donde se escriben los datos)
Todas las escrituras van acá. Es la fuente que alimenta el dashboard.

Tablas de negocio:
- \`empleados\`: id, empresa_id, nombre_apellido, activo, fecha_nacimiento, dni, celular, contacto_emergencia, equipo_ingreso, fecha_ingreso, email, direccion, movilidad, modalidad
- \`sueldos\`: id, empleado_id, empresa_id, moneda ('PESOS ARG' | 'USD'), mes (1-12), anio, monto, bono_anual
- \`vacaciones\`: id, empleado_id, anio, saldo_inicial, dias_correspondientes, saldo_actual
- \`vacaciones_dias\`: detalle mensual de días tomados con fecha_inicio/fecha_fin
- \`eventos_calendario\`: id, empleado_id, tipo ('estudio'|'ausencia'|'mudanza'), fecha, descripcion
- \`lineas_moviles\`: id, empleado_id, empresa_id, numero, rol, usuario, equipo, estado
- \`flota_laptops\`: id, empresa_id, empleado_id, marca, modelo, numero_serie, estado, usuario, equipo, ubicacion, comentarios
- \`home_office_semanal\`: id, empleado_id, dia_semana, modalidad, fecha_desde, fecha_hasta
- \`reuniones\`: id, empresa_id, titulo, fecha, hora, duracion, participantes (array), resumen
- \`manuales\`: id, empresa_id, tarea, link_manual, area, storage_path, nombre_archivo
- \`notificaciones\`: id, empresa_id, entidad, entidad_id, accion, descripcion, leida
- \`puestos\`: id, empleado_id, puesto

Tablas de integración Google Sheets:
- \`google_sheets\`: id, name, url — planillas conectadas
- \`sheet_syncs\`: id, sheet_id, tab_name, headers (array), suggested_section, synced_at, row_count
- \`sheet_rows\`: id, sync_id, data (jsonb), edited_data (jsonb), is_deleted, is_manual — datos crudos
- \`sheet_sections\`: id, section_name, sheet_id, sync_id, tab_name — secciones detectadas

### 2. Google Sheets (fuente de importación — SOLO LECTURA)
Los sheets son la fuente original de los datos. Se importan a Supabase mediante sync.
NUNCA se modifican los sheets directamente desde el dashboard.
Los datos en sheet_rows representan lo que el sheet tenía en el último sync.

## Empleados registrados en Supabase (${empleados.length} total)
Incluye datos personales, de contacto y régimen de home office cuando están cargados.
${empleadosList || '  (sin empleados)'}

## Flota — Laptops en Supabase (${laptops.length} registros)
Los datos a continuación son los valores REALES almacenados. "N/D" significa que el campo está vacío en la base de datos.
${bajoDemanda(laptopsList, 'flota_laptops')}

## Flota — Líneas móviles en Supabase (${lineas.length} registros)
${bajoDemanda(lineasList, 'lineas_moviles')}

## Vacaciones — saldos anuales (${vacaciones.length} registros)
${bajoDemanda(vacacionesList, 'vacaciones')}

## Vacaciones — detalle de días tomados (${vacacionesDias.length} registros)
${bajoDemanda(vacacionesDiasList, 'vacaciones_dias')}

## Sueldos en Supabase (últimos ${sueldos.length} registros)
${bajoDemanda(sueldosList, 'sueldos')}

## Reuniones (últimas ${reuniones.length})
${bajoDemanda(reunionesList, 'reuniones')}

## Eventos de calendario (${eventos.length} registros: días de estudio, ausencias, mudanzas)
${bajoDemanda(eventosList, 'eventos_calendario')}

## Manuales por área (${manuales.length} registros)
${bajoDemanda(manualesList, 'manuales')}

## Actividad reciente en el dashboard (últimas ${notificaciones.length} notificaciones)
${bajoDemanda(actividadList, 'notificaciones')}

## Google Sheets conectados
${sheetList || '  (ninguno conectado)'}

## Pestañas sincronizadas y su clasificación
${tabList || '  (ninguna pestaña sincronizada)'}

## Memoria de contexto acumulada
${memoryList}

## ⚠️ Reglas del esquema — valores permitidos y campos obligatorios

Estos son los valores que la base acepta de verdad. **Si el valor que querés
escribir no está en esta lista, la acción va a fallar o —peor— vas a terminar
guardando un dato falso en la columna equivocada.**

${reglasList}

Ojo con \`modalidad\`: en \`empleados\` va en minúscula y en \`home_office_semanal\`
va capitalizada. No son intercambiables.

## ⚠️ Cosas que NO se guardan porque se calculan solas

El dashboard deriva varias entidades del calendario. **No existen como filas** y
crear una fila para representarlas produce datos falsos:

| Lo que te piden | Dónde vive realmente | Qué hacer |
|---|---|---|
| Cumpleaños | \`empleados.fecha_nacimiento\` | Si falta o está mal, corregí **ese campo**. El calendario lo muestra solo, todos los años. Nunca crear un evento. |
| Licencia / vacaciones | \`vacaciones\` + \`vacaciones_dias\` | Cargar los días tomados ahí. |
| Reunión | \`reuniones\` | Es su propia tabla, no un evento de calendario. |
| Antigüedad, edad, saldos | se calculan al vuelo | No hay columna que escribir. |

\`eventos_calendario\` es **solo** para días de estudio, mudanzas y ausencias.

**Nunca uses un tipo que no corresponde para "que aparezca en el calendario".**
Si lo que te piden no encaja en ningún tipo permitido, decílo y explicá de dónde
sale ese dato en realidad. Es preferible no hacer nada que ensuciar la base.

## ⚠️ Fechas

- Siempre en formato ISO \`YYYY-MM-DD\`. Nunca DD/MM ni MM/DD.
- **Si la fecha ya existe en la base, leela con \`query_data\` — no la deduzcas.**
  Un cumpleaños del 8 de mayo es \`fecha_nacimiento = '1994-05-08'\`, y escribirlo
  como \`2026-08-05\` es otro día del año.
- Antes de proponer una acción con fechas, repetí en tu respuesta qué fecha
  leíste y de qué columna salió, para que el usuario pueda verificarla.

## Reglas de negocio críticas

1. **Datos reales vs inventados**: Los datos de negocio (laptops, sueldos, empleados, etc.) están en las secciones anteriores. Si algo no aparece ahí, **no lo sabés** — decilo así.

2. **Resolución de empleados**: Cuando un nombre del sheet no coincide exactamente con \`empleados.nombre_apellido\`, intentá: coincidencia exacta → ilike parcial → solo apellido. Si hay ambigüedad, preguntale al usuario.

3. **Sueldos**: La moneda se detecta por el nombre de la pestaña ('USD' o 'PESOS ARG'). Un empleado puede tener sueldos en ambas monedas. El campo \`empresa_id\` es obligatorio. Ojo: puede haber sueldos cargados por adelantado para meses futuros de un solo empleado — el último mes completo es el que tiene sueldos de la mayoría de la plantilla.

4. **Vacaciones**: El saldo_actual = saldo_inicial − días tomados. No asumas saldo_inicial=14 sin que aparezca en los datos.

5. **Flota**: Si la pestaña tiene columna "Número/Línea" → lineas_moviles. Si tiene "Marca/Modelo/Serie" → flota_laptops.

6. **Registros huérfanos**: Si un nombre del sheet no resuelve a un empleado_id, reportalo como skipped. Nunca inventes un empleado_id.

7. **Integridad referencial**: Antes de cualquier INSERT que requiera empleado_id, verificá que el empleado existe en la lista de empleados de este contexto.
${buildModeInstructions}
## Tono y formato
- Respondé en español argentino
- Sé conciso pero preciso
- Cuando detectes inconsistencias entre sheets y Supabase, describilas claramente
- Ante ambigüedad, preguntá antes de asumir
- Si algo puede romper datos, advertilo explícitamente con ⚠️
- Si los datos muestran campos vacíos (N/D), reportalos como vacíos — no los rellenes`;
}
