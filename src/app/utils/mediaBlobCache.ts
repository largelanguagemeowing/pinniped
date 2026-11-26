// Keeps loaded media in memory, so showing it again (scrolling back, opening the viewer) does not
// download and decrypt it again. Blobs in use are never evicted; the limits bound what is kept
// beyond them, least recently used first. A blob's object URL belongs to its entry and is revoked
// when the entry goes, so no URL outlives the cache's record of it.
//
// Memory only, on purpose: decrypted media is never written to storage from here.

export type BlobCacheLimits = { maxEntries: number; maxBytes: number };

export const MEDIA_CACHE_LIMITS: BlobCacheLimits = { maxEntries: 512, maxBytes: 32 * 1024 * 1024 };

/** How object URLs are made and released. */
export type ObjectUrls = { create: (blob: Blob) => string; revoke: (url: string) => void };

/** A wait for the blob of a key. It counts as a use of the blob until released. */
export type BlobRequest = { blob: Promise<Blob>; release: () => void };

/** A use of a loaded blob through its object URL, which stays valid until released. */
export type BlobLease = { url: string; release: () => void };

export type BlobCacheUsage = { inUse: number; kept: number; keptBytes: number };

type Entry = {
  key: string;
  // requests and leases not released yet
  uses: number;
  // false once evicted, discarded, failed or abandoned: no longer what its key is answered from
  cached: boolean;
  content:
    | { status: 'loading'; abort: AbortController }
    // the URL is made when the blob is first held; a blob that is only read never gets one
    | { status: 'ready'; blob: Blob; url: string | undefined };
  blob: Promise<Blob>;
};

export class BlobCache {
  private readonly entries = new Map<string, Entry>();

  // loaded entries nothing uses, least recently used first; what the limits apply to
  private readonly kept = new Map<string, Entry>();

  private keptBytes = 0;

  private inUse = 0;

  private readonly owners = new WeakMap<Blob, Entry>();

  constructor(
    private readonly limits: BlobCacheLimits,
    private readonly urls: ObjectUrls
  ) {}

  /**
   * The blob of `key`: the cached one, the load already running for it, or a new load. A load
   * is aborted through its signal once every request for it has been released, and a failed
   * load is not kept.
   */
  request(key: string, load: (signal: AbortSignal) => Promise<Blob>): BlobRequest {
    const entry = this.entries.get(key) ?? this.start(key, load);
    return { blob: entry.blob, release: this.use(entry) };
  }

  /** The object URL of a blob this cache loaded and still has; shared by all its holders. */
  hold(blob: Blob): BlobLease | undefined {
    const entry = this.owners.get(blob);
    if (entry?.content.status !== 'ready') return undefined;
    const { content } = entry;
    const release = this.use(entry);
    content.url ??= this.urls.create(blob);
    return { url: content.url, release };
  }

  /**
   * Forgets a blob that turned out to be unusable, so the next request loads it again. Its URL
   * stays valid for those still holding it.
   */
  discard(blob: Blob): void {
    const entry = this.owners.get(blob);
    if (!entry) return;
    this.drop(entry);
    if (entry.uses === 0) this.revoke(entry);
  }

  /** Evicts everything that is not in use. */
  clear(): void {
    [...this.kept.values()].forEach((entry) => this.evict(entry));
  }

  usage(): BlobCacheUsage {
    return { inUse: this.inUse, kept: this.kept.size, keptBytes: this.keptBytes };
  }

  private start(key: string, load: (signal: AbortSignal) => Promise<Blob>): Entry {
    const abort = new AbortController();
    const entry: Entry = {
      key,
      uses: 0,
      cached: true,
      content: { status: 'loading', abort },
      blob: new Promise<Blob>((resolve) => {
        resolve(load(abort.signal));
      }).then(
        (blob) => {
          // an abandoned load may still deliver; that is not kept
          if (entry.cached) {
            entry.content = { status: 'ready', blob, url: undefined };
            this.owners.set(blob, entry);
          }
          return blob;
        },
        (error: unknown) => {
          this.drop(entry);
          throw error;
        }
      ),
    };
    // the failure is for those waiting; a request released early does not handle it
    entry.blob.catch(() => undefined);
    this.entries.set(key, entry);
    return entry;
  }

  // counts a use and returns its release, which counts once
  private use(entry: Entry): () => void {
    if (entry.uses === 0) {
      this.inUse += 1;
      this.unkeep(entry);
    }
    entry.uses += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      entry.uses -= 1;
      if (entry.uses > 0) return;
      this.inUse -= 1;
      this.unused(entry);
    };
  }

  private unused(entry: Entry): void {
    const { content } = entry;
    if (content.status === 'loading') {
      content.abort.abort();
      this.drop(entry);
    } else if (!entry.cached) {
      this.revoke(entry);
    } else if (content.blob.size > this.limits.maxBytes) {
      // it alone is over the limit; keeping it would push everything else out
      this.evict(entry);
    } else {
      this.kept.set(entry.key, entry);
      this.keptBytes += content.blob.size;
      this.trim();
    }
  }

  private trim(): void {
    const { maxEntries, maxBytes } = this.limits;
    for (const oldest of this.kept.values()) {
      if (this.kept.size <= maxEntries && this.keptBytes <= maxBytes) return;
      this.evict(oldest);
    }
  }

  private unkeep(entry: Entry): void {
    if (this.kept.get(entry.key) !== entry || entry.content.status !== 'ready') return;
    this.kept.delete(entry.key);
    this.keptBytes -= entry.content.blob.size;
  }

  // the entry stops being what its key and its blob are answered from
  private drop(entry: Entry): void {
    this.unkeep(entry);
    entry.cached = false;
    if (this.entries.get(entry.key) === entry) this.entries.delete(entry.key);
    if (entry.content.status === 'ready' && this.owners.get(entry.content.blob) === entry) {
      this.owners.delete(entry.content.blob);
    }
  }

  private revoke(entry: Entry): void {
    if (entry.content.status !== 'ready' || entry.content.url === undefined) return;
    this.urls.revoke(entry.content.url);
    entry.content.url = undefined;
  }

  private evict(entry: Entry): void {
    this.drop(entry);
    this.revoke(entry);
  }
}

export const mediaBlobCache = new BlobCache(MEDIA_CACHE_LIMITS, {
  create: (blob) => URL.createObjectURL(blob),
  revoke: (url) => URL.revokeObjectURL(url),
});
