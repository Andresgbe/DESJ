// Dictado: voz → texto en el propio teléfono (iOS Speech / Google en Android). Gratis y sin enviar audio a terceros.
// expo-speech-recognition no viene en Expo Go: ahí queda "no disponible" y se sugiere el micrófono del teclado.
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

export const dictationAvailable = Platform.OS !== 'web' && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

// Carga diferida: en Expo Go el módulo nativo no existe.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const lib = () => require('expo-speech-recognition') as typeof import('expo-speech-recognition');

type Handlers = {
  /** Texto reconocido hasta ahora (se actualiza mientras hablas). */
  onText: (text: string) => void;
  onEnd: () => void;
  onError: (message: string) => void;
};

/** Empieza a escuchar. Devuelve una función para detener, o null si no hay permiso o no está disponible. */
export async function startDictation({ onText, onEnd, onError }: Handlers): Promise<(() => void) | null> {
  if (!dictationAvailable) return null;
  const { ExpoSpeechRecognitionModule: Speech } = lib();
  const perm = await Speech.requestPermissionsAsync();
  if (!perm.granted) {
    onError('Necesito permiso de micrófono y reconocimiento de voz. Actívalo en Ajustes › DESJ.');
    return null;
  }

  const subs = [
    Speech.addListener('result', (e) => onText(e.results[0]?.transcript ?? '')),
    Speech.addListener('error', (e) => {
      if (e.error !== 'aborted' && e.error !== 'no-speech') onError('No te entendí. Intenta de nuevo.');
    }),
    Speech.addListener('end', () => {
      subs.forEach((s) => s.remove());
      onEnd();
    }),
  ];

  Speech.start({ lang: 'es-ES', interimResults: true, continuous: true, addsPunctuation: true });
  return () => Speech.stop();
}
