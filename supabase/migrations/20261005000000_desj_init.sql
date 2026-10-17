-- DESJ · esquema inicial.
-- Todo es privado por usuario: cada tabla tiene user_id y RLS que solo deja ver/editar lo propio.
-- La Edge Function `chat` usa el JWT del usuario, así que también pasa por estas reglas.

create extension if not exists vector with schema extensions;

-- Perfil: el "contexto fijo" de cada persona (quién es, cómo quiere que DESJ le hable).
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  about text not null default '',
  timezone text not null default 'America/Caracas',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Memoria: hechos que DESJ va aprendiendo en las conversaciones (o que el usuario carga a mano).
-- `embedding` queda listo para búsqueda semántica (fase 2); por ahora puede ir vacío.
create table public.memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category text not null default 'otro'
    check (category in ('personal', 'salud', 'negocios', 'preferencia', 'otro')),
  content text not null check (length(content) between 1 and 2000),
  source text not null default 'chat' check (source in ('chat', 'manual', 'archivo')),
  embedding extensions.vector(1024),
  created_at timestamptz not null default now()
);

-- Historial del chat.
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

-- Medicamentos y tomas.
create table public.meds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  dose text not null default '',
  hour smallint not null check (hour between 0 and 23),
  minute smallint not null default 0 check (minute between 0 and 59),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.med_intakes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  med_id uuid not null references public.meds (id) on delete cascade,
  day date not null,
  taken_at timestamptz not null default now(),
  unique (med_id, day)
);

-- Recordatorios. El teléfono los programa como notificaciones locales.
create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  body text not null default '',
  due_at timestamptz not null,
  repeat text not null default 'none' check (repeat in ('none', 'daily')),
  done boolean not null default false,
  created_at timestamptz not null default now()
);

-- Archivos de contexto (exámenes, documentos legales, etc.). El binario va en Storage.
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  kind text not null default 'otro' check (kind in ('examen', 'legal', 'negocio', 'otro')),
  storage_path text not null,
  summary text,
  created_at timestamptz not null default now()
);

create index on public.memories (user_id, created_at desc);
create index on public.messages (user_id, created_at desc);
create index on public.meds (user_id);
create index on public.med_intakes (user_id, day);
create index on public.med_intakes (med_id);
create index on public.reminders (user_id, due_at);
create index on public.documents (user_id, created_at desc);

-- RLS: cada quien solo lo suyo.
alter table public.profiles enable row level security;
alter table public.memories enable row level security;
alter table public.messages enable row level security;
alter table public.meds enable row level security;
alter table public.med_intakes enable row level security;
alter table public.reminders enable row level security;
alter table public.documents enable row level security;

create policy "perfil propio: leer" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "perfil propio: editar" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

do $$
declare t text;
begin
  foreach t in array array['memories', 'messages', 'meds', 'med_intakes', 'reminders', 'documents'] loop
    execute format('create policy "propio: leer" on public.%I for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format('create policy "propio: crear" on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t);
    execute format('create policy "propio: editar" on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('create policy "propio: borrar" on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- Una toma solo puede apuntar a un medicamento del mismo usuario.
create or replace function public.check_intake_owner() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (select 1 from public.meds m where m.id = new.med_id and m.user_id = new.user_id) then
    raise exception 'medicamento no encontrado';
  end if;
  return new;
end $$;

create trigger med_intakes_owner before insert or update on public.med_intakes
  for each row execute function public.check_intake_owner();

-- Al registrarse un usuario se crea su perfil vacío.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  return new;
end $$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Storage privado: cada usuario solo en su carpeta  documentos/<user_id>/...
insert into storage.buckets (id, name, public) values ('documentos', 'documentos', false)
on conflict (id) do nothing;

create policy "documentos propios: leer" on storage.objects for select to authenticated
  using (bucket_id = 'documentos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "documentos propios: subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "documentos propios: borrar" on storage.objects for delete to authenticated
  using (bucket_id = 'documentos' and (storage.foldername(name))[1] = (select auth.uid())::text);
