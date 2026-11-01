import JSZip from 'jszip';
import FileSaver from 'file-saver';
import { MatrixClient, MatrixEvent, Room } from 'matrix-js-sdk';
import {
  CHAT_EXPORT_FILES_DIR,
  CHAT_EXPORT_GENERATOR,
  CHAT_EXPORT_MESSAGE_FILE,
  CHAT_EXPORT_VERSION,
  ChatExport,
  ChatExportError,
  ExportFile,
  ExportImageRef,
  ExportMessage,
  ExportRangeSummary,
  defaultSenderName,
  findExportRangeEvents,
  getExportImageRef,
  summarizeExportRange,
  toExportMessage,
} from './chatExport';
import { decryptFile, mxcUrlToHttp } from '../../../utils/matrix';
import { FALLBACK_MIMETYPE, getFileNameExt, mimeTypeToSafeExt } from '../../../utils/mimeTypes';
import { decryptAllTimelineEvent, getStateEvent } from '../../../utils/room';
import { StateEvent } from '../../../../types/matrix/room';
import { getLinkedTimelines, getLiveTimeline } from '../../../utils/timeline';

const FALLBACK_FILE_EXT = 'bin';
const MAX_EXT_LENGTH = 8;
const MAX_FILE_NAME_LENGTH = 96;

export const sanitizeExportFileName = (name: string): string => {
  const withoutPath = name.replace(/[/\\]/g, '_');
  const cleaned = withoutPath.replace(/[^a-zA-Z0-9-_. ]+/g, '_').replace(/^[_. ]+|[_. ]+$/g, '');
  return cleaned.slice(0, MAX_FILE_NAME_LENGTH) || 'image';
};

const splitExtension = (name: string): [string, string] => {
  const ext = getFileNameExt(name);
  if (ext === name || ext.length === 0 || ext.length > MAX_EXT_LENGTH) return [name, ''];
  return [name.slice(0, name.length - ext.length - 1), `.${ext}`];
};

const pickExtension = (ref: ExportImageRef): string => {
  const fromName = ref.name ? splitExtension(sanitizeExportFileName(ref.name))[1] : '';
  if (fromName) return fromName;
  const fromMimetype =
    ref.mimetype && ref.mimetype !== FALLBACK_MIMETYPE ? mimeTypeToSafeExt(ref.mimetype) : '';
  return fromMimetype ? `.${fromMimetype}` : `.${FALLBACK_FILE_EXT}`;
};

export type ExportImageTask = {
  ref: ExportImageRef;
  file: ExportFile;
};

/**
 * Assigns stable names under files/ to exported images and remembers what
 * needs downloading. Messages are mapped synchronously, downloads follow.
 * Media reused in several messages is only stored once.
 */
export class ChatExportImageCollector {
  private tasksByMxc = new Map<string, ExportImageTask>();

  private usedNames = new Set<string>();

  collect(mEvent: MatrixEvent): ExportFile | undefined {
    const ref = getExportImageRef(mEvent);
    if (!ref) return undefined;

    const existing = this.tasksByMxc.get(ref.mxcUrl);
    if (existing) return existing.file;

    const [stem, nameExt] = splitExtension(
      sanitizeExportFileName(ref.name || mEvent.getId() || 'image')
    );
    const ext = nameExt || pickExtension(ref);
    let name = `${stem}${ext}`;
    let suffix = 2;
    while (this.usedNames.has(name.toLowerCase())) {
      name = `${stem}-${suffix}${ext}`;
      suffix += 1;
    }
    this.usedNames.add(name.toLowerCase());

    const file: ExportFile = {
      path: `${CHAT_EXPORT_FILES_DIR}/${name}`,
      mimetype: ref.mimetype,
      name: ref.name,
      size: ref.size,
      width: ref.width,
      height: ref.height,
    };
    this.tasksByMxc.set(ref.mxcUrl, { ref, file });
    return file;
  }

  get tasks(): ExportImageTask[] {
    return Array.from(this.tasksByMxc.values());
  }
}

const fetchImage = async (
  mx: MatrixClient,
  useAuthentication: boolean,
  ref: ExportImageRef
): Promise<Blob> => {
  const httpUrl = mxcUrlToHttp(mx, ref.mxcUrl, useAuthentication);
  if (!httpUrl) throw new Error('Could not resolve media URL');

  // Media requests are authenticated by the service worker.
  const res = await fetch(httpUrl, { method: 'GET' });
  if (!res.ok) throw new Error(`Download failed with status ${res.status}`);
  const downloaded = await res.blob();
  if (!ref.encInfo) return downloaded;
  return decryptFile(
    await downloaded.arrayBuffer(),
    ref.mimetype ?? FALLBACK_MIMETYPE,
    ref.encInfo
  );
};

export type ExportImageBlobs = Map<string, Blob>;

/**
 * Downloads images one after another to keep the memory footprint predictable
 * and reports progress after each download. A failed download is recorded on
 * its file entry instead of aborting the export.
 */
export const downloadExportImages = async (
  mx: MatrixClient,
  useAuthentication: boolean,
  tasks: ExportImageTask[],
  onProgress: (done: number, total: number) => void
): Promise<ExportImageBlobs> => {
  const blobs: ExportImageBlobs = new Map();

  const downloadNext = async (index: number): Promise<void> => {
    if (index >= tasks.length) return;
    const { ref, file } = tasks[index];
    const { path } = file;

    try {
      const blob = await fetchImage(mx, useAuthentication, ref);
      if (path) blobs.set(path, blob);
      file.size = blob.size;
    } catch (e) {
      file.error = e instanceof Error ? e.message : 'Download failed';
      delete file.path;
    }
    onProgress(index + 1, tasks.length);
    await downloadNext(index + 1);
  };

  await downloadNext(0);
  return blobs;
};

/**
 * Retries decryption of the room timeline. Anchors are always loaded events, so
 * this only makes their content readable where keys arrived after the fact.
 */
const decryptRoomTimeline = async (mx: MatrixClient, room: Room): Promise<void> => {
  if (!room.hasEncryptionStateEvent() || !mx.getCrypto()) return;
  await Promise.allSettled(
    getLinkedTimelines(getLiveTimeline(room)).map((timeline) =>
      decryptAllTimelineEvent(mx, timeline)
    )
  );
};

export type ExportSummary = {
  messages: number;
  images: number;
  failedImages: number;
  fileName: string;
};

export type ExportPreview = {
  events: MatrixEvent[];
  summary: ExportRangeSummary;
};

/**
 * Resolves the anchors to their events and counts the content. Decryption is
 * retried first so undecryptable messages do not hide their images.
 */
export const prepareExport = async (
  mx: MatrixClient,
  room: Room,
  startEventId: string,
  endEventId: string
): Promise<ExportPreview> => {
  await decryptRoomTimeline(mx, room);

  const events = findExportRangeEvents(room, startEventId, endEventId);
  if (!events) {
    throw new ChatExportError(
      'The selected messages are no longer loaded. Select the range again.'
    );
  }

  const summary = summarizeExportRange(events);
  if (summary.messages === 0) {
    throw new ChatExportError('The selected range has no messages to export.');
  }
  return { events, summary };
};

/** Builds the JSON document for the range, assigning image file names on the way. */
export const buildChatExport = (
  room: Room,
  events: MatrixEvent[],
  collector: ChatExportImageCollector,
  startEventId: string,
  endEventId: string
): ChatExport => {
  const timelineSet = room.getUnfilteredTimelineSet();
  const messages: ExportMessage[] = [];

  events.forEach((mEvent) => {
    const message = toExportMessage(mEvent, {
      timelineSet,
      getSenderName: (userId) => defaultSenderName(room, userId),
      resolveFile: (evt) => collector.collect(evt),
    });
    if (message) messages.push(message);
  });

  const topicContent = getStateEvent(room, StateEvent.RoomTopic)?.getContent();
  const topic =
    typeof topicContent?.topic === 'string' ? (topicContent.topic as string) : undefined;

  return {
    generator: CHAT_EXPORT_GENERATOR,
    version: CHAT_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    room: { id: room.roomId, name: room.name, topic },
    range: {
      startEventId,
      endEventId,
      startTimestamp: new Date(events[0].getTs()).toISOString(),
      endTimestamp: new Date(events[events.length - 1].getTs()).toISOString(),
    },
    messages,
  };
};

export const sanitizeArchiveName = (name: string): string => {
  const cleaned = name
    .replace(/[/\\]+/g, ' ')
    .replace(/[^a-zA-Z0-9-_. ]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '');
  return cleaned.slice(0, 64) || 'room';
};

const localDay = (ts: number): string => {
  const date = new Date(ts);
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

export const buildArchiveName = (roomName: string, startTs: number, endTs: number): string => {
  const startDay = localDay(Math.min(startTs, endTs));
  const endDay = localDay(Math.max(startTs, endTs));
  const range = startDay === endDay ? startDay : `${startDay}_${endDay}`;
  return `${sanitizeArchiveName(roomName)}-${range}.zip`;
};

export type ExportProgress = {
  stage: 'packing' | 'downloading';
  done: number;
  total: number;
};

export type ExportChatOptions = {
  mx: MatrixClient;
  room: Room;
  preview: ExportPreview;
  startEventId: string;
  endEventId: string;
  useAuthentication: boolean;
  onProgress?: (progress: ExportProgress) => void;
};

/**
 * Downloads every attached image into files/, writes messages.json next to it
 * and saves the result as one zip archive.
 */
export const exportChat = async ({
  mx,
  room,
  preview,
  startEventId,
  endEventId,
  useAuthentication,
  onProgress,
}: ExportChatOptions): Promise<ExportSummary> => {
  const collector = new ChatExportImageCollector();
  const exportData = buildChatExport(room, preview.events, collector, startEventId, endEventId);

  onProgress?.({ stage: 'downloading', done: 0, total: collector.tasks.length });
  const blobs = await downloadExportImages(mx, useAuthentication, collector.tasks, (done, total) =>
    onProgress?.({ stage: 'downloading', done, total })
  );

  onProgress?.({ stage: 'packing', done: 0, total: 1 });
  const imageCount = blobs.size;
  const zip = new JSZip();
  // JSZip treats Blobs as an optional capability; byte arrays work everywhere and
  // let each blob be released as soon as it is written.
  const paths = Array.from(blobs.keys());
  const writeNext = async (index: number): Promise<void> => {
    if (index >= paths.length) return;
    const path = paths[index];
    const blob = blobs.get(path);
    if (blob) {
      zip.file(path, new Uint8Array(await blob.arrayBuffer()));
      blobs.delete(path);
    }
    await writeNext(index + 1);
  };
  await writeNext(0);
  // Serialized after downloading so failed files keep their error and lose their path.
  zip.file(CHAT_EXPORT_MESSAGE_FILE, JSON.stringify(exportData, null, 2));

  const archive = await zip.generateAsync({ type: 'blob' });
  const startTs = new Date(exportData.range.startTimestamp).getTime();
  const endTs = new Date(exportData.range.endTimestamp).getTime();
  const fileName = buildArchiveName(room.name || room.roomId, startTs, endTs);
  FileSaver.saveAs(archive, fileName);

  return {
    messages: exportData.messages.length,
    images: imageCount,
    failedImages: collector.tasks.filter((task) => task.file.error !== undefined).length,
    fileName,
  };
};
