// Historial de conversaciones con DESJ.
// - Con sesión: las conversaciones viven en Supabase (privadas por usuario) y la Edge Function guarda cada mensaje.
// - Sin nube: se guardan en el teléfono, con la misma interfaz.
// La memoria de DESJ (tabla memories) es común a todas las conversaciones; el historial solo ordena las charlas.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';

import { Attachment, uploadAttachment } from '@/lib/attachments';
import { useAuth } from '@/lib/auth';
import { askDesj, think } from '@/lib/brain';
import { today, useStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';

export type Conversation = { id: string; title: string; updatedAt: string };
export type ChatMsg = { id: string; from: 'me' | 'desj'; text: string; attachment?: string };

// En la nube el adjunto se guarda como una línea "[Adjunto: nombre]" al final del mensaje.
const ATTACHMENT_LINE = /\n?\[Adjunto: (.+)\]$/;
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
  /** Envía un mensaje (y opcionalmente un adjunto) en la conversación activa o en una nueva. Devuelve la respuesta de DESJ. */
  send: (text: string, attachment?: Attachment | null) => Promise<string | null>;
  newChat: () => void;
  open: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
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

  const loadMessages = useCallback(async (id: string) => {
    const { data } = await supabase
      .from('messages')
      .select('id, role, content')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true })
      .limit(200);
    return (data ?? []).map((r): ChatMsg => {
      const m = r.content.match(ATTACHMENT_LINE);
      return { id: r.id, from: r.role === 'user' ? 'me' : 'desj', text: m ? r.content.replace(ATTACHMENT_LINE, '') : r.content, attachment: m?.[1] };
    });
  }, []);

  // Carga inicial: se retoma la conversación más reciente.
  useEffect(() => {
    if (cloud) {
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

  const send = async (text: string, attachment?: Attachment | null) => {
    if (busy) return null;
    const title = makeTitle(text || attachment?.name || 'Archivo');
    const mine: ChatMsg = { id: `${Date.now()}`, from: 'me', text, attachment: attachment?.name };
    setMessages((m) => [...m, mine]);
    setBusy(true);
    const now = new Date().toISOString();

    try {
      if (cloud) {
        let uploaded;
        if (attachment && session) {
          try {
            uploaded = await uploadAttachment(attachment, session.user.id);
          } catch (e) {
            const msg = e instanceof Error ? e.message : 'No pude subir el archivo.';
            setMessages((m) => [...m, { id: `${Date.now()}r`, from: 'desj', text: msg }]);
            return msg;
          }
        }
        const res = await askDesj(text, activeId, 'chat', uploaded);
        const answer: ChatMsg = { id: `${Date.now()}r`, from: 'desj', text: res.reply };
        setMessages((m) => [...m, answer]);
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

      const reply = attachment
        ? `Recibí "${attachment.name}". Para leer archivos necesito estar conectado al cerebro (Claude); por ahora queda solo en este chat.`
        : await think(text, { meds, takenKeys: taken[today()] ?? [] });
      const answer: ChatMsg = { id: `${Date.now()}r`, from: 'desj', text: reply };
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
      return reply;
    } finally {
      setBusy(false);
    }
  };

  const newChat = () => {
    if (busy) return;
    setActiveId(null);
    setMessages([]);
  };

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

  return (
    <ChatsCtx.Provider value={{ ready, conversations, activeId, messages, busy, send, newChat, open, remove }}>
      {children}
    </ChatsCtx.Provider>
  );
}

export function useChats() {
  const ctx = useContext(ChatsCtx);
  if (!ctx) throw new Error('useChats debe usarse dentro de ChatsProvider');
  return ctx;
}
