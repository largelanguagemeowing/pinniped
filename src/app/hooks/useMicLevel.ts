import { useEffect, useState } from 'react';

import { processingAudioContext } from '../plugins/call/engine/livekit/processingAudioContext';

/** The voice gate's 0-1 scale covers -70 dBFS to -20 dBFS, as the call's threshold does. */
export const GATE_DB_MIN = -70;
export const GATE_DB_SPAN = 50;

/** Where a level (RMS, 0..1) sits on the voice gate's 0-1 scale. */
export const levelToGatePosition = (level: number): number => {
  const db = level > 0 ? 20 * Math.log10(level) : -100;
  return Math.min(1, Math.max(0, (db - GATE_DB_MIN) / GATE_DB_SPAN));
};

/**
 * The live loudness of a microphone on the gate scale (see levelToGatePosition), or 0 while
 * not `active`. Captures raw, the way the call does: no echo cancellation, noise suppression
 * or gain control.
 */
export const useMicLevel = (deviceId: string, active: boolean): number => {
  const [position, setPosition] = useState(0);

  useEffect(() => {
    if (!active || !navigator.mediaDevices?.getUserMedia) {
      setPosition(0);
      return undefined;
    }
    let disposed = false;
    let cleanup: (() => void) | undefined;

    navigator.mediaDevices
      .getUserMedia({
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      })
      .then((stream) => {
        if (disposed) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const ctx = processingAudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const samples = new Float32Array(analyser.fftSize);
        const id = window.setInterval(() => {
          analyser.getFloatTimeDomainData(samples);
          let sum = 0;
          samples.forEach((s) => {
            sum += s * s;
          });
          setPosition(levelToGatePosition(Math.sqrt(sum / samples.length)));
        }, 40);
        cleanup = () => {
          window.clearInterval(id);
          stream.getTracks().forEach((t) => t.stop());
          ctx.close().catch(() => undefined);
        };
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      cleanup?.();
      setPosition(0);
    };
  }, [deviceId, active]);

  return position;
};
