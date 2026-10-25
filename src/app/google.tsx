// Pantalla · vuelta de Google: termina de conectar la cuenta (Drive, Gmail, Calendar) y lleva de vuelta a Ajustes.
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { Btn } from '@/components/form';
import { Card, Label } from '@/components/ui';
import { finishGoogle } from '@/lib/google';
import { C } from '@/theme';

export default function GoogleReturn() {
  const { code, state, error } = useLocalSearchParams<{ code?: string; state?: string; error?: string }>();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    if (error || !code || !state) {
      Promise.resolve().then(() => setResult({ ok: false, text: error === 'access_denied' ? 'Cancelaste la conexión. Puedes intentarlo cuando quieras desde Ajustes.' : 'Google no devolvió la conexión. Vuelve a intentarlo desde Ajustes.' }));
      return;
    }
    finishGoogle(code, state).then((res) =>
      setResult(res.error ? { ok: false, text: res.error } : { ok: true, text: `Listo: DESJ quedó conectado a ${res.email ?? 'tu cuenta de Google'}. Ya puede crear archivos en tu Drive, enviar correos (siempre con tu confirmación) y usar tu Google Calendar.` }),
    );
  }, [code, state, error]);

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={styles.wrap}>
      <Card>
        <Label style={{ color: result ? (result.ok ? C.ok : C.bad) : C.accentSoft }}>{result ? (result.ok ? 'Conectado' : 'No se conectó') : 'Conectando con Google…'}</Label>
        <Text style={styles.text}>{result?.text ?? 'Un momento…'}</Text>
        {result ? <Btn label="Volver a Ajustes" onPress={() => router.replace('/ajustes')} /> : null}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 12, width: '100%', maxWidth: 640, alignSelf: 'center' },
  text: { color: C.text, fontSize: 15, lineHeight: 21 },
});
