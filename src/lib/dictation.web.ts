// Dictado en la web: voz → texto con el reconocimiento de voz del navegador (Safari en iPhone, Chrome).
// Misma interfaz que dictation.ts (la versión nativa con expo-speech-recognition).
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

const Ctor: (new () => Recognition) | undefined =
  typeof window === 'undefined'
    ? undefined
    : ((window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition);

export const dictationAvailable = Boolean(Ctor);

type Handlers = {
  /** Texto reconocido hasta ahora (se actualiza mientras hablas). */
  onText: (text: string) => void;
  onEnd: () => void;
  onError: (message: string) => void;
  /** false: termina solo cuando haces una pausa (conversación por voz). Por defecto sigue hasta que la detengas. */
  continuous?: boolean;
};

/** Empieza a escuchar. Devuelve una función para detener, o null si el navegador no tiene dictado. */
export async function startDictation({ onText, onEnd, onError, continuous = true }: Handlers): Promise<(() => void) | null> {
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = 'es-ES';
  rec.continuous = continuous;
  rec.interimResults = true;
  rec.onresult = (e) => {
    let text = '';
    for (let i = 0; i < e.results.length; i++) text += e.results[i][0]?.transcript ?? '';
    onText(text.trim());
  };
  rec.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') onError('Necesito permiso de micrófono. Actívalo en la configuración del navegador.');
    else if (e.error !== 'aborted' && e.error !== 'no-speech') onError('No te entendí. Intenta de nuevo.');
  };
  rec.onend = onEnd;
  try {
    rec.start();
  } catch {
    onError('No pude abrir el micrófono. Intenta de nuevo.');
    return null;
  }
  return () => rec.stop();
}
