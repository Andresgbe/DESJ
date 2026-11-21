// Pantalla de entrada. Las cuentas se crean desde el panel de Supabase (no hay registro público).
import { createElement, type ReactNode, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text, TextInput } from '@/components/text';
import { DesjCore } from '@/components/desj-core';
import { IconEye, IconEyeOff } from '@/components/icons';
import { NeuralBackground } from '@/components/neural-bg';
import { Label, Title } from '@/components/ui';
import { Wordmark } from '@/components/wordmark';
import { useAuth } from '@/lib/auth';
import { C, S } from '@/theme';

export function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const form = useRef<HTMLFormElement | null>(null);

  const submit = async () => {
    if (!email.trim() || !password || busy) return;
    setBusy(true);
    const err = await signIn(email, password);
    setError(err);
    setBusy(false);
    if (!err) rememberPassword(email.trim(), password);
  };

  // En web, "Entrar" envía el formulario: así Safari (iPhone) y Chrome ven un inicio de sesión y ofrecen guardar la contraseña.
  const send = () => {
    if (Platform.OS === 'web' && form.current?.requestSubmit) form.current.requestSubmit();
    else submit();
  };

  return (
    <SafeAreaView style={styles.screen}>
      <NeuralBackground />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.body}>
        <View style={{ alignItems: 'center', gap: 14, marginBottom: 8 }}>
          <DesjCore size={280} label="ACCESO" />
          <Wordmark height={40} />
        </View>
        <Title accent="cuenta">Entra a tu</Title>
        <Label>Tu contexto es privado: solo tú lo ves.</Label>

        <LoginForm formRef={form} onSubmit={submit}>
          <TextInput
            style={styles.input}
            placeholder="Correo"
            placeholderTextColor={C.muted}
            autoCapitalize="none"
            autoComplete="username"
            textContentType="username"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <View style={styles.passwordRow}>
            <TextInput
              style={[styles.input, styles.passwordInput]}
              placeholder="Contraseña"
              placeholderTextColor={C.muted}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoComplete="current-password"
              textContentType="password"
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={send}
              returnKeyType="go"
            />
            <Pressable
              onPress={() => setShowPassword((v) => !v)}
              style={styles.eye}
              hitSlop={4}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}>
              {showPassword ? <IconEyeOff color={C.accentSoft} /> : <IconEye color={C.muted} />}
            </Pressable>
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable onPress={send} style={styles.btn} accessibilityRole="button">
            {busy ? <ActivityIndicator color={C.onAccent} /> : <Text style={styles.btnText}>Entrar</Text>}
          </Pressable>
        </LoginForm>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** En web, un <form> de verdad (los gestores de contraseñas lo necesitan); en el teléfono, una columna normal. */
function LoginForm({ formRef, onSubmit, children }: { formRef: React.RefObject<HTMLFormElement | null>; onSubmit: () => void; children: ReactNode }) {
  if (Platform.OS !== 'web') return <View style={{ gap: S.gap }}>{children}</View>;
  return createElement(
    'form',
    {
      ref: formRef,
      method: 'post',
      action: '#',
      style: { display: 'flex', flexDirection: 'column', gap: S.gap },
      onSubmit: (e: { preventDefault: () => void }) => {
        e.preventDefault();
        onSubmit();
      },
    },
    children,
  );
}

/** En navegadores con la API de credenciales (Chrome, Edge), guarda el correo y la contraseña en su gestor. Safari lo ofrece solo. */
function rememberPassword(id: string, password: string) {
  if (Platform.OS !== 'web') return;
  const w = globalThis as unknown as { PasswordCredential?: new (d: { id: string; password: string; name?: string }) => unknown; navigator?: { credentials?: { store?: (c: unknown) => Promise<unknown> } } };
  if (!w.PasswordCredential || !w.navigator?.credentials?.store) return;
  w.navigator.credentials.store(new w.PasswordCredential({ id, password, name: id })).catch(() => {});
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  body: { flex: 1, justifyContent: 'center', padding: S.pad, gap: S.gap, width: '100%', maxWidth: S.column + S.pad * 2, alignSelf: 'center' },
  input: { color: C.text, fontSize: 16, borderWidth: 1, borderColor: C.cardBorder, borderRadius: 12, paddingHorizontal: 14, minHeight: 48, backgroundColor: C.surfaceSunken },
  passwordRow: { justifyContent: 'center' },
  passwordInput: { paddingRight: S.touch + 4 },
  eye: { position: 'absolute', right: 2, width: S.touch, height: S.touch, alignItems: 'center', justifyContent: 'center' },
  error: { color: C.bad, fontSize: 13.5 },
  btn: { minHeight: 50, borderRadius: 14, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  btnText: { color: C.onAccent, fontSize: 15.5, fontWeight: '700' },
});
