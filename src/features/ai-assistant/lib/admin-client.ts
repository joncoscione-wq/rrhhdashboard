import { createClient } from '@supabase/supabase-js';

/**
 * Cliente con service role. Solo para rutas de servidor: saltea RLS y puede
 * escribir cualquier tabla. Nunca importarlo desde un componente cliente.
 */
export function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY no configurada');
  return createClient(url, key);
}
