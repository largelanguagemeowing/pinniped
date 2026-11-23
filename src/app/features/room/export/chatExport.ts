import {
  EventTimelineSet,
  IContent,
  MatrixEvent,
  MsgType,
  RelationType,
  Room,
} from 'matrix-js-sdk';
import { IEncryptedFile } from '../../../../types/matrix/common';
import { MessageEvent } from '../../../../types/matrix/room';
import {
  getEditedEvent,
  getEventReactions,
  getMemberDisplayName,
  trimReplyFromBody,
  trimReplyFromFormattedBody,
} from '../../../utils/room';
import { getMxIdLocalPart } from '../../../utils/matrix';
import { getEventIdAbsoluteIndex, getLinkedTimelines } from '../../../utils/timeline';
import { isPollStartType, parsePollStart } from '../../../utils/poll';

export const CHAT_EXPORT_GENERATOR = 'pinniped';
export const CHAT_EXPORT_VERSION = 1;
export const CHAT_EXPORT_MESSAGE_FILE = 'messages.json';
export const CHAT_EXPORT_FILES_DIR = 'files';

export class ChatExportError extends Error {}

export type ExportReaction = {
  key: string;
  senders: string[];
};

export type ExportFile = {
  /** Path inside the archive, missing when the download failed. */
  path?: string;
  mimetype?: string;
  name?: string;
  size?: number;
  width?: number;
  height?: number;
  error?: string;
};

export type ExportPoll = {
  question: string;
  answers: string[];
  maxSelections: number;
  disclosed: boolean;
  closesAt?: string;
};

export type ExportMessage = {
  eventId: string;
  sender: { id: string; name: string };
  /** ISO 8601, UTC. */
  timestamp: string;
  type: string;
  msgtype?: string;
  body?: string;
  formattedBody?: string;
  edited?: boolean;
  /** Event id of the message this one replies to. */
  replyTo?: string;
  threadId?: string;
  redacted?: boolean;
  redactionReason?: string;
  decryptionFailure?: boolean;
  file?: ExportFile;
  poll?: ExportPoll;
  reactions?: ExportReaction[];
};

export type ChatExport = {
  generator: string;
  version: number;
  exportedAt: string;
  room: { id: string; name: string; topic?: string };
  range: {
    startEventId: string;
    endEventId: string;
    startTimestamp: string;
    endTimestamp: string;
  };
  messages: ExportMessage[];
};

export type ExportImageRef = {
  mxcUrl: string;
  encInfo?: IEncryptedFile;
  mimetype?: string;
  name?: string;
  size?: number;
  width?: number;
  height?: number;
};

/** Media an image message or sticker references. */
export const getExportImageRef = (mEvent: MatrixEvent): ExportImageRef | undefined => {
  if (mEvent.isRedacted() || mEvent.isDecryptionFailure()) return undefined;

  const content = mEvent.getContent();
  const isImageMessage = content.msgtype === MsgType.Image;
  const isSticker = mEvent.getType() === MessageEvent.Sticker;
  if (!isImageMessage && !isSticker) return undefined;

  const mxcUrl = typeof content.file?.url === 'string' ? content.file.url : content.url;
  if (typeof mxcUrl !== 'string') return undefined;

  const info = content.info ?? {};
  return {
    mxcUrl,
    encInfo: content.file,
    mimetype: typeof info.mimetype === 'string' ? info.mimetype : undefined,
    name: content.filename ?? content.body,
    size: typeof info.size === 'number' ? info.size : undefined,
    width: typeof info.w === 'number' ? info.w : undefined,
    height: typeof info.h === 'number' ? info.h : undefined,
  };
};

/**
 * Events that make it into the export. State events and relations (edits,
 * reactions, poll votes) are skipped; thread replies are part of the timeline
 * and stay in, carrying their thread id.
 */
export const isExportableEvent = (mEvent: MatrixEvent): boolean => {
  if (typeof mEvent.getStateKey() === 'string') return false;
  const relType = mEvent.getRelation()?.rel_type;
  if (relType !== undefined && relType !== RelationType.Thread) return false;

  const type = mEvent.getType();
  return (
    type === MessageEvent.RoomMessage ||
    type === MessageEvent.RoomMessageEncrypted ||
    type === MessageEvent.Sticker ||
    isPollStartType(type)
  );
};

/**
 * All loaded events between two anchors, in timeline order, inclusive. Undefined
 * while the anchors sit in timelines that are not linked to each other, e.g. one
 * was marked after a jump to an old message and the other in the live timeline.
 */
export const findExportRangeEvents = (
  room: Room,
  startEventId: string,
  endEventId: string
): MatrixEvent[] | undefined => {
  const timelineSet = room.getUnfilteredTimelineSet();
  const startTimeline = timelineSet.getTimelineForEvent(startEventId);
  if (!startTimeline) return undefined;

  // The chain the anchors are in, not the live one: the live chain need not hold them.
  const linkedTimelines = getLinkedTimelines(startTimeline);
  const events = linkedTimelines.flatMap((timeline) => timeline.getEvents());

  const absoluteIndex = (eventId: string): number | undefined => {
    const eventTimeline = timelineSet.getTimelineForEvent(eventId);
    if (!eventTimeline) return undefined;
    return getEventIdAbsoluteIndex(linkedTimelines, eventTimeline, eventId);
  };

  const startIndex = absoluteIndex(startEventId);
  const endIndex = absoluteIndex(endEventId);
  if (startIndex === undefined || endIndex === undefined) return undefined;

  const from = Math.min(startIndex, endIndex);
  const to = Math.max(startIndex, endIndex);
  return events.slice(from, to + 1);
};

export const getExportRangeEvents = (
  room: Room,
  startEventId: string,
  endEventId: string
): MatrixEvent[] => {
  const events = findExportRangeEvents(room, startEventId, endEventId);
  if (!events) {
    throw new ChatExportError(
      'The selected messages are no longer loaded. Select the range again.'
    );
  }
  return events;
};

export const defaultSenderName = (room: Room, userId: string): string =>
  getMemberDisplayName(room, userId) ?? getMxIdLocalPart(userId) ?? userId;

export type ExportRangeSummary = {
  messages: number;
  images: number;
};

/** Counts what an export of the given events would contain. */
export const summarizeExportRange = (events: MatrixEvent[]): ExportRangeSummary => {
  let messages = 0;
  let images = 0;

  events.forEach((mEvent) => {
    if (!isExportableEvent(mEvent)) return;
    messages += 1;
    if (getExportImageRef(mEvent)) images += 1;
  });

  return { messages, images };
};

const getExportReactions = (
  timelineSet: EventTimelineSet,
  eventId: string
): ExportReaction[] | undefined => {
  const sorted = getEventReactions(timelineSet, eventId)?.getSortedAnnotationsByKey() as
    [string, Set<MatrixEvent>][] | null | undefined;
  if (!sorted || sorted.length === 0) return undefined;

  return sorted.map(([key, reactions]) => ({
    key,
    senders: Array.from(new Set(Array.from(reactions).map((evt) => evt.getSender() ?? ''))).filter(
      Boolean
    ),
  }));
};

const getEventContent = (
  mEvent: MatrixEvent,
  timelineSet?: EventTimelineSet
): { content: IContent; edited: boolean } => {
  const eventId = mEvent.getId();
  if (eventId && timelineSet) {
    const newContent = getEditedEvent(eventId, mEvent, timelineSet)?.getContent()['m.new_content'];
    if (newContent) return { content: newContent, edited: true };
  }
  return { content: mEvent.getContent(), edited: false };
};

const getBody = (content: IContent): string | undefined => {
  if (typeof content.body !== 'string') return undefined;
  if (content.msgtype === MsgType.Emote) return content.body;
  return trimReplyFromBody(content.body);
};

const getFormattedBody = (content: IContent): string | undefined => {
  if (typeof content.formatted_body !== 'string') return undefined;
  if (content.msgtype === MsgType.Emote) return content.formatted_body;
  return trimReplyFromFormattedBody(content.formatted_body);
};

export type ExportMessageOptions = {
  timelineSet?: EventTimelineSet;
  getSenderName: (userId: string) => string;
  resolveFile?: (mEvent: MatrixEvent) => ExportFile | undefined;
};

/** Maps a timeline event to its export representation, or undefined to skip it. */
export const toExportMessage = (
  mEvent: MatrixEvent,
  options: ExportMessageOptions
): ExportMessage | undefined => {
  if (!isExportableEvent(mEvent)) return undefined;

  const eventId = mEvent.getId();
  if (!eventId) return undefined;

  const senderId = mEvent.getSender() ?? '';
  const base: ExportMessage = {
    eventId,
    sender: { id: senderId, name: options.getSenderName(senderId) },
    timestamp: new Date(mEvent.getTs()).toISOString(),
    type: mEvent.getType(),
  };

  if (mEvent.isRedacted()) {
    const reason = mEvent.getUnsigned().redacted_because?.content?.reason;
    return {
      ...base,
      redacted: true,
      redactionReason: typeof reason === 'string' ? reason : undefined,
    };
  }

  if (mEvent.isDecryptionFailure()) {
    return { ...base, type: MessageEvent.RoomMessage, decryptionFailure: true };
  }

  const { content, edited } = getEventContent(mEvent, options.timelineSet);
  const message: ExportMessage = {
    ...base,
    type:
      mEvent.getType() === MessageEvent.Sticker ? MessageEvent.Sticker : MessageEvent.RoomMessage,
    msgtype: typeof content.msgtype === 'string' ? content.msgtype : undefined,
    body: getBody(content),
    formattedBody: getFormattedBody(content),
  };

  if (edited) message.edited = true;
  if (typeof mEvent.replyEventId === 'string') message.replyTo = mEvent.replyEventId;
  if (typeof mEvent.threadRootId === 'string') message.threadId = mEvent.threadRootId;

  const file = options.resolveFile?.(mEvent);
  if (file) message.file = file;

  const poll = parsePollStart(content);
  if (poll) {
    message.poll = {
      question: poll.question,
      answers: poll.answers.map((answer) => answer.text),
      maxSelections: poll.maxSelections,
      disclosed: poll.disclosed,
      closesAt: poll.expiresAt ? new Date(poll.expiresAt).toISOString() : undefined,
    };
  }

  if (options.timelineSet) {
    const reactions = getExportReactions(options.timelineSet, eventId);
    if (reactions) message.reactions = reactions;
  }

  return message;
};
