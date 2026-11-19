import React, {
  type CSSProperties,
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react';
import { observeParticipantMedia, type TrackReference } from '@livekit/components-core';
import { type Track } from 'livekit-client';

/** The track currently behind a publication; it comes and goes as the publication is (un)subscribed. */
function usePublicationTrack({ participant, publication }: TrackReference): Track | undefined {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const subscription = observeParticipantMedia(participant).subscribe(onChange);
      return (): void => subscription.unsubscribe();
    },
    [participant]
  );
  return useSyncExternalStore(subscribe, () => publication.track);
}

type VideoTrackProps = {
  trackRef: TrackReference;
  className?: string;
  style?: CSSProperties;
  'data-testid'?: string;
};

/** Plays a LiveKit video track. Attaching lets LiveKit fit the received quality to the element's size. */
export function VideoTrack({ trackRef, className, style, 'data-testid': testId }: VideoTrackProps) {
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const track = usePublicationTrack(trackRef);

  useEffect(() => {
    if (video === null || track === undefined) return undefined;
    track.attach(video);
    return () => {
      track.detach(video);
    };
  }, [video, track]);

  return (
    <video
      ref={setVideo}
      className={className}
      style={style}
      data-testid={testId}
      // There's no reason for this to be focusable
      tabIndex={-1}
      disablePictureInPicture
      muted
      playsInline
    />
  );
}
