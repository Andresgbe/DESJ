// Pantalla de entrada. Las cuentas se crean desde el panel de Supabase (no hay registro público).
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DesjCore } from '@/components/desj-core';
import { NeuralBackground } from '@/components/neural-bg';
import { Label, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { C } from '@/theme';

export function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password || busy) return;
    setBusy(true);
    setError(await signIn(email, password));
    setBusy(false);
  };

  return (
    <SafeAreaView style={styles.screen}>
      <NeuralBackground />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.body}>
        <View style={{ alignItems: 'center', marginBottom: 8 }}>
          <DesjCore size={200} label="ACCESO" />
        </View>
        <Title accent="DESJ">Entra a</Title>
        <Label>Tu contexto es privado: solo tú lo ves.</Label>

        <TextInput
          style={styles.input}
          placeholder="Correo"
          placeholderTextColor={C.muted}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Contraseña"
          placeholderTextColor={C.muted}
          secureTextEntry
          autoComplete="password"
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={submit}
          returnKeyType="go"
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable onPress={submit} style={styles.btn} accessibilityRole="button">
          {busy ? <ActivityIndicator color={C.onAccent} /> : <Text style={styles.btnText}>Entrar</Text>}
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  body: { flex: 1, justifyContent: 'center', padding: 20, gap: 12 },
  input: { color: C.text, fontSize: 16, borderWidth: 1, borderColor: C.cardBorder, borderRadius: 12, paddingHorizontal: 14, minHeight: 48, backgroundColor: C.surfaceSunken },
  error: { color: C.bad, fontSize: 13.5 },
  btn: { minHeight: 50, borderRadius: 14, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  btnText: { color: C.onAccent, fontSize: 15.5, fontWeight: '700' },
});
