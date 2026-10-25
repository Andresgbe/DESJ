// Cuenta de Google de la persona (Drive, Gmail solo enviar, Calendar), del lado del servidor: lo usan las
// herramientas de DESJ en la Edge Function `chat` y en el worker local. Sin dependencias de Deno ni de Node.
// El acceso vive en google_accounts (una fila por persona, RLS); aquí se refresca cuando vence.
// Credenciales de la app de Google: GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET (secretos de Supabase / .env del worker).
import type { SupabaseClient } from '@supabase/supabase-js';

export const GOOGLE_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar.events',
];

type Env = { get?: (k: string) => string | undefined; [k: string]: unknown };
/** Variable de entorno en Deno (Edge Function) o en Node (worker). */
export function env(name: string): string | undefined {
  const g = globalThis as unknown as { Deno?: { env: Env }; process?: { env: Record<string, string | undefined> } };
  return g.Deno?.env.get?.(name) ?? g.process?.env[name];
}

export const NOT_CONNECTED = 'La persona no tiene su cuenta de Google conectada: dile que la conecte en Ajustes → Cuenta de Google.';

/** Token de acceso vigente de la persona; lo refresca si vence en menos de un minuto. */
export async function googleToken(db: SupabaseClient, userId: string): Promise<string> {
  const { data: acc } = await db.from('google_accounts').select('refresh_token, access_token, expires_at').eq('user_id', userId).maybeSingle();
  if (!acc?.refresh_token) throw new Error(NOT_CONNECTED);
  if (acc.access_token && acc.expires_at && new Date(acc.expires_at).getTime() > Date.now() + 60_000) return acc.access_token;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env('GOOGLE_CLIENT_ID') ?? '',
      client_secret: env('GOOGLE_CLIENT_SECRET') ?? '',
      refresh_token: acc.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  const json = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !json.access_token) {
    await db.from('google_accounts').update({ last_error: json.error ?? `HTTP ${res.status}` }).eq('user_id', userId);
    throw new Error(json.error === 'invalid_grant' ? 'Google desconectó a DESJ: dile que vuelva a conectar su cuenta en Ajustes.' : 'No pude hablar con Google ahora mismo.');
  }
  const expires = new Date(Date.now() + (json.expires_in ?? 3600) * 1000).toISOString();
  await db.from('google_accounts').update({ access_token: json.access_token, expires_at: expires, last_error: null }).eq('user_id', userId);
  return json.access_token;
}

async function call<T>(token: string, url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });
  const text = await res.text();
  if (!res.ok) {
    let msg = text.slice(0, 200);
    try {
      msg = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? msg;
    } catch {
      // no era JSON
    }
    throw new Error(`Google respondió ${res.status}: ${msg}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

// ---------------------------------------------------------------- utilidades

const utf8 = (s: string) => new TextEncoder().encode(s);
export function base64(bytes: Uint8Array) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
const base64url = (bytes: Uint8Array) => base64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Markdown sencillo → HTML (títulos, listas, negritas, cursivas, párrafos) para que Drive lo convierta en Doc. */
export function markdownToHtml(md: string) {
  const inline = (t: string) => escapeHtml(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>');
  const out: string[] = [];
  let list: 'ul' | 'ol' | null = null;
  const close = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (h) {
      close();
      out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
    } else if (ul || ol) {
      const kind = ul ? 'ul' : 'ol';
      if (list !== kind) {
        close();
        out.push(`<${kind}>`);
        list = kind;
      }
      out.push(`<li>${inline((ul ?? ol)![1])}</li>`);
    } else if (!line.trim()) {
      close();
    } else {
      close();
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  close();
  return `<html><head><meta charset="utf-8"></head><body>${out.join('')}</body></html>`;
}

// ---------------------------------------------------------------- Drive

const FOLDER_MIME = 'application/vnd.google-apps.folder';

/** Carpeta "DESJ" en el Drive de la persona (la crea la primera vez). Con drive.file solo ve lo que creó DESJ. */
async function desjFolder(token: string) {
  const q = encodeURIComponent(`name = 'DESJ' and mimeType = '${FOLDER_MIME}' and trashed = false`);
  const found = await call<{ files: { id: string }[] }>(token, `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=1`);
  if (found.files[0]) return found.files[0].id;
  const created = await call<{ id: string }>(token, 'https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'DESJ', mimeType: FOLDER_MIME }),
  });
  return created.id;
}

/**
 * Sube un archivo a la carpeta DESJ. Con `convertTo` Drive lo convierte (HTML → Google Doc, CSV → Google Sheet).
 * Devuelve el enlace para abrirlo.
 */
export async function driveUpload(token: string, file: { name: string; mime: string; bytes: Uint8Array; convertTo?: string }) {
  const parent = await desjFolder(token);
  const boundary = `desj${Date.now()}`;
  const meta = JSON.stringify({ name: file.name, parents: [parent], ...(file.convertTo ? { mimeType: file.convertTo } : {}) });
  const head = utf8(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${file.mime}\r\n\r\n`);
  const tail = utf8(`\r\n--${boundary}--`);
  const body = new Uint8Array(head.length + file.bytes.length + tail.length);
  body.set(head, 0);
  body.set(file.bytes, head.length);
  body.set(tail, head.length + file.bytes.length);
  return call<{ id: string; webViewLink: string; name: string }>(token, 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
}

export const docFromMarkdown = (token: string, title: string, markdown: string) =>
  driveUpload(token, { name: title, mime: 'text/html', bytes: utf8(markdownToHtml(markdown)), convertTo: 'application/vnd.google-apps.document' });

export const sheetFromCsv = (token: string, title: string, csv: string) =>
  driveUpload(token, { name: title, mime: 'text/csv', bytes: utf8(csv), convertTo: 'application/vnd.google-apps.spreadsheet' });

// ---------------------------------------------------------------- Gmail

const encodeHeader = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${base64(utf8(s))}?=`);

/** Envía un correo desde la cuenta de la persona. `to`/`cc`: direcciones separadas por coma. */
export async function gmailSend(
  token: string,
  mail: { to: string; cc: string; subject: string; body: string; attachments: { name: string; mime: string; bytes: Uint8Array }[] },
) {
  const boundary = `desj${Date.now()}`;
  const lines = [
    `To: ${mail.to}`,
    ...(mail.cc ? [`Cc: ${mail.cc}`] : []),
    `Subject: ${encodeHeader(mail.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    base64(utf8(mail.body)).replace(/.{76}/g, '$&\r\n'),
  ];
  for (const a of mail.attachments) {
    lines.push(
      `--${boundary}`,
      `Content-Type: ${a.mime}; name="${encodeHeader(a.name)}"`,
      `Content-Disposition: attachment; filename="${encodeHeader(a.name)}"`,
      'Content-Transfer-Encoding: base64',
      '',
      base64(a.bytes).replace(/.{76}/g, '$&\r\n'),
    );
  }
  lines.push(`--${boundary}--`);
  return call<{ id: string }>(token, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: base64url(utf8(lines.join('\r\n'))) }),
  });
}

// ---------------------------------------------------------------- Calendar

export type GEvent = { id?: string; colorId?: string; summary?: string; location?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string }; htmlLink?: string };

export async function calendarList(token: string, fromIso: string, toIso: string, max = 50) {
  const qs = new URLSearchParams({ timeMin: fromIso, timeMax: toIso, singleEvents: 'true', orderBy: 'startTime', maxResults: String(max) });
  const res = await call<{ items?: GEvent[] }>(token, `https://www.googleapis.com/calendar/v3/calendars/primary/events?${qs}`);
  return res.items ?? [];
}

export async function calendarDelete(token: string, id: string) {
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 410) throw new Error(`Google respondió ${res.status} al borrar el evento.`);
}

export async function calendarInsert(token: string, ev: { title: string; start: string; end: string; location: string; description: string; timeZone: string }) {
  return call<GEvent>(token, 'https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      summary: ev.title,
      location: ev.location || undefined,
      description: ev.description || undefined,
      start: { dateTime: ev.start, timeZone: ev.timeZone },
      end: { dateTime: ev.end, timeZone: ev.timeZone },
    }),
  });
}
