export type AssistantMode = 'chat' | 'build';

export type MessageRole = 'user' | 'assistant' | 'system';

export type ProposedAction = {
  type: 'upsert' | 'update' | 'delete' | 'mapping';
  table: string;
  description: string;
  risk: 'low' | 'medium' | 'high';
  records: Record<string, unknown>[];
  conflict_column?: string;
  match_column?: string;
  affected_rows_estimate?: number;
  status: 'pending' | 'approved' | 'rejected' | 'executed' | 'error' | 'reverted';
  result?: { affected: number; error?: string; log_id?: number };
};

/** Lectura que hizo el agente durante el turno, para mostrar en qué se basó. */
export type ToolActivity = {
  name: string;
  summary: string;
};

export type ChatMessage = {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  pendingAction?: ProposedAction;
  activity?: ToolActivity[];
};

export type ChatRequest = {
  messages: { role: MessageRole; content: string }[];
  mode: AssistantMode;
};

/** Eventos del stream SSE de /api/ai/chat. */
export type ChatStreamEvent =
  | { t: 'text'; v: string }
  | { t: 'tool'; name: string; summary: string }
  | { t: 'action'; action: ProposedAction }
  | { t: 'error'; message: string }
  | { t: 'done' };

export type ExecuteRequest = {
  action: ProposedAction;
  session_id?: string;
};

export type ExecuteResponse = {
  affected: number;
  error?: string;
  /** Id en ai_agent_log — es lo que después permite deshacer la acción. */
  log_id?: number;
};

export type RevertRequest = {
  log_id: number;
};

export type RevertResponse = {
  restored: number;
  removed: number;
  error?: string;
};
