/**
 * What Pinniped's own call controls ask of the call widget (the
 * `club.stablecat.pinniped.call_control` action). Only the fields present are applied.
 */
export type CallControlRequest = {
  layout?: CallLayout;
  /** `false` ends our screen share; starting one is the ScreenShare action. */
  screenShare?: false;
  /** Whether the call's audio plays; `false` is deafened. */
  outputEnabled?: boolean;
  /** Whether the user has been idle, so the call view fades its labels. */
  idle?: boolean;
  /** Scrollbar colours of the current theme, as CSS colours. */
  scrollbar?: { track: string; thumb: string };
};

export type CallLayout = 'grid' | 'spotlight';

/** What the call widget shows, as it reports it (the `club.stablecat.pinniped.call_view` action). */
export type CallViewState = {
  layout: CallLayout;
  /** Whether we are sharing our screen. */
  screenSharing: boolean;
  /** Height in pixels of the screen share being watched, if there is one. */
  streamHeight?: number;
};

export const initialCallViewState: CallViewState = { layout: 'grid', screenSharing: false };

/** Reads the widget's `call_view` payload; anything malformed keeps the previous value. */
export const parseCallViewState = (data: unknown, previous: CallViewState): CallViewState => {
  if (typeof data !== 'object' || data === null) return previous;
  const { layout, screenSharing, streamHeight } = data as Record<string, unknown>;
  return {
    layout: layout === 'grid' || layout === 'spotlight' ? layout : previous.layout,
    screenSharing: typeof screenSharing === 'boolean' ? screenSharing : previous.screenSharing,
    streamHeight:
      typeof streamHeight === 'number' && Number.isFinite(streamHeight) && streamHeight > 0
        ? streamHeight
        : undefined,
  };
};
