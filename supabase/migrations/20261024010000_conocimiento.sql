-- Conocimiento con archivos libres: además de perfil, salud, negocios y preferencias, la persona crea, renombra y
-- borra los suyos (familia.md, proyectos.md…). `slug` es el nombre del archivo; `title`, el nombre visible.
alter table public.knowledge drop constraint knowledge_slug_check;
alter table public.knowledge
  add constraint knowledge_slug_check check (slug ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  add column title text not null default '' check (length(title) <= 60);

update public.knowledge set title = case slug
  when 'perfil' then 'Perfil'
  when 'salud' then 'Salud'
  when 'negocios' then 'Negocios'
  when 'preferencias' then 'Preferencias'
  else title end;
