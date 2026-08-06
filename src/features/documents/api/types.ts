export type TipoDocumento = 'contrato' | 'dni' | 'certificado' | 'otro';

export type TipoArchivo = 'pdf' | 'word' | 'imagen';

export type EtiquetaDocumento = 'Legal' | 'Contable' | 'RRHH' | 'Contrato' | 'Seguro';

export type TipoEntidad = 'empleado' | 'linea_movil' | 'laptop';

export type Documento = {
  id: number;
  empresa_id: number;
  empleado_id: number | null;
  empleado_nombre: string | null;
  linea_movil_id: number | null;
  linea_movil_numero: string | null;
  laptop_id: number | null;
  laptop_descripcion: string | null;
  tipo: TipoDocumento;
  tipo_otro: string | null;
  etiqueta: EtiquetaDocumento | null;
  storage_path: string | null;
  nombre_archivo: string | null;
  tipo_archivo: TipoArchivo | null;
  tamanio: number | null;
  created_at: string;
};

export type DocumentoUploadInput = {
  file: File;
  empleado_id?: number | null;
  linea_movil_id?: number | null;
  laptop_id?: number | null;
  tipo: TipoDocumento;
  tipo_otro?: string;
  etiqueta?: EtiquetaDocumento | null;
};

export type EmpleadoOption = { id: number; nombre_apellido: string };

export type LineaMovilOption = { id: number; numero: string };

export type LaptopOption = { id: number; descripcion: string };
