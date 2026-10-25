-- Módulo NO MORE (catálogo de MÓDULOS, uno por persona): contador de días sin un hábito que se está dejando
-- (fumar, alcohol, lujuria…), con el historial de cuándo se perdió la racha. Es delicado: la pantalla pide un
-- PIN cada vez que se entra (se guarda solo su hash con sal) y DESJ no lee estos datos en el chat.
-- Mismo patrón que el resto: user_id por defecto y RLS "solo lo propio". Todo cuelga del módulo, así que al
-- quitar el módulo se borra todo.

alter table public.modules drop constraint modules_kind_check;
alter table public.modules add constraint modules_kind_check check (kind in ('negocios', 'vehiculo', 'nomore'));
create unique index modules_one_nomore on public.modules (user_id) where kind = 'nomore';

-- PIN del módulo: SHA-256 de "sal:pin". Es un candado de pantalla; los datos ya están protegidos por RLS.
create table public.nomore_settings (
  module_id uuid primary key references public.modules (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  pin_hash text not null check (length(pin_hash) = 64),
  pin_salt text not null check (length(pin_salt) between 16 and 64),
  updated_at timestamptz not null default now()
);

-- Lo que se está dejando. La racha actual corre desde started_at.
create table public.nomore_habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  module_id uuid not null references public.modules (id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  reason text not null default '' check (length(reason) <= 500), -- por qué lo dejo
  started_at timestamptz not null default now(),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

-- Cada vez que se perdió la racha: cuándo y cuánto había durado (para la mejor racha).
create table public.nomore_resets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  habit_id uuid not null,
  at timestamptz not null default now(),
  streak_seconds bigint not null default 0 check (streak_seconds >= 0),
  note text not null default '' check (length(note) <= 500),
  foreign key (habit_id, user_id) references public.nomore_habits (id, user_id) on delete cascade
);

create index on public.nomore_settings (user_id);
create index on public.nomore_habits (module_id, position);
create index on public.nomore_habits (user_id);
create index on public.nomore_resets (habit_id, at desc);
create index on public.nomore_resets (user_id);

alter table public.nomore_settings enable row level security;
alter table public.nomore_habits enable row level security;
alter table public.nomore_resets enable row level security;

do $$
declare t text;
begin
  foreach t in array array['nomore_settings', 'nomore_habits', 'nomore_resets'] loop
    execute format('create policy "propio: leer" on public.%I for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format('create policy "propio: crear" on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t);
    execute format('create policy "propio: editar" on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('create policy "propio: borrar" on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- El PIN y los hábitos cuelgan de un módulo NO MORE del mismo usuario.
create or replace function public.check_nomore_owner() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (select 1 from public.modules m where m.id = new.module_id and m.user_id = new.user_id and m.kind = 'nomore') then
    raise exception 'El módulo no es NO MORE de este usuario';
  end if;
  return new;
end $$;

create trigger nomore_settings_owner before insert or update on public.nomore_settings for each row execute function public.check_nomore_owner();
create trigger nomore_habits_owner before insert or update on public.nomore_habits for each row execute function public.check_nomore_owner();
