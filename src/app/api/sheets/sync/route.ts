import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { extractSheetId } from '@/features/google-sheets/api/service';
import { suggestSection } from '@/features/google-sheets/lib/section-detector';
import { importSheetData } from '@/features/google-sheets/lib/import-engine';
import { parseSpreadsheet, type ParsedTab } from '@/features/google-sheets/lib/parse-spreadsheet';
import type { SyncResult } from '@/features/google-sheets/api/types';

async function parseXlsxFromGoogle(googleSheetId: string): Promise<ParsedTab[]> {
  const url = `https://docs.google.com/spreadsheets/d/${googleSheetId}/export?format=xlsx`;
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok)
    throw new Error(
      'No se pudo descargar el sheet. Verificá que esté compartido como "Cualquiera con el enlace puede ver".'
    );

  const buffer = await res.arrayBuffer();
  return parseSpreadsheet(buffer);
}

export async function POST(request: Request) {
  const body = (await request.json()) as { sheetId: string; url: string };
  const { sheetId, url } = body;

  if (!sheetId || !url) {
    return NextResponse.json({ error: 'Missing sheetId or url' }, { status: 400 });
  }

  const googleSheetId = extractSheetId(url);
  if (!googleSheetId) {
    return NextResponse.json({ error: 'URL de Google Sheets inválida' }, { status: 400 });
  }

  let tabs: ParsedTab[];
  try {
    tabs = await parseXlsxFromGoogle(googleSheetId);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }

  const result: SyncResult = { tabs: [] };

  for (const tab of tabs) {
    const suggestedSection = suggestSection(tab.headers, tab.name);

    const { data: sync, error: syncError } = await supabase
      .from('sheet_syncs')
      .insert({
        sheet_id: sheetId,
        row_count: tab.rows.length,
        headers: tab.headers,
        tab_name: tab.name,
        tab_gid: tab.index,
        suggested_section: suggestedSection
      })
      .select()
      .single();

    if (syncError || !sync) {
      result.tabs.push({
        tabName: tab.name,
        tabGid: tab.index,
        syncId: '',
        rowCount: 0,
        headers: [],
        suggestedSection: null,
        error: syncError?.message
      });
      continue;
    }

    if (tab.rows.length > 0) {
      await supabase.from('sheet_rows').insert(
        tab.rows.map((data, row_index) => ({
          sync_id: sync.id,
          sheet_id: sheetId,
          row_index,
          data
        }))
      );
    }

    // Remove any previous classification for this (sheet, tab) pair — ensures
    // each tab belongs to exactly one section and reclassifications take effect.
    await supabase.from('sheet_sections').delete().eq('sheet_id', sheetId).eq('tab_name', tab.name);

    if (suggestedSection) {
      await supabase.from('sheet_sections').insert({
        section_name: suggestedSection,
        sheet_id: sheetId,
        sync_id: sync.id,
        tab_name: tab.name
      });
    }

    result.tabs.push({
      tabName: tab.name,
      tabGid: tab.index,
      syncId: sync.id,
      rowCount: tab.rows.length,
      headers: tab.headers,
      suggestedSection,
      commentRowsSkipped: tab.commentRowsSkipped
    });

    // ── Importar a tabla de negocio ─────────────────────────────────────────
    if (suggestedSection) {
      const last = result.tabs[result.tabs.length - 1];
      try {
        const importResult = await importSheetData(
          suggestedSection,
          tab.rows,
          tab.headers,
          tab.name,
          tab.headerYearHints
        );
        if (importResult) {
          last.importCreated = importResult.created;
          last.importUpdated = importResult.updated;
          last.importSkipped = importResult.skipped;
        }
      } catch (importError) {
        last.importError = (importError as Error).message;
      } finally {
        await supabase
          .from('sheet_syncs')
          .update({
            import_created: last.importCreated ?? null,
            import_updated: last.importUpdated ?? null,
            import_skipped: last.importSkipped ?? null,
            import_error: last.importError ?? null
          })
          .eq('id', sync.id);
      }
    }
  }

  return NextResponse.json(result);
}
