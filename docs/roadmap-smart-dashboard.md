# Roadmap: Dashboard Auto-Adaptable desde Google Sheets

**Proyecto:** RRHH Dashboard  
**Stack:** Next.js 16 App Router · Supabase (Postgres + RLS) · TanStack Query · TanStack Form · shadcn/ui · Tailwind v4  
**Supabase project_ref:** `zgzsggetnlbibjembesc`  
**Repositorio:** `ignaciobavala-png/rrhhdashboard`

---

## Contexto y visión

El dashboard ya importa Google Sheets públicos como XLSX, detecta el tipo de cada columna, clasifica cada pestaña por sección (Vacaciones, Legajo, Sueldos, Flota, Asistencia, People) y almacena todo en Supabase como JSONB.

**El problema actual:** los datos importados son de solo lectura. No se pueden editar desde el dashboard, no generan secciones operativas, y no se integran con los widgets del home.

**La visión:** cuando el cliente conecta un Google Sheet nuevo, el dashboard debe:
1. Detectar su estructura automáticamente
2. Generar una sección editable en el nav
3. Permitir modificar, agregar y eliminar filas desde el dashboard
4. Reflejar esos cambios en los widgets del home

Los cambios siempre se guardan en Supabase. El sheet es de solo lectura (fuente de importación, no de verdad).

---

## Estado actual del código

### Tablas Supabase existentes (relevantes para este roadmap)

```sql
google_sheets     -- una fila por planilla conectada (id, name, url, description)
sheet_syncs       -- una fila por pestaña × sync (id, sheet_id, tab_name, tab_gid, headers[], row_count, suggested_section, synced_at, error)
sheet_rows        -- filas crudas JSONB (id, sync_id, sheet_id, row_index, data jsonb)
```

RLS en todas: política `ALL` con `qual: true` (acceso total con anon key).

### Archivos clave existentes

```
src/features/google-sheets/
├── api/
│   ├── types.ts           -- GoogleSheet, SheetSync, SheetRow, ColumnType, SyncResult
│   └── service.ts         -- getGoogleSheets, getLatestSyncsByTab, getRowsForSync, extractSheetId
├── components/
│   ├── google-sheets-listing.tsx  -- acordeón con "Sincronizar todo" + "Agregar Sheet"
│   ├── sheet-data-viewer.tsx      -- tabs por pestaña + tabla genérica readonly
│   ├── smart-cell.tsx             -- renderiza celda según ColumnType (número, fecha, email, url...)
│   ├── section-suggestion-banner.tsx -- banner informativo de sección detectada
│   └── add-sheet-dialog.tsx       -- dialog para agregar URL de sheet
└── lib/
    ├── column-detector.ts     -- detectColumnType(values[]) → ColumnType
    └── section-detector.ts    -- suggestSection(headers[], tabName?) → string|null

src/app/api/sheets/sync/route.ts   -- POST: descarga XLSX, parsea todas las pestañas, persiste en sheet_syncs + sheet_rows

src/app/dashboard/google-sheets/page.tsx   -- página principal de la sección
src/config/nav-config.ts                   -- navGroups con "Integraciones > Google Sheets"
```

### Convenciones del proyecto (OBLIGATORIO respetar)

- **React Query:** `void prefetchQuery()` server + `useSuspenseQuery` client + `HydrationBoundary` + `dehydrate`. Mutations con `useMutation`.
- **API layer por feature:** `api/types.ts` → `api/service.ts` → `api/queries.ts`. Query key factories: `entityKeys.all/list/detail`.
- **Icons:** solo importar desde `@/components/icons`, nunca de `@tabler/icons-react` directo.
- **Forms:** `useAppForm` + `useFormFields<T>()` desde `@/components/ui/tanstack-form`.
- **Page headers:** usar `PageContainer` props (`pageTitle`, `pageDescription`, `pageHeaderAction`).
- **Formatting:** comillas simples, sin trailing comma, 2 espacios, JSX comillas simples.
- **nuqs:** para URL search params. `searchParamsCache` server, `useQueryStates` client.

---

## Fase A — Tabla editable desde `sheet_rows`

**Objetivo:** las filas de cualquier pestaña importada se pueden editar, agregar y eliminar directamente desde el dashboard. Los cambios se guardan en `sheet_rows.data` (JSONB) en Supabase.

### A.1 — Migración Supabase: columna `edited_data`

Ejecutar en Supabase SQL editor:

```sql
-- Permite guardar ediciones sin perder el dato original del sheet
ALTER TABLE sheet_rows ADD COLUMN IF NOT EXISTS edited_data jsonb;
ALTER TABLE sheet_rows ADD COLUMN IF NOT EXISTS is_deleted boolean DEFAULT false;
ALTER TABLE sheet_rows ADD COLUMN IF NOT EXISTS is_manual boolean DEFAULT false;

-- Vista que devuelve edited_data si existe, sino data original
CREATE OR REPLACE VIEW sheet_rows_effective AS
SELECT
  id,
  sync_id,
  sheet_id,
  row_index,
  COALESCE(edited_data, data) AS data,
  data AS original_data,
  edited_data,
  is_deleted,
  is_manual
FROM sheet_rows
WHERE is_deleted = false;
```

### A.2 — Nuevas funciones en `service.ts`

Agregar a `src/features/google-sheets/api/service.ts`:

```typescript
// Actualiza un campo individual de una fila
export async function updateSheetRowField(
  rowId: string,
  field: string,
  value: string
): Promise<void> {
  // Fetch current edited_data first, merge field
  const { data: row } = await supabase
    .from('sheet_rows')
    .select('edited_data, data')
    .eq('id', rowId)
    .single();

  const current = (row?.edited_data ?? row?.data ?? {}) as Record<string, string>;
  const updated = { ...current, [field]: value };

  const { error } = await supabase
    .from('sheet_rows')
    .update({ edited_data: updated })
    .eq('id', rowId);

  if (error) throw new Error(error.message);
}

// Elimina lógicamente una fila
export async function deleteSheetRow(rowId: string): Promise<void> {
  const { error } = await supabase
    .from('sheet_rows')
    .update({ is_deleted: true })
    .eq('id', rowId);
  if (error) throw new Error(error.message);
}

// Agrega una fila manual nueva
export async function addSheetRow(
  syncId: string,
  sheetId: string,
  data: Record<string, string>,
  rowIndex: number
): Promise<void> {
  const { error } = await supabase.from('sheet_rows').insert({
    sync_id: syncId,
    sheet_id: sheetId,
    row_index: rowIndex,
    data,
    is_manual: true
  });
  if (error) throw new Error(error.message);
}

// Obtiene filas efectivas (edited_data si existe)
export async function getEffectiveRowsForSync(syncId: string): Promise<SheetRow[]> {
  const { data, error } = await supabase
    .from('sheet_rows_effective')
    .select('*')
    .eq('sync_id', syncId)
    .order('row_index', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as SheetRow[];
}
```

### A.3 — Nuevo tipo en `types.ts`

Agregar a `src/features/google-sheets/api/types.ts`:

```typescript
export type SheetRow = {
  id: string;
  sync_id: string;
  sheet_id: string;
  row_index: number;
  data: Record<string, string>;
  original_data?: Record<string, string>;
  edited_data?: Record<string, string> | null;
  is_deleted?: boolean;
  is_manual?: boolean;
};
```

### A.4 — Componente `EditableCell`

Crear `src/features/google-sheets/components/editable-cell.tsx`:

```typescript
'use client';

import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { updateSheetRowField } from '../api/service';
import { SmartCell } from './smart-cell';
import type { ColumnType } from '../api/types';

type Props = {
  rowId: string;
  syncId: string;
  field: string;
  value: string;
  type: ColumnType;
  isEdited?: boolean;
};

export function EditableCell({ rowId, syncId, field, value, type, isEdited }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => updateSheetRowField(rowId, field, draft),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sheet-rows', syncId] });
      setEditing(false);
    },
    onError: (err: Error) => toast.error(err.message)
  });

  if (editing) {
    return (
      <Input
        ref={inputRef}
        value={draft}
        autoFocus
        className='h-7 min-w-[80px] px-2 text-sm'
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== value) mutation.mutate();
          else setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            if (draft !== value) mutation.mutate();
            else setEditing(false);
          }
          if (e.key === 'Escape') {
            setDraft(value);
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <div
      role='button'
      tabIndex={0}
      onClick={() => { setDraft(value); setEditing(true); }}
      onKeyDown={(e) => { if (e.key === 'Enter') { setDraft(value); setEditing(true); } }}
      className={`cursor-pointer rounded px-1 py-0.5 hover:bg-muted/60 ${isEdited ? 'text-blue-600 dark:text-blue-400' : ''}`}
      title={isEdited ? 'Editado localmente' : 'Clic para editar'}
    >
      <SmartCell value={value} type={type} />
    </div>
  );
}
```

### A.5 — Actualizar `sheet-data-viewer.tsx`

En el componente `TabData`:

1. Cambiar import de `getRowsForSync` → `getEffectiveRowsForSync`
2. Reemplazar las celdas `<td>` con `<EditableCell>`
3. Agregar botón "Agregar fila" que abre un dialog con inputs vacíos por cada header
4. Agregar columna de acciones con botón eliminar (llama `deleteSheetRow`)
5. Mostrar indicador visual (punto azul) en filas con `edited_data !== null`
6. Mostrar indicador (badge "Manual") en filas con `is_manual === true`

El query key para `getEffectiveRowsForSync` debe ser `['sheet-rows', sync.id]` (mismo que antes para que las invalidaciones existentes sigan funcionando).

### A.6 — Componente `AddRowDialog`

Crear `src/features/google-sheets/components/add-row-dialog.tsx`:

Dialog con un form auto-generado a partir de `headers` y `columnTypes`. Cada header genera un `Input` del tipo correspondiente. Al submit llama `addSheetRow`.

Usar `useAppForm` + `useFormFields` de `@/components/ui/tanstack-form` (convención del proyecto).

---

## Fase B — Secciones dinámicas en el nav

**Objetivo:** cuando el sistema detecta pestañas con secciones conocidas (Vacaciones, Legajo, Sueldos, Flota, Asistencia, People), generar automáticamente entradas en el nav y rutas funcionales para cada una.

### B.1 — Tabla de secciones registradas

```sql
CREATE TABLE IF NOT EXISTS sheet_sections (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  section_name text NOT NULL,          -- 'Vacaciones', 'Legajo', 'Sueldos', etc.
  sheet_id uuid REFERENCES google_sheets(id) ON DELETE CASCADE,
  sync_id uuid REFERENCES sheet_syncs(id) ON DELETE CASCADE,
  tab_name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(section_name, sheet_id, tab_name)
);

ALTER TABLE sheet_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY sheet_sections_all ON sheet_sections FOR ALL USING (true);
```

### B.2 — Poblar `sheet_sections` en el sync

En `src/app/api/sheets/sync/route.ts`, después de persistir cada tab exitoso, si `suggestedSection !== null`:

```typescript
await supabase
  .from('sheet_sections')
  .upsert({
    section_name: suggestedSection,
    sheet_id: sheetId,
    sync_id: sync.id,
    tab_name: tab.name
  }, { onConflict: 'section_name,sheet_id,tab_name' });
```

### B.3 — Nav dinámico

Crear `src/features/google-sheets/api/queries.ts`:

```typescript
export const sheetSectionKeys = {
  all: ['sheet-sections'] as const,
  list: () => [...sheetSectionKeys.all, 'list'] as const,
};

export async function getActiveSections() {
  const { data } = await supabase
    .from('sheet_sections')
    .select('section_name, tab_name, sheet_id, sync_id')
    .order('section_name');
  return data ?? [];
}
```

Crear `src/components/layout/dynamic-nav-sections.tsx` (client component):
- Usa `useQuery({ queryKey: sheetSectionKeys.list(), queryFn: getActiveSections })`
- Renderiza `NavItem` entries para cada sección única encontrada
- URL: `/dashboard/sheets/[section_name_slug]`
- Ícono por sección: mapear 'Vacaciones' → icono calendario, 'Sueldos' → icono payroll, etc.

Integrar en el sidebar existente (ver `src/components/layout/app-sidebar.tsx`) como grupo "Secciones importadas" que aparece solo si hay secciones activas.

### B.4 — Ruta dinámica

Crear `src/app/dashboard/sheets/[section]/page.tsx`:

```typescript
// Server component
import { PageContainer } from '@/components/layout/page-container';
import { SheetSectionView } from '@/features/google-sheets/components/sheet-section-view';

export default function SheetSectionPage({ params }: { params: { section: string } }) {
  return (
    <PageContainer pageTitle={params.section} pageDescription={`Datos importados desde Google Sheets`}>
      <SheetSectionView sectionName={params.section} />
    </PageContainer>
  );
}
```

Crear `src/features/google-sheets/components/sheet-section-view.tsx`:
- Recibe `sectionName`
- Queries `sheet_sections` para obtener el `sync_id` más reciente para esa sección
- Renderiza `<TabData>` (del `sheet-data-viewer.tsx`) con edición habilitada
- Incluye breadcrumb: Dashboard > [Sección]

---

## Fase C — Forms auto-generados por schema

**Objetivo:** a partir del schema inferido (headers + ColumnType), generar formularios completos para alta y edición de registros. Sin escribir un form por sección.

### C.1 — Schema registry en `sheet_syncs`

```sql
ALTER TABLE sheet_syncs ADD COLUMN IF NOT EXISTS column_types jsonb;
-- Ejemplo: {"Nombre": "text", "Fecha Ingreso": "date", "Activo": "boolean", "Sueldo": "currency"}
```

Actualizar `src/app/api/sheets/sync/route.ts` para guardar los tipos detectados:

```typescript
import { detectColumnTypes } from '@/features/google-sheets/lib/column-detector';

// Después de parsear, antes de insertar:
const columnTypes = detectColumnTypes(parsed.headers, parsed.rows);

await supabase.from('sheet_syncs').insert({
  // ...campos existentes...
  column_types: columnTypes
});
```

### C.2 — Componente `DynamicForm`

Crear `src/features/google-sheets/components/dynamic-form.tsx`:

Recibe:
```typescript
type Props = {
  headers: string[];
  columnTypes: Record<string, ColumnType>;
  initialValues?: Record<string, string>;
  onSubmit: (values: Record<string, string>) => Promise<void>;
  submitLabel?: string;
};
```

Lógica de renderizado por tipo:
- `text` → `<Input type='text' />`
- `number` | `currency` | `percentage` → `<Input type='number' />`
- `date` → `<Input type='date' />` (con DatePicker de shadcn si disponible)
- `boolean` → `<Switch />` o `<Checkbox />`
- `email` → `<Input type='email' />`
- `url` → `<Input type='url' />`

Usar `useAppForm` de `@/components/ui/tanstack-form`. El schema Zod se construye dinámicamente:

```typescript
import { z } from 'zod';

function buildSchema(headers: string[], columnTypes: Record<string, ColumnType>) {
  const shape: Record<string, z.ZodType> = {};
  for (const h of headers) {
    const type = columnTypes[h] ?? 'text';
    if (type === 'number' || type === 'currency' || type === 'percentage') {
      shape[h] = z.string().regex(/^-?[\d.,]*$/, 'Debe ser un número').optional().default('');
    } else if (type === 'email') {
      shape[h] = z.string().email('Email inválido').optional().or(z.literal('')).default('');
    } else if (type === 'date') {
      shape[h] = z.string().optional().default('');
    } else {
      shape[h] = z.string().optional().default('');
    }
  }
  return z.object(shape);
}
```

### C.3 — Integrar `DynamicForm` en el flujo de alta

En `add-row-dialog.tsx` (creado en Fase A), reemplazar inputs manuales con `<DynamicForm>`.

En `sheet-section-view.tsx` (Fase B), agregar botón "Nuevo registro" en el `pageHeaderAction` que abre un Sheet (panel lateral) con `<DynamicForm>`.

### C.4 — Edit dialog

En cada fila de la tabla, agregar ícono de edición que abre un `<Sheet>` (Radix side panel) con `<DynamicForm initialValues={row.data} />`. Al submit llama `updateSheetRowField` para cada campo que cambió.

---

## Fase D — Sincronización inteligente con detección de cambios

**Objetivo:** cuando el usuario re-sincroniza un sheet, el sistema detecta qué cambió respecto a la última sync y ofrece un flujo de revisión antes de aplicar.

### D.1 — Tabla de diff

```sql
CREATE TABLE IF NOT EXISTS sheet_sync_diffs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  sheet_id uuid REFERENCES google_sheets(id) ON DELETE CASCADE,
  tab_name text NOT NULL,
  old_sync_id uuid REFERENCES sheet_syncs(id),
  new_sync_id uuid REFERENCES sheet_syncs(id),
  diff_type text NOT NULL,   -- 'added' | 'removed' | 'modified'
  row_index integer,
  old_data jsonb,
  new_data jsonb,
  applied boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE sheet_sync_diffs ENABLE ROW LEVEL SECURITY;
CREATE POLICY sheet_sync_diffs_all ON sheet_sync_diffs FOR ALL USING (true);
```

### D.2 — Lógica de diff en el sync route

En `src/app/api/sheets/sync/route.ts`, después de insertar el nuevo sync, comparar contra el sync anterior de la misma pestaña:

```typescript
// 1. Obtener sync anterior
const { data: prevSync } = await supabase
  .from('sheet_syncs')
  .select('id')
  .eq('sheet_id', sheetId)
  .eq('tab_name', tab.name)
  .neq('id', sync.id)
  .order('synced_at', { ascending: false })
  .limit(1)
  .single();

if (prevSync) {
  const { data: prevRows } = await supabase
    .from('sheet_rows')
    .select('row_index, data')
    .eq('sync_id', prevSync.id);

  const prevMap = new Map((prevRows ?? []).map(r => [r.row_index, r.data]));
  const newMap = new Map(parsed.rows.map((data, i) => [i, data]));

  const diffs = [];

  // Detectar filas nuevas
  for (const [idx, data] of newMap) {
    if (!prevMap.has(idx)) {
      diffs.push({ diff_type: 'added', row_index: idx, new_data: data, old_data: null });
    } else {
      const prev = prevMap.get(idx)!;
      if (JSON.stringify(prev) !== JSON.stringify(data)) {
        diffs.push({ diff_type: 'modified', row_index: idx, old_data: prev, new_data: data });
      }
    }
  }

  // Detectar filas eliminadas
  for (const [idx, data] of prevMap) {
    if (!newMap.has(idx)) {
      diffs.push({ diff_type: 'removed', row_index: idx, old_data: data, new_data: null });
    }
  }

  if (diffs.length > 0) {
    await supabase.from('sheet_sync_diffs').insert(
      diffs.map(d => ({
        sheet_id: sheetId,
        tab_name: tab.name,
        old_sync_id: prevSync.id,
        new_sync_id: sync.id,
        ...d
      }))
    );
  }
}
```

### D.3 — UI de revisión de cambios

Crear `src/features/google-sheets/components/sync-diff-reviewer.tsx`:

- Se muestra en el acordeón de un sheet si hay diffs pendientes (`applied = false`)
- Muestra una tabla con 3 columnas: fila | antes | después
- Filas nuevas en verde, eliminadas en rojo, modificadas en amarillo
- Botón "Aplicar cambios" que marca `applied = true` y actualiza `sheet_rows`
- Botón "Descartar" que marca `applied = true` sin cambiar `sheet_rows`

Agregar badge en el acordeón trigger cuando hay cambios pendientes: `"N cambios pendientes"`.

### D.4 — Invalidación del nav y widgets tras aplicar

Después de aplicar cambios:
```typescript
queryClient.invalidateQueries({ queryKey: ['sheet-rows'] });
queryClient.invalidateQueries({ queryKey: ['sheet-sections'] });
queryClient.invalidateQueries({ queryKey: ['calendario', 'sheets-vacaciones'] });
```

---

## Mapa de archivos a crear/modificar por fase

### Fase A
| Acción | Archivo |
|--------|---------|
| CREAR | migration en Supabase (SQL directo) |
| MODIFICAR | `src/features/google-sheets/api/types.ts` |
| MODIFICAR | `src/features/google-sheets/api/service.ts` |
| CREAR | `src/features/google-sheets/components/editable-cell.tsx` |
| CREAR | `src/features/google-sheets/components/add-row-dialog.tsx` |
| MODIFICAR | `src/features/google-sheets/components/sheet-data-viewer.tsx` |

### Fase B
| Acción | Archivo |
|--------|---------|
| CREAR | migration `sheet_sections` en Supabase |
| MODIFICAR | `src/app/api/sheets/sync/route.ts` |
| CREAR | `src/features/google-sheets/api/queries.ts` |
| CREAR | `src/components/layout/dynamic-nav-sections.tsx` |
| MODIFICAR | `src/components/layout/app-sidebar.tsx` |
| CREAR | `src/app/dashboard/sheets/[section]/page.tsx` |
| CREAR | `src/features/google-sheets/components/sheet-section-view.tsx` |

### Fase C
| Acción | Archivo |
|--------|---------|
| CREAR | migration `column_types` column en Supabase |
| MODIFICAR | `src/app/api/sheets/sync/route.ts` |
| CREAR | `src/features/google-sheets/components/dynamic-form.tsx` |
| MODIFICAR | `src/features/google-sheets/components/add-row-dialog.tsx` |
| MODIFICAR | `src/features/google-sheets/components/sheet-section-view.tsx` |

### Fase D
| Acción | Archivo |
|--------|---------|
| CREAR | migration `sheet_sync_diffs` en Supabase |
| MODIFICAR | `src/app/api/sheets/sync/route.ts` |
| CREAR | `src/features/google-sheets/components/sync-diff-reviewer.tsx` |
| MODIFICAR | `src/features/google-sheets/components/google-sheets-listing.tsx` |

---

## Orden de ejecución recomendado

```
A.1 → A.2 → A.3 → A.4 → A.5 → A.6   (tabla editable — máximo impacto inmediato)
B.1 → B.2 → B.3 → B.4                (nav dinámico — el dashboard "se expande solo")
C.1 → C.2 → C.3 → C.4                (forms auto-generados — operación completa)
D.1 → D.2 → D.3 → D.4                (diff inteligente — nivel enterprise)
```

Cada fase es independiente y deployable. No es necesario completar todas para tener valor.

---

## Modificaciones adicionales al alcance (obligatorio)

Las siguientes funcionalidades complementan la especificación original y forman parte de los requisitos de la nueva versión del dashboard.

### 1. Sistema de Versionado e Historial Cronológico

La auditoría de cambios y la función "Deshacer" no son suficientes para garantizar la trazabilidad y recuperación completa de la información. Se debe implementar un **Sistema de Versionado** para todas las entidades del sistema (empleados, legajos, celulares, laptops, documentos, sueldos, eventos, etc.).

#### Requisitos

Cada modificación realizada sobre un registro debe generar automáticamente una nueva versión. Cada versión debe conservar:

- Fecha y hora.
- Usuario que realizó el cambio (o Asistente IA).
- Estado completo del registro en ese momento (snapshot).
- Detalle de los cambios realizados respecto de la versión anterior.

Cada ficha debe incorporar una nueva pestaña o sección denominada **Timeline** o **Historial de Versiones**, desde la cual será posible:

- Visualizar cronológicamente todas las modificaciones.
- Consultar quién realizó cada cambio.
- Comparar cualquier versión con otra o con la versión actual.
- Visualizar claramente los valores anteriores y posteriores.
- Restaurar cualquier versión anterior con una única acción y confirmación del usuario.

La restauración de una versión también debe generar una nueva versión en el historial, preservando completamente la trazabilidad.

Este historial es independiente del log global de auditoría y debe existir para cada registro individual.

#### Migración sugerida

```sql
CREATE TABLE IF NOT EXISTS registro_versiones (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  entidad_tabla text NOT NULL,        -- 'empleados', 'sueldos', 'laptops', etc.
  entidad_id uuid NOT NULL,           -- ID del registro afectado
  version integer NOT NULL,           -- Número de versión (auto-incremental por entidad)
  snapshot jsonb NOT NULL,            -- Estado completo del registro en ese momento
  cambios jsonb NOT NULL,             -- { campo: { anterior: X, nuevo: Y }, ... }
  usuario text NOT NULL,              -- Usuario o 'Asistente IA'
  operacion text NOT NULL,            -- 'creacion', 'actualizacion', 'eliminacion', 'restauracion'
  created_at timestamptz DEFAULT now(),

  UNIQUE(entidad_tabla, entidad_id, version)
);

ALTER TABLE registro_versiones ENABLE ROW LEVEL SECURITY;
CREATE POLICY registro_versiones_all ON registro_versiones FOR ALL USING (true);

-- Índice para consultar historial por entidad
CREATE INDEX idx_versiones_entidad ON registro_versiones(entidad_tabla, entidad_id, version DESC);
```

#### Integración con el flujo de mutaciones

Cada `UPDATE` o `DELETE` en una entidad debe estar envuelto en un trigger o función RPC que:

1. Capture el estado actual del registro (snapshot completo).
2. Calcule el diff respecto de la versión anterior (último snapshot de `registro_versiones`).
3. Inserte la nueva versión en `registro_versiones`.
4. Ejecute la operación solicitada sobre la tabla de la entidad.

La restauración de una versión se implementa como:

1. Obtener el snapshot de la versión a restaurar desde `registro_versiones`.
2. Escribir ese snapshot en la tabla de la entidad.
3. Insertar una nueva fila en `registro_versiones` con `operacion = 'restauracion'` y `cambios = { accion: 'restaurado_desde_version_X' }`.

---

### 2. Aguinaldos (SAC) en la sección Sueldos

La sección **Sueldos** debe ampliarse para contemplar también la gestión de **Aguinaldos (SAC)**.

El sistema debe permitir registrar, editar y consultar:

- Sueldos.
- Bonos.
- Aguinaldos.

Los aguinaldos deben poder asociarse al período correspondiente (primer o segundo semestre), año, moneda (ARS/USD cuando corresponda) y empleado, manteniendo la misma lógica de edición manual y carga mediante el Asistente IA que el resto de los conceptos salariales.

#### Migración sugerida

```sql
ALTER TABLE sueldos ADD COLUMN IF NOT EXISTS tipo_concepto text DEFAULT 'sueldo';
-- Valores posibles: 'sueldo', 'bono', 'aguinaldo'

ALTER TABLE sueldos ADD COLUMN IF NOT EXISTS semestre integer;
-- 1 = primer semestre, 2 = segundo semestre. Solo aplica cuando tipo_concepto = 'aguinaldo'.

-- Check constraint para asegurar semestre válido en aguinaldos
ALTER TABLE sueldos ADD CONSTRAINT chk_semestre_aguinaldo
  CHECK (
    (tipo_concepto = 'aguinaldo' AND semestre IN (1, 2))
    OR (tipo_concepto != 'aguinaldo')
  );
```

#### Cambios en la UI

El accordion de Sueldos (actualmente ARS / USD / Bonos) debe incorporar una cuarta sección:

| Sección | Contenido |
|---------|-----------|
| **Aguinaldos (SAC)** | Tabla: empleado, semestre (1er/2do badge), monto, moneda (ARS/USD badge) + totales ARS/USD |

La tabla de Aguinaldos debe seguir el mismo patrón que la tabla de Bonos Anuales: filas por empleado con aguinaldo registrado, columnas de monto y moneda, y footer con totales por moneda.

---

### 3. Alta manual de Legajos

Actualmente el documento especifica la carga mediante el Asistente IA y la edición de legajos existentes, pero también debe quedar explícitamente establecido que **los legajos pueden crearse manualmente desde la interfaz gráfica**, al igual que ocurre con las demás entidades del sistema.

La sección **Legajo** debe contar con un botón **"Nuevo Legajo"** que permita crear un empleado completamente desde formularios tradicionales, sin necesidad de utilizar el Asistente IA.

Este comportamiento debe ser consistente con el principio rector del proyecto:

> Todo dato del sistema debe poder cargarse, editarse y eliminarse tanto manualmente desde la interfaz como conversando con el Asistente IA.

La creación manual debe ofrecer exactamente las mismas capacidades y validaciones que la creación conversacional mediante IA.

#### Cambios en la UI

- Agregar botón **"+ Nuevo Legajo"** en el `pageHeaderAction` del listado `/dashboard/legajo`.
- El botón abre un `<Sheet>` (panel lateral) o `<Dialog>` con un formulario completo que capture todos los campos del empleado (nombre, DNI, fecha de nacimiento, celular, email, dirección, movilidad, equipo, fecha de ingreso, estado, modalidad, contacto de emergencia, puesto).
- Usar `useAppForm` + `useFormFields` de `@/components/ui/tanstack-form` (convención del proyecto).
- Al submit exitoso: invalidar `['empleados']`, cerrar el panel, y mostrar toast de éxito con opción de ir al detalle del nuevo empleado.
- Las mismas validaciones que aplica el Asistente IA deben aplicarse aquí (campos requeridos, formatos de email, DNI numérico, etc.).

#### Query key

```typescript
// La creación usa:
queryClient.invalidateQueries({ queryKey: ['empleados'] });
```

---

## Notas para la IA que ejecute este roadmap

1. **Leer antes de tocar:** siempre leer el archivo completo antes de editar, nunca asumir contenido.
2. **Supabase project_ref:** `zgzsggetnlbibjembesc`. Usar MCP `mcp__supabase__execute_sql` para queries y `mcp__supabase__apply_migration` para DDL.
3. **No crear tablas Supabase dinámicamente desde código de aplicación.** Toda DDL va como migration.
4. **Query keys:** respetar los existentes — `['sheet-rows', syncId]`, `['sheet-syncs', sheetId]`, `['google-sheets']`, `['calendario', 'sheets-vacaciones']`.
5. **Invalidar correctamente:** cuando se edita/agrega/elimina una fila, invalidar `['sheet-rows', syncId]`. Cuando se aplica un diff, invalidar además `['sheet-sections']` y `['calendario', 'sheets-vacaciones']`.
6. **RLS:** toda tabla nueva debe tener `ALTER TABLE x ENABLE ROW LEVEL SECURITY` + `CREATE POLICY x_all ON x FOR ALL USING (true)`.
7. **TypeScript estricto:** `pnpm tsc --noEmit` debe pasar sin errores antes de cada commit.
8. **Lint:** el proyecto usa `oxfmt` en pre-commit hook. No usar `--no-verify`.
