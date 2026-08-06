import { supabase } from '@/lib/supabase';
import type {
  Documento,
  DocumentoUploadInput,
  TipoArchivo,
  EmpleadoOption,
  LineaMovilOption,
  LaptopOption
} from './types';

const BUCKET = 'expedientes';

function detectTipo(file: File): TipoArchivo {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (ext === 'jpg' || ext === 'jpeg' || ext === 'png') return 'imagen';
  return 'word';
}

export async function getDocumentos(empleadoId?: number): Promise<Documento[]> {
  let query = supabase
    .from('documentos_empleados')
    .select(
      '*, empleados(nombre_apellido), lineas_moviles(numero), flota_laptops!documentos_empleados_laptop_id_fkey(marca, modelo)'
    )
    .not('storage_path', 'is', null)
    .order('created_at', { ascending: false });

  if (empleadoId) query = query.eq('empleado_id', empleadoId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? []).map((d) => ({
    ...d,
    empleado_nombre: d.empleados?.nombre_apellido ?? null,
    linea_movil_numero: d.lineas_moviles?.numero ?? null,
    laptop_descripcion:
      d.flota_laptops?.marca && d.flota_laptops?.modelo
        ? `${d.flota_laptops.marca} ${d.flota_laptops.modelo}`
        : null
  })) as Documento[];
}

export async function uploadDocumento({
  file,
  empleado_id,
  linea_movil_id,
  laptop_id,
  tipo,
  tipo_otro,
  etiqueta
}: DocumentoUploadInput): Promise<Documento> {
  const prefix = empleado_id
    ? `empleado_${empleado_id}`
    : linea_movil_id
      ? `linea_${linea_movil_id}`
      : laptop_id
        ? `laptop_${laptop_id}`
        : 'general';
  const storagePath = `${prefix}/${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
  const tipoArchivo = detectTipo(file);

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, { upsert: false });

  if (uploadError) throw new Error(uploadError.message);

  const { data, error: dbError } = await supabase
    .from('documentos_empleados')
    .insert({
      empresa_id: 1,
      empleado_id: empleado_id ?? null,
      linea_movil_id: linea_movil_id ?? null,
      laptop_id: laptop_id ?? null,
      tipo,
      tipo_otro: tipo === 'otro' ? (tipo_otro?.trim() ?? null) : null,
      etiqueta: etiqueta ?? null,
      storage_path: storagePath,
      nombre_archivo: file.name,
      tipo_archivo: tipoArchivo,
      tamanio: file.size
    })
    .select(
      '*, empleados(nombre_apellido), lineas_moviles(numero), flota_laptops!documentos_empleados_laptop_id_fkey(marca, modelo)'
    )
    .single();

  if (dbError) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
    throw new Error(dbError.message);
  }

  return {
    ...data,
    empleado_nombre: data.empleados?.nombre_apellido ?? null,
    linea_movil_numero: data.lineas_moviles?.numero ?? null,
    laptop_descripcion:
      data.flota_laptops?.marca && data.flota_laptops?.modelo
        ? `${data.flota_laptops.marca} ${data.flota_laptops.modelo}`
        : null
  } as Documento;
}

export async function deleteDocumento(documento: Documento): Promise<void> {
  if (documento.storage_path) {
    await supabase.storage.from(BUCKET).remove([documento.storage_path]);
  }
  const { error } = await supabase.from('documentos_empleados').delete().eq('id', documento.id);
  if (error) throw new Error(error.message);
}

export async function softDeleteDocumento(documento: Documento): Promise<void> {
  const { error } = await supabase.from('documentos_empleados').delete().eq('id', documento.id);
  if (error) throw new Error(error.message);
}

export async function restoreDocumento(documento: Documento): Promise<void> {
  const { error } = await supabase.from('documentos_empleados').insert({
    empresa_id: documento.empresa_id,
    empleado_id: documento.empleado_id,
    linea_movil_id: documento.linea_movil_id,
    laptop_id: documento.laptop_id,
    tipo: documento.tipo,
    tipo_otro: documento.tipo_otro,
    etiqueta: documento.etiqueta,
    storage_path: documento.storage_path,
    nombre_archivo: documento.nombre_archivo,
    tipo_archivo: documento.tipo_archivo,
    tamanio: documento.tamanio
  });
  if (error) throw new Error(error.message);
}

export async function purgeDocumentoStorage(storagePath: string | null): Promise<void> {
  if (!storagePath) return;
  await supabase.storage.from(BUCKET).remove([storagePath]);
}

export function getDownloadUrl(storagePath: string): string {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}

export async function getEmpleadosParaDocumento(): Promise<EmpleadoOption[]> {
  const { data, error } = await supabase
    .from('empleados')
    .select('id, nombre_apellido')
    .eq('activo', true)
    .order('nombre_apellido');
  if (error) throw new Error(error.message);
  return (data ?? []) as EmpleadoOption[];
}

export async function getLineasMovilesParaDocumento(): Promise<LineaMovilOption[]> {
  const { data, error } = await supabase
    .from('lineas_moviles')
    .select('id, numero')
    .order('numero');
  if (error) throw new Error(error.message);
  return (data ?? []) as LineaMovilOption[];
}

export async function getLaptopsParaDocumento(): Promise<LaptopOption[]> {
  const { data, error } = await supabase
    .from('flota_laptops')
    .select('id, marca, modelo')
    .order('marca');
  if (error) throw new Error(error.message);
  return ((data ?? []) as { id: number; marca: string | null; modelo: string | null }[]).map(
    (l) => ({
      id: l.id,
      descripcion: [l.marca, l.modelo].filter(Boolean).join(' ') || `Laptop #${l.id}`
    })
  );
}

export function formatTamanio(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
