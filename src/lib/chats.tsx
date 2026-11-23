// Historial de conversaciones con DESJ.
// - Con sesión: las conversaciones viven en Supabase (privadas por usuario) y la Edge Function guarda cada mensaje.
// - Sin nube: se guardan en el teléfono, con la misma interfaz.
// La memoria de DESJ (tabla memories) es común a todas las conversaciones; el historial solo ordena las charlas.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';

import { Attachment, Uploaded, uploadAttachment } from '@/lib/attachments';
import { useAuth } from '@/lib/auth';
import { askDesj, countUnanswered, parseAlertReply, retryQueue, RetryProgress, RetryResult, think } from '@/lib/brain';
import { today, useStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';

export type Conversation = { id: string; title: string; updatedAt: string };
/** `status` (solo mensajes tuyos en la nube): 'pending' sigue en la cola del worker, 'error' no se pudo responder. `alert`: respuesta crítica de DESJ. */
export type ChatMsg = { id: string; from: 'me' | 'desj'; text: string; attachments?: string[]; status?: 'pending' | 'error'; alert?: boolean };

// En la nube cada adjunto se guarda como una línea "[Adjunto: nombre]" al final del mensaje.
const ATTACHMENT_LINE = /\n?\[Adjunto: (.+)\]$/gm;
type LocalConversation = Conversation & { messages: ChatMsg[] };

const LOCAL_KEY = 'desj:chats:v1';
const MAX_LOCAL = 50; // conversaciones guardadas en el teléfono
const MAX_LOCAL_MSGS = 200; // mensajes por conversación en el teléfono

type Ctx = {
  ready: boolean;
  conversations: Conversation[];
  activeId: string | null;
  messages: ChatMsg[];
  busy: boolean;
  /** Envía un mensaje (y opcionalmente archivos) en la conversación activa o en una nueva. Devuelve la respuesta de DESJ. */
  send: (text: string, files?: Attachment[]) => Promise<string | null>;
  /** Inyecta un mensaje crítico de DESJ directamente en la conversación actual (p. ej. botón de prueba de alerta). */
  pushAlert: (text: string) => void;
  newChat: () => void;
  open: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** Cambia el título de una conversación. Devuelve false si no se pudo. */
  rename: (id: string, title: string) => Promise<boolean>;
  /** Mensajes tuyos sin respuesta del worker (en cola o fallidos hace poco). 0 sin nube. */
  unanswered: number;
  /** Progreso de "Reintentar conexión" mientras corre; null si no está corriendo. */
  retrying: RetryProgress | null;
  /** Vuelve a mandar al worker todos los mensajes sin respuesta y trae sus respuestas. */
  retry: () => Promise<RetryResult | null>;
};

const ChatsCtx = createContext<Ctx | null>(null);

export function makeTitle(text: string) {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > 60 ? `${clean.slice(0, 57).trimEnd()}…` : clean;
}

const byRecent = (a: Conversation, b: Conversation) => b.updatedAt.localeCompare(a.updatedAt);

export function ChatsProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const cloud = Boolean(session);
  const { meds, taken, refresh } = useStore();

  const [ready, setReady] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [local, setLocal] = useState<LocalConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [busy, setBusy] = useState(false);
  const [unanswered, setUnanswered] = useState(0);
  const [retrying, setRetrying] = useState<RetryProgress | null>(null);
  // La conversación abierta en este momento (el reintento dura minutos y puedes cambiar de conversación).
  const activeRef = useRef<string | null>(null);
  useEffect(() => {
    activeRef.current = activeId;
  }, [activeId]);

  const loadMessages = useCallback(async (id: string) => {
    const { data } = await supabase
      .from('messages')
      .select('id, role, content, status, actions')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true })
      .limit(200);
    return (data ?? []).map((r): ChatMsg => {
      const names = [...r.content.matchAll(ATTACHMENT_LINE)].map((m) => m[1]);
      const status = r.role === 'user' && (r.status === 'pending' || r.status === 'running' || r.status === 'error') ? (r.status === 'error' ? 'error' : 'pending') : undefined;
      const clean = names.length ? r.content.replace(ATTACHMENT_LINE, '').trim() : r.content;
      const act = r.actions && typeof r.actions === 'object' ? (r.actions as { alert?: boolean }) : undefined;
      const parsed = r.role === 'assistant' ? parseAlertReply(clean, act?.alert) : { text: clean, alert: false };
      return { id: r.id, from: r.role === 'user' ? 'me' : 'desj', text: parsed.text, attachments: names.length ? names : undefined, status, ...(parsed.alert ? { alert: true } : {}) };
    });
  }, []);

  const checkQueue = useCallback(() => {
    countUnanswered().then((n) => n !== null && setUnanswered(n));
  }, []);

  // Carga inicial: se retoma la conversación más reciente.
  useEffect(() => {
    if (cloud) {
      countUnanswered().then((n) => n !== null && setUnanswered(n));
      supabase
        .from('conversations')
        .select('id, title, updated_at')
        .eq('kind', 'chat')
        .order('updated_at', { ascending: false })
        .limit(100)
        .then(async ({ data }) => {
          const list = (data ?? []).map((c) => ({ id: c.id, title: c.title, updatedAt: c.updated_at }));
          setConversations(list);
          if (list[0]) {
            setActiveId(list[0].id);
            setMessages(await loadMessages(list[0].id));
          }
          setReady(true);
        });
      return;
    }
    AsyncStorage.getItem(LOCAL_KEY)
      .then((raw) => {
        const list: LocalConversation[] = raw ? JSON.parse(raw) : [];
        setLocal(list);
        setConversations(list.map(({ id, title, updatedAt }) => ({ id, title, updatedAt })));
        if (list[0]) {
          setActiveId(list[0].id);
          setMessages(list[0].messages);
        }
      })
      .finally(() => setReady(true));
  }, [cloud, loadMessages]);

  const saveLocal = (list: LocalConversation[]) => {
    const trimmed = [...list].sort(byRecent).slice(0, MAX_LOCAL);
    setLocal(trimmed);
    setConversations(trimmed.map(({ id, title, updatedAt }) => ({ id, title, updatedAt })));
    AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(trimmed));
  };

  const send = async (text: string, files: Attachment[] = []) => {
    if (busy) return null;
    const title = makeTitle(text || files[0]?.name || 'Archivo');
    const mine: ChatMsg = { id: `${Date.now()}`, from: 'me', text, attachments: files.length ? files.map((f) => f.name) : undefined };
    setMessages((m) => [...m, mine]);
    setBusy(true);
    const now = new Date().toISOString();

    try {
      if (cloud) {
        const uploaded: Uploaded[] = [];
        if (files.length && session) {
          try {
            for (const f of files) uploaded.push(await uploadAttachment(f, session.user.id));
          } catch (e) {
            const msg = e instanceof Error ? e.message : 'No pude subir los archivos.';
            setMessages((m) => [...m, { id: `${Date.now()}r`, from: 'desj', text: msg }]);
            return msg;
          }
        }
        const res = await askDesj(text, activeId, 'chat', uploaded);
        const answer: ChatMsg = { id: `${Date.now()}r`, from: 'desj', text: res.reply, ...(res.alert ? { alert: true } : {}) };
        setMessages((m) => [...m.map((x) => (x.id === mine.id && res.queued ? { ...x, status: 'pending' as const } : x)), answer]);
        if (res.queued) checkQueue();
        if (res.dataChanged) refresh();
        if (!res.failed && res.conversationId) {
          const id = res.conversationId;
          setActiveId(id);
          setConversations((list) => {
            const existing = list.find((c) => c.id === id);
            const updated = { id, title: existing?.title ?? title, updatedAt: now };
            return [updated, ...list.filter((c) => c.id !== id)];
          });
        }
        return res.reply;
      }

      const rawReply = files.length
        ? `Recibí ${files.length === 1 ? `"${files[0].name}"` : `${files.length} archivos`}. Para leer archivos necesito estar conectado al cerebro (Claude); por ahora quedan solo en este chat.`
        : await think(text, { meds, takenKeys: taken[today()] ?? [] });
      const parsed = parseAlertReply(rawReply);
      const answer: ChatMsg = { id: `${Date.now()}r`, from: 'desj', text: parsed.text, ...(parsed.alert ? { alert: true } : {}) };
      const id = activeId ?? `c${Date.now()}`;
      const current = local.find((c) => c.id === id);
      const updated: LocalConversation = {
        id,
        title: current?.title ?? title,
        updatedAt: now,
        messages: [...(current?.messages ?? []), mine, answer].slice(-MAX_LOCAL_MSGS),
      };
      saveLocal([updated, ...local.filter((c) => c.id !== id)]);
      setActiveId(id);
      setMessages(updated.messages);
      return parsed.text;
    } finally {
      setBusy(false);
    }
  };

  const newChat = () => {
    if (busy) return;
    setActiveId(null);
    setMessages([]);
  };

  const pushAlert = useCallback((text: string) => {
    setMessages((m) => [...m, { id: `${Date.now()}a`, from: 'desj', text, alert: true }]);
  }, []);

  const open = async (id: string) => {
    if (busy || id === activeId) return;
    setActiveId(id);
    if (cloud) {
      setMessages([]);
      setMessages(await loadMessages(id));
    } else {
      setMessages(local.find((c) => c.id === id)?.messages ?? []);
    }
  };

  const remove = async (id: string) => {
    if (cloud) {
      const { error } = await supabase.from('conversations').delete().eq('id', id);
      if (error) return;
      setConversations((list) => list.filter((c) => c.id !== id));
    } else {
      saveLocal(local.filter((c) => c.id !== id));
    }
    if (id === activeId) {
      setActiveId(null);
      setMessages([]);
    }
  };

  const rename = async (id: string, title: string) => {
    const clean = title.replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!clean) return false;
    if (cloud) {
      const { error } = await supabase.from('conversations').update({ title: clean }).eq('id', id);
      if (error) return false;
      setConversations((list) => list.map((c) => (c.id === id ? { ...c, title: clean } : c)));
    } else {
      saveLocal(local.map((c) => (c.id === id ? { ...c, title: clean } : c)));
    }
    return true;
  };

  const retry = async () => {
    if (!cloud || retrying) return null;
    const reload = async (ids: string[]) => {
      const id = activeRef.current;
      if (id && ids.includes(id)) setMessages(await loadMessages(id));
    };
    // Mientras corre, los mensajes reenviados se ven "en cola" y cada respuesta aparece al llegar.
    setMessages((m) => m.map((x) => (x.status === 'error' ? { ...x, status: 'pending' } : x)));
    setRetrying({ total: unanswered, answered: 0, failed: 0, conversationIds: [] });
    try {
      const res = await retryQueue((p) => {
        setRetrying(p);
        reload(p.conversationIds);
      });
      if (res.dataChanged) refresh();
      if (res.conversationIds.length) {
        const now = new Date().toISOString();
        setConversations((list) => [...list].map((c) => (res.conversationIds.includes(c.id) ? { ...c, updatedAt: now } : c)).sort(byRecent));
      }
      await reload(activeRef.current ? [activeRef.current] : []);
      return res;
    } finally {
      setRetrying(null);
      checkQueue();
    }
  };

  return (
    <ChatsCtx.Provider value={{ ready, conversations, activeId, messages, busy, send, pushAlert, newChat, open, remove, rename, unanswered: cloud ? unanswered : 0, retrying, retry }}>
      {children}
    </ChatsCtx.Provider>
  );
}

export function useChats() {
  const ctx = useContext(ChatsCtx);
  if (!ctx) throw new Error('useChats debe usarse dentro de ChatsProvider');
  return ctx;
}
