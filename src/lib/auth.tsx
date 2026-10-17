// Sesión del usuario. Cada persona entra con su correo y solo ve sus propios datos.
import type { Session } from '@supabase/supabase-js';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';

import { cloudEnabled, supabase } from '@/lib/supabase';

type Ctx = {
  ready: boolean;
  session: Session | null;
  name: string;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
};

const AuthCtx = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!cloudEnabled);
  const [profile, setProfile] = useState<{ userId: string; name: string } | null>(null);

  useEffect(() => {
    if (!cloudEnabled) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) return;
    supabase
      .from('profiles')
      .select('display_name')
      .single()
      .then(({ data }) => setProfile({ userId, name: data?.display_name ?? '' }));
  }, [userId]);
  const name = profile && profile.userId === userId ? profile.name : '';

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    return error ? 'Correo o contraseña incorrectos.' : null;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return <AuthCtx.Provider value={{ ready, session, name, signIn, signOut }}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
