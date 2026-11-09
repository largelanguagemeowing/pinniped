/* eslint-disable jsx-a11y/media-has-caption */
import React, { ReactNode, useCallback, useRef, useState } from 'react';
import {
  Box,
  Chip,
  Icon,
  IconButton,
  Icons,
  ProgressBar,
  Spinner,
  Text,
  color,
  toRem,
} from 'folds';
import { EncryptedAttachmentInfo } from 'browser-encrypt-attachment';
import { Range } from 'react-range';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { AsyncStatus, useAsyncLoad } from '../../../hooks/useAsyncCallback';
import { AttachmentLoadError } from './AttachmentLoadError';
import { IAudioInfo } from '../../../../types/matrix/common';
import {
  PlayTimeCallback,
  useMediaLoading,
  useMediaPlay,
  useMediaPlaybackRate,
  useMediaPlayTimeCallback,
  useMediaSeek,
  useMediaVolume,
} from '../../../hooks/media';
import { useThrottle } from '../../../hooks/useThrottle';
import { secondsToMinutesAndSeconds } from '../../../utils/common';
import {
  decryptFile,
  downloadEncryptedMedia,
  downloadMedia,
  mxcUrlToHttp,
} from '../../../utils/matrix';
import { useMediaAuthentication } from '../../../hooks/useMediaAuthentication';
import { VoiceWaveform } from './VoiceWaveform';

const PLAY_TIME_THROTTLE_OPS = {
  wait: 500,
  immediate: true,
};

const PLAYBACK_RATES = [1, 1.25, 1.5, 2];

const getNextPlaybackRate = (playbackRate: number): number => {
  const currentIndex = PLAYBACK_RATES.indexOf(playbackRate);
  return PLAYBACK_RATES[(currentIndex + 1) % PLAYBACK_RATES.length];
};

type RenderMediaControlProps = {
  after: ReactNode;
  leftControl: ReactNode;
  rightControl: ReactNode;
  children: ReactNode;
};
export type AudioContentProps = {
  mimeType: string;
  url: string;
  info: IAudioInfo;
  encInfo?: EncryptedAttachmentInfo;
  /** Voice messages: waveform samples (0-1024) shown instead of the plain seek bar. */
  waveform?: number[];
  renderMediaControl: (props: RenderMediaControlProps) => ReactNode;
};
export function AudioContent({
  mimeType,
  url,
  info,
  encInfo,
  waveform,
  renderMediaControl,
}: AudioContentProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();

  const [srcState, loadSrc] = useAsyncLoad(
    useCallback(async () => {
      const mediaUrl = mxcUrlToHttp(mx, url, useAuthentication);
      if (!mediaUrl) throw new Error('Invalid media URL');
      const fileContent = encInfo
        ? await downloadEncryptedMedia(mediaUrl, (encBuf) => decryptFile(encBuf, mimeType, encInfo))
        : await downloadMedia(mediaUrl);
      return URL.createObjectURL(fileContent);
    }, [mx, url, useAuthentication, mimeType, encInfo])
  );

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [currentTime, setCurrentTime] = useState(0);
  // duration in seconds. (NOTE: info.duration is in milliseconds)
  const infoDuration = info.duration ?? 0;
  const [duration, setDuration] = useState((infoDuration >= 0 ? infoDuration : 0) / 1000);

  const getAudioRef = useCallback(() => audioRef.current, []);
  const { loading } = useMediaLoading(getAudioRef);
  const { playing, setPlaying } = useMediaPlay(getAudioRef);
  const { seek } = useMediaSeek(getAudioRef);
  const { playbackRate, setPlaybackRate } = useMediaPlaybackRate(getAudioRef);
  const { volume, mute, setMute, setVolume } = useMediaVolume(getAudioRef);
  const handlePlayTimeCallback: PlayTimeCallback = useCallback((d, ct) => {
    if (Number.isFinite(d) && d > 0) setDuration(d);
    if (Number.isFinite(ct) && ct >= 0) setCurrentTime(ct);
  }, []);
  useMediaPlayTimeCallback(
    getAudioRef,
    useThrottle(handlePlayTimeCallback, PLAY_TIME_THROTTLE_OPS)
  );

  const handlePlay = () => {
    if (srcState.status === AsyncStatus.Success) {
      setPlaying(!playing);
    } else if (srcState.status !== AsyncStatus.Loading) {
      loadSrc();
    }
  };

  const handleSeek = (values: number[]) => {
    const nextTime = values[0];
    setCurrentTime(nextTime);
    seek(nextTime);
  };

  const handleSeekTo = (seconds: number) => handleSeek([seconds]);

  const seekDuration = duration > 0 ? duration : 1;
  const seekTime = Math.min(currentTime, seekDuration);
  const formattedSeekTime = secondsToMinutesAndSeconds(seekTime);
  const formattedDuration = secondsToMinutesAndSeconds(duration);

  if (srcState.status === AsyncStatus.Error) {
    return <AttachmentLoadError error={srcState.error} onRetry={() => loadSrc()} />;
  }

  // A voice message is a compact bubble, not the full player: play, bars, time and speed.
  if (waveform) {
    const busy = srcState.status === AsyncStatus.Loading || loading;
    return (
      <Box alignItems="Center" gap="300">
        <IconButton
          variant="Primary"
          size="400"
          radii="Pill"
          onClick={handlePlay}
          disabled={srcState.status === AsyncStatus.Loading}
          aria-label={playing ? 'Pause voice message' : 'Play voice message'}
        >
          {busy ? (
            <Spinner variant="Primary" fill="Solid" size="200" />
          ) : (
            <Icon src={playing ? Icons.Pause : Icons.Play} filled />
          )}
        </IconButton>
        <Box direction="Column" gap="100" grow="Yes" style={{ minWidth: 0 }}>
          <VoiceWaveform
            waveform={waveform}
            currentTime={seekTime}
            duration={duration}
            onSeek={handleSeekTo}
            valueText={`${formattedSeekTime} of ${formattedDuration}`}
          />
          <Text size="T200" priority="300">
            {playing || seekTime > 0
              ? `${formattedSeekTime} / ${formattedDuration}`
              : formattedDuration}
          </Text>
        </Box>
        <Chip
          onClick={() => setPlaybackRate(getNextPlaybackRate(playbackRate))}
          variant="SurfaceVariant"
          radii="Pill"
          aria-label={`Playback speed, ${playbackRate} times`}
        >
          <Text size="B300">{playbackRate}×</Text>
        </Chip>
        <audio
          controls={false}
          autoPlay
          ref={audioRef}
          src={srcState.status === AsyncStatus.Success ? srcState.data : undefined}
        />
      </Box>
    );
  }

  return renderMediaControl({
    after: (
      <Range
        step={1}
        min={0}
        max={seekDuration}
        values={[seekTime]}
        disabled={duration <= 0}
        onChange={handleSeek}
        onFinalChange={handleSeek}
        renderTrack={(params) => (
          <div
            {...params.props}
            style={{
              ...params.props.style,
              cursor: duration > 0 ? 'pointer' : 'default',
              display: 'flex',
              height: toRem(24),
              position: 'relative',
              touchAction: 'none',
              width: '100%',
            }}
          >
            {params.children}
            <ProgressBar
              as="div"
              data-testid="audio-seek-bar"
              style={{
                left: 0,
                pointerEvents: 'none',
                position: 'absolute',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '100%',
              }}
              variant="Secondary"
              size="300"
              min={0}
              max={seekDuration}
              value={seekTime}
              radii="300"
            />
          </div>
        )}
        renderThumb={(params) => (
          <div
            {...params.props}
            aria-label="Seek audio"
            aria-valuetext={`${formattedSeekTime} of ${formattedDuration}`}
            style={{
              ...params.props.style,
              backgroundColor: color.Secondary.Main,
              borderRadius: '50%',
              cursor: 'grab',
              height: toRem(14),
              width: toRem(14),
              zIndex: 1,
            }}
          />
        )}
      />
    ),
    leftControl: (
      <>
        <Chip
          onClick={handlePlay}
          variant="Secondary"
          radii="300"
          disabled={srcState.status === AsyncStatus.Loading}
          before={
            srcState.status === AsyncStatus.Loading || loading ? (
              <Spinner variant="Secondary" size="50" />
            ) : (
              <Icon src={playing ? Icons.Pause : Icons.Play} size="50" filled={playing} />
            )
          }
        >
          <Text size="B300">{playing ? 'Pause' : 'Play'}</Text>
        </Chip>

        <Text size="T200">{`${formattedSeekTime} / ${formattedDuration}`}</Text>
      </>
    ),
    rightControl: (
      <>
        <Chip
          onClick={() => setPlaybackRate(getNextPlaybackRate(playbackRate))}
          variant="SurfaceVariant"
          radii="300"
          aria-label={`Playback speed, ${playbackRate} times`}
        >
          <Text size="B300">{playbackRate}×</Text>
        </Chip>
        <IconButton
          variant="SurfaceVariant"
          size="300"
          radii="Pill"
          onClick={() => setMute(!mute)}
          aria-label={mute ? 'Unmute audio' : 'Mute audio'}
          aria-pressed={mute}
        >
          <Icon src={mute ? Icons.VolumeMute : Icons.VolumeHigh} size="50" />
        </IconButton>
        <Range
          step={0.1}
          min={0}
          max={1}
          values={[volume]}
          onChange={(values) => setVolume(values[0])}
          renderTrack={(params) => (
            <div
              {...params.props}
              style={{
                ...params.props.style,
                cursor: 'pointer',
                display: 'flex',
                height: toRem(24),
                position: 'relative',
                touchAction: 'none',
                width: toRem(64),
              }}
            >
              {params.children}
              <ProgressBar
                data-testid="audio-volume-bar"
                style={{
                  left: 0,
                  pointerEvents: 'none',
                  position: 'absolute',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: '100%',
                }}
                variant="Secondary"
                size="300"
                min={0}
                max={1}
                value={volume}
                radii="300"
              />
            </div>
          )}
          renderThumb={(params) => (
            <div
              {...params.props}
              aria-label="Volume"
              aria-valuetext={`${Math.round(volume * 100)} percent`}
              style={{
                ...params.props.style,
                backgroundColor: color.Secondary.Main,
                borderRadius: '50%',
                cursor: 'grab',
                height: toRem(14),
                width: toRem(14),
                zIndex: 1,
              }}
            />
          )}
        />
      </>
    ),
    children: (
      <audio
        controls={false}
        autoPlay
        ref={audioRef}
        src={srcState.status === AsyncStatus.Success ? srcState.data : undefined}
      />
    ),
  });
}
