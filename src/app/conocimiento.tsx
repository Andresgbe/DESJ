// Pantalla · Conocimiento (desde el menú de perfil).
// Entrevista: DESJ pregunta y con cada respuesta reescribe tus archivos Markdown.
// Archivos: ver y editar a mano perfil.md, salud.md, negocios.md y preferencias.md.
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { Card, Label, Mono, Row } from '@/components/ui';
import { askDesj } from '@/lib/brain';
import { FILES, nextQuestion, QUESTIONS, Slug, useKnowledge } from '@/lib/knowledge';
import { C, mono } from '@/theme';

type Msg = { id: string; from: 'me' | 'desj'; text: string };

export default function Conocimiento() {
  const k = useKnowledge();
  const [tab, setTab] = useState<'entrevista' | 'archivos'>('entrevista');

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <View style={styles.wrap}>
        <Text style={styles.intro}>
          Lo que DESJ sabe de ti vive en estos archivos y los lee antes de cada respuesta. Solo tú los ves.
        </Text>
        <View style={styles.segment}>
          <Seg label="Entrevista" active={tab === 'entrevista'} onPress={() => setTab('entrevista')} />
          <Seg label="Archivos" active={tab === 'archivos'} onPress={() => setTab('archivos')} />
        </View>
        {!k.ready ? null : tab === 'entrevista' ? <Interview k={k} /> : <Files k={k} />}
      </View>
    </SafeAreaView>
  );
}

type K = ReturnType<typeof useKnowledge>;

function Interview({ k }: { k: K }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [questionId, setQuestionId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const list = useRef<FlatList<Msg>>(null);
  const started = useRef(false);

  const say = (text: string) => setMsgs((m) => [...m, { id: `${Date.now()}${m.length}`, from: 'desj', text }]);

  // Sin nube, la entrevista guiada arranca sola con la primera pregunta pendiente.
  useEffect(() => {
    if (k.cloud || started.current) return;
    started.current = true;
    const q = nextQuestion(k.docs, k.skipped);
    const intro = k.progress.answered
      ? `Ya tengo ${k.progress.answered} de ${k.progress.total} datos básicos. Sigamos.`
      : 'Te haré unas preguntas para conocerte. Responde con tus palabras; si no quieres responder alguna, escribe "saltar".';
    setMsgs([{ id: 'intro', from: 'desj', text: q ? `${intro}\n\n${q.ask}` : 'Ya tengo todo lo básico. Puedes revisar o editar tus archivos en la pestaña Archivos.' }]);
    setQuestionId(q?.id ?? null);
  }, [k.cloud, k.docs, k.skipped, k.progress]);

  const send = async (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || busy) return;
    setInput('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMsgs((m) => [...m, { id: `${Date.now()}`, from: 'me', text }]);

    if (!k.cloud) {
      if (!questionId) return say('Ya tengo todo lo básico. Si quieres cambiar algo, edítalo en Archivos.');
      const q = await k.answerLocal(questionId, text);
      setQuestionId(q?.id ?? null);
      return say(q ? q.ask : 'Listo, ya tengo lo básico. Gracias. Cuando DESJ esté conectado a Claude podrá profundizar más.');
    }

    setBusy(true);
    const res = await askDesj(text, conversationId, 'conocimiento');
    setBusy(false);
    if (!res.failed) setConversationId(res.conversationId);
    if (res.knowledgeChanged) k.reload();
    say(res.reply);
  };

  const skippedCount = k.skipped.length;

  return (
    <KeyboardAvoidingView style={{ flex: 1, gap: 8 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={100}>
      {!k.cloud ? (
        <Row>
          <Label>{`Básicos: ${k.progress.answered} de ${k.progress.total}`}</Label>
          {skippedCount && !questionId ? (
            <Pressable onPress={async () => { await k.resetSkipped(); started.current = false; setMsgs([]); }} hitSlop={8}>
              <Label style={{ color: C.accentSoft }}>{`Retomar ${skippedCount} saltadas`}</Label>
            </Pressable>
          ) : null}
        </Row>
      ) : null}
      <View style={styles.bar}>
        <View style={[styles.barFill, { width: `${(k.progress.answered / k.progress.total) * 100}%` }]} />
      </View>

      <FlatList
        ref={list}
        style={{ flex: 1 }}
        data={msgs}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ gap: 10, paddingVertical: 6 }}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          k.cloud ? (
            <Card>
              <Text style={styles.msg}>DESJ te hará preguntas una por una y actualizará tus archivos con cada respuesta.</Text>
              <Pressable onPress={() => send('Empecemos la entrevista.')} style={styles.start} accessibilityRole="button">
                <Text style={styles.startText}>Empezar entrevista</Text>
              </Pressable>
            </Card>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={item.from === 'me' ? styles.me : styles.bot}>
            <Text style={styles.msg}>{item.text}</Text>
          </View>
        )}
      />
      {busy ? <Label style={{ color: C.ok }}>● DESJ pensando…</Label> : null}

      <View style={styles.inputBar}>
        <TextInput
          value={input}
          onChangeText={setInput}
          onSubmitEditing={() => send()}
          placeholder={questionId ? QUESTIONS.find((q) => q.id === questionId)?.label : 'Responde a DESJ…'}
          placeholderTextColor={C.muted}
          style={styles.input}
          returnKeyType="send"
        />
        <Pressable onPress={() => send()} style={styles.send} accessibilityLabel="Enviar">
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={C.onAccent} strokeWidth={2.2} strokeLinecap="round">
            <Path d="M5 12h14" />
            <Path d="M13 6l6 6-6 6" />
          </Svg>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function Files({ k }: { k: K }) {
  const [editing, setEditing] = useState<Slug | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const startEdit = (slug: Slug) => {
    setEditing(slug);
    setDraft(k.docs[slug].content);
    setError(null);
  };

  const save = async () => {
    if (!editing) return;
    if (await k.saveDoc(editing, draft)) setEditing(null);
    else setError('No pude guardar. Revisa tu conexión.');
  };

  return (
    <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
      {FILES.map((f) => {
        const doc = k.docs[f.slug];
        const isEditing = editing === f.slug;
        return (
          <Card key={f.slug} glow={isEditing}>
            <Row>
              <View style={{ flex: 1 }}>
                <Mono style={{ color: C.accentSoft, fontSize: 13 }}>{`${f.slug}.md`}</Mono>
                <Text style={styles.hint}>{f.hint}</Text>
              </View>
              {!isEditing ? (
                <Pressable onPress={() => startEdit(f.slug)} style={styles.editBtn} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Editar ${f.slug}.md`}>
                  <Label style={{ color: C.accentSoft }}>Editar</Label>
                </Pressable>
              ) : null}
            </Row>

            {isEditing ? (
              <>
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  multiline
                  style={styles.editor}
                  placeholder={`# ${f.title}\n\n- **Campo:** valor`}
                  placeholderTextColor={C.muted}
                  autoCapitalize="sentences"
                  textAlignVertical="top"
                />
                {error ? <Text style={{ color: C.bad, fontSize: 13 }}>{error}</Text> : null}
                <Row>
                  <Pressable onPress={() => setEditing(null)} style={[styles.wide, styles.ghost]}><Text style={[styles.wideText, { color: C.muted }]}>Cancelar</Text></Pressable>
                  <Pressable onPress={save} style={[styles.wide, { backgroundColor: C.accent }]}><Text style={[styles.wideText, { color: C.onAccent }]}>Guardar</Text></Pressable>
                </Row>
              </>
            ) : doc.content ? (
              <Text style={styles.md}>{doc.content}</Text>
            ) : (
              <Text style={styles.hint}>Vacío. Llénalo con la entrevista o edítalo a mano.</Text>
            )}
            {doc.updatedAt && !isEditing ? <Label style={{ fontSize: 9.5 }}>{`Actualizado ${new Date(doc.updatedAt).toLocaleDateString('es-VE')}`}</Label> : null}
          </Card>
        );
      })}
    </ScrollView>
  );
}

function Seg({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.seg, active && { backgroundColor: C.accent }]} accessibilityRole="tab" accessibilityState={{ selected: active }}>
      <Text style={{ color: active ? C.onAccent : C.text, fontSize: 14, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  wrap: { flex: 1, padding: 16, gap: 12, width: '100%', maxWidth: 640, alignSelf: 'center' },
  intro: { color: C.muted, fontSize: 13.5, lineHeight: 19 },
  segment: { flexDirection: 'row', gap: 6 },
  seg: { flex: 1, minHeight: 40, borderRadius: 10, borderWidth: 1, borderColor: C.cardBorder, alignItems: 'center', justifyContent: 'center' },
  bar: { height: 3, borderRadius: 2, backgroundColor: C.cardBorder, overflow: 'hidden' },
  barFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: C.accent },
  me: { alignSelf: 'flex-end', maxWidth: '82%', backgroundColor: C.bubbleMe, borderRadius: 16, borderBottomRightRadius: 4, padding: 12 },
  bot: { alignSelf: 'flex-start', maxWidth: '86%', backgroundColor: C.surfaceInput, borderColor: C.cardBorder, borderWidth: 1, borderRadius: 16, borderBottomLeftRadius: 4, padding: 12 },
  msg: { color: C.text, fontSize: 15, lineHeight: 21 },
  start: { minHeight: 46, borderRadius: 14, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  startText: { color: C.onAccent, fontSize: 15, fontWeight: '700' },
  inputBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surfaceInput, borderColor: C.cardBorder, borderWidth: 1, borderRadius: 28, paddingLeft: 16, padding: 6 },
  input: { flex: 1, color: C.text, fontSize: 15, minHeight: 40 },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  hint: { color: C.muted, fontSize: 12.5 },
  editBtn: { minHeight: 34, paddingHorizontal: 10, justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: C.cardBorder },
  md: { color: C.text, fontFamily: mono, fontSize: 12.5, lineHeight: 19 },
  editor: { color: C.text, fontFamily: mono, fontSize: 13, lineHeight: 19, minHeight: 200, borderWidth: 1, borderColor: C.cardBorder, borderRadius: 12, padding: 12, backgroundColor: C.surfaceSunken },
  wide: { flex: 1, minHeight: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  wideText: { fontSize: 14.5, fontWeight: '700' },
  ghost: { borderWidth: 1, borderColor: C.cardBorder },
});
