import React, { useEffect, useMemo, useState } from 'react';
import { logger } from 'matrix-js-sdk/lib/logger';

import { type Call } from '../../../../plugins/call/Call';
import { callSettings } from '../../../../plugins/call/engine/settings';
import { useBehavior } from '../../../../plugins/call/engine/useBehavior';
import { RoomAudio } from './RoomAudio';
import { ReactionAudio } from './ReactionAudio';
import { type ListenerAudio } from './trackPlayback';

/**
 * Voices play through an audio context where it can follow the chosen output device, so a
 * participant's level can go past 100% (an element's volume stops at 1). Elsewhere (Firefox,
 * Safari) they play through plain audio elements, which follow the device themselves.
 */
const contextFollowsOutput =
  typeof AudioContext !== 'undefined' && 'setSinkId' in AudioContext.prototype;

/** The audio context the call plays through, on the chosen output device. */
function useCallAudioContext(call: Call): AudioContext | undefined {
  const [ctx, setCtx] = useState<AudioContext>();
  useEffect(() => {
    const created = new AudioContext({ latencyHint: 'interactive' });
    setCtx(created);
    return () => {
      setCtx(undefined);
      created.close().catch(() => undefined);
    };
  }, []);

  const outputId = useBehavior(call.mediaDevices.audioOutput.selected$)?.id;
  useEffect(() => {
    if (ctx === undefined || !contextFollowsOutput) return;
    // setSinkId is not in every DOM typing yet; '' is the system default.
    (ctx as AudioContext & { setSinkId(id: string): Promise<void> })
      .setSinkId(outputId ?? '')
      .catch((e) => logger.warn('Unable to change sink for audio context', e));
  }, [ctx, outputId]);

  return ctx;
}

/**
 * Everything the call plays: participants' voices, soundboard sounds and shared-screen audio,
 * and reaction sounds. Mount it for as long as the call runs, whether or not its view shows.
 */
export function CallAudio({ call }: { call: Call }) {
  const audioContext = useCallAudioContext(call);
  const rooms = useBehavior(call.vm.livekitRoomItems$);
  const deafened = useBehavior(call.muteStates.deafened$);
  const userVolumes = useBehavior(callSettings.userVolumes$);
  const soundboardVolume = useBehavior(callSettings.soundboardVolume$);
  const mutedSoundboards = useBehavior(callSettings.mutedSoundboards$);
  const soundVolume = useBehavior(callSettings.soundVolume$);

  const listener: ListenerAudio = useMemo(
    () => ({ userVolumes, soundboardVolume, mutedSoundboards, deafened }),
    [userVolumes, soundboardVolume, mutedSoundboards, deafened]
  );

  // Wait for the context, so the tracks do not first play through plain elements.
  if (audioContext === undefined) return null;
  return (
    <>
      {rooms.map(({ livekitRoom, url, participants, userIds }) => (
        <RoomAudio
          key={url}
          url={url}
          livekitRoom={livekitRoom}
          validIdentities={participants}
          userIds={userIds}
          listener={listener}
          audioContext={contextFollowsOutput ? audioContext : undefined}
        />
      ))}
      <ReactionAudio
        vm={call.vm}
        audioContext={audioContext}
        volume={soundVolume}
        deafened={deafened}
      />
    </>
  );
}
