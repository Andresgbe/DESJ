// Controles de formulario de los módulos (Salud, Mis datos): campo con etiqueta, selector de opciones
// y botones. Mismo estilo que el resto: campos en surface-sunken dentro de una Card, acción principal en accent.
import { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';

import { Label } from '@/components/ui';
import { C, R } from '@/theme';

export function Field({ label, hint, ...input }: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Label>{label}</Label>
      <TextInput
        placeholderTextColor={C.muted}
        {...input}
        style={[styles.input, input.multiline && styles.multiline, input.style]}
        accessibilityLabel={label}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

/** Opciones excluyentes en chips (tipo de examen, tipo de contacto, pestañas de un módulo). */
export function Choice<T extends string>({ options, value, onChange, label }: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void; label?: string }) {
  return (
    <View style={{ gap: 6 }}>
      {label ? <Label>{label}</Label> : null}
      <View style={styles.choices} accessibilityRole="radiogroup">
        {options.map((o) => {
          const on = o.id === value;
          return (
            <Pressable
              key={o.id}
              onPress={() => onChange(o.id)}
              style={[styles.choice, on && styles.choiceOn]}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}>
              <Text style={[styles.choiceText, on && { color: C.text }]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

type BtnKind = 'primary' | 'outline' | 'ghost' | 'danger';

export function Btn({ label, onPress, kind = 'primary', disabled, icon, style }: { label: string; onPress: () => void; kind?: BtnKind; disabled?: boolean; icon?: ReactNode; style?: ViewStyle }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.btn, styles[kind], pressed && { opacity: 0.8 }, disabled && { opacity: 0.5 }, style]}
      accessibilityRole="button"
      accessibilityState={{ disabled }}>
      {icon}
      <Text style={[styles.btnText, { color: kind === 'primary' ? C.onAccent : kind === 'danger' ? C.bad : kind === 'ghost' ? C.muted : C.chipText }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  input: { color: C.text, fontSize: 15, borderWidth: 1, borderColor: C.cardBorder, borderRadius: R.field, paddingHorizontal: 12, paddingVertical: 10, minHeight: 44, backgroundColor: C.surfaceSunken },
  multiline: { minHeight: 88, textAlignVertical: 'top' },
  hint: { color: C.muted, fontSize: 12 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { minHeight: 44, paddingHorizontal: 14, borderRadius: R.pill, borderWidth: 1, borderColor: C.cardBorder, backgroundColor: C.surfaceInput, alignItems: 'center', justifyContent: 'center' },
  choiceOn: { borderColor: C.accent, backgroundColor: C.surfaceSelected },
  choiceText: { color: C.chipText, fontSize: 14, fontWeight: '600' },
  btn: { flexGrow: 1, minHeight: 48, borderRadius: R.button, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  primary: { backgroundColor: C.accent },
  outline: { borderWidth: 1, borderColor: C.border, backgroundColor: C.surfaceInput },
  ghost: { borderWidth: 1, borderColor: C.cardBorder },
  danger: { borderWidth: 1, borderColor: C.cardBorder },
  btnText: { fontSize: 14, fontWeight: '700' },
});
