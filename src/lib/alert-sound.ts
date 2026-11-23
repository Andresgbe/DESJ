// Sonido de alarma crítica tipo HUD ("JARVIS") que suena en segundo plano mientras DESJ da un aviso crítico.
// En web genera pulsos armónicos con Web Audio API (sin archivos externos) y en el teléfono acompaña con vibraciones de alerta.
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

type WebAudioWindow = {
  AudioContext?: new () => AudioContext;
  webkitAudioContext?: new () => AudioContext;
};

let stopCurrent: (() => void) | null = null;

/** Inicia la alarma de alerta crítica. Devuelve una función para detenerla cuando DESJ termina de hablar. */
export function startAlertSound(): () => void {
  stopAlertSound();
  let active = true;

  // Pulso háptico en el teléfono mientras dura la alerta.
  const hapticTimer = setInterval(() => {
    if (!active) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  }, 950);
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});

  let audioCtx: AudioContext | null = null;
  let beepTimer: ReturnType<typeof setInterval> | null = null;

  if (Platform.OS === 'web' && typeof globalThis !== 'undefined') {
    const w = globalThis as unknown as WebAudioWindow;
    const Ctx = w.AudioContext ?? w.webkitAudioContext;
    if (Ctx) {
      try {
        const ctx = new Ctx();
        audioCtx = ctx;
        if (ctx.state === 'suspended') void ctx.resume().catch(() => {});

        // Doble pulso HUD (tono alto → tono medio) cada 900 ms, a volumen moderado para que la voz de DESJ se escuche clara encima.
        const pulse = () => {
          if (!active || ctx.state === 'closed') return;
          const now = ctx.currentTime;
          const tone = (freq1: number, freq2: number, start: number, dur: number) => {
            const osc = ctx.createOscillator();
            const sub = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            sub.type = 'sine';
            osc.frequency.setValueAtTime(freq1, start);
            osc.frequency.exponentialRampToValueAtTime(freq2, start + dur);
            sub.frequency.setValueAtTime(freq1 * 0.5, start);
            sub.frequency.exponentialRampToValueAtTime(freq2 * 0.5, start + dur);

            gain.gain.setValueAtTime(0.0001, start);
            gain.gain.exponentialRampToValueAtTime(0.09, start + 0.025);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);

            osc.connect(gain);
            sub.connect(gain);
            gain.connect(ctx.destination);
            osc.start(start);
            sub.start(start);
            osc.stop(start + dur + 0.01);
            sub.stop(start + dur + 0.01);
          };
          tone(880, 660, now, 0.16);
          tone(980, 540, now + 0.2, 0.22);
        };

        pulse();
        beepTimer = setInterval(pulse, 900);
      } catch {
        // si el navegador bloquea el audio, continúa sin fallar
      }
    }
  }

  const stop = () => {
    if (!active) return;
    active = false;
    clearInterval(hapticTimer);
    if (beepTimer) clearInterval(beepTimer);
    if (audioCtx && audioCtx.state !== 'closed') {
      void audioCtx.close().catch(() => {});
    }
    if (stopCurrent === stop) stopCurrent = null;
  };

  stopCurrent = stop;
  return stop;
}

export function stopAlertSound() {
  stopCurrent?.();
}
