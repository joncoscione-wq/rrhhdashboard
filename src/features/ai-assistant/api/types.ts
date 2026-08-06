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
  status: 'pending' | 'approved' | 'rejected' | 'executed' | 'error';
  result?: { affected: number; error?: string };
};

export type ChatMessage = {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  pendingAction?: ProposedAction;
};

export type ChatRequest = {
  messages: { role: MessageRole; content: string }[];
  mode: AssistantMode;
};

export type ExecuteRequest = {
  action: ProposedAction;
  session_id?: string;
};

export type ExecuteResponse = {
  affected: number;
  error?: string;
};
