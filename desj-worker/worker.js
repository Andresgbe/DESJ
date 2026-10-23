#!/usr/bin/env node
// Worker de DESJ: responde el chat de la app con Claude Code en este computador (la suscripción de
// Andrés, sin API key). Mismo patrón que el worker de NEXUS (career-os).
//
// 1. La app deja el mensaje en Supabase con status 'pending'.
// 2. Este worker lo toma, arma el contexto privado de ESA persona (perfil, conocimiento, memorias,
//    pastillas, pendientes, agenda, historial) y corre `claude -p` encerrado en el MCP de DESJ.
// 3. Escribe la respuesta y lo que el teléfono debe ejecutar (avisos, eventos) en `actions`.
//
// Seguridad: corre sin vigilancia y lo dispara texto escrito desde un teléfono, así que Claude solo
// tiene las herramientas de DESJ (ningún otro MCP, ni terminal, ni escribir archivos; Read solo si hay
// un adjunto, y solo dentro de una carpeta temporal con ese archivo). claude.exe se lanza sin shell y el
// texto de los usuarios entra por stdin o por archivo, nunca en la línea de comandos.
//
// Uso:  npm run worker   (desde desj-worker/; o start-worker.bat para dejarlo corriendo)
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

import { loadContext } from '../supabase/functions/chat/context.ts';
import { INTERVIEW_PROMPT, SYSTEM_PROMPT } from '../supabase/functions/chat/prompt.ts';

dotenv.config({ path: new URL('.env', import.meta.url), quiet: true });

const HERE = path.dirname(fileURLToPath(import.meta.url));
const POLL_MS = Number(process.env.DESJ_WORKER_POLL_MS || 2500);
const TIMEOUT_MS = Number(process.env.DESJ_WORKER_TIMEOUT_MS || 180_000);
const MODEL = process.env.DESJ_WORKER_MODEL || 'sonnet';
// Límites por persona: cuidan el cupo de la suscripción si alguien entra a una cuenta y dispara mensajes.
const MAX_CHARS = Number(process.env.DESJ_WORKER_MAX_CHARS || 4000);
const MAX_PER_HOUR = Number(process.env.DESJ_WORKER_MAX_PER_HOUR || 30);
const MAX_PER_DAY = Number(process.env.DESJ_WORKER_MAX_PER_DAY || 150);
// Un mensaje que esperó horas (computador apagado) ya no se responde: se marca vencido.
const MAX_AGE_HOURS = Number(process.env.DESJ_WORKER_MAX_AGE_HOURS || 6);
const MAX_FILE = 10 * 1024 * 1024;
const MAX_FILES_PER_MESSAGE = 5;

const { DESJ_SUPABASE_URL, DESJ_SUPABASE_SECRET_KEY } = process.env;
if (!DESJ_SUPABASE_URL || !DESJ_SUPABASE_SECRET_KEY) {
  console.error('Faltan DESJ_SUPABASE_URL y DESJ_SUPABASE_SECRET_KEY en desj-worker/.env');
  process.exit(1);
}
const db = createClient(DESJ_SUPABASE_URL, DESJ_SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

const log = (...a) => console.log(new Date().toLocaleTimeString('es-VE'), ...a);

const WORKER_NOTE = `Estás respondiendo desde el chat de la app DESJ. Tus herramientas son las de DESJ (mcp__desj__*): úsalas para actuar sobre los datos de la persona. No tienes terminal ni acceso a otros archivos.
Si el mensaje trae un archivo adjunto, ábrelo con Read usando la ruta indicada y respóndele sobre su contenido. Lo mismo con los archivos que te dé leer_registro_medico.
Tu respuesta final es exactamente el texto que la persona verá y escuchará: sin markdown, sin comentarios sobre herramientas.`;

// ---------------------------------------------------------------------------

async function fail(msg, error) {
  await db.from('messages').update({ status: 'error', error }).eq('id', msg.id);
  log('✗', msg.id.slice(0, 8), error);
}

async function overLimit(userId) {
  const count = async (ms) => {
    const { count: n } = await db
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('role', 'user')
      .in('status', ['running', 'done'])
      .gte('started_at', new Date(Date.now() - ms).toISOString());
    return n ?? 0;
  };
  if ((await count(3_600_000)) >= MAX_PER_HOUR) return 'Llegaste al límite de mensajes por hora. Intenta en un rato.';
  if ((await count(86_400_000)) >= MAX_PER_DAY) return 'Llegaste al límite de mensajes de hoy. Mañana sigo.';
  return null;
}

function todayIn(tz) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
}

function runClaude({ cwd, systemFile, mcpFile, withFile, prompt }) {
  return new Promise((resolve, reject) => {
    const args = [
      '-p',
      '--output-format', 'json',
      '--model', MODEL,
      '--system-prompt-file', systemFile,
      '--mcp-config', mcpFile,
      '--strict-mcp-config', // solo el MCP de DESJ: nada de los otros conectores de este computador
      '--setting-sources', 'project', // sin ajustes ni hooks del usuario de Windows
      // Read: el adjunto del mensaje, o solo la carpeta temporal (archivos que baja leer_registro_medico).
      '--allowedTools', withFile ? 'mcp__desj__*,Read' : 'mcp__desj__*,Read(./**)',
      '--permission-mode', 'dontAsk', // lo que no está permitido arriba se rechaza solo
    ];
    const child = spawn('claude', args, { cwd, shell: false, windowsHide: true });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Claude no respondió en ${TIMEOUT_MS / 1000} s`));
    }, TIMEOUT_MS);
    child.stdout.on('data', (c) => (out += c));
    child.stderr.on('data', (c) => (err += c));
    child.stdin.on('error', () => {});
    child.stdin.end(prompt);
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      let parsed = null;
      try {
        parsed = JSON.parse(out);
      } catch {
        // no era JSON
      }
      if (code !== 0 || !parsed || parsed.is_error) {
        const reason = parsed?.result || err.trim().split('\n').pop() || `código ${code}`;
        return reject(new Error(String(reason).slice(0, 300)));
      }
      resolve(String(parsed.result ?? '').trim());
    });
  });
}

async function handle(msg) {
  const age = Date.now() - new Date(msg.created_at).getTime();
  if (age > MAX_AGE_HOURS * 3_600_000) return fail(msg, 'El mensaje esperó demasiado (DESJ estaba desconectado). Envíalo de nuevo.');
  if (msg.content.length > MAX_CHARS) return fail(msg, `El mensaje es muy largo (máximo ${MAX_CHARS} caracteres).`);
  const limited = await overLimit(msg.user_id);
  if (limited) return fail(msg, limited);

  // Tomar el mensaje (si otro proceso ya lo tomó, no hace nada).
  const { data: claimed } = await db
    .from('messages')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', msg.id)
    .eq('status', 'pending')
    .select('id');
  if (!claimed?.length) return;
  log('→', msg.id.slice(0, 8), `(${msg.user_id.slice(0, 8)})`, msg.content.slice(0, 60));

  const dir = await mkdtemp(path.join(tmpdir(), 'desj-'));
  try {
    const [{ data: conv }, { data: profile }] = await Promise.all([
      db.from('conversations').select('kind').eq('id', msg.conversation_id).eq('user_id', msg.user_id).single(),
      db.from('profiles').select('timezone').eq('id', msg.user_id).single(),
    ]);
    if (!conv) return fail(msg, 'Esa conversación ya no existe.');
    const ctx = await loadContext(db, msg.user_id, msg.context?.agenda ?? null, msg.conversation_id);
    const today = todayIn(profile?.timezone || 'America/Caracas');

    // Adjuntos (hasta 5, numerados): se bajan a la carpeta temporal, que es lo único que Read puede abrir.
    const files = Array.isArray(msg.attachments)
      ? msg.attachments
      : msg.attachment_path
        ? [{ path: msg.attachment_path, name: msg.attachment_name, mime: msg.attachment_mime }]
        : [];
    if (files.length > MAX_FILES_PER_MESSAGE) return fail(msg, `Puedes enviar hasta ${MAX_FILES_PER_MESSAGE} archivos por mensaje.`);
    let fileLine = '';
    for (const [i, f] of files.entries()) {
      if (typeof f?.path !== 'string' || !f.path.startsWith(`${msg.user_id}/`)) return fail(msg, 'Adjunto no válido.');
      const { data: blob, error } = await db.storage.from('documentos').download(f.path);
      if (error || !blob) return fail(msg, 'No encontré un archivo adjunto.');
      if (blob.size > MAX_FILE) return fail(msg, `"${f.name}" pesa más de 10 MB.`);
      const local = path.join(dir, `adjunto-${i + 1}-${path.basename(f.path).replace(/[^\w.-]/g, '_')}`);
      await writeFile(local, Buffer.from(await blob.arrayBuffer()));
      fileLine += `[Archivo ${i + 1}: "${f.name ?? path.basename(local)}" (${f.mime ?? 'archivo'}). Ábrelo con Read en: ${local}]\n`;
    }

    const system = [SYSTEM_PROMPT, conv.kind === 'conocimiento' ? INTERVIEW_PROMPT : '', WORKER_NOTE, ctx.block].filter(Boolean).join('\n\n');
    const history = ctx.history
      .map((h) => `${h.role === 'user' ? 'Persona' : 'DESJ'}: ${typeof h.content === 'string' ? h.content : ''}`)
      .join('\n');
    const prompt = `${history ? `<historial>\n${history}\n</historial>\n\n` : ''}${fileLine}Mensaje de la persona:\n${msg.content || 'Te envío estos archivos. Revísalos y dime lo importante.'}`;

    const systemFile = path.join(dir, 'system.md');
    const mcpFile = path.join(dir, 'mcp.json');
    const actionsFile = path.join(dir, 'actions.json');
    await writeFile(systemFile, system);
    await writeFile(
      mcpFile,
      JSON.stringify({
        mcpServers: {
          desj: {
            type: 'stdio',
            command: process.execPath,
            args: ['--no-warnings', path.join(HERE, 'mcp.js')],
            env: {
              DESJ_USER_ID: msg.user_id,
              DESJ_ACTIONS_FILE: actionsFile,
              DESJ_TODAY: today,
              DESJ_TMP_DIR: dir,
              ...(files.length
                ? { DESJ_ATTACHMENTS: JSON.stringify(files.map((f) => ({ path: f.path, name: f.name ?? path.basename(f.path), mime: f.mime ?? 'application/octet-stream' }))) }
                : {}),
            },
          },
        },
      }),
    );

    const reply = (await runClaude({ cwd: dir, systemFile, mcpFile, withFile: Boolean(fileLine), prompt })) || 'Listo.';
    const actions = await readFile(actionsFile, 'utf8').then(JSON.parse).catch(() => null);

    const { error: saveError } = await db.from('messages').insert({
      user_id: msg.user_id,
      conversation_id: msg.conversation_id,
      role: 'assistant',
      content: reply,
      status: 'done',
      actions,
    });
    if (saveError) return fail(msg, 'No pude guardar la respuesta.');
    await Promise.all([
      db.from('messages').update({ status: 'done' }).eq('id', msg.id),
      db.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', msg.conversation_id),
    ]);
    log('✓', msg.id.slice(0, 8), reply.slice(0, 60));
  } catch (e) {
    await fail(msg, `DESJ no pudo responder: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// Si el worker se cortó a mitad de un mensaje, ese mensaje vuelve a la cola al arrancar.
await db.from('messages').update({ status: 'pending' }).eq('status', 'running');
log(`Worker de DESJ escuchando (modelo ${MODEL}). Ctrl+C para salir.`);

for (;;) {
  try {
    const { data, error } = await db
      .from('messages')
      .select('id, user_id, conversation_id, content, context, created_at, attachments, attachment_path, attachment_name, attachment_mime')
      .eq('status', 'pending')
      .eq('role', 'user')
      .order('created_at')
      .limit(1);
    if (error) throw new Error(error.message);
    if (data?.length) {
      await handle(data[0]);
      continue;
    }
  } catch (e) {
    log('Error consultando la cola:', e instanceof Error ? e.message : e);
  }
  await new Promise((r) => setTimeout(r, POLL_MS));
}
