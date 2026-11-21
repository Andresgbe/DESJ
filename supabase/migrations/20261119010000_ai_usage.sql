-- Gasto de IA por persona y límite mensual.
-- ai_usage: un registro por mensaje respondido (tokens, búsquedas y costo estimado en USD). Cada persona ve y
--   agrega solo lo suyo, pero NO puede editarlo ni borrarlo (así no se puede "reiniciar" el gasto).
-- ai_limits: tope mensual en USD por persona. Solo lectura desde la app; se cambia en el panel de Supabase:
--   insert into public.ai_limits (user_id, monthly_usd) values ('<uuid>', 15)
--   on conflict (user_id) do update set monthly_usd = excluded.monthly_usd, updated_at = now();
-- Sin fila en ai_limits, la Edge Function usa AI_MONTHLY_LIMIT_USD (por defecto 5).

create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  searches integer not null default 0,
  cost_usd numeric(10, 6) not null default 0
);
create index ai_usage_user_month on public.ai_usage (user_id, created_at);

create table public.ai_limits (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  monthly_usd numeric(8, 2) not null check (monthly_usd >= 0),
  updated_at timestamptz not null default now()
);

alter table public.ai_usage enable row level security;
alter table public.ai_limits enable row level security;

create policy "propio: leer" on public.ai_usage for select to authenticated using (user_id = (select auth.uid()));
create policy "propio: crear" on public.ai_usage for insert to authenticated with check (user_id = (select auth.uid()));
create policy "propio: leer" on public.ai_limits for select to authenticated using (user_id = (select auth.uid()));
