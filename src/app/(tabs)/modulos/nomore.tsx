// Módulos · NO MORE: contadores de días sin lo que la persona está dejando, mensaje de aliento del día y
// versículos. Pide el PIN cada vez que se entra (al salir de la pantalla se vuelve a bloquear). La primera
// vez se crea el PIN. Si se olvida, con sesión se recupera con la contraseña de la cuenta.
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Btn, Field } from '@/components/form';
import { IconPlus } from '@/components/icons';
import { ModuleIcon } from '@/components/modules';
import { HabitCard, HabitForm, PinPad, VerseCard } from '@/components/nomore';
import { Card, Label, Row, Screen, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { confirm, notify } from '@/lib/confirm';
import { useModules } from '@/lib/modules';
import { daysLabel, Habit, MILESTONES, useNoMore } from '@/lib/nomore';
import { dayIndex, MESSAGES, RELAPSE_MESSAGES, VERSES } from '@/lib/nomore-content';
import { supabase } from '@/lib/supabase';
import { C, R } from '@/theme';

const MAX_TRIES = 5;
const WAIT_MS = 30_000;

type Stage = 'unlock' | 'create' | 'confirm' | 'forgot' | 'open';

export default function NoMore() {
  const { ready: modulesReady, modules, reload: reloadModules } = useModules();
  const mod = modules.find((m) => m.kind === 'nomore');
  const nm = useNoMore(mod?.id);
  const { reload } = nm;
  const { session } = useAuth();

  const [stage, setStage] = useState<Stage>('unlock');
  const [first, setFirst] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [tries, setTries] = useState(0);
  const [blocked, setBlocked] = useState(false);
  const [password, setPassword] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [verse, setVerse] = useState(() => dayIndex() % VERSES.length);
  const [form, setForm] = useState<Habit | 'new' | null>(null);
  const [fallen, setFallen] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void reloadModules();
      reload().catch((e: Error) => setLoadError(e.message));
      // Al salir de la pantalla se bloquea: el PIN se pide cada vez que se entra.
      return () => {
        setStage('unlock');
        setForm(null);
        setFallen(null);
        setPinError(null);
      };
    }, [reloadModules, reload]),
  );

  // El contador avanza cada segundo solo con la pantalla abierta y desbloqueada.
  const open = stage === 'open';
  useFocusEffect(
    useCallback(() => {
      if (!open) return;
      setNow(Date.now());
      const id = setInterval(() => setNow(Date.now()), 1000);
      return () => clearInterval(id);
    }, [open]),
  );

  if (!mod || !nm.ready) {
    return (
      <Screen module="Módulos · No more" back>
        <Text style={styles.caption}>{loadError ?? (modulesReady && !mod ? 'Este módulo ya no existe. Agrégalo desde el catálogo de Módulos.' : 'Cargando…')}</Text>
      </Screen>
    );
  }

  // ---------------------------------------------------------------- PIN
  const effective: Stage = !nm.hasPin && (stage === 'unlock' || stage === 'forgot') ? 'create' : stage;

  const unlock = async (pin: string) => {
    if (blocked) return;
    if (await nm.checkPin(pin)) {
      setTries(0);
      setPinError(null);
      setStage('open');
      return;
    }
    const n = tries + 1;
    setTries(n);
    if (n >= MAX_TRIES) {
      setTries(0);
      setBlocked(true);
      setPinError('Demasiados intentos. Espera 30 segundos.');
      setTimeout(() => {
        setBlocked(false);
        setPinError(null);
      }, WAIT_MS);
    } else setPinError(`PIN incorrecto. Te quedan ${MAX_TRIES - n} intentos.`);
  };

  const confirmPin = async (pin: string) => {
    if (pin !== first) {
      setPinError('No coinciden. Escríbelo de nuevo.');
      setStage('create');
      return;
    }
    if (!(await nm.setPin(pin))) {
      setPinError('No pude guardar el PIN. Revisa tu conexión.');
      setStage('create');
      return;
    }
    setPinError(null);
    setStage('open');
  };

  const recover = async () => {
    const email = session?.user.email;
    if (!email || !password) return;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setPassword('');
    if (error) return setPinError('Esa no es la contraseña de tu cuenta.');
    setPinError(null);
    setStage('create');
  };

  if (effective !== 'open') {
    return (
      <Screen module="Módulos · No more" back>
        {effective === 'unlock' ? (
          <>
            <PinPad title="Escribe tu PIN" error={pinError} disabled={blocked} onComplete={unlock} />
            <Btn label="¿Olvidaste tu PIN?" kind="ghost" onPress={() => (setPinError(null), setStage('forgot'))} />
          </>
        ) : effective === 'create' ? (
          <PinPad
            title={nm.hasPin ? 'Nuevo PIN' : 'Crea un PIN para este módulo'}
            subtitle="4 dígitos. Te lo pediré cada vez que entres a NO MORE."
            error={pinError}
            onComplete={(pin) => {
              setFirst(pin);
              setPinError(null);
              setStage('confirm');
            }}
          />
        ) : effective === 'confirm' ? (
          <PinPad title="Repite el PIN" error={pinError} onComplete={confirmPin} />
        ) : (
          <Card>
            <Label style={{ color: C.accentSoft }}>Recuperar el PIN</Label>
            {nm.cloud ? (
              <>
                <Text style={styles.body}>Escribe la contraseña de tu cuenta de DESJ y crea un PIN nuevo. Tus contadores no se tocan.</Text>
                <Field label="Contraseña de la cuenta" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" onSubmitEditing={recover} />
                {pinError ? <Text style={styles.error}>{pinError}</Text> : null}
                <Row>
                  <Btn label="Volver" kind="ghost" onPress={() => (setPinError(null), setStage('unlock'))} />
                  <Btn label="Continuar" onPress={recover} />
                </Row>
              </>
            ) : (
              <>
                <Text style={styles.body}>Sin cuenta no hay forma de recuperarlo: la única opción es quitar el módulo en Módulos › Editar y agregarlo de nuevo (se borran los contadores).</Text>
                <Btn label="Volver" kind="ghost" onPress={() => setStage('unlock')} />
              </>
            )}
          </Card>
        )}
      </Screen>
    );
  }

  // ---------------------------------------------------------------- abierto
  const today = dayIndex();
  const milestone = nm.habits
    .map((h) => ({ h, days: Math.floor((now - new Date(h.started_at).getTime()) / 86_400_000) }))
    .find((x) => MILESTONES.includes(x.days) || (x.days > 0 && x.days % 365 === 0));

  const removeHabit = async (h: Habit) => {
    if (await confirm('Eliminar', `¿Eliminar "${h.name}" y su historial? No se puede deshacer.`, 'Eliminar')) void nm.removeHabit(h.id);
  };

  return (
    <Screen module="Módulos · No more" back>
      <Row style={{ justifyContent: 'flex-start' }}>
        <View style={styles.icon}>
          <ModuleIcon kind="nomore" color={C.accentSoft} size={24} />
        </View>
        <View style={{ gap: 2, flex: 1 }}>
          <Label>Lo que estás dejando</Label>
          <Title accent="more">No</Title>
        </View>
      </Row>

      {fallen ? (
        <Card glow>
          <Label style={{ color: C.warn }}>Vuelves a empezar</Label>
          <Text style={styles.message}>{fallen}</Text>
        </Card>
      ) : (
        <Card glow>
          <Label style={{ color: C.accentSoft }}>{milestone ? `¡${daysLabel(milestone.days)} sin ${milestone.h.name.toLowerCase()}!` : 'Mensaje de hoy'}</Label>
          <Text style={styles.message}>{MESSAGES[today % MESSAGES.length]}</Text>
        </Card>
      )}

      {nm.habits.length === 0 && !form ? (
        <Card>
          <Text style={styles.body}>Agrega lo que estás dejando: fumar, alcohol, lujuria o lo que sea. Puedes tener varios, cada uno con su contador.</Text>
        </Card>
      ) : null}

      {nm.habits.map((h) =>
        form !== 'new' && form?.id === h.id ? (
          <HabitForm
            key={h.id}
            initial={h}
            onCancel={() => setForm(null)}
            onSave={async (input) => {
              const ok = await nm.saveHabit(input, h.id);
              if (ok) setForm(null);
              return ok;
            }}
          />
        ) : (
          <HabitCard
            key={h.id}
            habit={h}
            resets={nm.resets.filter((r) => r.habit_id === h.id)}
            now={now}
            onEdit={() => setForm(h)}
            onRemove={() => removeHabit(h)}
            onRelapse={async (note) => {
              if (await nm.relapse(h, note)) setFallen(RELAPSE_MESSAGES[Math.floor(Math.random() * RELAPSE_MESSAGES.length)]);
              else notify('No pude guardarlo. Revisa tu conexión e intenta de nuevo.');
            }}
          />
        ),
      )}

      {form === 'new' ? (
        <HabitForm
          onCancel={() => setForm(null)}
          onSave={async (input) => {
            const ok = await nm.saveHabit(input);
            if (ok) setForm(null);
            return ok;
          }}
        />
      ) : (
        <Btn label="Agregar algo que estás dejando" kind="outline" icon={<IconPlus color={C.chipText} />} onPress={() => setForm('new')} />
      )}

      <VerseCard index={verse} onNext={() => setVerse((v) => (v + 1 + Math.floor(Math.random() * (VERSES.length - 1))) % VERSES.length)} />

      <Card>
        <Label>Privacidad</Label>
        <Text style={styles.caption}>Este módulo es solo tuyo: se bloquea al salir y DESJ no lo lee en el chat.</Text>
        <Row>
          <Btn label="Cambiar PIN" kind="ghost" onPress={() => (setPinError(null), setStage('create'))} />
          <Btn label="Bloquear" kind="outline" onPress={() => setStage('unlock')} />
        </Row>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { color: C.text, fontSize: 14.5, lineHeight: 20 },
  caption: { color: C.muted, fontSize: 12.5, lineHeight: 18 },
  error: { color: C.bad, fontSize: 13 },
  message: { color: C.text, fontSize: 17, lineHeight: 25 },
  icon: { width: 48, height: 48, borderRadius: R.card, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surfaceInput },
});
