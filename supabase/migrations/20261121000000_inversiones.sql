-- Módulo Inversiones: lo que la persona invierte cada mes (en qué, dónde y cuánto, en dólares).
-- Es solo un registro: DESJ no da consejos de compra ni venta.
-- Los aportes son de la persona (user_id), no del módulo: quitar el módulo no los borra.

create table public.investments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  month date not null,                       -- primer día del mes del aporte
  asset text not null check (length(asset) between 1 and 80),   -- en qué: "S&P 500", "Bitcoin"
  platform text not null default '' check (length(platform) <= 80), -- dónde: "Binance", "IBKR"
  amount_usd numeric(14, 2) not null check (amount_usd > 0),
  note text not null default '' check (length(note) <= 300),
  created_at timestamptz not null default now()
);
create index investments_user_month on public.investments (user_id, month desc);

alter table public.investments enable row level security;
create policy "propio: leer" on public.investments for select to authenticated using (user_id = (select auth.uid()));
create policy "propio: crear" on public.investments for insert to authenticated with check (user_id = (select auth.uid()));
create policy "propio: editar" on public.investments for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "propio: borrar" on public.investments for delete to authenticated using (user_id = (select auth.uid()));

alter table public.modules drop constraint modules_kind_check;
alter table public.modules add constraint modules_kind_check
  check (kind in ('negocios', 'vehiculo', 'nomore', 'tobuy', 'universidad', 'horarios', 'goals', 'finanzas', 'inversiones'));
