// Módulos · Universidad: links rápidos arriba (con el logo de cada sitio) y la lista de materias con cómo va
// cada una. Cada materia abre su detalle (plan de evaluación, notas, 15 semanas de clases y sus links).
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { Btn } from '@/components/form';
import { IconPlus } from '@/components/icons';
import { ModuleIcon } from '@/components/modules';
import { Card, Label, Row, Screen, Title } from '@/components/ui';
import { LinkGrid, SubjectCard, SubjectForm } from '@/components/university';
import { useModules } from '@/lib/modules';
import { useUniversity } from '@/lib/university';
import { C, R } from '@/theme';

export default function Universidad() {
  const { ready: modulesReady, modules, reload: reloadModules } = useModules();
  const mod = modules.find((m) => m.kind === 'universidad');
  const uni = useUniversity(mod?.id);
  const { reload } = uni;
  const [adding, setAdding] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void reloadModules();
      reload()
        .then(() => setLoadError(null))
        .catch((e: Error) => setLoadError(e.message));
    }, [reloadModules, reload]),
  );

  if (!mod || !uni.ready) {
    return (
      <Screen module="Módulos · Universidad" back>
        <Text style={styles.caption}>{loadError ?? (modulesReady && !mod ? 'Este módulo ya no existe. Agrégalo desde el catálogo de Módulos.' : 'Cargando…')}</Text>
      </Screen>
    );
  }

  const { uni_subjects: subjects, uni_evaluations: evals, uni_links: links } = uni.data;

  return (
    <Screen module="Módulos · Universidad" back>
      <Row style={{ justifyContent: 'flex-start' }}>
        <View style={styles.icon}>
          <ModuleIcon kind="universidad" color={C.accentSoft} size={24} />
        </View>
        <View style={{ gap: 2, flex: 1 }}>
          <Label>Materias, notas y clases</Label>
          <Title accent="universidad">Tu</Title>
        </View>
      </Row>

      <LinkGrid
        links={links}
        subjects={subjects}
        onAdd={async (l) => Boolean(await uni.insert('uni_links', { ...l, position: links.length }))}
        onRemove={(id) => uni.remove({ uni_links: [id] })}
        onReorder={(ids) => uni.updateMany('uni_links', ids.map((id, position) => ({ id, patch: { position } })))}
      />

      <Label style={{ color: C.accentSoft, marginTop: 4 }}>{`Materias (${subjects.length})`}</Label>
      {subjects.length === 0 && !adding ? (
        <Card>
          <Text style={styles.body}>Agrega tus materias. En cada una cargas el plan de evaluación, tus notas y lo que vieron en cada clase.</Text>
        </Card>
      ) : null}
      {subjects.map((s) => (
        <SubjectCard key={s.id} subject={s} evals={evals.filter((e) => e.subject_id === s.id)} onPress={() => router.push({ pathname: '/modulos/materia/[id]', params: { id: s.id } })} />
      ))}
      {adding ? (
        <SubjectForm
          onCancel={() => setAdding(false)}
          onSave={async (s) => {
            const ok = Boolean(await uni.insert('uni_subjects', { ...s, position: subjects.length }));
            if (ok) setAdding(false);
            return ok;
          }}
        />
      ) : (
        <Btn label="Agregar materia" kind="outline" icon={<IconPlus color={C.chipText} />} onPress={() => setAdding(true)} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { color: C.text, fontSize: 14.5, lineHeight: 20 },
  caption: { color: C.muted, fontSize: 12.5, lineHeight: 18 },
  icon: { width: 48, height: 48, borderRadius: R.card, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surfaceInput },
});
