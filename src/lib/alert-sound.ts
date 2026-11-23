// Banda sonora y alarma cinematográfica de alerta roja estilo "JARVIS / Hans Zimmer" mientras DESJ da un aviso crítico.
// Combina 4 capas con Web Audio API (sin archivos externos):
// 1. Sub-bass cinematográfico pulsante (Re menor: D1/D2 con filtro paso-bajo).
// 2. Pulso rítmico ostinato de tensión (arpegio oscuro D3-F3-A3-Bb3-A3-F3 a 16avos).
// 3. Sirena orquestal/sci-fi suave (barrido filtrado con eco estéreo) que no tapa la voz de DESJ.
// 4. Telemetría HUD (micro-chirps cristalinos de escaneo de emergencia).
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

type WebAudioWindow = {
  AudioContext?: new () => AudioContext;
  webkitAudioContext?: new () => AudioContext;
};

let stopCurrent: (() => void) | null = null;

// Notas en Hz (tonalidad de Re menor: tensa, grave y cinematográfica).
const D1 = 36.71;
const D2 = 73.42;
const A2 = 110.0;
const Bb2 = 116.54;
const D3 = 146.83;
const F3 = 174.61;
const A3 = 220.0;
const Bb3 = 233.08;
const D5 = 587.33;
const A5 = 880.0;
const F5 = 698.46;

const OSTINATO = [D3, F3, A3, D3, Bb3, A3, F3, A2];

/** Inicia la música y alarma de alerta crítica. Devuelve una función para detenerla con un fade-out suave cuando DESJ termina de hablar. */
export function startAlertSound(): () => void {
  stopAlertSound();
  let active = true;

  // Pulso háptico rítmico en el teléfono al compás del bajo.
  const hapticTimer = setInterval(() => {
    if (!active) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  }, 1200);
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});

  let audioCtx: AudioContext | null = null;
  let stepTimer: ReturnType<typeof setInterval> | null = null;
  let masterGain: GainNode | null = null;

  if (Platform.OS === 'web' && typeof globalThis !== 'undefined') {
    const w = globalThis as unknown as WebAudioWindow;
    const Ctx = w.AudioContext ?? w.webkitAudioContext;
    if (Ctx) {
      try {
        const ctx = new Ctx();
        audioCtx = ctx;
        if (ctx.state === 'suspended') void ctx.resume().catch(() => {});

        // Canal maestro con compresor suave y eco espacial (delay con filtro) para que suene a sala de control.
        const master = ctx.createGain();
        master.gain.setValueAtTime(0.001, ctx.currentTime);
        master.gain.exponentialRampToValueAtTime(0.42, ctx.currentTime + 0.18);
        masterGain = master;

        const comp = ctx.createDynamicsCompressor();
        comp.threshold.setValueAtTime(-18, ctx.currentTime);
        comp.ratio.setValueAtTime(4, ctx.currentTime);
        comp.connect(ctx.destination);
        master.connect(comp);

        // Eco espacial para la sirena y los tonos HUD.
        const delay = ctx.createDelay();
        delay.delayTime.setValueAtTime(0.225, ctx.currentTime);
        const feedback = ctx.createGain();
        feedback.gain.setValueAtTime(0.32, ctx.currentTime);
        const delayFilter = ctx.createBiquadFilter();
        delayFilter.type = 'lowpass';
        delayFilter.frequency.setValueAtTime(1600, ctx.currentTime);
        delay.connect(delayFilter);
        delayFilter.connect(feedback);
        feedback.connect(delay);
        delayFilter.connect(master);

        // 1) Drone continuo grave (cama armónica de tensión en Re menor).
        const droneOsc1 = ctx.createOscillator();
        const droneOsc2 = ctx.createOscillator();
        const droneFilter = ctx.createBiquadFilter();
        const droneGain = ctx.createGain();
        droneOsc1.type = 'sawtooth';
        droneOsc2.type = 'triangle';
        droneOsc1.frequency.setValueAtTime(D2, ctx.currentTime);
        droneOsc2.frequency.setValueAtTime(D1, ctx.currentTime);
        droneOsc1.detune.setValueAtTime(-8, ctx.currentTime);
        droneFilter.type = 'lowpass';
        droneFilter.frequency.setValueAtTime(190, ctx.currentTime);
        droneGain.gain.setValueAtTime(0.16, ctx.currentTime);
        droneOsc1.connect(droneFilter);
        droneOsc2.connect(droneFilter);
        droneFilter.connect(droneGain);
        droneGain.connect(master);
        droneOsc1.start();
        droneOsc2.start();

        // Secuenciador por pasos (1 paso = 150 ms → 100 BPM en semicorcheas).
        let step = 0;
        const tick = () => {
          if (!active || ctx.state === 'closed') return;
          const now = ctx.currentTime;

          // 2) Ostinato cinematográfico (cada paso de 150 ms).
          const note = OSTINATO[step % OSTINATO.length];
          const pulseOsc = ctx.createOscillator();
          const pulseFilter = ctx.createBiquadFilter();
          const pulseGain = ctx.createGain();
          pulseOsc.type = 'sawtooth';
          pulseOsc.frequency.setValueAtTime(note, now);
          pulseFilter.type = 'lowpass';
          const accent = step % 4 === 0;
          pulseFilter.frequency.setValueAtTime(accent ? 780 : 460, now);
          pulseFilter.frequency.exponentialRampToValueAtTime(160, now + 0.13);
          pulseGain.gain.setValueAtTime(0.0001, now);
          pulseGain.gain.exponentialRampToValueAtTime(accent ? 0.14 : 0.08, now + 0.015);
          pulseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
          pulseOsc.connect(pulseFilter);
          pulseFilter.connect(pulseGain);
          pulseGain.connect(master);
          pulseOsc.start(now);
          pulseOsc.stop(now + 0.15);

          // 3) Impacto de bajo ("braaam" corto) cada 8 pasos (1.2 s) + barrido de sirena sci-fi filtrada.
          if (step % 8 === 0) {
            const root = step % 16 === 0 ? D2 : Bb2 * 0.5;
            const sub = ctx.createOscillator();
            const subGain = ctx.createGain();
            sub.type = 'sine';
            sub.frequency.setValueAtTime(root * 1.35, now);
            sub.frequency.exponentialRampToValueAtTime(root, now + 0.12);
            subGain.gain.setValueAtTime(0.0001, now);
            subGain.gain.exponentialRampToValueAtTime(0.26, now + 0.02);
            subGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
            sub.connect(subGain);
            subGain.connect(master);
            sub.start(now);
            sub.stop(now + 0.58);

            // Sirena sci-fi cálida (filtrada debajo de los 1.4 kHz para dejar libre la voz de DESJ).
            const siren1 = ctx.createOscillator();
            const siren2 = ctx.createOscillator();
            const sirenFilter = ctx.createBiquadFilter();
            const sirenGain = ctx.createGain();
            siren1.type = 'sawtooth';
            siren2.type = 'triangle';
            siren1.detune.setValueAtTime(10, now);
            siren2.detune.setValueAtTime(-10, now);
            siren1.frequency.setValueAtTime(A3, now);
            siren1.frequency.exponentialRampToValueAtTime(F5, now + 0.35);
            siren1.frequency.exponentialRampToValueAtTime(D3 * 2, now + 0.85);
            siren2.frequency.setValueAtTime(A3 * 0.5, now);
            siren2.frequency.exponentialRampToValueAtTime(F5 * 0.5, now + 0.35);
            siren2.frequency.exponentialRampToValueAtTime(D3, now + 0.85);

            sirenFilter.type = 'bandpass';
            sirenFilter.frequency.setValueAtTime(720, now);
            sirenFilter.Q.setValueAtTime(2.2, now);

            sirenGain.gain.setValueAtTime(0.0001, now);
            sirenGain.gain.exponentialRampToValueAtTime(0.11, now + 0.12);
            sirenGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.88);

            siren1.connect(sirenFilter);
            siren2.connect(sirenFilter);
            sirenFilter.connect(sirenGain);
            sirenGain.connect(master);
            sirenGain.connect(delay);
            siren1.start(now);
            siren2.start(now);
            siren1.stop(now + 0.9);
            siren2.stop(now + 0.9);
          }

          // 4) Telemetría HUD: doble ping cristalino en el contratiempo (paso 4 y 12).
          if (step % 8 === 4) {
            const ping = (freq: number, offset: number) => {
              const osc = ctx.createOscillator();
              const g = ctx.createGain();
              osc.type = 'sine';
              osc.frequency.setValueAtTime(freq, now + offset);
              g.gain.setValueAtTime(0.0001, now + offset);
              g.gain.exponentialRampToValueAtTime(0.06, now + offset + 0.008);
              g.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.09);
              osc.connect(g);
              g.connect(master);
              g.connect(delay);
              osc.start(now + offset);
              osc.stop(now + offset + 0.1);
            };
            ping(A5, 0);
            ping(D5, 0.09);
          }

          step += 1;
        };

        tick();
        stepTimer = setInterval(tick, 150);
      } catch {
        // si el navegador bloquea el audio, continúa sin fallar
      }
    }
  }

  const stop = () => {
    if (!active) return;
    active = false;
    clearInterval(hapticTimer);
    if (stepTimer) clearInterval(stepTimer);
    if (audioCtx && audioCtx.state !== 'closed') {
      const ctx = audioCtx;
      if (masterGain) {
        try {
          const now = ctx.currentTime;
          masterGain.gain.cancelScheduledValues(now);
          masterGain.gain.setValueAtTime(Math.max(0.001, masterGain.gain.value), now);
          masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
        } catch {
          // ignorar si ya cerró
        }
      }
      setTimeout(() => {
        if (ctx.state !== 'closed') void ctx.close().catch(() => {});
      }, 380);
    }
    if (stopCurrent === stop) stopCurrent = null;
  };

  stopCurrent = stop;
  return stop;
}

export function stopAlertSound() {
  stopCurrent?.();
}
