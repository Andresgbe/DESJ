// Pantalla · Ajustes (desde el menú de perfil): cuenta, cuenta de Google (Drive, Gmail, Calendar), permisos y versión.
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { useFocusEffect } from 'expo-router';

import { Btn } from '@/components/form';
import { Card, Label, Row } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { calendarAvailable } from '@/lib/calendar';
import { confirm, notify } from '@/lib/confirm';
import { connectGoogle, googleAvailable, useGoogle } from '@/lib/google';
import { askPermission } from '@/lib/notifications';
import { cloudEnabled } from '@/lib/supabase';
import { C } from '@/theme';

export default function Ajustes() {
  const { session, name, signOut } = useAuth();
  const [notif, setNotif] = useState<boolean | null>(null);
  const google = useGoogle();
  const { reload: reloadGoogle } = google;

  useFocusEffect(
    useCallback(() => {
      if (session) void reloadGoogle();
    }, [session, reloadGoogle]),
  );

  const disconnectGoogle = async () => {
    if (!(await confirm('Desconectar Google', 'DESJ dejará de crear archivos en tu Drive, enviar correos y usar tu Google Calendar. Lo ya creado en Drive se queda.', 'Desconectar'))) return;
    const res = await google.disconnect();
    if (res.error) notify(res.error);
  };

  useEffect(() => {
    Notifications.getPermissionsAsync().then((p) => setNotif(p.granted)).catch(() => setNotif(null));
  }, []);

  const enableNotif = async () => {
    const ok = await askPermission();
    setNotif(ok);
    if (!ok) Linking.openSettings();
  };

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={styles.wrap}>
      <Card>
        <Label style={{ color: C.accentSoft }}>Cuenta</Label>
        <Item label="Nombre" value={name || '—'} />
        <Item label="Correo" value={session?.user.email ?? '—'} />
        <Item label="Datos" value={session ? 'En la nube (privados)' : cloudEnabled ? 'Sin sesión' : 'Solo en este teléfono (modo local)'} />
        {!cloudEnabled ? <Text style={styles.note}>La nube y el cerebro con Claude se activan cuando se configure Supabase.</Text> : null}
      </Card>

      {session ? (
        <Card>
          <Label style={{ color: C.accentSoft }}>Cuenta de Google</Label>
          <Text style={styles.note}>Para que DESJ cree documentos en tu Drive, envíe correos desde tu Gmail (siempre te muestra el borrador antes) y use tu Google Calendar.</Text>
          {google.status ? (
            <>
              <Item label="Conectada" value={google.status.email ?? 'Sí'} />
              {google.status.lastError ? <Text style={[styles.note, { color: C.warn }]}>Google rechazó el último acceso. Vuelve a conectar.</Text> : null}
              <Row>
                {google.status.lastError && googleAvailable ? <Btn label="Reconectar" onPress={connectGoogle} /> : null}
                <Btn label="Desconectar" kind="danger" onPress={disconnectGoogle} />
              </Row>
            </>
          ) : googleAvailable ? (
            <Btn label="Conectar Google" onPress={connectGoogle} />
          ) : (
            <Text style={styles.note}>{google.ready ? 'Se conecta desde la versión web de DESJ (desj.expo.app).' : 'Cargando…'}</Text>
          )}
        </Card>
      ) : null}

      <Card>
        <Label style={{ color: C.accentSoft }}>Permisos</Label>
        <Row>
          <Text style={styles.label}>Notificaciones</Text>
          {notif ? (
            <Text style={[styles.value, { color: C.ok }]}>Activas</Text>
          ) : (
            <Pressable onPress={enableNotif} hitSlop={8} accessibilityRole="button">
              <Text style={[styles.value, { color: C.accentSoft }]}>Activar</Text>
            </Pressable>
          )}
        </Row>
        <Item label="Calendario del teléfono" value={calendarAvailable ? 'Disponible' : 'Solo en la app instalada'} />
      </Card>

      <Card>
        <Label style={{ color: C.accentSoft }}>Acerca de</Label>
        <Item label="Versión" value={Constants.expoConfig?.version ?? '—'} />
        <Text style={styles.note}>DESJ no diagnostica ni reemplaza a tu médico, abogado o asesor financiero.</Text>
      </Card>

      {session ? (
        <Pressable onPress={signOut} style={styles.out} accessibilityRole="button">
          <Text style={styles.outText}>Cerrar sesión</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <Row>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value} numberOfLines={1}>{value}</Text>
    </Row>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 12, width: '100%', maxWidth: 640, alignSelf: 'center' },
  label: { color: C.text, fontSize: 15 },
  value: { color: C.muted, fontSize: 14, flexShrink: 1, textAlign: 'right' },
  note: { color: C.muted, fontSize: 12.5, lineHeight: 18 },
  out: { minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: C.bad, alignItems: 'center', justifyContent: 'center' },
  outText: { color: C.bad, fontSize: 15, fontWeight: '700' },
});
