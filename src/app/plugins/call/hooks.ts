import { ClientWidgetApi } from 'matrix-widget-api';
import { useEffect, useState } from 'react';
import { CallControl, CallControlEvent } from './CallControl';
import { CallControlState } from './CallControlState';
import { CallEmbed } from './CallEmbed';
import { CallActivity, emptyCallActivity } from './activity';
import { CallError } from './error';
import { CallStatsSample } from './stats';

export const useClientWidgetApiEvent = <T>(
  api: ClientWidgetApi | undefined,
  type: string,
  callback: (event: CustomEvent<T>) => void
) => {
  useEffect(() => {
    api?.on(`action:${type}`, callback);
    return () => {
      api?.off(`action:${type}`, callback);
    };
  }, [api, type, callback]);
};

export const useCallControlState = (control: CallControl): CallControlState => {
  const [state, setState] = useState(control.getState());

  useEffect(() => {
    const handleUpdate = () => {
      setState(control.getState());
    };
    control.on(CallControlEvent.StateUpdate, handleUpdate);
    return () => {
      control.off(CallControlEvent.StateUpdate, handleUpdate);
    };
  }, [control]);

  // Deafened means the microphone is off, whatever it was set to before.
  return state.sound
    ? state
    : new CallControlState(false, state.video, state.sound, state.screenshare, state.spotlight);
};

/** The embed's WebRTC sample history; re-renders on every new sample. */
export const useCallStats = (embed: CallEmbed | undefined): CallStatsSample[] => {
  const [history, setHistory] = useState<CallStatsSample[]>(embed?.statsHistory ?? []);

  useEffect(() => {
    setHistory(embed?.statsHistory ?? []);
    return embed?.onStats(() => setHistory(embed.statsHistory));
  }, [embed]);

  return history;
};

/** Who is speaking, muted or sharing in the call; re-renders when the widget reports a change. */
export const useCallActivity = (embed: CallEmbed | undefined): CallActivity => {
  const [activity, setActivity] = useState<CallActivity>(embed?.activity ?? emptyCallActivity);

  useEffect(() => {
    setActivity(embed?.activity ?? emptyCallActivity);
    return embed?.onActivity(() => setActivity(embed.activity));
  }, [embed]);

  return activity;
};

/** The problem the widget reports for the call, if any; re-renders when it changes. */
export const useCallError = (embed: CallEmbed | undefined): CallError | undefined => {
  const [error, setError] = useState<CallError | undefined>(embed?.error);

  useEffect(() => {
    setError(embed?.error);
    return embed?.onError(() => setError(embed.error));
  }, [embed]);

  return error;
};
