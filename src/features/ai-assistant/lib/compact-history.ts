/**
 * Compactación del historial de chat.
 *
 * El system prompt ya pesa decenas de miles de caracteres (vuelca empleados,
 * sueldos, vacaciones…). Si además se manda el historial completo, una
 * conversación larga con tablas volcadas en las respuestas termina reventando
 * la ventana de DeepSeek: el modelo empieza a ignorar las instrucciones del
 * principio y responde cualquier cosa, sin ningún error visible.
 *
 * Se conservan íntegros los últimos turnos —que es donde está el pedido real—
 * y lo anterior se colapsa en un resumen mecánico (sin llamar al modelo, para
 * no agregar latencia ni costo) que preserva el hilo de qué se pidió y qué se
 * resolvió.
 */

type Msg = { role: string; content: string };

/** Presupuesto de caracteres para el historial reciente que se manda entero. */
const BUDGET_CHARS = 14000;
/** Turnos que se mandan completos siempre, aunque excedan el presupuesto. */
const MIN_MENSAJES = 6;
/** Recorte de cada mensaje viejo dentro del resumen. */
const RESUMEN_CHARS = 180;

function recortar(texto: string, max: number): string {
  const limpio = texto.replace(/\s+/g, ' ').trim();
  return limpio.length <= max ? limpio : `${limpio.slice(0, max)}…`;
}

export type CompactResult = {
  /** Historial listo para mandar, con el resumen al frente si hubo compactación. */
  messages: Msg[];
  /** Cuántos mensajes se colapsaron. 0 = no hizo falta compactar. */
  compactados: number;
};

export function compactHistory(messages: Msg[]): CompactResult {
  if (messages.length <= MIN_MENSAJES) return { messages, compactados: 0 };

  // Se recorre desde el final sumando caracteres hasta agotar el presupuesto.
  let corte = messages.length;
  let acumulado = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    acumulado += messages[i].content.length;
    if (acumulado > BUDGET_CHARS && messages.length - i >= MIN_MENSAJES) break;
    corte = i;
  }

  if (corte === 0) return { messages, compactados: 0 };

  const viejos = messages.slice(0, corte);
  const recientes = messages.slice(corte);

  const resumen = viejos
    .map((m) => `- ${m.role === 'user' ? 'Usuario' : 'Vos'}: ${recortar(m.content, RESUMEN_CHARS)}`)
    .join('\n');

  return {
    compactados: viejos.length,
    messages: [
      {
        role: 'system',
        content:
          `## Resumen de la parte anterior de esta conversación (${viejos.length} mensajes compactados)\n\n` +
          `${resumen}\n\n` +
          'Está recortado: si necesitás un dato exacto de esos turnos, releelo de la base con `query_data` en vez de deducirlo de este resumen.'
      },
      ...recientes
    ]
  };
}
