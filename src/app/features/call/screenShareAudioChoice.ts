import type { ScreenShareAudioScope } from '../../state/screenShareAudioScope';
import type { ScreenShareAudioApp } from '../../utils/device';

/** The screen share dialog's audio choice: none, or whose audio the share carries. */
export type ShareAudioChoice = { kind: 'off' } | ScreenShareAudioScope;

export type ShareAudioOption = { value: string; label: string; choice: ShareAudioChoice };

export const shareAudioKey = (choice: ShareAudioChoice): string =>
  choice.kind === 'app' ? `app:${choice.app.id}` : choice.kind;

const label = (choice: ShareAudioChoice): string => {
  if (choice.kind === 'off') return 'None';
  if (choice.kind === 'all') return 'Computer audio';
  return `Only ${choice.app.name}`;
};

/**
 * The audio options: none, every other application, or one of the applications playing now.
 * The chosen application stays listed when it stops playing, so the choice still shows.
 */
export function shareAudioOptions(
  playing: ScreenShareAudioApp[],
  chosen: ShareAudioChoice
): ShareAudioOption[] {
  const apps =
    chosen.kind === 'app' && !playing.some((app) => app.id === chosen.app.id)
      ? [...playing, chosen.app]
      : playing;
  const choices: ShareAudioChoice[] = [
    { kind: 'off' },
    { kind: 'all' },
    ...apps.map((app): ShareAudioChoice => ({ kind: 'app', app })),
  ];
  return choices.map((choice) => ({ value: shareAudioKey(choice), label: label(choice), choice }));
}
