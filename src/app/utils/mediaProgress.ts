import { DownloadProgress } from './mediaDownload';

// How far the downloads in flight are, by the URL being fetched, so every view of one media
// (a timeline tile, the viewer, a download button) can show the same figure.

export type MediaProgressState =
  { status: 'idle' } | { status: 'loading'; progress: DownloadProgress };

/** One download's handle on the store; `end` it whether it finished, failed or was aborted. */
export type MediaProgressTracker = {
  report: (progress: DownloadProgress) => void;
  end: () => void;
};

/** The share of an announced length that has arrived, as a whole percent. */
export const progressPercent = (
  progress: Extract<DownloadProgress, { length: 'known' }>
): number => (progress.total === 0 ? 100 : Math.floor((progress.loaded * 100) / progress.total));

// a known length is shown as a percent; an unknown one as the bytes so far, reported in steps
const sameFigure = (a: DownloadProgress, b: DownloadProgress): boolean => {
  if (a.length === 'known' && b.length === 'known') {
    return progressPercent(a) === progressPercent(b);
  }
  return a.length === b.length && a.loaded === b.loaded;
};

export const IDLE_PROGRESS: MediaProgressState = { status: 'idle' };

type Slot = {
  state: Extract<MediaProgressState, { status: 'loading' }>;
  // downloads of this URL in flight; several run when one media is asked for in different forms
  trackers: number;
};

export class MediaProgressStore {
  private readonly slots = new Map<string, Slot>();

  private readonly listeners = new Map<string, Set<() => void>>();

  private notify(url: string): void {
    this.listeners.get(url)?.forEach((listener) => listener());
  }

  /** Starts showing a download. Until its first report nothing is known about its length. */
  begin(url: string): MediaProgressTracker {
    const slot = this.slots.get(url);
    if (slot) {
      slot.trackers += 1;
    } else {
      this.slots.set(url, {
        state: { status: 'loading', progress: { length: 'unknown', loaded: 0 } },
        trackers: 1,
      });
      this.notify(url);
    }

    let ended = false;
    return {
      report: (progress) => {
        const current = this.slots.get(url);
        // listeners render per report, so one that shows the same figure is dropped
        if (ended || !current || sameFigure(current.state.progress, progress)) return;
        current.state = { status: 'loading', progress };
        this.notify(url);
      },
      end: () => {
        const current = this.slots.get(url);
        if (ended || !current) return;
        ended = true;
        current.trackers -= 1;
        if (current.trackers > 0) return;
        this.slots.delete(url);
        this.notify(url);
      },
    };
  }

  /** The same object until the figure changes, as `useSyncExternalStore` requires. */
  get(url: string): MediaProgressState {
    return this.slots.get(url)?.state ?? IDLE_PROGRESS;
  }

  subscribe(url: string, listener: () => void): () => void {
    const listeners = this.listeners.get(url) ?? new Set();
    this.listeners.set(url, listeners);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.listeners.delete(url);
    };
  }
}

export const mediaProgress = new MediaProgressStore();
