import { atom } from 'jotai';
import { atomFamily } from 'jotai-family';
import { Descendant } from 'slate';
import { EncryptedAttachmentInfo } from 'browser-encrypt-attachment';
import { IEventRelation } from 'matrix-js-sdk';
import { createUploadAtomFamily } from '../upload';
import { TUploadContent } from '../../utils/matrix';
import { createListAtom } from '../list';
import { loadMsgDraft, storeMsgDraft } from './msgDraftStore';

export type TUploadMetadata = {
  markedAsSpoiler: boolean;
};

export type TUploadItem = {
  file: TUploadContent;
  originalFile: TUploadContent;
  metadata: TUploadMetadata;
  encInfo: EncryptedAttachmentInfo | undefined;
};

export type TUploadListAtom = ReturnType<typeof createListAtom<TUploadItem>>;

export const roomIdToUploadItemsAtomFamily = atomFamily<string, TUploadListAtom>(createListAtom);

export const roomUploadAtomFamily = createUploadAtomFamily();

export type RoomIdToMsgAction =
  | {
      type: 'PUT';
      roomId: string;
      msg: Descendant[];
    }
  | {
      type: 'DELETE';
      roomId: string;
    };

/** The room's unsent composer text. Starts from the stored draft and stores every change. */
const createMsgDraftAtom = (roomId: string) => {
  const draftAtom = atom<Descendant[]>(loadMsgDraft(roomId));
  return atom<Descendant[], [Descendant[]], undefined>(
    (get) => get(draftAtom),
    (get, set, draft) => {
      set(draftAtom, draft);
      storeMsgDraft(roomId, draft);
    }
  );
};
export type TMsgDraftAtom = ReturnType<typeof createMsgDraftAtom>;
export const roomIdToMsgDraftAtomFamily = atomFamily<string, TMsgDraftAtom>(createMsgDraftAtom);

export type IReplyDraft = {
  userId: string;
  eventId: string;
  body: string;
  formattedBody?: string | undefined;
  relation?: IEventRelation | undefined;
};
const createReplyDraftAtom = () => atom<IReplyDraft | undefined>(undefined);
export type TReplyDraftAtom = ReturnType<typeof createReplyDraftAtom>;
export const roomIdToReplyDraftAtomFamily = atomFamily<string, TReplyDraftAtom>(() =>
  createReplyDraftAtom()
);
