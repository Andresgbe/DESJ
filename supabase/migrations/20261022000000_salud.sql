-- Módulo YO · Salud: exámenes médicos con sus archivos (fotos, PDF) y contactos de salud
-- (clínicas, doctores, laboratorios). Mismo patrón que el resto: user_id por defecto y RLS "solo lo propio".
-- Los archivos van en Storage: documentos/<user_id>/salud/<exam_id>/... (las políticas del bucket ya
-- limitan cada usuario a su carpeta).

create table public.health_exams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (length(title) between 1 and 200),
  exam_date date not null, -- cuándo se hizo el examen (no cuándo se cargó): ordena la línea de tiempo
  kind text not null default 'laboratorio' check (kind in ('laboratorio', 'imagen', 'consulta', 'otro')),
  place text not null default '',
  doctor text not null default '',
  results text not null default '', -- valores principales; DESJ los anota al leer el archivo
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table public.health_exam_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  exam_id uuid not null references public.health_exams (id) on delete cascade,
  name text not null,
  mime text not null,
  size bigint,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create table public.health_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null default 'doctor' check (kind in ('doctor', 'clinica', 'laboratorio', 'otro')),
  name text not null check (length(name) between 1 and 200),
  specialty text not null default '',
  phone text not null default '',
  email text not null default '',
  address text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);

create index on public.health_exams (user_id, exam_date desc);
create index on public.health_exam_files (exam_id);
create index on public.health_exam_files (user_id);
create index on public.health_contacts (user_id, name);

alter table public.health_exams enable row level security;
alter table public.health_exam_files enable row level security;
alter table public.health_contacts enable row level security;

do $$
declare t text;
begin
  foreach t in array array['health_exams', 'health_exam_files', 'health_contacts'] loop
    execute format('create policy "propio: leer" on public.%I for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format('create policy "propio: crear" on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t);
    execute format('create policy "propio: editar" on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('create policy "propio: borrar" on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- Un archivo solo puede colgar de un examen del mismo usuario, y vivir en su carpeta.
create or replace function public.check_exam_file_owner() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (select 1 from public.health_exams e where e.id = new.exam_id and e.user_id = new.user_id) then
    raise exception 'El examen no es de este usuario';
  end if;
  if split_part(new.storage_path, '/', 1) <> new.user_id::text then
    raise exception 'El archivo no está en la carpeta de este usuario';
  end if;
  return new;
end $$;

create trigger health_exam_files_owner before insert or update on public.health_exam_files
  for each row execute function public.check_exam_file_owner();
