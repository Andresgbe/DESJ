-- Módulos UNIVERSIDAD y HORARIOS (catálogo de MÓDULOS, uno de cada uno por persona).
-- Universidad: materias con su plan de evaluación y notas, lo visto en cada clase (15 semanas) y links rápidos.
-- Horarios: el horario semanal de la persona ("Yo") y de sus amigos, para ver quién le puede dar la cola.
-- Mismo patrón que el resto: user_id por defecto y RLS "solo lo propio". Todo cuelga del módulo.

alter table public.modules drop constraint modules_kind_check;
alter table public.modules add constraint modules_kind_check check (kind in ('negocios', 'vehiculo', 'nomore', 'tobuy', 'universidad', 'horarios'));
create unique index modules_one_universidad on public.modules (user_id) where kind = 'universidad';
create unique index modules_one_horarios on public.modules (user_id) where kind = 'horarios';

-- ---------------------------------------------------------------- Universidad

create table public.uni_subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  module_id uuid not null references public.modules (id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  professor text not null default '' check (length(professor) <= 120),
  color text not null default '#3b82f6' check (color ~ '^#[0-9a-fA-F]{6}$'),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

-- Plan de evaluación: cada evaluación con su porcentaje y, cuando la hay, la nota (sobre max_score, 20 por defecto).
create table public.uni_evaluations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id uuid not null,
  name text not null check (length(name) between 1 and 120),
  weight numeric not null check (weight >= 0 and weight <= 100),
  max_score numeric not null default 20 check (max_score > 0),
  score numeric check (score is null or score >= 0),
  due_on date,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  foreign key (subject_id, user_id) references public.uni_subjects (id, user_id) on delete cascade
);

-- Lo visto en clase: semana 1–15, día (1 = lunes … 7 = domingo) y el título del tema.
create table public.uni_classes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id uuid not null,
  week smallint not null check (week between 1 and 15),
  weekday smallint not null check (weekday between 1 and 7),
  topic text not null check (length(topic) between 1 and 300),
  created_at timestamptz not null default now(),
  foreign key (subject_id, user_id) references public.uni_subjects (id, user_id) on delete cascade
);

-- Links rápidos (aula virtual, Drive, grupo…), del módulo o de una materia.
create table public.uni_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  module_id uuid not null references public.modules (id) on delete cascade,
  subject_id uuid,
  title text not null check (length(title) between 1 and 80),
  url text not null check (url ~ '^https?://' and length(url) <= 2000),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  foreign key (subject_id, user_id) references public.uni_subjects (id, user_id) on delete set null (subject_id)
);

-- ---------------------------------------------------------------- Horarios

create table public.sched_people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  module_id uuid not null references public.modules (id) on delete cascade,
  name text not null check (length(name) between 1 and 60),
  color text not null default '#3b82f6' check (color ~ '^#[0-9a-fA-F]{6}$'),
  phone text not null default '' check (length(phone) <= 30),
  is_me boolean not null default false, -- el horario propio
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
create unique index sched_people_one_me on public.sched_people (module_id) where is_me;

create table public.sched_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  person_id uuid not null,
  weekday smallint not null check (weekday between 1 and 7),
  starts time not null,
  ends time not null check (ends > starts),
  label text not null default '' check (length(label) <= 120),
  created_at timestamptz not null default now(),
  foreign key (person_id, user_id) references public.sched_people (id, user_id) on delete cascade
);

-- ---------------------------------------------------------------- índices, RLS y dueño

create index on public.uni_subjects (module_id, position);
create index on public.uni_subjects (user_id);
create index on public.uni_evaluations (subject_id, position);
create index on public.uni_evaluations (user_id);
create index on public.uni_classes (subject_id, week);
create index on public.uni_classes (user_id);
create index on public.uni_links (module_id, position);
create index on public.uni_links (user_id);
create index on public.uni_links (subject_id);
create index on public.sched_people (module_id, position);
create index on public.sched_people (user_id);
create index on public.sched_blocks (person_id, weekday);
create index on public.sched_blocks (user_id);

alter table public.uni_subjects enable row level security;
alter table public.uni_evaluations enable row level security;
alter table public.uni_classes enable row level security;
alter table public.uni_links enable row level security;
alter table public.sched_people enable row level security;
alter table public.sched_blocks enable row level security;

do $$
declare t text;
begin
  foreach t in array array['uni_subjects', 'uni_evaluations', 'uni_classes', 'uni_links', 'sched_people', 'sched_blocks'] loop
    execute format('create policy "propio: leer" on public.%I for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format('create policy "propio: crear" on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t);
    execute format('create policy "propio: editar" on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('create policy "propio: borrar" on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- Lo que cuelga directo de un módulo tiene que ser de un módulo del tipo correcto y del mismo usuario.
create or replace function public.check_module_kind_owner() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (select 1 from public.modules m where m.id = new.module_id and m.user_id = new.user_id and m.kind = tg_argv[0]) then
    raise exception 'El módulo no es % de este usuario', tg_argv[0];
  end if;
  return new;
end $$;

create trigger uni_subjects_owner before insert or update on public.uni_subjects for each row execute function public.check_module_kind_owner('universidad');
create trigger uni_links_owner before insert or update on public.uni_links for each row execute function public.check_module_kind_owner('universidad');
create trigger sched_people_owner before insert or update on public.sched_people for each row execute function public.check_module_kind_owner('horarios');
