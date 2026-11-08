import {
  createContext,
  RefObject,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { MatrixClient, Room } from 'matrix-js-sdk';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { IWidgetApiRequest } from 'matrix-widget-api';
import {
  CallEmbed,
  ElementCallThemeKind,
  ElementWidgetActions,
  useCallActivity,
  useClientWidgetApiEvent,
  screenShareAudioSource,
  getCallUserVolumes,
} from '../plugins/call';
import { CallControlEvent } from '../plugins/call/CallControl';
import { useSetting } from '../state/hooks/settings';
import { settingsAtom } from '../state/settings';
import { playCallEndSound } from '../sound/play';
import { useMatrixClient } from './useMatrixClient';
import { ThemeKind, useTheme } from './useTheme';
import { callEmbedAtom, callIdleAtom } from '../state/callEmbed';
import { useResizeObserver } from './useResizeObserver';
import { CallControlState } from '../plugins/call/CallControlState';
import { useCallMembersChange, useCallSession } from './useCall';
import { CallPreferences } from '../state/callPreferences';
import { useCallPreferencesAtom } from '../state/hooks/callPreferences';
import { withDefaultTuning } from '../plugins/call/voiceTuning';

const CallEmbedContext = createContext<CallEmbed | undefined>(undefined);

export const CallEmbedContextProvider = CallEmbedContext.Provider;

export const useCallEmbed = (): CallEmbed | undefined => {
  const callEmbed = useContext(CallEmbedContext);

  return callEmbed;
};

const CallEmbedRefContext = createContext<RefObject<HTMLDivElement | null> | undefined>(undefined);
export const CallEmbedRefContextProvider = CallEmbedRefContext.Provider;
export const useCallEmbedRef = (): RefObject<HTMLDivElement | null> => {
  const ref = useContext(CallEmbedRefContext);
  if (!ref) {
    throw new Error('CallEmbedRef is not provided!');
  }
  return ref;
};

export const createCallEmbed = (
  mx: MatrixClient,
  room: Room,
  dm: boolean,
  themeKind: ElementCallThemeKind,
  container: HTMLElement,
  pref?: CallPreferences
): CallEmbed => {
  const rtcSession = mx.matrixRTC.getRoomSession(room);
  const ongoing = rtcSession.memberships.length > 0;

  const intent = CallEmbed.getIntent(dm, ongoing, pref?.video);
  const widget = CallEmbed.getWidget(mx, room, intent, themeKind);
  const controlState = pref && new CallControlState(pref.microphone, pref.video, pref.sound);

  const embed = new CallEmbed(mx, room, widget, container, controlState);

  return embed;
};

export const useCallStart = (dm = false) => {
  const mx = useMatrixClient();
  const theme = useTheme();
  const setCallEmbed = useSetAtom(callEmbedAtom);
  const callEmbedRef = useCallEmbedRef();

  const startCall = useCallback(
    (room: Room, pref?: CallPreferences) => {
      const container = callEmbedRef.current;
      if (!container) {
        throw new Error('Failed to start call, No embed container element found!');
      }
      const callEmbed = createCallEmbed(mx, room, dm, theme.kind, container, pref);

      setCallEmbed(callEmbed);
    },
    [mx, dm, theme, setCallEmbed, callEmbedRef]
  );

  return startCall;
};

export const useCallJoined = (embed?: CallEmbed): boolean => {
  const [joined, setJoined] = useState(embed?.joined ?? false);

  useClientWidgetApiEvent(
    embed?.call,
    ElementWidgetActions.JoinCall,
    useCallback(() => {
      setJoined(true);
    }, [])
  );

  useEffect(() => {
    if (!embed) {
      setJoined(false);
    }
  }, [embed]);

  return joined;
};

export const useCallHangupEvent = (embed: CallEmbed, callback: () => void) => {
  // Log who ended the call: an unexpected widget-initiated hangup is otherwise invisible.
  const logAndCallback = (action: string) => (evt: unknown) => {
    console.info(`[call] widget requested ${action}`, evt);
    callback();
  };
  useClientWidgetApiEvent(
    embed.call,
    ElementWidgetActions.HangupCall,
    useCallback(logAndCallback('hangup'), [callback]) // eslint-disable-line react-hooks/exhaustive-deps
  );
  useClientWidgetApiEvent<IWidgetApiRequest>(
    embed.call,
    ElementWidgetActions.Close,
    useCallback(
      (evt) => {
        // The call closes without playing its end sound: play it here.
        playCallEndSound(evt.detail?.data?.reason);
        logAndCallback('close')(evt);
      },
      [callback] // eslint-disable-line react-hooks/exhaustive-deps
    )
  );
};

export const useCallMemberSoundSync = (embed: CallEmbed) => {
  const callSession = useCallSession(embed.room);
  useCallMembersChange(
    callSession,
    useCallback(() => embed.control.applySound(), [embed])
  );
};

/**
 * Remember mic/sound toggles the user makes in a call, so the next call starts the same way.
 * Only user toggles count: state reported by the call widget itself (joins, reconnects) must
 * never overwrite the saved preference.
 */
export const useCallPreferenceSync = (embed: CallEmbed) => {
  const prefAtom = useCallPreferencesAtom();
  const [pref, setPref] = useAtom(prefAtom);
  const prefRef = useRef(pref);
  prefRef.current = pref;

  useEffect(() => {
    const onToggle = (change: Partial<Pick<CallPreferences, 'microphone' | 'sound'>>) => {
      setPref({ ...prefRef.current, ...change });
    };
    embed.control.on(CallControlEvent.UserToggle, onToggle);
    return () => {
      embed.control.off(CallControlEvent.UserToggle, onToggle);
    };
  }, [embed, setPref]);
};

/** Preferences for starting a call: remembered mic/sound state, with the given video choice. */
export const useCallStartPreferences = (): ((video: boolean) => CallPreferences) => {
  const pref = useAtomValue(useCallPreferencesAtom());
  return useCallback(
    (video: boolean) => ({ microphone: pref.microphone, video, sound: pref.sound }),
    [pref]
  );
};

export const useCallThemeSync = (embed: CallEmbed) => {
  const theme = useTheme();

  useEffect(() => {
    const name: ElementCallThemeKind = theme.kind === ThemeKind.Dark ? 'dark' : 'light';

    embed.setTheme(name);
  }, [theme.kind, embed]);
};

export const useCallSettingsSync = (embed: CallEmbed) => {
  const [denoise] = useSetting(settingsAtom, 'callDenoise');
  const [voiceGate] = useSetting(settingsAtom, 'callVoiceGate');
  const [voiceGateAuto] = useSetting(settingsAtom, 'callVoiceGateAuto');
  const [voiceGateThreshold] = useSetting(settingsAtom, 'callVoiceGateThreshold');
  const [voiceTuning] = useSetting(settingsAtom, 'callVoiceTuning');
  const [simulcast] = useSetting(settingsAtom, 'callSimulcast');
  const [screenShare] = useSetting(settingsAtom, 'callScreenShare');
  const [screenShareAudio] = useSetting(settingsAtom, 'callScreenShareAudio');
  const [soundVolume] = useSetting(settingsAtom, 'soundVolume');
  const [soundboardVolume] = useSetting(settingsAtom, 'soundboardVolume');
  const [callUserVolumes] = useSetting(settingsAtom, 'callUserVolumes');
  const [callMutedUsers] = useSetting(settingsAtom, 'callMutedUsers');
  const [callSoundboardMutedUsers] = useSetting(settingsAtom, 'callSoundboardMutedUsers');
  // Joined so the effect below compares by value; the array is new every render.
  const [audioInput] = useSetting(settingsAtom, 'callAudioInput');
  const [audioOutput] = useSetting(settingsAtom, 'callAudioOutput');

  useEffect(() => {
    embed
      .setCallSettings({
        denoise,
        voiceGate,
        voiceGateAuto,
        voiceGateThreshold,
        voiceTuning: withDefaultTuning(voiceTuning),
        simulcast,
        screenShare: `${screenShare.resolution}:${screenShare.fps}`,
        screenShareAudio: screenShareAudioSource(screenShareAudio),
        soundVolume,
        soundboardVolume,
        userVolumes: getCallUserVolumes({ callUserVolumes, callMutedUsers }),
        mutedSoundboards: callSoundboardMutedUsers,
        audioInput,
        audioOutput,
      })
      .catch(() => {
        // The widget is not ready yet; it was seeded from the same setting via its URL.
      });
  }, [
    denoise,
    voiceGate,
    voiceGateAuto,
    voiceGateThreshold,
    voiceTuning,
    simulcast,
    screenShare,
    screenShareAudio,
    soundVolume,
    soundboardVolume,
    callUserVolumes,
    callMutedUsers,
    callSoundboardMutedUsers,
    audioInput,
    audioOutput,
    embed,
  ]);
};

export const useCallEmbedPlacementSync = (
  containerViewRef: RefObject<HTMLDivElement | null>
): void => {
  const callEmbedRef = useCallEmbedRef();

  const syncCallEmbedPlacement = useCallback(() => {
    const embedEl = callEmbedRef.current;
    const container = containerViewRef.current;
    if (!embedEl || !container) return;

    embedEl.style.top = `${container.offsetTop}px`;
    embedEl.style.left = `${container.offsetLeft}px`;
    embedEl.style.width = `${container.clientWidth}px`;
    embedEl.style.height = `${container.clientHeight}px`;
  }, [callEmbedRef, containerViewRef]);

  useResizeObserver(
    syncCallEmbedPlacement,
    useCallback(() => containerViewRef.current, [containerViewRef])
  );
};

const CALL_IDLE_MS = 3000;

/**
 * Tracks pointer/keyboard activity (in the app and inside the call iframe) and flips
 * `callIdleAtom` after a few quiet seconds, so the call view can fade its UI. The call document also
 * gets `data-cinny-idle` so the call UI itself can hide its labels.
 */
export const useCallIdle = (embed?: CallEmbed) => {
  const setIdle = useSetAtom(callIdleAtom);

  useEffect(() => {
    if (!embed) {
      setIdle(false);
      return undefined;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    const attached = new Set<Document>();

    const applyIdle = (idle: boolean) => {
      setIdle(idle);
      const root = embed.document?.documentElement;
      if (root) root.dataset.cinnyIdle = String(idle);
    };

    const onActivity = () => {
      applyIdle(false);
      clearTimeout(timer);
      timer = setTimeout(() => applyIdle(true), CALL_IDLE_MS);
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'wheel'] as const;
    const attach = (doc?: Document) => {
      if (!doc || attached.has(doc)) return;
      attached.add(doc);
      events.forEach((evt) => doc.addEventListener(evt, onActivity, { passive: true }));
    };
    const attachAll = () => {
      attach(document);
      attach(embed.document);
    };

    attachAll();
    embed.iframe.addEventListener('load', attachAll);
    onActivity();

    return () => {
      clearTimeout(timer);
      embed.iframe.removeEventListener('load', attachAll);
      attached.forEach((doc) => events.forEach((evt) => doc.removeEventListener(evt, onActivity)));
      setIdle(false);
    };
  }, [embed, setIdle]);
};

/** Human-readable step the call is on while it connects, for the "Connecting…" label. */
export const useCallConnectionStatus = (embed: CallEmbed): string => {
  const [status, setStatus] = useState('Loading call…');

  useEffect(() => {
    setStatus('Loading call…');
    const disposers = [
      embed.onPreparing(() => setStatus('Preparing the call…')),
      embed.onReady(() => setStatus('Call ready, requesting permissions…')),
      embed.onCapabilitiesNotified(() => setStatus('Joining the call…')),
      embed.onPreparingError((error: unknown) =>
        setStatus(`Failed to prepare: ${error instanceof Error ? error.message : String(error)}`)
      ),
    ];
    const onLoad = () => setStatus((prev) => (prev === 'Loading call…' ? 'Starting call…' : prev));
    embed.iframe.addEventListener('load', onLoad);
    return () => {
      disposers.forEach((dispose) => dispose());
      embed.iframe.removeEventListener('load', onLoad);
    };
  }, [embed]);

  return status;
};

/**
 * Linux desktop: makes the virtual microphone that carries other applications' audio while the
 * call is up, and feeds it only while you share your screen. The call widget publishes it as the
 * share's audio. Other applications' audio is only fed in while screen share audio is on.
 */
export const useScreenShareAudioBridge = (embed: CallEmbed) => {
  const mx = useMatrixClient();
  const [enabled] = useSetting(settingsAtom, 'callScreenShareAudio');
  const joined = useCallJoined(embed);
  const { screenSharers } = useCallActivity(embed);
  const sharing = joined && screenSharers.has(mx.getSafeUserId());
  const bridge = window.cinnyDesktop?.screenShareAudio;

  // The device stays for the whole call: if it vanished while the widget still captures it, the
  // capture can silently move to the real microphone and send it a second time.
  useEffect(() => {
    if (!bridge) return undefined;
    bridge.prepare();
    return () => {
      bridge.release();
    };
  }, [bridge]);

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

  useEffect(() => {
    if (!bridge || !enabled) return undefined;
    bridge.link(sharing, outputLabel);
    return () => {
      bridge.link(false);
    };
  }, [bridge, enabled, sharing, outputLabel]);
};
