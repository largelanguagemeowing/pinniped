import React, { useEffect, useMemo } from 'react';

import { type Call } from '../../../../plugins/call/Call';
import { callSettings } from '../../../../plugins/call/engine/settings';
import { useBehavior } from '../../../../plugins/call/engine/useBehavior';
import { RoomAudio } from './RoomAudio';
import { ReactionAudio } from './ReactionAudio';
import { type ListenerAudio } from './trackPlayback';
import { contextFollowsOutput, useCallAudioContext } from './callAudioContext';

/** Plays a local stream through the call's context. */
function StreamAudio({
  stream,
  audioContext,
}: {
  stream: MediaStream;
  audioContext: AudioContext;
}) {
  useEffect(() => {
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(audioContext.destination);
    return () => source.disconnect();
  }, [stream, audioContext]);
  return null;
}

/**
 * Everything the call plays: participants' voices, soundboard sounds (the user's own copy
 * included) and shared-screen audio, and reaction sounds, all on the call's output. Mount it for
 * as long as the call runs, whether or not its view shows.
 */
export function CallAudio({ call }: { call: Call }) {
  const outputId = useBehavior(call.mediaDevices.audioOutput.selected$)?.id ?? '';
  const audioContext = useCallAudioContext(outputId);
  const rooms = useBehavior(call.vm.livekitRoomItems$);
  const soundboardMonitor = useBehavior(call.vm.soundboardMonitor$);
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
          outputId={outputId}
        />
      ))}
      {soundboardMonitor && <StreamAudio stream={soundboardMonitor} audioContext={audioContext} />}
      <ReactionAudio
        vm={call.vm}
        audioContext={audioContext}
        volume={soundVolume}
        deafened={deafened}
      />
    </>
  );
}
