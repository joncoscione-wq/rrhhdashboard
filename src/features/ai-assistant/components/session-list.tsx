'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Icons } from '@/components/icons';
import { toast } from 'sonner';
import { getSessions, getSessionMessages } from '../api/service';
import type { AiSession, AiMessage } from '../api/service';
import type { ChatMessage } from '../api/types';

function dbMessageToChat(m: AiMessage): ChatMessage {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    timestamp: new Date(m.created_at),
    pendingAction: m.pending_action as ChatMessage['pendingAction']
  };
}

type Props = {
  activeSessionId: string | null;
  onSelectSession: (sessionId: string, messages: ChatMessage[]) => void;
  onNewSession: () => void;
  refreshTrigger?: number;
};

export function SessionList({
  activeSessionId,
  onSelectSession,
  onNewSession,
  refreshTrigger
}: Props) {
  const [sessions, setSessions] = useState<AiSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getSessions(30);
      setSessions(data);
    } catch {
      toast.error('No se pudo cargar el historial de conversaciones');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchSessions();
  }, [fetchSessions, refreshTrigger]);

  const handleSelect = async (session: AiSession) => {
    if (session.id === activeSessionId) return;
    setLoadingId(session.id);
    try {
      const dbMessages = await getSessionMessages(session.id);
      onSelectSession(session.id, dbMessages.map(dbMessageToChat));
    } catch {
      toast.error('No se pudo cargar esa conversación');
    }
    setLoadingId(null);
  };

  return (
    <div className='flex h-full flex-col border-r'>
      <div className='flex items-center justify-between border-b px-3 py-3'>
        <span className='text-xs font-medium text-muted-foreground uppercase tracking-wide'>
          Historial
        </span>
        <Button
          variant='ghost'
          size='icon'
          className='h-6 w-6'
          onClick={onNewSession}
          title='Nueva conversación'
        >
          <Icons.plus className='h-3.5 w-3.5' />
        </Button>
      </div>

      <div className='flex-1 overflow-y-auto p-2 space-y-1'>
        {loading && (
          <div className='flex items-center justify-center py-8'>
            <Icons.spinner className='h-4 w-4 animate-spin text-muted-foreground' />
          </div>
        )}

        {!loading && sessions.length === 0 && (
          <p className='text-xs text-muted-foreground text-center py-8 px-2'>
            Las conversaciones aparecerán acá
          </p>
        )}

        {sessions.map((session) => {
          const isActive = session.id === activeSessionId;
          const isLoading = loadingId === session.id;
          const date = new Date(session.updated_at);
          const dateStr = date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });

          return (
            <button
              key={session.id}
              onClick={() => void handleSelect(session)}
              disabled={isLoading}
              className={`w-full text-left rounded-md px-2.5 py-2 text-xs transition-colors space-y-1 ${
                isActive
                  ? 'bg-primary/10 text-foreground'
                  : 'hover:bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              <div className='flex items-start justify-between gap-1'>
                {/* Dos líneas antes de recortar: con `truncate` un título de
                    una frase entera se veía como tres palabras sueltas */}
                <span className='line-clamp-2 font-medium leading-snug break-words'>
                  {session.title ?? 'Sin título'}
                </span>
                {isLoading && <Icons.spinner className='mt-0.5 h-3 w-3 animate-spin shrink-0' />}
              </div>
              <div className='flex items-center gap-1.5'>
                <Badge
                  variant='outline'
                  className={`text-[9px] px-1 py-0 h-4 ${
                    session.mode === 'build'
                      ? 'border-amber-400 text-amber-600 dark:text-amber-400'
                      : 'border-border'
                  }`}
                >
                  {session.mode}
                </Badge>
                <span className='text-[10px] text-muted-foreground/60'>{dateStr}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
