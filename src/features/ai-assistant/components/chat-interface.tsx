'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Icons } from '@/components/icons';
import { toast } from 'sonner';
import { ActionPreview } from './action-preview';
import type {
  ChatMessage,
  AssistantMode,
  ProposedAction,
  ChatStreamEvent,
  ToolActivity
} from '../api/types';
import type { LogEntry } from './action-log';
import { createSession, saveMessage } from '../api/service';

/** Lecturas que hizo el agente antes de responder — hace auditable en qué se basó. */
function ActivityTrail({ activity }: { activity: ToolActivity[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className='text-xs text-muted-foreground'>
      <button
        onClick={() => setOpen(!open)}
        className='flex items-center gap-1 hover:text-foreground transition-colors'
      >
        {open ? <Icons.chevronUp className='h-3 w-3' /> : <Icons.chevronDown className='h-3 w-3' />}
        Consultó la base ({activity.length} {activity.length === 1 ? 'vez' : 'veces'})
      </button>
      {open && (
        <ul className='mt-1 space-y-0.5 border-l pl-2'>
          {activity.map((a, i) => (
            <li key={i} className='font-mono text-[10px]'>
              {a.summary}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MessageBubble({
  message,
  onApproveAction,
  onRejectAction,
  onRevertAction,
  executingId
}: {
  message: ChatMessage;
  onApproveAction: (msgId: string, action: ProposedAction) => void;
  onRejectAction: (msgId: string) => void;
  onRevertAction: (msgId: string, logId: number) => void;
  executingId: string | null;
}) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] space-y-2 ${isUser ? 'items-end' : 'items-start'} flex flex-col`}
      >
        {!isUser && (
          <div className='flex items-center gap-1.5'>
            <div className='flex h-5 w-5 items-center justify-center rounded-full bg-primary/10'>
              <Icons.sparkles className='h-3 w-3 text-primary' />
            </div>
            <span className='text-xs text-muted-foreground'>Asistente RRHH</span>
          </div>
        )}
        <div
          className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
            isUser ? 'bg-primary text-primary-foreground rounded-tr-sm' : 'bg-muted rounded-tl-sm'
          }`}
        >
          <p className='whitespace-pre-wrap'>{message.content}</p>
        </div>
        {message.activity && message.activity.length > 0 && (
          <ActivityTrail activity={message.activity} />
        )}
        {message.pendingAction && (
          <ActionPreview
            action={message.pendingAction}
            onApprove={() => onApproveAction(message.id, message.pendingAction!)}
            onReject={() => onRejectAction(message.id)}
            onRevert={(logId) => onRevertAction(message.id, logId)}
            isExecuting={executingId === message.id}
          />
        )}
        <span className='text-[10px] text-muted-foreground/60'>
          {message.timestamp.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  );
}

type Props = {
  onLogEntry?: (entry: Omit<LogEntry, 'id'>) => void;
  onLogActionUpdate?: (entryId: string, action: ProposedAction) => void;
  initialSessionId?: string | null;
  initialMessages?: ChatMessage[];
  onSessionCreated?: (sessionId: string) => void;
};

export function ChatInterface({
  onLogEntry,
  onLogActionUpdate,
  initialSessionId,
  initialMessages,
  onSessionCreated
}: Props) {
  const [mode, setMode] = useState<AssistantMode>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages ?? []);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const logEntryIdRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string | null>(initialSessionId ?? null);
  const dbUserMsgIdRef = useRef<string | null>(null);
  const dbAssistantMsgIdRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(async () => {
    const content = input.trim();
    if (!content || isStreaming) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: new Date()
    };

    const assistantMsgId = crypto.randomUUID();
    const assistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: new Date()
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput('');
    setIsStreaming(true);

    // Register in log
    const logId = crypto.randomUUID();
    logEntryIdRef.current = logId;
    onLogEntry?.({ timestamp: new Date(), mode, userMessage: content });

    // Persist to DB (fire-and-forget, don't block UI)
    void (async () => {
      try {
        if (!sessionIdRef.current) {
          const session = await createSession(mode);
          sessionIdRef.current = session.id;
          onSessionCreated?.(session.id);
        }
        const dbMsg = await saveMessage(sessionIdRef.current, 'user', content);
        dbUserMsgIdRef.current = dbMsg.id;
      } catch {
        toast.warning('No se pudo guardar la conversación (se perderá al recargar la página)');
      }
    })();

    try {
      const history = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, mode })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Error al conectar con el asistente');
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';
      let action: ProposedAction | null = null;
      const activity: ToolActivity[] = [];
      let streamError: string | null = null;
      // Un chunk de red puede cortar un evento SSE al medio: se acumula y solo
      // se procesan las líneas completas.
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          let event: ChatStreamEvent;
          try {
            event = JSON.parse(line.slice(6)) as ChatStreamEvent;
          } catch {
            continue;
          }

          if (event.t === 'text') {
            fullContent += event.v;
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantMsgId ? { ...m, content: fullContent } : m))
            );
          } else if (event.t === 'tool') {
            // El agente consultó la base: se muestra en qué se está basando
            activity.push({ name: event.name, summary: event.summary });
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantMsgId ? { ...m, activity: [...activity] } : m))
            );
          } else if (event.t === 'action') {
            action = event.action;
          } else if (event.t === 'error') {
            streamError = event.message;
          }
        }
      }

      if (streamError) throw new Error(streamError);

      // Si el agente solo propuso la acción sin texto, la descripción hace de mensaje
      if (action && !fullContent.trim()) {
        fullContent = action.description;
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMsgId ? { ...m, content: fullContent } : m))
        );
      }

      if (action) {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMsgId ? { ...m, pendingAction: action! } : m))
        );
        if (logEntryIdRef.current) {
          onLogActionUpdate?.(logEntryIdRef.current, action);
        }
      }

      // Persist assistant response
      void (async () => {
        try {
          if (sessionIdRef.current) {
            const dbMsg = await saveMessage(sessionIdRef.current, 'assistant', fullContent);
            dbAssistantMsgIdRef.current = dbMsg.id;
          }
        } catch {
          toast.warning(
            'No se pudo guardar la respuesta del asistente (se perderá al recargar la página)'
          );
        }
      })();
    } catch (err) {
      toast.error((err as Error).message);
      setMessages((prev) => prev.filter((m) => m.id !== assistantMsgId));
    } finally {
      setIsStreaming(false);
    }
  }, [input, isStreaming, messages, mode, onLogEntry, onLogActionUpdate, onSessionCreated]);

  const approveAction = useCallback(
    async (msgId: string, action: ProposedAction) => {
      setExecutingId(msgId);

      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId && m.pendingAction
            ? { ...m, pendingAction: { ...m.pendingAction, status: 'approved' } }
            : m
        )
      );

      try {
        const res = await fetch('/api/ai/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, session_id: sessionIdRef.current ?? undefined })
        });
        const result = await res.json();

        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId && m.pendingAction
              ? {
                  ...m,
                  pendingAction: {
                    ...m.pendingAction,
                    status: result.error ? 'error' : 'executed',
                    result
                  }
                }
              : m
          )
        );

        if (result.error) toast.error(result.error);
        else toast.success(`${result.affected} registros actualizados`);

        // Update log with final action state
        if (logEntryIdRef.current) {
          onLogActionUpdate?.(logEntryIdRef.current, {
            ...action,
            status: result.error ? 'error' : 'executed',
            result
          });
        }
      } catch (err) {
        toast.error((err as Error).message);
      } finally {
        setExecutingId(null);
      }
    },
    [onLogActionUpdate]
  );

  const revertAction = useCallback(async (msgId: string, logId: number) => {
    setExecutingId(msgId);
    try {
      const res = await fetch('/api/ai/revert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ log_id: logId })
      });
      const result = await res.json();

      if (!res.ok) throw new Error(result.error ?? 'No se pudo deshacer');

      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId && m.pendingAction
            ? { ...m, pendingAction: { ...m.pendingAction, status: 'reverted' } }
            : m
        )
      );
      toast.success(
        `Deshecho — ${result.restored} ${result.restored === 1 ? 'fila restaurada' : 'filas restauradas'}` +
          (result.removed > 0 ? `, ${result.removed} dadas de baja` : '')
      );
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setExecutingId(null);
    }
  }, []);

  const rejectAction = useCallback((msgId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId && m.pendingAction
          ? { ...m, pendingAction: { ...m.pendingAction, status: 'rejected' } }
          : m
      )
    );
  }, []);

  return (
    <div className='flex h-full flex-col'>
      {/* Header */}
      <div className='flex items-center justify-between border-b px-4 py-3'>
        <div className='flex items-center gap-2'>
          <Icons.sparkles className='h-4 w-4 text-primary' />
          <span className='font-medium text-sm'>Asistente RRHH</span>
          <Badge variant='outline' className='text-[10px]'>
            DeepSeek
          </Badge>
        </div>
        <div className='flex items-center gap-1.5 rounded-full border p-0.5'>
          <button
            onClick={() => setMode('chat')}
            className={`rounded-full px-3 py-1 text-xs transition-colors ${
              mode === 'chat'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Chat
          </button>
          <button
            onClick={() => setMode('build')}
            className={`rounded-full px-3 py-1 text-xs transition-colors ${
              mode === 'build'
                ? 'bg-amber-500 text-white'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            ⚡ Build
          </button>
        </div>
      </div>

      {/* Mode banner */}
      {mode === 'build' && (
        <div className='flex items-center gap-2 border-b bg-amber-50 px-4 py-2 text-xs text-amber-700 dark:bg-amber-950/30 dark:text-amber-300'>
          <Icons.alertCircle className='h-3.5 w-3.5 shrink-0' />
          Modo Build activo — el asistente puede proponer cambios en Supabase. Revisá cada acción
          antes de ejecutar.
        </div>
      )}

      {/* Messages */}
      <div className='flex-1 overflow-y-auto px-4 py-4 space-y-4'>
        {messages.length === 0 && (
          <div className='flex flex-col items-center justify-center h-full gap-3 text-center py-16'>
            <div className='flex h-12 w-12 items-center justify-center rounded-full bg-primary/10'>
              <Icons.sparkles className='h-6 w-6 text-primary' />
            </div>
            <p className='font-medium'>Asistente de RRHH</p>
            <p className='text-sm text-muted-foreground max-w-xs'>
              Preguntame sobre empleados, sueldos, vacaciones o pedime que resuelva inconsistencias
              entre sheets y Supabase.
            </p>
            <div className='flex flex-wrap gap-2 justify-center mt-2'>
              {[
                '¿Cuántos días de vacaciones le quedan a cada empleado?',
                '¿Hay empleados en el sheet que no están en Supabase?',
                '¿Qué sueldos se cargaron en el último sync?'
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => setInput(suggestion)}
                  className='rounded-full border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted transition-colors'
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            onApproveAction={approveAction}
            onRejectAction={rejectAction}
            onRevertAction={revertAction}
            executingId={executingId}
          />
        ))}

        {isStreaming && (
          <div className='flex justify-start'>
            <div className='rounded-2xl rounded-tl-sm bg-muted px-3.5 py-2.5'>
              <div className='flex gap-1'>
                <span className='h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:0ms]' />
                <span className='h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:150ms]' />
                <span className='h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:300ms]' />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className='border-t px-4 py-3'>
        <div className='flex gap-2 items-end'>
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder={
              mode === 'build'
                ? 'Describí qué querés hacer con los datos...'
                : 'Preguntá sobre los datos de RRHH...'
            }
            className='min-h-[44px] max-h-32 resize-none text-sm'
            rows={1}
            disabled={isStreaming}
          />
          <Button
            size='icon'
            className='h-11 w-11 shrink-0'
            onClick={sendMessage}
            disabled={!input.trim() || isStreaming}
          >
            {isStreaming ? (
              <Icons.spinner className='h-4 w-4 animate-spin' />
            ) : (
              <Icons.send className='h-4 w-4' />
            )}
          </Button>
        </div>
        <p className='mt-1.5 text-[10px] text-muted-foreground/60 text-center'>
          Enter para enviar · Shift+Enter para nueva línea
        </p>
      </div>
    </div>
  );
}
