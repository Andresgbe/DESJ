-- DESJ pasa de Claude (worker con suscripción) a Gemini (Edge Function `chat`, 24/7).
-- Todas las personas usan el motor 'api'; la app ya no deja mensajes en cola para el worker.

alter table public.profiles alter column brain set default 'api';
update public.profiles set brain = 'api' where brain <> 'api';

-- Mensajes viejos que quedaron en cola o fallaron porque el worker estaba apagado: ya no hay quien los responda.
-- Se marcan como terminados para que la app no muestre "En cola" ni "Reintentar conexión".
update public.messages set status = 'done', error = null where role = 'user' and status in ('pending', 'running', 'error');
