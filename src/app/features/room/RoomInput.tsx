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
import { EventType, IContent, MsgType, RelationType, Room } from 'matrix-js-sdk';
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
import { MATRIX_GIF_PROPERTY_NAME } from '../../../types/matrix/common';
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
  IReplyDraft,
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
  UploadBoardHeader,
  UploadBoardImperativeHandlers,
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
import { fulfilledPromiseSettledResult } from '../../utils/common';
import { useSetting } from '../../state/hooks/settings';
import { settingsAtom } from '../../state/settings';
import {
  getAudioMsgContent,
  getFileMsgContent,
  getImageMsgContent,
  getVideoMsgContent,
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

const gifIconStyles: CSSProperties = {
  border: '1.5px solid currentColor',
  borderRadius: toRem(3),
  fontSize: toRem(9),
  fontWeight: 700,
  lineHeight: 1,
  padding: `${toRem(3)} ${toRem(2)}`,
};

const SEND_FAILURE_MESSAGE =
  'Message not sent. Check your connection and available disk space, then retry the failed message.';

const addReplyRelation = (content: IContent, replyDraft?: IReplyDraft): IContent => {
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

    const [uploadBoard, setUploadBoard] = useState(true);
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

    const handleEditorChange = useCallback(() => {
      // Only attempt replacement when the user types a ':' character
      const hasColonInsert = editor.operations.some(
        (op) => op.type === 'insert_text' && op.text.includes(':')
      );
      if (hasColonInsert) {
        replaceShortcodeWithEmoji(editor, emojiShortcodeMap);
      }
    }, [editor, emojiShortcodeMap]);

    const handleFiles = useCallback(
      async (files: File[]) => {
        setUploadBoard(true);
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

    const handleSendUpload = async (uploads: UploadSuccess[]) => {
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
      const contents = fulfilledPromiseSettledResult(await Promise.allSettled(contentsPromises));
      const sendResults = await Promise.allSettled(
        contents.map((content) =>
          mx.sendMessage(roomId, addReplyRelation(content, replyDraft) as any)
        )
      );
      setSendError(
        sendResults.some((result) => result.status === 'rejected')
          ? SEND_FAILURE_MESSAGE
          : undefined
      );
      setReplyDraft(undefined);
    };

    const submit = useCallback(() => {
      uploadBoardHandlers.current?.handleSend();

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
        const commandContent = commands[commandName as Command];
        if (commandContent) {
          commandContent.exe(plainText);
        }
        resetEditor(editor);
        resetEditorHistory(editor);
        sendTypingStatus(false);
        return;
      }

      if (plainText === '') return;

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
      mx.sendMessage(roomId, addReplyRelation(content, replyDraft) as any).catch(() =>
        setSendError(SEND_FAILURE_MESSAGE)
      );
      resetEditor(editor);
      resetEditorHistory(editor);
      setReplyDraft(undefined);
      sendTypingStatus(false);
      if (isMobile) safeFocusEditor(editor);
    }, [mx, roomId, editor, replyDraft, sendTypingStatus, setReplyDraft, commands, isMobile]);

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

    const handleStickerSelect = async (mxc: string, shortcode: string, label: string) => {
      const stickerUrl = mxcUrlToHttp(mx, mxc, useAuthentication);
      if (!stickerUrl) return;

      const info = await getImageInfo(
        await loadImageElement(stickerUrl),
        await getImageUrlBlob(stickerUrl)
      );

      const content: IContent = {
        body: label,
        url: mxc,
        info,
      };
      mx.sendEvent(roomId, EventType.Sticker, addReplyRelation(content, replyDraft) as any);
      setReplyDraft(undefined);
    };

    const handleGifSelect = async (fav: FavoriteGif) => {
      const sendGifContent = (content: IContent) => {
        const finalContent = addReplyRelation(content, replyDraft);
        mx.sendMessage(roomId, finalContent as any);
        setReplyDraft(undefined);
      };

      const safeGifName = (name: string, fallback: string) =>
        name
          .replace(/[/\\?%*:|"<>/]/g, '')
          .trim()
          .slice(0, 50) || fallback;

      try {
        // An unencrypted mxc favourite going into an unencrypted room can
        // reuse the already uploaded content without a re-upload.
        if (fav.kind === 'mxc' && !fav.video && !fav.encInfo && !room.hasEncryptionStateEvent()) {
          sendGifContent({
            msgtype: MsgType.Image,
            body: fav.body,
            filename: fav.body,
            url: fav.mxc,
            info: fav.info,
          });
          return;
        }

        let blob: Blob;
        let filename: string;
        let videoGif = fav.kind === 'url' || (fav.kind === 'mxc' && fav.video === true);
        if (fav.kind === 'klipy') {
          const format = getGifToSend(fav.gif);
          if (!format?.url) return;
          videoGif = isGifVideo(format);
          const resp = await fetch(format.url);
          if (!resp.ok) return;
          blob = await resp.blob();
          filename = `${safeGifName(fav.gif.title || 'gif', 'gif')}.${videoGif ? 'mp4' : 'gif'}`;
        } else if (fav.kind === 'mxc') {
          const mediaUrl = mxcUrlToHttp(mx, fav.mxc, useAuthentication);
          if (!mediaUrl) return;
          if (fav.encInfo) {
            const { encInfo } = fav;
            blob = await downloadEncryptedMedia(mediaUrl, (encBuf) =>
              decryptFile(encBuf, fav.info?.mimetype ?? 'image/gif', encInfo)
            );
          } else {
            const resp = await fetch(mediaUrl);
            if (!resp.ok) return;
            blob = await resp.blob();
          }
          const extension = videoGif ? 'mp4' : 'gif';
          const baseName = fav.body.replace(/\.(?:gif|mp4)$/i, '');
          filename = new RegExp(`\\.${extension}$`, 'i').test(fav.body)
            ? fav.body
            : `${safeGifName(baseName, 'gif')}.${extension}`;
        } else {
          const resp = await fetch(fav.videoUrl);
          if (!resp.ok) return;
          blob = await resp.blob();
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
        if (!mxc) return;

        const item: TUploadItem = {
          file,
          originalFile: file,
          encInfo: encData?.encInfo,
          metadata: { markedAsSpoiler: false },
        };
        const content = videoGif
          ? await getVideoMsgContent(mx, item, mxc)
          : await getImageMsgContent(mx, item, mxc);
        if (videoGif) content[MATRIX_GIF_PROPERTY_NAME] = true;

        sendGifContent(content);
      } catch (e) {
        console.error('Failed to send GIF', e);
      }
    };

    return (
      <div ref={ref}>
        {selectedFiles.length > 0 && (
          <UploadBoard
            header={
              <UploadBoardHeader
                open={uploadBoard}
                onToggle={() => setUploadBoard(!uploadBoard)}
                uploadFamilyObserverAtom={uploadFamilyObserverAtom}
                onSend={handleSendUpload}
                imperativeHandlerRef={uploadBoardHandlers}
                onCancel={handleCancelUpload}
              />
            }
          >
            {uploadBoard && (
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
            )}
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
            sendError ? (
              <Box direction="Column">
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
