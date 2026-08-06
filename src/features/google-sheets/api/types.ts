export type GoogleSheet = {
  id: string;
  name: string;
  url: string;
  description: string | null;
  created_at: string;
};

export type GoogleSheetInsert = {
  name: string;
  url: string;
  description?: string | null;
};

export type SheetSync = {
  id: string;
  sheet_id: string;
  synced_at: string;
  row_count: number;
  headers: string[];
  error: string | null;
  tab_name: string;
  tab_gid: number;
  suggested_section: string | null;
};

export type SheetRowEffective = {
  id: string;
  sync_id: string;
  sheet_id: string;
  row_index: number;
  data: Record<string, string>;
  original_data: Record<string, string>;
  edited_data: Record<string, string> | null;
  is_deleted: boolean;
  is_manual: boolean;
};

export type SheetRow = {
  id: string;
  sync_id: string;
  sheet_id: string;
  row_index: number;
  data: Record<string, string>;
};

export type ParsedSheet = {
  headers: string[];
  rows: Record<string, string>[];
};

export type SheetTab = {
  gid: number;
  name: string;
};

export type ColumnType =
  | 'number'
  | 'date'
  | 'boolean'
  | 'email'
  | 'url'
  | 'percentage'
  | 'currency'
  | 'text';

export type TabSyncResult = {
  tabName: string;
  tabGid: number;
  syncId: string;
  rowCount: number;
  headers: string[];
  suggestedSection: string | null;
  importCreated?: number;
  importUpdated?: number;
  importSkipped?: number;
  importError?: string;
  // filas descartadas por ser comentarios/notas fuera de la grilla de datos
  commentRowsSkipped?: number;
  error?: string;
};

export type SyncResult = {
  tabs: TabSyncResult[];
};
