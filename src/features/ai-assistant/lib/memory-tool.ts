import { getAdminClient } from './admin-client';

/**
 * Memoria permanente del agente.
 *
 * El historial de un chat se compacta y se pierde entre sesiones, pero hay
 * cosas que el agente aprende y valen para siempre: que "Nacho" es el id 17,
 * que los sueldos de agosto se cargan el día 25, que la pestaña "FLOTA 2026"
 * reemplazó a "FLOTA". Esas van a `ai_context_memory`, que `buildSystemPrompt`
 * vuelca en TODAS las sesiones siguientes.
 *
 * Es lo único que el agente puede escribir sin confirmación del usuario: no
 * toca datos de negocio, solo su propia libreta.
 */

export const REMEMBER_TOOL = {
  type: 'function' as const,
  function: {
    name: 'remember',
    description:
      'Guarda un dato en tu memoria permanente, disponible en todas las conversaciones futuras. Usala sin pedir permiso cuando el usuario te corrige, te aclara una convención del negocio, o descubrís algo estable que te ahorraría consultas después. NO la uses para datos de negocio que ya viven en una tabla (sueldos, fechas, saldos): esos se leen con query_data.',
    parameters: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description:
            'Identificador corto en snake_case, ej. "alias_empleados" o "convencion_carga_sueldos". Si la clave ya existe se sobrescribe.'
        },
        value: {
          description: 'El dato a recordar. Puede ser texto, número, objeto o lista.'
        },
        description: {
          type: 'string',
          description: 'Una línea explicando para qué sirve este dato'
        }
      },
      required: ['key', 'value']
    }
  }
};

export const FORGET_TOOL = {
  type: 'function' as const,
  function: {
    name: 'forget',
    description:
      'Borra una entrada de tu memoria permanente. Usala cuando el usuario te diga que algo que recordabas ya no vale.',
    parameters: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'La clave a borrar' }
      },
      required: ['key']
    }
  }
};

const KEY_RE = /^[a-z0-9_]{2,60}$/;

export async function runRemember(args: {
  key?: string;
  value?: unknown;
  description?: string;
}): Promise<{ ok: boolean; summary: string }> {
  const key = (args.key ?? '').trim().toLowerCase();
  if (!KEY_RE.test(key)) {
    return {
      ok: false,
      summary: `clave inválida: "${args.key}" (usá snake_case, 2-60 caracteres)`
    };
  }
  if (args.value === undefined || args.value === null || args.value === '') {
    return { ok: false, summary: `no se guardó "${key}": el valor está vacío` };
  }

  const { error } = await getAdminClient()
    .from('ai_context_memory')
    .upsert(
      {
        key,
        value: args.value,
        description: args.description ?? null,
        source: 'assistant',
        updated_at: new Date().toISOString()
      },
      { onConflict: 'key' }
    );

  if (error) return { ok: false, summary: `no se pudo recordar "${key}": ${error.message}` };
  return { ok: true, summary: `recordado: ${key}` };
}

export async function runForget(args: { key?: string }): Promise<{ ok: boolean; summary: string }> {
  const key = (args.key ?? '').trim().toLowerCase();
  if (!KEY_RE.test(key)) return { ok: false, summary: `clave inválida: "${args.key}"` };

  const { error } = await getAdminClient().from('ai_context_memory').delete().eq('key', key);
  if (error) return { ok: false, summary: `no se pudo olvidar "${key}": ${error.message}` };
  return { ok: true, summary: `olvidado: ${key}` };
}
