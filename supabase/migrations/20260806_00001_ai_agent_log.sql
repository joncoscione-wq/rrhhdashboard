-- ============================================================================
-- Migration: ai_agent_log — registro durable de cambios hechos por el agente IA
-- Cada acción de escritura que ejecuta el agente (modo Build, siempre con
-- aprobación del usuario) queda registrada con el estado anterior y posterior
-- de las filas tocadas, para auditar o revertir a mano si hiciera falta.
-- ============================================================================

create table if not exists ai_agent_log (
  id bigint primary key generated always as identity,
  empresa_id bigint not null default 1 references empresas(id) on delete cascade,
  session_id text, -- ai_sessions.id (esa tabla se creó fuera de migraciones)
  action_type text not null check (action_type in ('upsert', 'update', 'delete')),
  table_name text not null,
  description text,
  risk text check (risk in ('low', 'medium', 'high')),
  records_before jsonb, -- filas antes del cambio (vacío en altas)
  records_after jsonb, -- filas después del cambio
  affected integer not null default 0,
  status text not null default 'executed' check (status in ('executed', 'error')),
  error text,
  created_at timestamptz not null default now()
);

create index if not exists ai_agent_log_created_idx on ai_agent_log (created_at desc);
create index if not exists ai_agent_log_table_idx on ai_agent_log (table_name);

alter table ai_agent_log enable row level security;

-- Mismo patrón que el resto de las tablas del dashboard (app monotenant detrás
-- de PIN; ver migración 20260709_00005_auditoria_produccion). La lectura desde
-- el browser necesita anon porque la app no usa auth de Supabase sino su propio
-- PIN vía proxy.
drop policy if exists ai_agent_log_write on ai_agent_log;
create policy ai_agent_log_write on ai_agent_log
  for all to anon, authenticated using (true) with check (true);
