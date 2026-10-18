#!/usr/bin/env node
// Servidor MCP de DESJ para el worker local. Expone a Claude Code las MISMAS herramientas que usa la
// Edge Function (supabase/functions/chat/tools.ts), atadas a UNA persona: el worker lo arranca por cada
// mensaje con DESJ_USER_ID de quien escribió. Claude nunca elige el usuario; todas las consultas lo filtran.
// Lo que el teléfono debe ejecutar (avisos, eventos) se va guardando en DESJ_ACTIONS_FILE.
import { writeFile } from 'node:fs/promises';

import { fromJsonSchema, McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

import { runTool, TOOLS } from '../supabase/functions/chat/tools.ts';

dotenv.config({ path: new URL('.env', import.meta.url), quiet: true });

const { DESJ_SUPABASE_URL, DESJ_SUPABASE_SECRET_KEY, DESJ_USER_ID, DESJ_ACTIONS_FILE, DESJ_TODAY } = process.env;
if (!DESJ_SUPABASE_URL || !DESJ_SUPABASE_SECRET_KEY || !DESJ_USER_ID || !DESJ_ACTIONS_FILE || !DESJ_TODAY) {
  console.error('desj mcp: faltan variables (lo arranca el worker, no se usa solo).');
  process.exit(1);
}

const db = createClient(DESJ_SUPABASE_URL, DESJ_SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const actions = { reminders: [], events: [], medsChanged: false, intakesChanged: false, knowledgeChanged: false, tasksChanged: false };

const server = new McpServer({ name: 'desj', version: '1.0.0' });

for (const tool of TOOLS) {
  server.registerTool(
    tool.name,
    { description: tool.description, inputSchema: fromJsonSchema(tool.input_schema) },
    async (args) => {
      try {
        const out = await runTool(db, tool.name, args ?? {}, { today: DESJ_TODAY, actions, userId: DESJ_USER_ID });
        await writeFile(DESJ_ACTIONS_FILE, JSON.stringify(actions));
        return { content: [{ type: 'text', text: out }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : typeof err === 'object' && err && 'message' in err ? String(err.message) : String(err);
        return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
      }
    },
  );
}

await serveStdio(() => server);
