-- Pestaña MÓDULOS con catálogo cerrado: por ahora solo Negocios (uno por persona) y Vehículo (uno por carro o
-- moto). Cada tipo tiene su propia vista. Vehículo: ficha, mantenimientos (con el próximo por km o fecha) y
-- papeles con vencimiento y archivo. La bitácora genérica (module_entries) deja de usarse.
-- Mismo patrón que el resto: user_id por defecto y RLS "solo lo propio".

-- Solo quedan los tipos del catálogo. Lo que hubiera de otro tipo pasa a Vehículo si era vehículo; si no, se borra
-- (hoy solo existen módulos Negocios).
delete from public.modules where kind not in ('negocios', 'vehiculo');
alter table public.modules drop constraint modules_kind_check;
alter table public.modules add constraint modules_kind_check check (kind in ('negocios', 'vehiculo'));
create unique index modules_one_negocios on public.modules (user_id) where kind = 'negocios';

-- Ficha del vehículo: una por módulo.
create table public.vehicles (
  module_id uuid primary key references public.modules (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  brand text not null default '',
  model text not null default '',
  year integer check (year is null or year between 1900 and 2100),
  plate text not null default '',
  color text not null default '',
  odometer_km integer check (odometer_km is null or odometer_km >= 0),
  odometer_on date,
  notes text not null default '',
  updated_at timestamptz not null default now()
);

create table public.vehicle_services (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  module_id uuid not null references public.modules (id) on delete cascade,
  service_date date not null,
  km integer check (km is null or km >= 0),
  kind text not null default 'otro' check (kind in ('aceite', 'frenos', 'cauchos', 'bateria', 'revision', 'reparacion', 'otro')),
  title text not null default '',
  cost numeric check (cost is null or cost >= 0),
  shop text not null default '',
  notes text not null default '',
  next_km integer check (next_km is null or next_km >= 0), -- próximo servicio por kilometraje
  next_date date,                                          -- o por fecha
  created_at timestamptz not null default now()
);

create table public.vehicle_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  module_id uuid not null references public.modules (id) on delete cascade,
  kind text not null default 'otro' check (kind in ('seguro', 'revision', 'titulo', 'permiso', 'otro')),
  name text not null check (length(name) between 1 and 120),
  number text not null default '',
  expires_on date,
  storage_path text, -- documentos/<user_id>/vehiculos/<module_id>/...
  file_name text,
  mime text,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create index on public.vehicles (user_id);
create index on public.vehicle_services (module_id, service_date desc);
create index on public.vehicle_services (user_id);
create index on public.vehicle_documents (module_id, expires_on);
create index on public.vehicle_documents (user_id);

alter table public.vehicles enable row level security;
alter table public.vehicle_services enable row level security;
alter table public.vehicle_documents enable row level security;

do $$
declare t text;
begin
  foreach t in array array['vehicles', 'vehicle_services', 'vehicle_documents'] loop
    execute format('create policy "propio: leer" on public.%I for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format('create policy "propio: crear" on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t);
    execute format('create policy "propio: editar" on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('create policy "propio: borrar" on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- Todo lo de un vehículo cuelga de un módulo Vehículo del mismo usuario; los archivos, en su carpeta.
create or replace function public.check_vehicle_owner() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (select 1 from public.modules m where m.id = new.module_id and m.user_id = new.user_id and m.kind = 'vehiculo') then
    raise exception 'El módulo no es un vehículo de este usuario';
  end if;
  if tg_table_name = 'vehicle_documents' and new.storage_path is not null and split_part(new.storage_path, '/', 1) <> new.user_id::text then
    raise exception 'El archivo no está en la carpeta de este usuario';
  end if;
  return new;
end $$;

create trigger vehicles_owner before insert or update on public.vehicles for each row execute function public.check_vehicle_owner();
create trigger vehicle_services_owner before insert or update on public.vehicle_services for each row execute function public.check_vehicle_owner();
create trigger vehicle_documents_owner before insert or update on public.vehicle_documents for each row execute function public.check_vehicle_owner();
