// Módulo 03 · YO: tu información personal alrededor de una armadura holográfica que gira, y la
// entrada a tus módulos personales (Salud, Plan físico, Tus datos). Los datos salen de tus archivos
// de conocimiento (perfil.md, salud.md) y de tus pastillas; lo que falta se muestra "[pendiente]".
import { router, useFocusEffect, type Href } from "expo-router";
import { useCallback, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { IconChevron } from "@/components/icons";
import { SUIT_RATIO, SuitCore } from "@/components/suit-core";
import { Label, Screen, Title } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import {
  ageFrom,
  firstName,
  numberIn,
  readField,
  useKnowledge,
} from "@/lib/knowledge";
import { today, useStore } from "@/lib/store";
import { C, mono, S } from "@/theme";

const STAT_W = 86;

/** Talla en metros a partir de "1,78 m", "178 cm" o "178". */
function meters(text: string | null) {
  const n = numberIn(text);
  if (!n) return null;
  return n < 3 ? n : n / 100;
}

export default function Yo() {
  const { name: accountName } = useAuth();
  const knowledge = useKnowledge();
  const { docs } = knowledge;
  const { meds, taken } = useStore();
  const { width, height } = useWindowDimensions();

  // La armadura se pausa cuando YO no está a la vista; los datos se releen al volver.
  const [focused, setFocused] = useState(true);
  const reload = knowledge.reload;
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      void reload();
      return () => setFocused(false);
    }, [reload]),
  );

  const name = firstName(docs) || accountName;
  const tallaText = readField(docs, ["Talla", "Altura", "Estatura"]);
  const pesoText = readField(docs, ["Peso"]);
  const talla = meters(tallaText);
  const peso = numberIn(pesoText);
  const imc = talla && peso ? peso / (talla * talla) : null;
  const edad =
    ageFrom(readField(docs, ["Fecha de nacimiento", "Nacimiento"])) ??
    numberIn(readField(docs, ["Edad"]));
  const sangre = readField(docs, ["Tipo de sangre", "Sangre"]);
  const tomadas = meds.filter((m) =>
    (taken[today()] ?? []).includes(m.id),
  ).length;

  // La figura ocupa el centro entre las dos columnas de datos, sin pasar de la mitad del alto.
  const column = Math.min(width, S.column) - S.pad * 2;
  const figW = Math.min(column - STAT_W * 2 - S.gap * 2, 300);
  const figH = Math.round(Math.min(figW / SUIT_RATIO, height * 0.5));

  return (
    <Screen module="Módulo 03 · Yo">
      <View style={{ gap: 2 }}>
        <Label>Sistema personal · DESJ</Label>
        <Title accent="ECOSISTEMA">
          {name ? name.toUpperCase() : "Tu perfil"}
        </Title>
      </View>

      <View style={styles.hero}>
        <View style={styles.col}>
          <Stat
            label="Altura"
            value={talla ? talla.toFixed(2).replace(".", ",") : null}
            unit="metros"
          />
          <Stat
            label="Peso"
            value={peso ? String(peso).replace(".", ",") : null}
            unit="kg"
          />
          <Stat
            label="IMC"
            value={imc ? imc.toFixed(1).replace(".", ",") : null}
            unit="kg/m²"
          />
        </View>

        <View
          style={{ alignItems: "center" }}
          accessible
          accessibilityRole="image"
          accessibilityLabel="Armadura holográfica de DESJ girando"
        >
          <SuitCore height={figH} active={focused} />
          <Label style={styles.platform}>Configuración personal</Label>
        </View>

        <View style={[styles.col, { alignItems: "flex-end" }]}>
          <Stat
            label="Edad"
            value={edad !== null ? String(edad) : null}
            unit="años"
            right
          />
          <Stat label="Sangre" value={sangre} unit="tipo" right />
          <Stat
            label="Pastillas"
            value={meds.length ? `${tomadas}/${meds.length}` : null}
            unit="hoy"
            right
          />
        </View>
      </View>

      <Label style={{ marginTop: 4 }}>Módulos personales</Label>
      <ModuleRow
        tag="03.1"
        title="Salud"
        sub={
          meds.length
            ? `${tomadas} de ${meds.length} pastillas tomadas hoy · recordatorios`
            : "Pastillas, dosis y recordatorios"
        }
        href="/yo/salud"
      />
      <ModuleRow
        tag="03.2"
        title="Plan físico"
        sub="Objetivo, rutina y avance"
        href="/yo/plan-fisico"
      />
      <ModuleRow
        tag="03.3"
        title="Tus datos"
        sub="Altura, peso y todo lo que DESJ sabe de ti"
        href="/conocimiento"
      />
    </Screen>
  );
}

function Stat({
  label,
  value,
  unit,
  right,
}: {
  label: string;
  value: string | null;
  unit: string;
  right?: boolean;
}) {
  const align = right ? "right" : "left";
  return (
    <View style={styles.stat}>
      <Label style={{ textAlign: align }}>{label}</Label>
      <Text
        style={[styles.value, { textAlign: align }, !value && styles.missing]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value ?? "—"}
      </Text>
      <Text style={[styles.unit, { textAlign: align }]} numberOfLines={1}>
        {value ? unit : "[pendiente]"}
      </Text>
    </View>
  );
}

function ModuleRow({
  tag,
  title,
  sub,
  href,
}: {
  tag: string;
  title: string;
  sub: string;
  href: Href;
}) {
  return (
    <Pressable
      onPress={() => router.push(href)}
      style={({ pressed }) => [
        styles.module,
        pressed && { backgroundColor: C.surfaceSelected },
      ]}
      accessibilityRole="button"
    >
      <Text style={styles.tag}>{tag}</Text>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.moduleTitle}>{title}</Text>
        <Text style={styles.unit}>{sub}</Text>
      </View>
      <IconChevron color={C.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: S.gap,
  },
  col: { width: STAT_W, gap: 22 },
  stat: { gap: 2 },
  value: { fontFamily: mono, fontSize: 24, fontWeight: "600", color: C.text },
  missing: { color: C.textFaint },
  unit: { color: C.muted, fontSize: 12.5 },
  platform: { marginTop: 4, color: C.accentSoft, fontSize: 9.5 },
  module: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 64,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.cardBorder,
    backgroundColor: C.card,
  },
  tag: {
    fontFamily: mono,
    fontSize: 11,
    letterSpacing: 1.5,
    color: C.accentSoft,
    width: 38,
  },
  moduleTitle: { color: C.text, fontSize: 15, fontWeight: "600" },
});
