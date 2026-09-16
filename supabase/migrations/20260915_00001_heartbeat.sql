-- El proyecto de Supabase (plan free) se pausa tras 7 dias sin actividad.
-- El cron /api/ping existia desde junio pero no habia forma de saber si
-- realmente corria: cuando el proyecto se pauso no quedo ningun rastro.
-- Esta tabla guarda la marca del ultimo ping para poder auditarlo, y el
-- upsert diario cuenta como actividad de escritura (no solo lectura).
create table if not exists heartbeat (
  id boolean primary key default true,
  last_ping timestamptz not null default now(),
  source text,
  constraint heartbeat_single_row check (id)
);

insert into heartbeat (id, source) values (true, 'migracion')
on conflict (id) do nothing;

-- Sin policies: solo el service role (que saltea RLS) escribe aca.
alter table heartbeat enable row level security;
