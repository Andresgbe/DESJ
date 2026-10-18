// Pendientes (tareas). Con sesión viven en Supabase (privadas por usuario); sin nube, en el teléfono.
// DESJ también las crea y completa desde el chat, por eso la pantalla recarga al enfocarse.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useState } from 'react';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export type Task = { id: string; title: string; notes: string; dueDate: string | null; done: boolean; doneAt: string | null; createdAt: string };

const LOCAL_KEY = 'desj:tasks:v1';
const KEEP_DONE_DAYS = 30; // las hechas se ocultan del teléfono después de 30 días

type Row = { id: string; title: string; notes: string; due_date: string | null; done: boolean; done_at: string | null; created_at: string };
const fromRow = (r: Row): Task => ({ id: r.id, title: r.title, notes: r.notes, dueDate: r.due_date, done: r.done, doneAt: r.done_at, createdAt: r.created_at });

async function readLocal(): Promise<Task[]> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function useTasks() {
  const { session } = useAuth();
  const cloud = Boolean(session);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [ready, setReady] = useState(false);

  const reload = useCallback(async () => {
    if (cloud) {
      const since = new Date(Date.now() - KEEP_DONE_DAYS * 86_400_000).toISOString();
      const { data } = await supabase
        .from('tasks')
        .select('id, title, notes, due_date, done, done_at, created_at')
        .or(`done.eq.false,done_at.gte.${since}`)
        .order('created_at', { ascending: false })
        .limit(300);
      if (data) setTasks(data.map(fromRow));
    } else {
      const cutoff = Date.now() - KEEP_DONE_DAYS * 86_400_000;
      setTasks((await readLocal()).filter((t) => !t.done || !t.doneAt || new Date(t.doneAt).getTime() > cutoff));
    }
    setReady(true);
  }, [cloud]);

  const saveLocal = async (next: Task[]) => {
    setTasks(next);
    await AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(next));
  };

  const add = async (title: string, dueDate: string | null) => {
    const clean = title.trim();
    if (!clean) return;
    if (cloud) {
      const { data } = await supabase.from('tasks').insert({ title: clean, due_date: dueDate }).select('id, title, notes, due_date, done, done_at, created_at').single();
      if (data) setTasks((list) => [fromRow(data), ...list]);
      return;
    }
    const task: Task = { id: `t${Date.now()}`, title: clean, notes: '', dueDate, done: false, doneAt: null, createdAt: new Date().toISOString() };
    await saveLocal([task, ...(await readLocal())]);
  };

  const toggle = async (id: string) => {
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    const done = !t.done;
    const doneAt = done ? new Date().toISOString() : null;
    setTasks((list) => list.map((x) => (x.id === id ? { ...x, done, doneAt } : x)));
    if (cloud) {
      const { error } = await supabase.from('tasks').update({ done, done_at: doneAt }).eq('id', id);
      if (error) reload();
    } else {
      await saveLocal((await readLocal()).map((x) => (x.id === id ? { ...x, done, doneAt } : x)));
    }
  };

  const remove = async (id: string) => {
    setTasks((list) => list.filter((x) => x.id !== id));
    if (cloud) await supabase.from('tasks').delete().eq('id', id);
    else await saveLocal((await readLocal()).filter((x) => x.id !== id));
  };

  return { ready, tasks, reload, add, toggle, remove };
}
