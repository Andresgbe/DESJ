-- Salud · Historial médico: los "exámenes" pasan a ser registros del historial (consultas, laboratorios,
-- estudios de imagen, procedimientos). Cada archivo dice qué es: informe, orden, resultado, receta…
-- La tabla conserva su nombre (health_exams) para no romper lo ya cargado.

alter table public.health_exams drop constraint health_exams_kind_check;
alter table public.health_exams
  add constraint health_exams_kind_check check (kind in ('consulta', 'laboratorio', 'imagen', 'procedimiento', 'otro')),
  alter column kind set default 'consulta';

alter table public.health_exam_files
  add column doc_type text not null default 'otro'
    check (doc_type in ('informe', 'orden', 'resultado', 'receta', 'imagen', 'otro'));
