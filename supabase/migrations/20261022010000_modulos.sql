-- Pestaña MÓDULOS: cada persona arma su lista de módulos (Negocios, Vehículo, Hogar…), los ordena y los
-- quita. Negocios abre su vista propia; los demás son una bitácora de registros (título, fecha, detalle).
-- Mismo patrón que el resto: user_id por defecto y RLS "solo lo propio".

create table public.modules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null default 'otro' check (kind in ('negocios', 'vehiculo', 'hogar', 'mascotas', 'viajes', 'documentos', 'otro')),
  name text not null check (length(name) between 1 and 80),
  description text not null default '',
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.module_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  module_id uuid not null references public.modules (id) on delete cascade,
  title text not null check (length(title) between 1 and 200),
  entry_date date, -- cuándo pasó (opcional); ordena la bitácora
  details text not null default '',
  created_at timestamptz not null default now()
);

create index on public.modules (user_id, position);
create index on public.module_entries (module_id, entry_date desc);
create index on public.module_entries (user_id);

alter table public.modules enable row level security;
alter table public.module_entries enable row level security;

do $$
declare t text;
begin
  foreach t in array array['modules', 'module_entries'] loop
    execute format('create policy "propio: leer" on public.%I for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format('create policy "propio: crear" on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t);
    execute format('create policy "propio: editar" on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('create policy "propio: borrar" on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- Un registro solo puede colgar de un módulo del mismo usuario.
create or replace function public.check_module_entry_owner() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (select 1 from public.modules m where m.id = new.module_id and m.user_id = new.user_id) then
    raise exception 'El módulo no es de este usuario';
  end if;
  return new;
end $$;

create trigger module_entries_owner before insert or update on public.module_entries
  for each row execute function public.check_module_entry_owner();

-- Negocios era una pestaña: pasa a ser el primer módulo de cada persona que ya existe.
insert into public.modules (user_id, kind, name, position)
select id, 'negocios', 'Negocios', 0 from auth.users;
