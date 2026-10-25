-- Cuenta de Google conectada (Drive, Gmail para enviar, Calendar). Se reutiliza google_accounts, que tenía RLS
-- activado pero sin reglas (nadie podía leerla ni escribirla). Cada persona ve y cambia solo su fila; la
-- Edge Function google-auth la escribe con la sesión de la persona, y DESJ la lee para actuar en su nombre.
alter table public.google_accounts
  alter column user_id set default auth.uid(),
  add column if not exists scopes text not null default '';

create policy "propio: leer" on public.google_accounts for select to authenticated using (user_id = (select auth.uid()));
create policy "propio: crear" on public.google_accounts for insert to authenticated with check (user_id = (select auth.uid()));
create policy "propio: editar" on public.google_accounts for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "propio: borrar" on public.google_accounts for delete to authenticated using (user_id = (select auth.uid()));

-- oauth_states quedó de la integración anterior y no se usa: el "state" de OAuth lo guarda el navegador.
drop table if exists public.oauth_states;
