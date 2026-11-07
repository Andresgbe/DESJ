// Módulos · Universidad · Materia: cómo va (acumulado sobre 20 y cuánto falta para aprobar), plan de evaluación
// con notas, las 15 semanas de clases (plegadas) y los links de la materia. Editar o borrar la materia al final.
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Btn } from '@/components/form';
import { Label, Row, Screen, Title } from '@/components/ui';
import { EvaluationPlan, LinkGrid, SubjectForm, Weeks } from '@/components/university';
import { confirm, notify } from '@/lib/confirm';
import { useModules } from '@/lib/modules';
import { useUniversity } from '@/lib/university';
import { C } from '@/theme';

export default function Materia() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { modules, reload: reloadModules } = useModules();
  const mod = modules.find((m) => m.kind === 'universidad');
  const uni = useUniversity(mod?.id);
  const { reload } = uni;
  const [editing, setEditing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void reloadModules();
      reload().catch((e: Error) => notify(e.message));
    }, [reloadModules, reload]),
  );

  const subject = uni.data.uni_subjects.find((s) => s.id === id);
  if (!subject) {
    return (
      <Screen module="Universidad · Materia" back>
        <Text style={styles.caption}>{uni.ready ? 'Esta materia ya no existe.' : 'Cargando…'}</Text>
      </Screen>
    );
  }

  const evals = uni.data.uni_evaluations.filter((e) => e.subject_id === id).sort((a, b) => a.position - b.position || (a.due_on ?? '').localeCompare(b.due_on ?? ''));
  const classes = uni.data.uni_classes.filter((c) => c.subject_id === id);
  const links = uni.data.uni_links.filter((l) => l.subject_id === id);

  const removeSubject = async () => {
    if (!(await confirm('Borrar materia', `¿Borrar "${subject.name}" con su plan, notas y clases? No se puede deshacer.`, 'Borrar'))) return;
    await uni.remove({ uni_subjects: [subject.id], uni_evaluations: evals.map((e) => e.id), uni_classes: classes.map((c) => c.id) });
    router.back();
  };

  return (
    <Screen module="Universidad · Materia" back>
      <View style={{ gap: 4 }}>
        <Row style={{ justifyContent: 'flex-start', gap: 8 }}>
          <View style={[styles.dot, { backgroundColor: subject.color }]} />
          <Label>{subject.professor || 'Materia'}</Label>
        </Row>
        <Title>{subject.name}</Title>
      </View>

      <EvaluationPlan
        evals={evals}
        onAdd={async (e) => Boolean(await uni.insert('uni_evaluations', { ...e, subject_id: subject.id, position: evals.length }))}
        onUpdate={(eid, e) => uni.update('uni_evaluations', eid, e)}
        onRemove={(eid) => uni.remove({ uni_evaluations: [eid] })}
      />

      <Weeks classes={classes} onAdd={async (c) => Boolean(await uni.insert('uni_classes', { ...c, subject_id: subject.id }))} onRemove={(cid) => uni.remove({ uni_classes: [cid] })} />

      <LinkGrid
        links={links}
        subjects={uni.data.uni_subjects}
        defaultSubject={subject.id}
        onAdd={async (l) => Boolean(await uni.insert('uni_links', { ...l, position: uni.data.uni_links.length }))}
        onRemove={(lid) => uni.remove({ uni_links: [lid] })}
        onReorder={(ids) => uni.updateMany('uni_links', ids.map((lid, position) => ({ id: lid, patch: { position } })))}
      />

      {editing ? (
        <SubjectForm
          initial={subject}
          onCancel={() => setEditing(false)}
          onSave={async (s) => {
            const ok = await uni.update('uni_subjects', subject.id, s);
            if (ok) setEditing(false);
            return ok;
          }}
        />
      ) : (
        <Row>
          <Btn label="Editar materia" kind="outline" onPress={() => setEditing(true)} />
          <Btn label="Borrar" kind="danger" onPress={removeSubject} />
        </Row>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  caption: { color: C.muted, fontSize: 12.5, lineHeight: 18 },
  dot: { width: 12, height: 12, borderRadius: 6 },
});
