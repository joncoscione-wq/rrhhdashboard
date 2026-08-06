import { supabase } from '@/lib/supabase';
import type { AssistantMode } from './types';

export type AiSession = {
  id: string;
  title: string | null;
  mode: AssistantMode;
  skill: string | null;
  created_at: string;
  updated_at: string;
};

export type AiMessage = {
  id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  pending_action: Record<string, unknown> | null;
  created_at: string;
};

export type AiContextMemory = {
  id: string;
  key: string;
  value: unknown;
  description: string | null;
  source: 'manual' | 'assistant' | 'sync';
  updated_at: string;
};

// ── Sessions ──────────────────────────────────────────────────────────────────

export async function createSession(
  mode: AssistantMode,
  skill: string | null = null
): Promise<AiSession> {
  const { data, error } = await supabase
    .from('ai_sessions')
    .insert({ mode, skill })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as AiSession;
}

export async function updateSessionTitle(id: string, title: string): Promise<void> {
  await supabase.from('ai_sessions').update({ title }).eq('id', id);
}

export async function getSessions(limit = 20): Promise<AiSession[]> {
  const { data } = await supabase
    .from('ai_sessions')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as AiSession[];
}

export async function getSessionMessages(sessionId: string): Promise<AiMessage[]> {
  const { data } = await supabase
    .from('ai_messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at');
  return (data ?? []) as AiMessage[];
}

// ── Messages ──────────────────────────────────────────────────────────────────

export async function saveMessage(
  sessionId: string,
  role: 'user' | 'assistant',
  content: string,
  pendingAction?: Record<string, unknown> | null
): Promise<AiMessage> {
  const { data, error } = await supabase
    .from('ai_messages')
    .insert({
      session_id: sessionId,
      role,
      content,
      pending_action: pendingAction ?? null
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as AiMessage;
}

export async function updateMessageAction(
  messageId: string,
  pendingAction: Record<string, unknown>
): Promise<void> {
  await supabase.from('ai_messages').update({ pending_action: pendingAction }).eq('id', messageId);
}

// ── Agent Action Log (registro durable de cambios ejecutados por el agente) ──

export type AiAgentLogEntry = {
  id: number;
  session_id: string | null;
  action_type: 'upsert' | 'update' | 'delete';
  table_name: string;
  description: string | null;
  risk: 'low' | 'medium' | 'high' | null;
  records_before: Record<string, unknown>[] | null;
  records_after: Record<string, unknown>[] | null;
  affected: number;
  status: 'executed' | 'error';
  error: string | null;
  created_at: string;
};

export async function getAgentLog(limit = 30): Promise<AiAgentLogEntry[]> {
  const { data } = await supabase
    .from('ai_agent_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as AiAgentLogEntry[];
}

// ── Context Memory ────────────────────────────────────────────────────────────

export async function getContextMemory(): Promise<AiContextMemory[]> {
  const { data } = await supabase
    .from('ai_context_memory')
    .select('*')
    .order('updated_at', { ascending: false });
  return (data ?? []) as AiContextMemory[];
}

export async function upsertContextMemory(
  key: string,
  value: unknown,
  description?: string,
  source: AiContextMemory['source'] = 'assistant'
): Promise<void> {
  await supabase
    .from('ai_context_memory')
    .upsert(
      { key, value, description, source, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );
}

export async function deleteContextMemory(key: string): Promise<void> {
  await supabase.from('ai_context_memory').delete().eq('key', key);
}
