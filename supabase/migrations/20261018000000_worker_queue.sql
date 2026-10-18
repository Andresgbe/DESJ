-- Cola de mensajes para el "cerebro" local (desj-worker): la app deja el mensaje como 'pending',
-- el worker en el computador de Andrés lo responde con Claude Code (suscripción) y escribe la respuesta.
-- Los mensajes que responde la Edge Function (API key) nacen 'done', así que nada cambia para ese camino.

alter table public.messages
  add column status text not null default 'done' check (status in ('pending', 'running', 'done', 'error')),
  add column error text,
  add column context jsonb,          -- lo que manda el teléfono con el mensaje: agenda de hoy, modo
  add column actions jsonb,          -- lo que el teléfono debe ejecutar: recordatorios, eventos
  add column attachment_path text,   -- documentos/<user_id>/chat/...
  add column attachment_name text,
  add column attachment_mime text,
  add column started_at timestamptz;

create index messages_queue on public.messages (created_at) where status = 'pending';

-- Qué motor responde a cada persona: 'worker' (suscripción, computador de Andrés) o 'api' (API key, 24/7).
alter table public.profiles
  add column brain text not null default 'worker' check (brain in ('worker', 'api'));
