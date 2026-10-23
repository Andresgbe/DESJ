-- YO · Finanzas: ingresos y gastos convertidos a dólar BCV, deudas y presupuesto mensual.
-- Regla: amount_usd = amount / rate_per_usd, y se GUARDA con el movimiento (nunca se recalcula al leer).
-- Las tasas nacen en null ("sin cargar"): nunca se inventan. Mismo patrón que el resto: user_id por
-- defecto y RLS "solo lo propio".

create table public.finance_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(name) between 1 and 60),
  kind text not null default 'expense' check (kind in ('income', 'expense', 'both')),
  color text not null default '#8b5cf6' check (color ~ '^#[0-9a-fA-F]{6}$'),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

-- Una tasa por forma de pago: cuántas unidades equivalen a 1 dólar BCV.
create table public.finance_rates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  code text not null,
  label text not null default '',
  currency text not null default 'VES',
  per_usd numeric check (per_usd is null or per_usd > 0),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, code)
);

create table public.finance_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('income', 'expense')),
  occurred_on date not null default current_date,
  description text not null default '',
  place text not null default '',
  category_id uuid references public.finance_categories (id) on delete set null,
  amount numeric not null check (amount > 0),
  currency text not null default 'USD',
  rate_per_usd numeric not null default 1 check (rate_per_usd > 0),
  rate_label text not null default '',
  amount_usd numeric not null,
  note text not null default '',
  created_at timestamptz not null default now()
);

create table public.finance_bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  description text not null default '',
  amount numeric not null default 0,
  interest_rate numeric,
  due_date date,
  paid boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.finance_monthly_budget (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  month text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  category text not null default '',
  description text not null default '',
  amount numeric not null default 0,
  recurring boolean not null default false,
  created_at timestamptz not null default now()
);

create index finance_transactions_month_idx on public.finance_transactions (user_id, occurred_on desc);
create index on public.finance_transactions (category_id);
create index on public.finance_bills (user_id, created_at);
create index on public.finance_monthly_budget (user_id, month);

alter table public.finance_categories enable row level security;
alter table public.finance_rates enable row level security;
alter table public.finance_transactions enable row level security;
alter table public.finance_bills enable row level security;
alter table public.finance_monthly_budget enable row level security;

do $$
declare t text;
begin
  foreach t in array array['finance_categories', 'finance_rates', 'finance_transactions', 'finance_bills', 'finance_monthly_budget'] loop
    execute format('create policy "propio: leer" on public.%I for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format('create policy "propio: crear" on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t);
    execute format('create policy "propio: editar" on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('create policy "propio: borrar" on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- Un movimiento solo puede usar una categoría del mismo usuario.
create or replace function public.check_finance_category_owner() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.category_id is not null
    and not exists (select 1 from public.finance_categories c where c.id = new.category_id and c.user_id = new.user_id) then
    raise exception 'La categoría no es de este usuario';
  end if;
  return new;
end $$;

create trigger finance_transactions_category_owner before insert or update on public.finance_transactions
  for each row execute function public.check_finance_category_owner();

-- Datos iniciales para las cuentas que ya existen (las nuevas se siembran desde la app al abrir Finanzas).
insert into public.finance_categories (user_id, name, kind, color, sort_order)
select u.id, c.name, c.kind, c.color, c.sort_order
from auth.users u
cross join (values
  ('Supermercado', 'expense', '#10b981', 0),
  ('Comida fuera', 'expense', '#f59e0b', 1),
  ('Transporte', 'expense', '#06b6d4', 2),
  ('Gasolina', 'expense', '#ef4444', 3),
  ('Moto', 'expense', '#f97316', 4),
  ('Universidad', 'expense', '#8b5cf6', 5),
  ('Salud', 'expense', '#ec4899', 6),
  ('Servicios', 'expense', '#3b82f6', 7),
  ('Suscripciones', 'expense', '#a855f7', 8),
  ('Casa', 'expense', '#14b8a6', 9),
  ('Ocio', 'expense', '#eab308', 10),
  ('Otros gastos', 'expense', '#64748b', 11),
  ('Agencia', 'income', '#22c55e', 12),
  ('Freelance', 'income', '#84cc16', 13),
  ('Otros ingresos', 'income', '#64748b', 14)
) as c (name, kind, color, sort_order)
on conflict (user_id, name) do nothing;

insert into public.finance_rates (user_id, code, label, currency, per_usd)
select u.id, r.code, r.label, r.currency, null
from auth.users u
cross join (values
  ('BCV', 'Bolívares (Bs)', 'VES'),
  ('EUR', 'Euro', 'EUR'),
  ('CASH', 'Dólar efectivo', 'USD'),
  ('USDT', 'USDT', 'USD')
) as r (code, label, currency)
on conflict (user_id, code) do nothing;
