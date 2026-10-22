-- Medicamentos con varias dosis al día y horas opcionales.
-- meds: `doses_per_day` (1–12) y `times` (horas "HH:MM" opcionales, a lo más una por dosis) reemplazan a
-- hour/minute, que eran obligatorias y de una sola toma. med_intakes: una fila por dosis tomada (`dose`, 1…N).

alter table public.meds
  add column doses_per_day smallint not null default 1 check (doses_per_day between 1 and 12),
  add column times text[] not null default '{}';

-- Lo que ya existía: una dosis diaria a su hora de siempre.
update public.meds set times = array[lpad(hour::text, 2, '0') || ':' || lpad(minute::text, 2, '0')];

alter table public.meds
  drop column hour,
  drop column minute,
  add constraint meds_times_valid check (
    cardinality(times) <= doses_per_day
    and array_to_string(times, ',') ~ '^(([01][0-9]|2[0-3]):[0-5][0-9](,|$))*$'
  );

alter table public.med_intakes
  add column dose smallint not null default 1 check (dose between 1 and 12),
  drop constraint med_intakes_med_id_day_key,
  add constraint med_intakes_med_id_day_dose_key unique (med_id, day, dose);
