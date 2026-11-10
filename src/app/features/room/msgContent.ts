import { EventType, IContent, MatrixClient, MsgType, RelationType } from 'matrix-js-sdk';
import { RoomMessageEventContent, StickerEventContent } from 'matrix-js-sdk/lib/types';
import to from 'await-to-js';
import {
  IThumbnailContent,
  MATRIX_BLUR_HASH_PROPERTY_NAME,
  MATRIX_SPOILER_PROPERTY_NAME,
} from '../../../types/matrix/common';
import {
  getImageFileUrl,
  getThumbnail,
  getThumbnailDimensions,
  getVideoFileUrl,
  loadImageElement,
  loadVideoElement,
} from '../../utils/dom';
import { encryptFile, getImageInfo, getThumbnailContent, getVideoInfo } from '../../utils/matrix';
import { IReplyDraft, TUploadItem } from '../../state/room/roomInputDrafts';
import { ATTACHMENTS_CONTENT_KEY } from '../../utils/attachments';
import { encodeBlurHash } from '../../utils/blurHash';
import { scaleYDimension } from '../../utils/common';

const generateThumbnailContent = async (
  mx: MatrixClient,
  img: HTMLImageElement | HTMLVideoElement,
  dimensions: [number, number],
  encrypt: boolean
): Promise<IThumbnailContent> => {
  const thumbnail = await getThumbnail(img, ...dimensions);
  if (!thumbnail) throw new Error('Can not create thumbnail!');
  const encThumbData = encrypt ? await encryptFile(thumbnail) : undefined;
  const thumbnailFile = encThumbData?.file ?? thumbnail;
  if (!thumbnailFile) throw new Error('Can not create thumbnail!');

  const data = await mx.uploadContent(thumbnailFile);
  const thumbMxc = data?.content_uri;
  if (!thumbMxc) throw new Error('Failed when uploading thumbnail!');
  const thumbnailContent = getThumbnailContent({
    thumbnail: thumbnailFile,
    encInfo: encThumbData?.encInfo,
    mxc: thumbMxc,
    width: dimensions[0],
    height: dimensions[1],
  });
  return thumbnailContent;
};

export const getImageMsgContent = async (
  mx: MatrixClient,
  item: TUploadItem,
  mxc: string
): Promise<IContent> => {
  const { file, originalFile, encInfo, metadata } = item;
  const [imgError, imgEl] = await to(loadImageElement(getImageFileUrl(originalFile)));
  if (imgError) console.warn(imgError);

  const content: IContent = {
    msgtype: MsgType.Image,
    filename: file.name,
    body: file.name,
    [MATRIX_SPOILER_PROPERTY_NAME]: metadata.markedAsSpoiler,
  };
  if (imgEl) {
    const blurHash = encodeBlurHash(imgEl, 512, scaleYDimension(imgEl.width, 512, imgEl.height));

    content.info = {
      ...getImageInfo(imgEl, file),
      [MATRIX_BLUR_HASH_PROPERTY_NAME]: blurHash,
    };
  }
  if (encInfo) {
    content.file = {
      ...encInfo,
      url: mxc,
    };
  } else {
    content.url = mxc;
  }
  return content;
};

export const getVideoMsgContent = async (
  mx: MatrixClient,
  item: TUploadItem,
  mxc: string
): Promise<IContent> => {
  const { file, originalFile, encInfo, metadata } = item;

  const [videoError, videoEl] = await to(loadVideoElement(getVideoFileUrl(originalFile)));
  if (videoError) console.warn(videoError);

  const content: IContent = {
    msgtype: MsgType.Video,
    filename: file.name,
    body: file.name,
    [MATRIX_SPOILER_PROPERTY_NAME]: metadata.markedAsSpoiler,
  };
  if (videoEl) {
    const [thumbError, thumbContent] = await to(
      generateThumbnailContent(
        mx,
        videoEl,
        getThumbnailDimensions(videoEl.videoWidth, videoEl.videoHeight),
        !!encInfo
      )
    );
    if (thumbContent && thumbContent.thumbnail_info) {
      thumbContent.thumbnail_info[MATRIX_BLUR_HASH_PROPERTY_NAME] = encodeBlurHash(
        videoEl,
        512,
        scaleYDimension(videoEl.videoWidth, 512, videoEl.videoHeight)
      );
    }
    if (thumbError) console.warn(thumbError);
    content.info = {
      ...getVideoInfo(videoEl, file),
      ...thumbContent,
    };
  }
  if (encInfo) {
    content.file = {
      ...encInfo,
      url: mxc,
    };
  } else {
    content.url = mxc;
  }
  return content;
};

export const getAudioMsgContent = (item: TUploadItem, mxc: string): IContent => {
  const { file, encInfo } = item;
  const content: IContent = {
    msgtype: MsgType.Audio,
    filename: file.name,
    body: file.name,
    info: {
      mimetype: file.type,
      size: file.size,
    },
  };
  if (encInfo) {
    content.file = {
      ...encInfo,
      url: mxc,
    };
  } else {
    content.url = mxc;
  }
  return content;
};

export const getFileMsgContent = (item: TUploadItem, mxc: string): IContent => {
  const { file, encInfo } = item;
  const content: IContent = {
    msgtype: MsgType.File,
    body: file.name,
    filename: file.name,
    info: {
      mimetype: file.type,
      size: file.size,
    },
  };
  if (encInfo) {
    content.file = {
      ...encInfo,
      url: mxc,
    };
  } else {
    content.url = mxc;
  }
  return content;
};

export const addReplyRelation = (content: IContent, replyDraft?: IReplyDraft): IContent => {
  if (!replyDraft) return content;

  const relation: Record<string, unknown> = {
    'm.in_reply_to': {
      event_id: replyDraft.eventId,
    },
  };
  if (replyDraft.relation?.rel_type === RelationType.Thread) {
    relation.event_id = replyDraft.relation.event_id;
    relation.rel_type = RelationType.Thread;
    relation.is_falling_back = false;
  }

  return { ...content, 'm.relates_to': relation };
};

// The SDK's room message type models a relation as replacement, plain relation or reply, so it
// cannot express a thread reply (`m.thread` with `m.in_reply_to`), and its sticker type has no
// relation at all. Both are content our builders create, so widen at this one boundary.
export const sendRoomMessage = (mx: MatrixClient, roomId: string, content: IContent) =>
  mx.sendMessage(roomId, content as RoomMessageEventContent);

export const sendRoomSticker = (mx: MatrixClient, roomId: string, content: IContent) =>
  mx.sendEvent(roomId, EventType.Sticker, content as StickerEventContent);

type UploadMessages = {
  /** One message content per uploaded file, in the order they were picked. */
  files: IContent[];
  /** What was typed alongside the files, as a text message content. */
  caption?: IContent;
  /** Shared by every file when there are several, see utils/attachments.ts. */
  groupId?: string;
  replyDraft?: IReplyDraft;
};

/**
 * The events a send with files goes out as: one per file, since that is what every Matrix client
 * can show.
 *
 * - Several files carry the same group id, so Pinniped draws them as one grid.
 * - The typed text is the caption of the first file, so it reads as one message. With no file to
 *   carry it, it is sent as plain text.
 * - Only the first event carries a reply: the files are one message, and a reply on each would
 *   show the quoted message once per file in clients that do not group them. Inside a thread every
 *   event keeps the relation, or the later files would land in the main timeline.
 */
export const getUploadMessages = ({
  files,
  caption,
  groupId,
  replyDraft,
}: UploadMessages): IContent[] => {
  const grouped = groupId
    ? files.map((content) => ({ ...content, [ATTACHMENTS_CONTENT_KEY]: groupId }))
    : files;

  let messages: IContent[] = grouped;
  if (caption) {
    messages =
      grouped.length > 0
        ? [
            {
              ...grouped[0],
              body: caption.body,
              ...(caption.format
                ? { format: caption.format, formatted_body: caption.formatted_body }
                : {}),
              'm.mentions': caption['m.mentions'],
            },
            ...grouped.slice(1),
          ]
        : [caption];
  }

  const inThread = replyDraft?.relation?.rel_type === RelationType.Thread;
  return messages.map((content, index) =>
    index === 0 || inThread ? addReplyRelation(content, replyDraft) : content
  );
};
