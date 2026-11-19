import { SCREEN_SHARE_AUDIO_DEVICE } from '../../types';

/**
 * Where a screen share's audio comes from: nothing, what the browser offers with the capture
 * (`display`), a microphone published in its place (`device`; on Linux the desktop app's virtual
 * microphone) or PCM the desktop app captures itself and pushes into the call (`pcm`, Windows).
 */
export type ScreenShareAudioSource =
  { kind: 'off' } | { kind: 'display' } | { kind: 'device'; label: string } | { kind: 'pcm' };

/** The source this platform offers when share audio is on. */
export function screenShareAudioSource(enabled: boolean): ScreenShareAudioSource {
  if (!enabled) return { kind: 'off' };
  const bridge = window.pinnipedDesktop?.screenShareAudio;
  if (!bridge) return { kind: 'display' };
  return bridge.onPcm ? { kind: 'pcm' } : { kind: 'device', label: SCREEN_SHARE_AUDIO_DEVICE };
}
