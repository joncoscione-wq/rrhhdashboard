import { NextResponse } from 'next/server';
import { buildSystemPrompt } from '@/features/ai-assistant/lib/system-prompt';
import {
  QUERY_DATA_TOOL,
  runQueryData,
  type QueryDataArgs
} from '@/features/ai-assistant/lib/read-tools';
import { PROPOSE_OPERATION_TOOL, OPERATIONS } from '@/features/ai-assistant/lib/operations';
import {
  REMEMBER_TOOL,
  FORGET_TOOL,
  runRemember,
  runForget
} from '@/features/ai-assistant/lib/memory-tool';
import { compactHistory } from '@/features/ai-assistant/lib/compact-history';
import type { ChatRequest, ProposedAction } from '@/features/ai-assistant/api/types';

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';

// Cuántas veces puede el agente leer y volver a pensar dentro de un mismo turno.
// Sin esto era un solo disparo: proponía a ciegas, sin poder verificar nada.
const MAX_STEPS = 6;

export const maxDuration = 120;

const PROPOSE_ACTION_TOOL = {
  type: 'function' as const,
  function: {
    name: 'propose_action',
    description:
      'Propone una acción de escritura sobre una tabla de negocio de RRHH. Nunca ejecuta nada: la acción se le muestra al usuario para que la confirme. Llamala solo después de haber verificado los datos con query_data.',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['upsert', 'update', 'delete'],
          description:
            'upsert: insertar o actualizar por columna(s) de conflicto. update: modificar registros existentes por match_column. delete: baja lógica (empleados) o física.'
        },
        table: {
          type: 'string',
          description:
            'Tabla de negocio: empleados, sueldos, vacaciones, vacaciones_dias, lineas_moviles, flota_laptops, home_office_semanal, reuniones, manuales, puestos, eventos_calendario'
        },
        description: {
          type: 'string',
          description: 'Qué hace esta acción y por qué, en español claro'
        },
        risk: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description:
            'low: 1 registro reversible. medium: varios registros o FK. high: >20 registros o columnas críticas (moneda, monto, activo)'
        },
        records: {
          type: 'array',
          items: { type: 'object', additionalProperties: true },
          description:
            'Filas a escribir. Deben incluir la(s) columna(s) clave. Para empleados usar el id numérico obtenido con query_data.'
        },
        conflict_column: {
          type: 'string',
          description:
            'Solo upsert: columna(s) de conflicto. Para claves compuestas, separadas por coma sin espacios, ej. "empleado_id,mes,anio,moneda" en sueldos.'
        },
        match_column: {
          type: 'string',
          description:
            'Solo update/delete: columna(s) para ubicar los registros, separadas por coma si son varias (normalmente "id")'
        },
        affected_rows_estimate: { type: 'number' }
      },
      required: ['type', 'table', 'description', 'risk', 'records']
    }
  }
};

type ToolCallAcc = { id: string; name: string; arguments: string };

type ChatCompletionMessage = {
  role: string;
  content?: string | null;
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
};

/**
 * Ejecuta un paso contra DeepSeek en streaming, reenviando el texto token a
 * token y acumulando los tool_calls (que llegan como deltas parciales por
 * índice, no completos).
 */
async function runStep(
  convo: ChatCompletionMessage[],
  tools: unknown[] | undefined,
  apiKey: string,
  onText: (chunk: string) => void
): Promise<{ content: string; toolCalls: ToolCallAcc[] }> {
  const upstream = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      stream: true,
      messages: convo,
      temperature: 0.3,
      max_tokens: 2048,
      ...(tools ? { tools, tool_choice: 'auto' as const } : {})
    })
  });

  if (!upstream.ok) {
    throw new Error(`DeepSeek respondió ${upstream.status}: ${await upstream.text()}`);
  }

  const reader = upstream.body!.getReader();
  const decoder = new TextDecoder();
  const acc: Record<number, ToolCallAcc> = {};
  let content = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    // Un chunk puede cortar una línea al medio: se acumula y solo se procesan
    // las líneas completas.
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (!data || data === '[DONE]') continue;

      try {
        const delta = JSON.parse(data).choices?.[0]?.delta;
        if (!delta) continue;

        if (delta.content) {
          content += delta.content;
          onText(delta.content);
        }

        for (const tc of delta.tool_calls ?? []) {
          const idx = tc.index ?? 0;
          acc[idx] ??= { id: '', name: '', arguments: '' };
          if (tc.id) acc[idx].id += tc.id;
          if (tc.function?.name) acc[idx].name += tc.function.name;
          if (tc.function?.arguments) acc[idx].arguments += tc.function.arguments;
        }
      } catch {
        // línea SSE no parseable: se ignora, el stream sigue
      }
    }
  }

  return { content, toolCalls: Object.values(acc) };
}

function resumenLectura(args: QueryDataArgs, result: { count?: number; error?: string }): string {
  if (result.error) return `${args.table}: error — ${result.error}`;
  const filtros = (args.filters ?? []).map((f) => `${f.column} ${f.op} ${JSON.stringify(f.value)}`);
  const donde = filtros.length > 0 ? ` (${filtros.join(', ')})` : '';
  return `${args.table}${donde} → ${result.count ?? 0} ${result.count === 1 ? 'fila' : 'filas'}`;
}

export async function POST(request: Request) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'DEEPSEEK_API_KEY no configurada' }, { status: 500 });
  }

  const body = (await request.json()) as ChatRequest;
  const { messages, mode } = body;

  if (!messages?.length) {
    return NextResponse.json({ error: 'messages requerido' }, { status: 400 });
  }

  const systemPrompt = await buildSystemPrompt(mode ?? 'chat');

  // El historial largo se colapsa antes de mandarlo: ver compact-history.ts.
  const { messages: historial, compactados } = compactHistory(messages);

  console.warn(
    `[ai/chat] system prompt: ${systemPrompt.length} chars (~${Math.round(systemPrompt.length / 3.5)} tokens) | mode=${mode ?? 'chat'} | historial=${messages.length} mensajes` +
      (compactados > 0 ? ` (${compactados} compactados)` : '')
  );

  // En ambos modos el agente puede LEER y recordar. Lo que cambia es si puede
  // proponer escrituras de negocio: eso sigue siendo exclusivo de build, y
  // siempre con confirmación del usuario.
  const tools =
    mode === 'build'
      ? [QUERY_DATA_TOOL, PROPOSE_ACTION_TOOL, PROPOSE_OPERATION_TOOL, REMEMBER_TOOL, FORGET_TOOL]
      : [QUERY_DATA_TOOL, REMEMBER_TOOL, FORGET_TOOL];

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      const convo: ChatCompletionMessage[] = [
        { role: 'system', content: systemPrompt },
        ...historial.map((m) => ({ role: m.role, content: m.content }))
      ];

      try {
        for (let step = 0; step < MAX_STEPS; step++) {
          const { content, toolCalls } = await runStep(convo, tools, apiKey, (chunk) =>
            emit({ t: 'text', v: chunk })
          );

          if (toolCalls.length === 0) break;

          convo.push({
            role: 'assistant',
            content: content || null,
            tool_calls: toolCalls.map((tc) => ({
              id: tc.id,
              type: 'function' as const,
              function: { name: tc.name, arguments: tc.arguments }
            }))
          });

          const operacion = toolCalls.find((tc) => tc.name === 'propose_operation');
          if (operacion) {
            try {
              const { operation, description, args } = JSON.parse(operacion.arguments) as {
                operation: string;
                description: string;
                args: Record<string, unknown>;
              };
              const def = OPERATIONS[operation];
              if (!def) throw new Error(`operación desconocida: ${operation}`);
              emit({
                t: 'action',
                action: {
                  kind: 'operation',
                  type: 'operation',
                  operation,
                  operation_args: args ?? {},
                  table: def.entidad,
                  description,
                  risk: def.risk,
                  records: [args ?? {}],
                  status: 'pending'
                } satisfies ProposedAction
              });
            } catch (err) {
              emit({
                t: 'error',
                message: `El asistente propuso una operación inválida: ${(err as Error).message}`
              });
            }
            break;
          }

          const propuesta = toolCalls.find((tc) => tc.name === 'propose_action');
          if (propuesta) {
            try {
              const action = JSON.parse(propuesta.arguments) as ProposedAction;
              emit({ t: 'action', action: { ...action, kind: 'write', status: 'pending' } });
            } catch {
              emit({ t: 'error', message: 'El asistente propuso una acción con formato inválido' });
            }
            // El turno termina acá: la escritura espera confirmación del usuario.
            break;
          }

          // Solo quedaron lecturas y memoria: se ejecutan y el resultado vuelve
          // al modelo para que siga razonando en el próximo paso.
          for (const tc of toolCalls) {
            let args: Record<string, unknown>;
            try {
              args = JSON.parse(tc.arguments) as Record<string, unknown>;
            } catch {
              convo.push({
                role: 'tool',
                tool_call_id: tc.id,
                content: 'Argumentos inválidos: no son JSON válido'
              });
              continue;
            }

            if (tc.name === 'remember' || tc.name === 'forget') {
              const res =
                tc.name === 'remember'
                  ? await runRemember(args as { key?: string; value?: unknown })
                  : await runForget(args as { key?: string });
              console.warn(`[ai/chat] ${tc.name} → ${res.summary}`);
              emit({ t: 'tool', name: tc.name, summary: `memoria — ${res.summary}` });
              convo.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(res) });
              continue;
            }

            if (tc.name !== 'query_data') {
              convo.push({
                role: 'tool',
                tool_call_id: tc.id,
                content: `Herramienta desconocida: ${tc.name}`
              });
              continue;
            }

            const queryArgs = args as unknown as QueryDataArgs;
            const result = await runQueryData(queryArgs);
            const resumen = resumenLectura(queryArgs, result);
            console.warn(`[ai/chat] query_data → ${resumen}`);
            emit({ t: 'tool', name: 'query_data', summary: resumen });

            convo.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: JSON.stringify(result)
            });
          }

          if (step === MAX_STEPS - 1) {
            emit({
              t: 'error',
              message: `El asistente hizo ${MAX_STEPS} consultas sin llegar a una respuesta. Probá acotar el pedido.`
            });
          }
        }

        emit({ t: 'done' });
      } catch (err) {
        emit({ t: 'error', message: (err as Error).message });
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    }
  });
}
