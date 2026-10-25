-- Módulo TO BUY (catálogo de MÓDULOS, uno por persona): lista de compras con categorías. Cada cosa tiene título,
-- categoría opcional y check; las compradas quedan en "Completado".
-- Mismo patrón que el resto: user_id por defecto y RLS "solo lo propio". Todo cuelga del módulo.

alter table public.modules drop constraint modules_kind_check;
alter table public.modules add constraint modules_kind_check check (kind in ('negocios', 'vehiculo', 'nomore', 'tobuy'));
create unique index modules_one_tobuy on public.modules (user_id) where kind = 'tobuy';

create table public.tobuy_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  module_id uuid not null references public.modules (id) on delete cascade,
  name text not null check (length(name) between 1 and 60),
  color text not null default '#64748b' check (color ~ '^#[0-9a-fA-F]{6}$'),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.tobuy_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  module_id uuid not null references public.modules (id) on delete cascade,
  category_id uuid,
  title text not null check (length(title) between 1 and 200),
  done boolean not null default false,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  -- La categoría es del mismo usuario; si se borra, la cosa queda "Sin categoría".
  foreign key (category_id, user_id) references public.tobuy_categories (id, user_id) on delete set null (category_id)
);

create index on public.tobuy_categories (module_id, position);
create index on public.tobuy_categories (user_id);
create index on public.tobuy_items (module_id, done, created_at desc);
create index on public.tobuy_items (user_id);
create index on public.tobuy_items (category_id);

alter table public.tobuy_categories enable row level security;
alter table public.tobuy_items enable row level security;

do $$
declare t text;
begin
  foreach t in array array['tobuy_categories', 'tobuy_items'] loop
    execute format('create policy "propio: leer" on public.%I for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format('create policy "propio: crear" on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t);
    execute format('create policy "propio: editar" on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('create policy "propio: borrar" on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
end $$;

create or replace function public.check_tobuy_owner() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (select 1 from public.modules m where m.id = new.module_id and m.user_id = new.user_id and m.kind = 'tobuy') then
    raise exception 'El módulo no es TO BUY de este usuario';
  end if;
  return new;
end $$;

create trigger tobuy_categories_owner before insert or update on public.tobuy_categories for each row execute function public.check_tobuy_owner();
create trigger tobuy_items_owner before insert or update on public.tobuy_items for each row execute function public.check_tobuy_owner();
