import { useCallback, useEffect, useRef, useState } from 'react';
import { Room } from 'matrix-js-sdk';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { Call } from '../plugins/call/Call';
import { useBehavior } from '../plugins/call/engine/useBehavior';
import { useSetting } from '../state/hooks/settings';
import { settingsAtom } from '../state/settings';
import { useMatrixClient } from './useMatrixClient';
import { callAtom, callIdleAtom } from '../state/call';
import { CallPreferences } from '../state/callPreferences';
import { useCallPreferencesAtom } from '../state/hooks/callPreferences';

/** Joins the call of a room; the previous call, if any, ends without a leave sound. */
export const useCallStart = (dm = false) => {
  const mx = useMatrixClient();
  const setCall = useSetAtom(callAtom);

  return useCallback(
    (room: Room, preferences: CallPreferences) => {
      setCall(new Call(mx, room, { dm, preferences }));
    },
    [mx, dm, setCall]
  );
};

/**
 * Remember mic/sound toggles the user makes in a call, so the next call starts the same way.
 * Only user toggles count: state the call changes itself (joins, reconnects) must never
 * overwrite the saved preference.
 */
export const useCallPreferenceSync = (call: Call) => {
  const prefAtom = useCallPreferencesAtom();
  const [pref, setPref] = useAtom(prefAtom);
  const prefRef = useRef(pref);
  prefRef.current = pref;

  useEffect(() => {
    const subscription = call.userToggles$.subscribe((change) => {
      setPref({ ...prefRef.current, ...change });
    });
    return () => subscription.unsubscribe();
  }, [call, setPref]);
};

/** Preferences for starting a call: remembered mic/sound state, with the given video choice. */
export const useCallStartPreferences = (): ((video: boolean) => CallPreferences) => {
  const pref = useAtomValue(useCallPreferencesAtom());
  return useCallback(
    (video: boolean) => ({ microphone: pref.microphone, video, sound: pref.sound }),
    [pref]
  );
};

const CALL_IDLE_MS = 3000;

/**
 * While `active`, tracks pointer/keyboard activity and flips `callIdleAtom` after a few quiet
 * seconds, so the call view can fade its UI.
 */
export const useCallIdle = (active: boolean) => {
  const setIdle = useSetAtom(callIdleAtom);

  useEffect(() => {
    if (!active) {
      setIdle(false);
      return undefined;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;

    const onActivity = () => {
      setIdle(false);
      clearTimeout(timer);
      timer = setTimeout(() => setIdle(true), CALL_IDLE_MS);
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'wheel'] as const;
    events.forEach((evt) => document.addEventListener(evt, onActivity, { passive: true }));
    onActivity();

    return () => {
      clearTimeout(timer);
      events.forEach((evt) => document.removeEventListener(evt, onActivity));
      setIdle(false);
    };
  }, [active, setIdle]);
};

/**
 * Desktop: captures other applications' audio (not Pinniped's own) for your screen share. On
 * Linux that is a virtual microphone made while the call is up and fed only while you share; the
 * call publishes it as the share's audio. On Windows the audio arrives as PCM chunks, which go on
 * to the call while you share. Nothing is captured unless screen share audio is on.
 */
export const useScreenShareAudioBridge = (call: Call) => {
  const [enabled] = useSetting(settingsAtom, 'callScreenShareAudio');
  const [excluded] = useSetting(settingsAtom, 'callScreenShareAudioExcluded');
  const [helperConsole] = useSetting(settingsAtom, 'helperConsole');
  const sharing = useBehavior(call.vm.sharingScreen$);
  const bridge = window.pinnipedDesktop?.screenShareAudio;

  // The device is made once share audio is on, and then stays for the whole call: if it vanished
  // while the call still captures it, the capture can silently move to the real microphone and
  // send it a second time. Making it changes the system's audio devices mid-call, so calls
  // without share audio leave them alone.
  const [prepared, setPrepared] = useState(enabled);
  if (enabled && !prepared) setPrepared(true);

  useEffect(() => {
    if (!bridge || !prepared) return undefined;
    return () => {
      bridge.release();
    };
  }, [bridge, prepared]);

  // The console option goes in before the helper's first command, which is what starts it.
  // Changing it restarts the helper, so the call asks for its device again.
  useEffect(() => {
    if (!bridge || !prepared) return;
    bridge.setConsole?.(helperConsole);
    bridge.prepare();
  }, [bridge, prepared, helperConsole]);

  // Only audio played to the output device the call uses is shared, see electron/screenshare-audio.cjs.
  const [audioOutput] = useSetting(settingsAtom, 'callAudioOutput');
  const [outputLabel, setOutputLabel] = useState('');
  useEffect(() => {
    if (!bridge) return undefined;
    let cancelled = false;
    const resolve = async () => {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const output = audioOutput
        ? devices.find((d) => d.kind === 'audiooutput' && d.deviceId === audioOutput)
        : undefined;
      if (!cancelled) setOutputLabel(output?.label ?? '');
    };
    resolve().catch(() => setOutputLabel(''));
    navigator.mediaDevices.addEventListener('devicechange', resolve);
    return () => {
      cancelled = true;
      navigator.mediaDevices.removeEventListener('devicechange', resolve);
    };
  }, [bridge, audioOutput]);

  // Windows: pass the captured audio on to the call, which publishes it as the share's audio.
  useEffect(() => {
    if (!bridge?.onPcm || !enabled || !sharing) return undefined;
    return bridge.onPcm((chunk) => call.vm.pushShareAudio(chunk));
  }, [bridge, call, enabled, sharing]);

  useEffect(() => {
    if (!bridge || !enabled) return undefined;
    bridge.link(sharing, outputLabel, excluded);
    return () => {
      bridge.link(false);
    };
  }, [bridge, enabled, sharing, outputLabel, excluded, helperConsole]);
};
