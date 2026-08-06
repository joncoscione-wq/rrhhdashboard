export type AssistantMode = 'chat' | 'build';

export type MessageRole = 'user' | 'assistant' | 'system';

export type ActionStatus = 'pending' | 'approved' | 'rejected' | 'executed' | 'error' | 'reverted';

export type ActionResult = { affected: number; error?: string; log_id?: number };

export type ProposedAction = {
  /** Distingue la escritura cruda de tabla de la operación de negocio */
  kind?: 'write' | 'operation';
  type: 'upsert' | 'update' | 'delete' | 'mapping' | 'operation';
  table: string;
  description: string;
  risk: 'low' | 'medium' | 'high';
  records: Record<string, unknown>[];
  conflict_column?: string;
  match_column?: string;
  affected_rows_estimate?: number;
  /** Solo cuando kind === 'operation' */
  operation?: string;
  operation_args?: Record<string, unknown>;
  status: ActionStatus;
  result?: ActionResult;
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
