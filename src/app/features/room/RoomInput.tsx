import React, {
  CSSProperties,
  KeyboardEventHandler,
  RefObject,
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { isKeyHotkey } from 'is-hotkey';
import { IContent, MsgType, RelationType, Room } from 'matrix-js-sdk';
import { Transforms, Editor } from 'slate';
import FocusTrap from 'focus-trap-react';
import {
  Box,
  Dialog,
  Icon,
  IconButton,
  Icons,
  Menu,
  MenuItem,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  PopOut,
  RectCords,
  Scroll,
  Spinner,
  Text,
  color,
  config,
  toRem,
} from 'folds';

import { useMatrixClient } from '../../hooks/useMatrixClient';
import {
  CustomEditor,
  toMatrixCustomHTML,
  toPlainText,
  AUTOCOMPLETE_PREFIXES,
  AutocompletePrefix,
  AutocompleteQuery,
  getAutocompleteQuery,
  getPrevWordRange,
  resetEditor,
  RoomMentionAutocomplete,
  UserMentionAutocomplete,
  EmoticonAutocomplete,
  createEmoticonElement,
  moveCursor,
  resetEditorHistory,
  customHtmlEqualsPlainText,
  trimCustomHtml,
  isEmptyEditor,
  getBeginCommand,
  trimCommand,
  getMentions,
  replaceShortcodeWithEmoji,
  isInOpenCodeBlock,
  safeFocusEditor,
} from '../../components/editor';
import { EmojiBoard, EmojiBoardTab } from '../../components/emoji-board';
import { getGifToSend, isGifVideo } from '../../utils/klipy';
import { FavoriteGif } from '../../state/gifFavorites';
import { markGifVideo } from '../../../types/matrix/common';
import { UseStateProvider } from '../../components/UseStateProvider';
import {
  TUploadContent,
  decryptFile,
  downloadEncryptedMedia,
  encryptFile,
  getImageInfo,
  getMxIdLocalPart,
  mxcUrlToHttp,
} from '../../utils/matrix';
import { useTypingStatusUpdater } from '../../hooks/useTypingStatusUpdater';
import { useFilePicker } from '../../hooks/useFilePicker';
import { useFilePasteHandler } from '../../hooks/useFilePasteHandler';
import { useFileDropZone } from '../../hooks/useFileDrop';
import {
  TUploadItem,
  TUploadMetadata,
  roomIdToMsgDraftAtomFamily,
  roomIdToReplyDraftAtomFamily,
  roomIdToUploadItemsAtomFamily,
  roomUploadAtomFamily,
} from '../../state/room/roomInputDrafts';
import { UploadCardRenderer } from '../../components/upload-card';
import {
  UploadBoard,
  UploadBoardContent,
  UploadBoardImperativeHandlers,
  UploadBoardSender,
} from '../../components/upload-board';
import {
  Upload,
  UploadStatus,
  UploadSuccess,
  createUploadFamilyObserverAtom,
} from '../../state/upload';
import { getImageUrlBlob, loadImageElement } from '../../utils/dom';
import { safeFile } from '../../utils/mimeTypes';
import { stripMetadata } from '../../utils/stripMetadata';
import { fulfilledPromiseSettledResult, randomStr } from '../../utils/common';
import { useSetting } from '../../state/hooks/settings';
import { settingsAtom } from '../../state/settings';
import {
  getAudioMsgContent,
  getFileMsgContent,
  getImageMsgContent,
  getVideoMsgContent,
  addReplyRelation,
  getUploadMessages,
  sendRoomMessage,
  sendRoomSticker,
} from './msgContent';
import { getMemberDisplayName, getMentionContent, trimReplyFromBody } from '../../utils/room';
import { CommandAutocomplete } from './CommandAutocomplete';
import { Command, SHRUG, TABLEFLIP, UNFLIP, useCommands } from '../../hooks/useCommands';
import { mobileOrTablet } from '../../utils/user-agent';
import { useElementSizeObserver } from '../../hooks/useElementSizeObserver';
import { ReplyLayout, ThreadIndicator } from '../../components/message';
import { roomToParentsAtom } from '../../state/room/roomToParents';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { useImagePackRooms } from '../../hooks/useImagePackRooms';
import { useEmojiShortcodeMap } from '../../hooks/useEmojiShortcodeMap';
import { usePowerLevelsContext } from '../../hooks/usePowerLevels';
import colorMXID from '../../../util/colorMXID';
import { useIsDirectRoom } from '../../hooks/useRoom';
import { useAccessiblePowerTagColors, useGetMemberPowerTag } from '../../hooks/useMemberPowerTag';
import { useRoomCreators } from '../../hooks/useRoomCreators';
import { useTheme } from '../../hooks/useTheme';
import { useRoomCreatorsTag } from '../../hooks/useRoomCreatorsTag';
import { usePowerLevelTags } from '../../hooks/usePowerLevelTags';
import { useComposingCheck } from '../../hooks/useComposingCheck';
import { PollCreator, PollIcon } from '../../components/poll';
import { stopPropagation } from '../../utils/keyboard';
import { storeMsgDraft } from '../../state/room/msgDraftStore';

const gifIconStyles: CSSProperties = {
  border: '1.5px solid currentColor',
  borderRadius: toRem(3),
  fontSize: toRem(9),
  fontWeight: 700,
  lineHeight: 1,
  padding: `${toRem(3)} ${toRem(2)}`,
};

const DRAFT_STORE_DELAY_MS = 400;

const SEND_FAILURE_MESSAGE =
  'Message not sent. Check your connection and available disk space, then retry the failed message.';

interface RoomInputProps {
  editor: Editor;
  fileDropContainerRef: RefObject<HTMLElement | null>;
  roomId: string;
  room: Room;
}
export const RoomInput = forwardRef<HTMLDivElement, RoomInputProps>(
  ({ editor, fileDropContainerRef, roomId, room }, ref) => {
    const mx = useMatrixClient();
    const useAuthentication = useMediaAuthentication();
    const [hideActivity] = useSetting(settingsAtom, 'hideActivity');
    const [legacyUsernameColor] = useSetting(settingsAtom, 'legacyUsernameColor');
    const direct = useIsDirectRoom();
    const commands = useCommands(mx, room);
    const isMobile = useMemo(mobileOrTablet, []);
    const emojiBtnRef = useRef<HTMLButtonElement>(null);
    const [attachMenuAnchor, setAttachMenuAnchor] = useState<RectCords>();
    const [pollCreator, setPollCreator] = useState(false);
    const lastSendTouchEndRef = useRef(-Infinity);
    const roomToParents = useAtomValue(roomToParentsAtom);
    const powerLevels = usePowerLevelsContext();
    const creators = useRoomCreators(room);

    const [msgDraft, setMsgDraft] = useAtom(roomIdToMsgDraftAtomFamily(roomId));
    const [replyDraft, setReplyDraft] = useAtom(roomIdToReplyDraftAtomFamily(roomId));
    const [sendError, setSendError] = useState<string>();
    // Stickers and GIFs being fetched or uploaded ahead of their send.
    const [preparingMedia, setPreparingMedia] = useState(0);
    const replyUserID = replyDraft?.userId;

    const powerLevelTags = usePowerLevelTags(room, powerLevels);
    const creatorsTag = useRoomCreatorsTag();
    const getMemberPowerTag = useGetMemberPowerTag(room, creators, powerLevels);
    const theme = useTheme();
    const accessibleTagColors = useAccessiblePowerTagColors(
      theme.kind,
      creatorsTag,
      powerLevelTags
    );

    const replyPowerTag = replyUserID ? getMemberPowerTag(replyUserID) : undefined;
    const replyPowerColor = replyPowerTag?.color
      ? accessibleTagColors.get(replyPowerTag.color)
      : undefined;
    const replyUsernameColor =
      legacyUsernameColor || direct ? colorMXID(replyUserID ?? '') : replyPowerColor;

    const [selectedFiles, setSelectedFiles] = useAtom(roomIdToUploadItemsAtomFamily(roomId));
    const uploadFamilyObserverAtom = createUploadFamilyObserverAtom(
      roomUploadAtomFamily,
      selectedFiles.map((f) => f.file)
    );
    const uploadBoardHandlers = useRef<UploadBoardImperativeHandlers>(undefined);

    const imagePackRooms: Room[] = useImagePackRooms(roomId, roomToParents);
    const emojiShortcodeMap = useEmojiShortcodeMap(imagePackRooms);

    const [autocompleteQuery, setAutocompleteQuery] =
      useState<AutocompleteQuery<AutocompletePrefix>>();

    const sendTypingStatus = useTypingStatusUpdater(mx, roomId);

    // The draft reaches its atom only when the room is left, which a reload or a quit never
    // does, so it is also stored a moment after each change and when the page goes away.
    const draftTimerRef = useRef<number>(undefined);
    const storeDraft = useCallback(() => {
      storeMsgDraft(roomId, isEmptyEditor(editor) ? [] : editor.children);
    }, [roomId, editor]);
    useEffect(() => {
      window.addEventListener('pagehide', storeDraft);
      return () => {
        window.removeEventListener('pagehide', storeDraft);
        // The editor is shared between rooms: a late save would file the next room's text here.
        window.clearTimeout(draftTimerRef.current);
      };
    }, [storeDraft]);

    const handleEditorChange = useCallback(() => {
      window.clearTimeout(draftTimerRef.current);
      draftTimerRef.current = window.setTimeout(storeDraft, DRAFT_STORE_DELAY_MS);

      // Only attempt replacement when the user types a ':' character
      const hasColonInsert = editor.operations.some(
        (op) => op.type === 'insert_text' && op.text.includes(':')
      );
      if (hasColonInsert) {
        replaceShortcodeWithEmoji(editor, emojiShortcodeMap);
      }
    }, [editor, emojiShortcodeMap, storeDraft]);

    const handleFiles = useCallback(
      async (files: File[]) => {
        const safeFiles = await Promise.all(files.map((f) => stripMetadata(safeFile(f))));
        const fileItems: TUploadItem[] = [];

        if (room.hasEncryptionStateEvent()) {
          const encryptFiles = fulfilledPromiseSettledResult(
            await Promise.allSettled(safeFiles.map((f) => encryptFile(f)))
          );
          encryptFiles.forEach((ef) =>
            fileItems.push({
              ...ef,
              metadata: {
                markedAsSpoiler: false,
              },
            })
          );
        } else {
          safeFiles.forEach((f) =>
            fileItems.push({
              file: f,
              originalFile: f,
              encInfo: undefined,
              metadata: {
                markedAsSpoiler: false,
              },
            })
          );
        }
        setSelectedFiles({
          type: 'PUT',
          item: fileItems,
        });
      },
      [setSelectedFiles, room]
    );
    const pickFile = useFilePicker(handleFiles, true);
    const handlePaste = useFilePasteHandler(handleFiles);
    const dropZoneVisible = useFileDropZone(fileDropContainerRef, handleFiles);
    const [hideExtraPickerBtns, setHideExtraPickerBtns] = useState(document.body.clientWidth < 500);

    const isComposing = useComposingCheck();

    useElementSizeObserver(
      useCallback(() => fileDropContainerRef.current, [fileDropContainerRef]),
      useCallback((width) => setHideExtraPickerBtns(width < 500), [])
    );

    useEffect(() => {
      Transforms.insertFragment(editor, msgDraft);
    }, [editor, msgDraft]);

    useEffect(
      () => () => {
        if (!isEmptyEditor(editor)) {
          const parsedDraft = JSON.parse(JSON.stringify(editor.children));
          setMsgDraft(parsedDraft);
        } else {
          setMsgDraft([]);
        }
        resetEditor(editor);
        resetEditorHistory(editor);
      },
      [roomId, editor, setMsgDraft]
    );

    const handleFileMetadata = useCallback(
      (fileItem: TUploadItem, metadata: TUploadMetadata) => {
        setSelectedFiles({
          type: 'REPLACE',
          item: fileItem,
          replacement: { ...fileItem, metadata },
        });
      },
      [setSelectedFiles]
    );

    const handleRemoveUpload = useCallback(
      (upload: TUploadContent | TUploadContent[]) => {
        const uploads = Array.isArray(upload) ? upload : [upload];
        setSelectedFiles({
          type: 'DELETE',
          item: selectedFiles.filter((f) => uploads.find((u) => u === f.file)),
        });
        uploads.forEach((u) => roomUploadAtomFamily.remove(u));
      },
      [setSelectedFiles, selectedFiles]
    );

    const handleCancelUpload = (uploads: Upload[]) => {
      uploads.forEach((upload) => {
        if (upload.status === UploadStatus.Loading) {
          mx.cancelUpload(upload.promise);
        }
      });
      handleRemoveUpload(uploads.map((upload) => upload.file));
    };

    const handleSendUpload = async (uploads: UploadSuccess[], caption?: IContent) => {
      const contentsPromises = uploads.map(async (upload) => {
        const fileItem = selectedFiles.find((f) => f.file === upload.file);
        if (!fileItem) throw new Error('Broken upload');

        if (fileItem.file.type.startsWith('image')) {
          return getImageMsgContent(mx, fileItem, upload.mxc);
        }
        if (fileItem.file.type.startsWith('video')) {
          return getVideoMsgContent(mx, fileItem, upload.mxc);
        }
        if (fileItem.file.type.startsWith('audio')) {
          return getAudioMsgContent(fileItem, upload.mxc);
        }
        return getFileMsgContent(fileItem, upload.mxc);
      });
      handleCancelUpload(uploads);
      const fetchedContents = fulfilledPromiseSettledResult(
        await Promise.allSettled(contentsPromises)
      );
      const outgoing = getUploadMessages({
        files: fetchedContents,
        caption,
        groupId: fetchedContents.length > 1 ? randomStr(16) : undefined,
        replyDraft,
      });
      const sendResults = await Promise.allSettled(
        outgoing.map((content) => sendRoomMessage(mx, roomId, content))
      );
      setSendError(
        sendResults.some((result) => result.status === 'rejected')
          ? SEND_FAILURE_MESSAGE
          : undefined
      );
      setReplyDraft(undefined);
    };

    const submit = useCallback(() => {
      const commandName = getBeginCommand(editor);
      let plainText = toPlainText(editor.children, true).trim();
      let customHtml = trimCustomHtml(
        toMatrixCustomHTML(editor.children, {
          allowTextFormatting: true,
          allowBlockMarkdown: true,
          allowInlineMarkdown: true,
        })
      );
      let msgType = MsgType.Text;

      if (commandName) {
        plainText = trimCommand(commandName, plainText);
        customHtml = trimCommand(commandName, customHtml);
      }
      if (commandName === Command.Me) {
        msgType = MsgType.Emote;
      } else if (commandName === Command.Notice) {
        msgType = MsgType.Notice;
      } else if (commandName === Command.Shrug) {
        plainText = `${SHRUG} ${plainText}`;
        customHtml = `${SHRUG} ${customHtml}`;
      } else if (commandName === Command.TableFlip) {
        plainText = `${TABLEFLIP} ${plainText}`;
        customHtml = `${TABLEFLIP} ${customHtml}`;
      } else if (commandName === Command.UnFlip) {
        plainText = `${UNFLIP} ${plainText}`;
        customHtml = `${UNFLIP} ${customHtml}`;
      } else if (commandName) {
        uploadBoardHandlers.current?.handleSend();
        const commandContent = commands[commandName as Command];
        if (commandContent) {
          commandContent.exe(plainText);
        }
        resetEditor(editor);
        resetEditorHistory(editor);
        sendTypingStatus(false);
        return;
      }

      if (plainText === '') {
        uploadBoardHandlers.current?.handleSend();
        return;
      }

      const body = plainText;
      const formattedBody = customHtml;
      const mentionData = getMentions(mx, roomId, editor);

      const content: IContent = {
        msgtype: msgType,
        body,
      };

      if (replyDraft && replyDraft.userId !== mx.getUserId()) {
        mentionData.users.add(replyDraft.userId);
      }

      const mMentions = getMentionContent(Array.from(mentionData.users), mentionData.room);
      content['m.mentions'] = mMentions;

      if (replyDraft || !customHtmlEqualsPlainText(formattedBody, body)) {
        content.format = 'org.matrix.custom.html';
        content.formatted_body = formattedBody;
      }
      setSendError(undefined);
      if (selectedFiles.length > 0) {
        uploadBoardHandlers.current?.handleSend(content);
      } else {
        sendRoomMessage(mx, roomId, addReplyRelation(content, replyDraft)).catch(() =>
          setSendError(SEND_FAILURE_MESSAGE)
        );
      }
      resetEditor(editor);
      resetEditorHistory(editor);
      setReplyDraft(undefined);
      sendTypingStatus(false);
      if (isMobile) safeFocusEditor(editor);
    }, [
      mx,
      roomId,
      editor,
      replyDraft,
      sendTypingStatus,
      setReplyDraft,
      commands,
      isMobile,
      selectedFiles,
    ]);

    const handleKeyDown: KeyboardEventHandler = useCallback(
      (evt) => {
        if (
          (isKeyHotkey('mod+enter', evt) ||
            (isKeyHotkey('enter', evt) &&
              // Like Discord: Enter inside an unclosed ``` block adds a new line.
              !isInOpenCodeBlock(editor))) &&
          !isComposing(evt)
        ) {
          evt.preventDefault();
          submit();
        }
        if (isKeyHotkey('escape', evt)) {
          evt.preventDefault();
          if (autocompleteQuery) {
            setAutocompleteQuery(undefined);
            return;
          }
          setReplyDraft(undefined);
        }
      },
      [submit, setReplyDraft, autocompleteQuery, isComposing, editor]
    );

    const handleKeyUp: KeyboardEventHandler = useCallback(
      (evt) => {
        if (isKeyHotkey('escape', evt)) {
          evt.preventDefault();
          return;
        }

        if (!hideActivity) {
          sendTypingStatus(!isEmptyEditor(editor));
        }

        const prevWordRange = getPrevWordRange(editor);
        const query = prevWordRange
          ? getAutocompleteQuery<AutocompletePrefix>(editor, prevWordRange, AUTOCOMPLETE_PREFIXES)
          : undefined;
        setAutocompleteQuery(query);
      },
      [editor, sendTypingStatus, hideActivity]
    );

    const handleCloseAutocomplete = useCallback(() => {
      setAutocompleteQuery(undefined);
      safeFocusEditor(editor);
    }, [editor]);

    const handleEmoticonSelect = (key: string, shortcode: string) => {
      editor.insertNode(createEmoticonElement(key, shortcode));
      moveCursor(editor);
    };

    // A picked sticker or GIF is fetched, and usually uploaded, before it can be sent. Show that
    // it is on its way, and say so when it does not make it.
    const sendPickedMedia = async (
      kind: 'GIF' | 'Sticker',
      prepare: () => Promise<() => Promise<unknown>>
    ) => {
      setSendError(undefined);
      setPreparingMedia((count) => count + 1);
      let send: () => Promise<unknown>;
      try {
        send = await prepare();
      } catch (err) {
        console.error(`Failed to prepare ${kind}`, err);
        setSendError(
          `${kind} not sent: it could not be loaded. Check your connection and try again.`
        );
        return;
      } finally {
        setPreparingMedia((count) => count - 1);
      }
      setReplyDraft(undefined);
      send().catch(() => setSendError(SEND_FAILURE_MESSAGE));
    };

    const handleStickerSelect = (mxc: string, shortcode: string, label: string) =>
      sendPickedMedia('Sticker', async () => {
        const stickerUrl = mxcUrlToHttp(mx, mxc, useAuthentication);
        if (!stickerUrl) throw new Error('Sticker has no media URL');

        const info = await getImageInfo(
          await loadImageElement(stickerUrl),
          await getImageUrlBlob(stickerUrl)
        );

        const content: IContent = {
          body: label,
          url: mxc,
          info,
        };
        return () => sendRoomSticker(mx, roomId, addReplyRelation(content, replyDraft));
      });

    const handleGifSelect = (fav: FavoriteGif) =>
      sendPickedMedia('GIF', async () => {
        const gifSender = (content: IContent) => () =>
          sendRoomMessage(mx, roomId, addReplyRelation(content, replyDraft));

        const safeGifName = (name: string, fallback: string) =>
          name
            .replace(/[/\\?%*:|"<>/]/g, '')
            .trim()
            .slice(0, 50) || fallback;

        const fetchBlob = async (url: string): Promise<Blob> => {
          const resp = await fetch(url);
          if (!resp.ok) throw new Error(`GIF download failed with status ${resp.status}`);
          return resp.blob();
        };

        // An unencrypted mxc favourite going into an unencrypted room can
        // reuse the already uploaded content without a re-upload.
        if (fav.kind === 'mxc' && !fav.video && !fav.encInfo && !room.hasEncryptionStateEvent()) {
          return gifSender({
            msgtype: MsgType.Image,
            body: fav.body,
            filename: fav.body,
            url: fav.mxc,
            info: fav.info,
          });
        }

        let blob: Blob;
        let filename: string;
        let videoGif = fav.kind === 'url' || (fav.kind === 'mxc' && fav.video === true);
        if (fav.kind === 'klipy') {
          const format = getGifToSend(fav.gif);
          if (!format?.url) throw new Error('GIF has no sendable format');
          videoGif = isGifVideo(format);
          blob = await fetchBlob(format.url);
          filename = `${safeGifName(fav.gif.title || 'gif', 'gif')}.${videoGif ? 'mp4' : 'gif'}`;
        } else if (fav.kind === 'mxc') {
          const mediaUrl = mxcUrlToHttp(mx, fav.mxc, useAuthentication);
          if (!mediaUrl) throw new Error('GIF has no media URL');
          if (fav.encInfo) {
            const { encInfo } = fav;
            blob = await downloadEncryptedMedia(mediaUrl, (encBuf) =>
              decryptFile(encBuf, fav.info?.mimetype ?? 'image/gif', encInfo)
            );
          } else {
            blob = await fetchBlob(mediaUrl);
          }
          const extension = videoGif ? 'mp4' : 'gif';
          const baseName = fav.body.replace(/\.(?:gif|mp4)$/i, '');
          filename = new RegExp(`\\.${extension}$`, 'i').test(fav.body)
            ? fav.body
            : `${safeGifName(baseName, 'gif')}.${extension}`;
        } else {
          blob = await fetchBlob(fav.videoUrl);
          filename = `${safeGifName(fav.title || 'gif', 'gif')}.mp4`;
        }

        const defaultType = videoGif ? 'video/mp4' : 'image/gif';
        const file = new File([blob], filename, {
          type: blob.type || defaultType,
        });

        const encData = room.hasEncryptionStateEvent() ? await encryptFile(file) : undefined;
        const uploadFile = encData?.file ?? file;

        const uploadData = await mx.uploadContent(uploadFile);
        const mxc = uploadData?.content_uri;
        if (!mxc) throw new Error('GIF upload returned no content URI');

        const item: TUploadItem = {
          file,
          originalFile: file,
          encInfo: encData?.encInfo,
          metadata: { markedAsSpoiler: false },
        };
        const content = videoGif
          ? await getVideoMsgContent(mx, item, mxc)
          : await getImageMsgContent(mx, item, mxc);
        return gifSender(videoGif ? markGifVideo(content) : content);
      });

    return (
      <div ref={ref}>
        {selectedFiles.length > 0 && (
          <UploadBoard>
            <UploadBoardSender
              uploadFamilyObserverAtom={uploadFamilyObserverAtom}
              onSend={handleSendUpload}
              imperativeHandlerRef={uploadBoardHandlers}
            />
            <Scroll size="300" hideTrack visibility="Hover">
              <UploadBoardContent>
                {Array.from(selectedFiles)
                  .reverse()
                  .map((fileItem, index) => (
                    <UploadCardRenderer
                      key={index}
                      isEncrypted={!!fileItem.encInfo}
                      fileItem={fileItem}
                      setMetadata={handleFileMetadata}
                      onRemove={handleRemoveUpload}
                    />
                  ))}
              </UploadBoardContent>
            </Scroll>
          </UploadBoard>
        )}
        {pollCreator && <PollCreator room={room} requestClose={() => setPollCreator(false)} />}
        <Overlay
          open={dropZoneVisible}
          backdrop={<OverlayBackdrop />}
          style={{ pointerEvents: 'none' }}
        >
          <OverlayCenter>
            <Dialog variant="Primary">
              <Box
                direction="Column"
                justifyContent="Center"
                alignItems="Center"
                gap="500"
                style={{ padding: toRem(60) }}
              >
                <Icon size="600" src={Icons.File} />
                <Text size="H4" align="Center">
                  {`Drop Files in "${room?.name || 'Room'}"`}
                </Text>
                <Text align="Center">Drag and drop files here or click for selection dialog</Text>
              </Box>
            </Dialog>
          </OverlayCenter>
        </Overlay>
        {autocompleteQuery?.prefix === AutocompletePrefix.RoomMention && (
          <RoomMentionAutocomplete
            roomId={roomId}
            editor={editor}
            query={autocompleteQuery}
            requestClose={handleCloseAutocomplete}
          />
        )}
        {autocompleteQuery?.prefix === AutocompletePrefix.UserMention && (
          <UserMentionAutocomplete
            room={room}
            editor={editor}
            query={autocompleteQuery}
            requestClose={handleCloseAutocomplete}
          />
        )}
        {autocompleteQuery?.prefix === AutocompletePrefix.Emoticon && (
          <EmoticonAutocomplete
            imagePackRooms={imagePackRooms}
            editor={editor}
            query={autocompleteQuery}
            requestClose={handleCloseAutocomplete}
          />
        )}
        {autocompleteQuery?.prefix === AutocompletePrefix.Command && (
          <CommandAutocomplete
            room={room}
            editor={editor}
            query={autocompleteQuery}
            requestClose={handleCloseAutocomplete}
          />
        )}
        <CustomEditor
          editableName="RoomInput"
          editor={editor}
          placeholder="Send a message..."
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          onChange={handleEditorChange}
          onPaste={handlePaste}
          top={
            replyDraft && (
              <div>
                <Box
                  alignItems="Center"
                  gap="300"
                  style={{ padding: `${config.space.S200} ${config.space.S300} 0` }}
                >
                  <IconButton
                    onClick={() => setReplyDraft(undefined)}
                    variant="SurfaceVariant"
                    size="300"
                    radii="300"
                  >
                    <Icon src={Icons.Cross} size="50" />
                  </IconButton>
                  <Box direction="Row" gap="200" alignItems="Center">
                    {replyDraft.relation?.rel_type === RelationType.Thread && <ThreadIndicator />}
                    <ReplyLayout
                      userColor={replyUsernameColor}
                      username={
                        <Text size="T300" truncate>
                          <b>
                            {getMemberDisplayName(room, replyDraft.userId) ??
                              getMxIdLocalPart(replyDraft.userId) ??
                              replyDraft.userId}
                          </b>
                        </Text>
                      }
                    >
                      <Text size="T300" truncate>
                        {trimReplyFromBody(replyDraft.body)}
                      </Text>
                    </ReplyLayout>
                  </Box>
                </Box>
              </div>
            )
          }
          before={
            <PopOut
              anchor={attachMenuAnchor}
              position="Top"
              align="Start"
              offset={8}
              content={
                <FocusTrap
                  focusTrapOptions={{
                    initialFocus: false,
                    returnFocusOnDeactivate: false,
                    onDeactivate: () => setAttachMenuAnchor(undefined),
                    clickOutsideDeactivates: true,
                    isKeyForward: (evt: KeyboardEvent) => evt.key === 'ArrowDown',
                    isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp',
                    escapeDeactivates: stopPropagation,
                  }}
                >
                  <Menu style={{ minWidth: toRem(180) }}>
                    <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
                      <MenuItem
                        size="300"
                        radii="300"
                        before={<Icon size="100" src={Icons.Attachment} />}
                        onClick={() => {
                          setAttachMenuAnchor(undefined);
                          pickFile('*');
                        }}
                      >
                        <Text style={{ flexGrow: 1 }} as="span" size="T300">
                          Upload a File
                        </Text>
                      </MenuItem>
                      <MenuItem
                        size="300"
                        radii="300"
                        before={<Icon size="100" src={PollIcon} />}
                        onClick={() => {
                          setAttachMenuAnchor(undefined);
                          setPollCreator(true);
                        }}
                      >
                        <Text style={{ flexGrow: 1 }} as="span" size="T300">
                          Create Poll
                        </Text>
                      </MenuItem>
                    </Box>
                  </Menu>
                </FocusTrap>
              }
            >
              <IconButton
                onClick={(evt) => setAttachMenuAnchor(evt.currentTarget.getBoundingClientRect())}
                // Shortcut: double click skips the menu and opens the file picker.
                onDoubleClick={() => {
                  setAttachMenuAnchor(undefined);
                  pickFile('*');
                }}
                aria-pressed={!!attachMenuAnchor}
                variant="SurfaceVariant"
                size="300"
                radii="300"
              >
                <Icon src={Icons.PlusCircle} />
              </IconButton>
            </PopOut>
          }
          after={
            <>
              <UseStateProvider initial={undefined}>
                {(emojiBoardTab: EmojiBoardTab | undefined, setEmojiBoardTab) => (
                  <PopOut
                    offset={16}
                    alignOffset={-44}
                    position="Top"
                    align="End"
                    anchor={
                      emojiBoardTab === undefined
                        ? undefined
                        : (emojiBtnRef.current?.getBoundingClientRect() ?? undefined)
                    }
                    content={
                      <EmojiBoard
                        tab={emojiBoardTab}
                        onTabChange={setEmojiBoardTab}
                        imagePackRooms={imagePackRooms}
                        returnFocusOnDeactivate={false}
                        onEmojiSelect={handleEmoticonSelect}
                        onCustomEmojiSelect={handleEmoticonSelect}
                        onStickerSelect={handleStickerSelect}
                        onGifSelect={handleGifSelect}
                        requestClose={() => {
                          setEmojiBoardTab((t) => {
                            if (t) {
                              if (!isMobile) safeFocusEditor(editor);
                              return undefined;
                            }
                            return t;
                          });
                        }}
                      />
                    }
                  >
                    {!hideExtraPickerBtns && (
                      <>
                        <IconButton
                          aria-label="Open GIF picker"
                          aria-pressed={emojiBoardTab === EmojiBoardTab.Gif}
                          onClick={() => setEmojiBoardTab(EmojiBoardTab.Gif)}
                          variant="SurfaceVariant"
                          size="300"
                          radii="300"
                        >
                          <span style={gifIconStyles}>GIF</span>
                        </IconButton>
                        <IconButton
                          aria-label="Open sticker picker"
                          aria-pressed={emojiBoardTab === EmojiBoardTab.Sticker}
                          onClick={() => setEmojiBoardTab(EmojiBoardTab.Sticker)}
                          variant="SurfaceVariant"
                          size="300"
                          radii="300"
                        >
                          <Icon
                            src={Icons.Sticker}
                            filled={emojiBoardTab === EmojiBoardTab.Sticker}
                          />
                        </IconButton>
                      </>
                    )}
                    <IconButton
                      ref={emojiBtnRef}
                      aria-label="Open emoji picker"
                      aria-pressed={
                        hideExtraPickerBtns
                          ? !!emojiBoardTab
                          : emojiBoardTab === EmojiBoardTab.Emoji
                      }
                      onClick={() => setEmojiBoardTab(EmojiBoardTab.Emoji)}
                      variant="SurfaceVariant"
                      size="300"
                      radii="300"
                    >
                      <Icon
                        src={Icons.Smile}
                        filled={
                          hideExtraPickerBtns
                            ? !!emojiBoardTab
                            : emojiBoardTab === EmojiBoardTab.Emoji
                        }
                      />
                    </IconButton>
                  </PopOut>
                )}
              </UseStateProvider>
              <IconButton
                onTouchEnd={(evt) => {
                  evt.preventDefault();
                  lastSendTouchEndRef.current = evt.timeStamp;
                  submit();
                }}
                onClick={(evt) => {
                  if (evt.timeStamp - lastSendTouchEndRef.current < 1000) return;
                  submit();
                }}
                variant="SurfaceVariant"
                size="300"
                radii="300"
              >
                <Icon src={Icons.Send} />
              </IconButton>
            </>
          }
          bottom={
            sendError || preparingMedia > 0 ? (
              <Box direction="Column">
                {preparingMedia > 0 && (
                  <Box
                    role="status"
                    alignItems="Center"
                    gap="200"
                    style={{ padding: config.space.S200 }}
                  >
                    <Spinner size="100" variant="Secondary" />
                    <Text size="T200" priority="300">
                      Sending…
                    </Text>
                  </Box>
                )}
                {sendError && (
                  <Text
                    role="alert"
                    size="T200"
                    style={{ color: color.Critical.Main, padding: config.space.S200 }}
                  >
                    {sendError}
                  </Text>
                )}
              </Box>
            ) : undefined
          }
        />
      </div>
    );
  }
);
