// Botón del ojo para ocultar o mostrar los montos (Finanzas, Inversiones).
import { Pressable, StyleSheet } from 'react-native';

import { IconEye, IconEyeOff } from '@/components/icons';
import { Text } from '@/components/text';
import { setAmountsHidden, useAmountsHidden } from '@/lib/privacy';
import { C, R } from '@/theme';

export function HideAmountsButton() {
  const hidden = useAmountsHidden();
  return (
    <Pressable
      onPress={() => setAmountsHidden(!hidden)}
      style={({ pressed }) => [styles.btn, pressed && { backgroundColor: C.surfaceSelected }]}
      accessibilityRole="switch"
      accessibilityState={{ checked: hidden }}
      accessibilityLabel={hidden ? 'Mostrar montos' : 'Ocultar montos'}>
      {hidden ? <IconEyeOff color={C.accentSoft} size={18} /> : <IconEye color={C.muted} size={18} />}
      <Text style={[styles.text, hidden && { color: C.accentSoft }]}>{hidden ? 'Mostrar' : 'Ocultar'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 12, borderRadius: R.control, borderWidth: 1, borderColor: C.cardBorder },
  text: { color: C.muted, fontSize: 13.5, fontWeight: '500' },
});
