// YO · Salud · Examen: detalle de un examen, sus archivos (ver, agregar, quitar), editar y borrar.
import * as WebBrowser from 'expo-web-browser';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Btn } from '@/components/form';
import { ExamForm, FileLine, FilePicker } from '@/components/health';
import { Card, Label, Row, Screen, Title } from '@/components/ui';
import { confirm, notify } from '@/lib/confirm';
import { EXAM_KINDS, ExamFile, formatDate, since, useHealth } from '@/lib/health';
import { C } from '@/theme';

export default function ExamDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { exams, ready, cloud, reload, saveExam, removeExam, addFile, removeFile, fileUrl } = useHealth();
  const [editing, setEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const exam = exams.find((e) => e.id === id);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  if (!exam) {
    return (
      <Screen module="Salud · Examen" back>
        <Text style={styles.caption}>{ready ? 'Este examen ya no existe.' : 'Cargando…'}</Text>
      </Screen>
    );
  }

  const open = async (f: ExamFile) => {
    const url = await fileUrl(f);
    if (!url) return notify('No pude abrir el archivo. Revisa tu conexión.');
    await WebBrowser.openBrowserAsync(url);
  };

  const removeOne = async (f: ExamFile) => {
    if (await confirm('Quitar archivo', `¿Quitar "${f.name}" de este examen?`, 'Quitar')) void removeFile(f);
  };

  const removeAll = async () => {
    if (!(await confirm('Borrar examen', `¿Borrar "${exam.title}" y sus archivos? No se puede deshacer.`, 'Borrar'))) return;
    await removeExam(exam.id);
    router.back();
  };

  const kind = EXAM_KINDS.find((k) => k.id === exam.kind)?.label ?? '';

  return (
    <Screen module="Salud · Examen" back>
      <View style={{ gap: 4 }}>
        <Label>{`${kind} · ${formatDate(exam.date)} · ${since(exam.date)}`}</Label>
        <Title>{exam.title}</Title>
      </View>

      {editing ? (
        <ExamForm
          initial={exam}
          onCancel={() => setEditing(false)}
          onSave={async (input) => {
            if (await saveExam(input, exam.id)) setEditing(false);
            else notify('No pude guardar los cambios. Revisa tu conexión e intenta de nuevo.');
          }}
        />
      ) : (
        <Card>
          <Item label="Clínica o laboratorio" value={exam.place} />
          <Item label="Doctor" value={exam.doctor} />
          <Item label="Resultados" value={exam.results} hint="Pídele a DESJ en el chat que lea el archivo y los anote." />
          {exam.notes ? <Item label="Notas" value={exam.notes} /> : null}
        </Card>
      )}

      {cloud ? (
        <View style={{ gap: 8 }}>
          <Label>Archivos</Label>
          {exam.files.length === 0 ? <Text style={styles.caption}>Sin archivos. Agrega la foto o el PDF del examen.</Text> : null}
          {exam.files.map((f) => (
            <FileLine key={f.id} name={f.name} onPress={() => open(f)} onRemove={() => removeOne(f)} />
          ))}
          <FilePicker
            disabled={uploading}
            onPick={async (a) => {
              setUploading(true);
              try {
                await addFile(exam.id, a);
              } catch (e) {
                notify(e instanceof Error ? e.message : 'No pude subir el archivo.');
              } finally {
                setUploading(false);
              }
            }}
          />
          {uploading ? <Text style={styles.caption}>Subiendo…</Text> : null}
        </View>
      ) : (
        <Text style={styles.caption}>Para guardar archivos necesitas iniciar sesión (nube).</Text>
      )}

      <Card>
        <Label>Pregúntale a DESJ</Label>
        <Text style={styles.caption}>
          {`"Lee mi examen de ${exam.title} y anota los resultados" o "¿cómo ha cambiado mi colesterol?". DESJ ordena y compara con rangos de referencia; no diagnostica.`}
        </Text>
      </Card>

      {!editing ? (
        <Row>
          <Btn label="Editar" kind="outline" onPress={() => setEditing(true)} />
          <Btn label="Borrar examen" kind="danger" onPress={removeAll} />
        </Row>
      ) : null}
    </Screen>
  );
}

function Item({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <View style={{ gap: 4 }}>
      <Label>{label}</Label>
      <Text style={value ? styles.value : styles.missing} selectable>
        {value || '[pendiente]'}
      </Text>
      {!value && hint ? <Text style={styles.caption}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  value: { color: C.text, fontSize: 15, lineHeight: 21 },
  missing: { color: C.muted, fontSize: 15 },
  caption: { color: C.muted, fontSize: 12.5, lineHeight: 18 },
});
