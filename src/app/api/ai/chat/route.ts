import { NextResponse } from 'next/server';
import { buildSystemPrompt } from '@/features/ai-assistant/lib/system-prompt';
import type { ChatRequest } from '@/features/ai-assistant/api/types';

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';

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
  // Visible en logs de Vercel: cuánto contexto se manda en cada mensaje
  console.warn(
    `[ai/chat] system prompt: ${systemPrompt.length} chars (~${Math.round(systemPrompt.length / 3.5)} tokens) | mode=${mode ?? 'chat'} | historial=${messages.length} mensajes`
  );

  // En modo build el asistente propone acciones con function calling real
  // (antes: el modelo imprimía un bloque ```json que se parseaba con regex —
  // frágil). La acción llega como tool_call estructurado y la UI pide
  // confirmación antes de ejecutarla vía /api/ai/execute.
  const tools =
    mode === 'build'
      ? [
          {
            type: 'function' as const,
            function: {
              name: 'propose_action',
              description:
                'Propone una acción de escritura sobre una tabla de negocio de RRHH. Nunca ejecuta nada: la acción se muestra al usuario para confirmación.',
              parameters: {
                type: 'object',
                properties: {
                  type: {
                    type: 'string',
                    enum: ['upsert', 'update', 'delete'],
                    description:
                      'upsert: insertar o actualizar por columna de conflicto. update: modificar registros existentes por match_column. delete: baja lógica (empleados) o física.'
                  },
                  table: {
                    type: 'string',
                    description:
                      'Tabla de negocio: empleados, sueldos, vacaciones, lineas_moviles, flota_laptops, home_office_semanal, reuniones, manuales, puestos'
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
                      'Filas a escribir. Para update/delete deben incluir la match_column. Para empleados usar el id numérico de la lista de empleados del contexto.'
                  },
                  conflict_column: {
                    type: 'string',
                    description: 'Solo upsert: columna de conflicto (default id)'
                  },
                  match_column: {
                    type: 'string',
                    description: 'Solo update/delete: columna para ubicar los registros (ej. id)'
                  },
                  affected_rows_estimate: { type: 'number' }
                },
                required: ['type', 'table', 'description', 'risk', 'records']
              }
            }
          }
        ]
      : undefined;

  const payload = {
    model: 'deepseek-chat',
    stream: true,
    messages: [{ role: 'system', content: systemPrompt }, ...messages],
    temperature: 0.3,
    max_tokens: 2048,
    ...(tools ? { tools, tool_choice: 'auto' as const } : {})
  };

  const upstream = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  if (!upstream.ok) {
    const err = await upstream.text();
    return NextResponse.json({ error: err }, { status: upstream.status });
  }

  // Stream the response directly to the client
  return new Response(upstream.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    }
  });
}
