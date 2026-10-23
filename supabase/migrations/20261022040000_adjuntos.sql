-- Chat con varios archivos por mensaje: `attachments` es la lista [{ path, name, mime }] (hasta 5).
-- Las columnas attachment_path/name/mime se siguen llenando con el primero, por compatibilidad.
alter table public.messages
  add column attachments jsonb check (attachments is null or (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 5));
