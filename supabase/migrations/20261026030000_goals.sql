-- Módulo GOALS (catálogo de MÓDULOS, uno por persona): metas a corto, mediano y largo plazo, por categoría
-- (finanzas, universidad, escritura…), con fecha meta, progreso (pasos, monto o manual) y pasos.
-- Mismo patrón que el resto: user_id por defecto y RLS "solo lo propio". Todo cuelga del módulo.

alter table public.modules drop constraint modules_kind_check;
alter table public.modules add constraint modules_kind_check check (kind in ('negocios', 'vehiculo', 'nomore', 'tobuy', 'universidad', 'horarios', 'goals'));
create unique index modules_one_goals on public.modules (user_id) where kind = 'goals';

create table public.goal_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  module_id uuid not null references public.modules (id) on delete cascade,
  name text not null check (length(name) between 1 and 60),
  color text not null default '#3b82f6' check (color ~ '^#[0-9a-fA-F]{6}$'),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  module_id uuid not null references public.modules (id) on delete cascade,
  category_id uuid,
  title text not null check (length(title) between 1 and 160),
  description text not null default '' check (length(description) <= 2000),
  horizon text not null default 'corto' check (horizon in ('corto', 'mediano', 'largo')),
  target_date date,
  -- Meta con número (ahorrar 5.000 $, leer 12 libros): cuánto se quiere y cuánto se lleva.
  target_amount numeric check (target_amount is null or target_amount > 0),
  current_amount numeric not null default 0 check (current_amount >= 0),
  unit text not null default '' check (length(unit) <= 20),
  -- Progreso a mano (0–100) cuando no hay pasos ni número.
  progress smallint not null default 0 check (progress between 0 and 100),
  done_at timestamptz, -- logrado
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (category_id, user_id) references public.goal_categories (id, user_id) on delete set null (category_id)
);

create table public.goal_steps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  goal_id uuid not null,
  title text not null check (length(title) between 1 and 200),
  done boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  foreign key (goal_id, user_id) references public.goals (id, user_id) on delete cascade
);

create index on public.goal_categories (module_id, position);
create index on public.goal_categories (user_id);
create index on public.goals (module_id, horizon, position);
create index on public.goals (user_id);
create index on public.goals (category_id);
create index on public.goal_steps (goal_id, position);
create index on public.goal_steps (user_id);

alter table public.goal_categories enable row level security;
alter table public.goals enable row level security;
alter table public.goal_steps enable row level security;

do $$
declare t text;
begin
  foreach t in array array['goal_categories', 'goals', 'goal_steps'] loop
    execute format('create policy "propio: leer" on public.%I for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format('create policy "propio: crear" on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t);
    execute format('create policy "propio: editar" on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('create policy "propio: borrar" on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- check_module_kind_owner viene de la migración de Universidad y Horarios.
create trigger goal_categories_owner before insert or update on public.goal_categories for each row execute function public.check_module_kind_owner('goals');
create trigger goals_owner before insert or update on public.goals for each row execute function public.check_module_kind_owner('goals');
