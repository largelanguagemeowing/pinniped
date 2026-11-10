import React, { ReactNode } from 'react';
import { MsgType } from 'matrix-js-sdk';
import { HTMLReactParserOptions } from 'html-react-parser';
import { Opts } from 'linkifyjs';
import { Box, config } from 'folds';
import {
  AudioContent,
  DownloadFile,
  FileContent,
  ImageContent,
  MAudio,
  MBadEncrypted,
  MEmote,
  MFile,
  MImage,
  MLocation,
  MediaAutoEmbed,
  MediaEmbedAllow,
  MNotice,
  MText,
  MVideo,
  OoyeGifContent,
  ReadPdfFile,
  ReadTextFile,
  RenderBody,
  ThumbnailContent,
  UnsupportedContent,
  VideoContent,
} from './message';
import { UrlPreviewCard, UrlPreviewHolder } from './url-preview';
import { Image, MediaControl } from './media';
import { VideoPlayer } from './media/VideoPlayer';
import { ImageViewer } from './image-viewer';
import { PdfViewer } from './Pdf-viewer';
import { TextViewer } from './text-viewer';
import { testMatrixTo } from '../plugins/matrix-to';
import { getOoyeGifVideoUrl, parseOoyeGif } from '../utils/ooye';
import { IImageContent } from '../../types/matrix/common';
import { isMediaAutoEmbedUrl } from '../utils/mediaAutoEmbed';
import { isDirectGifUrl } from '../utils/directGif';
import { settingsAtom } from '../state/settings';
import { getHostToAllow, isOoyeMediaUrl } from '../utils/ooyeMedia';
import { useSetting } from '../state/hooks/settings';
import { DirectGifContent } from './message/content/DirectGifContent';
import { trimReplyFromBody, trimReplyFromFormattedBody } from '../utils/room';

type RenderMessageContentProps = {
  displayName: string;
  msgType: string;
  ts: number;
  edited?: boolean;
  getContent: <T>() => T;
  mediaAutoLoad?: boolean;
  urlPreview?: boolean;
  highlightRegex?: RegExp;
  htmlReactParserOptions: HTMLReactParserOptions;
  linkifyOpts: Opts;
  outlineAttachment?: boolean;
  /** Images fill their parent box instead of sizing to the image (attachment grid). */
  fill?: boolean;
};
export function RenderMessageContent({
  displayName,
  msgType,
  ts,
  edited,
  getContent,
  mediaAutoLoad,
  urlPreview,
  highlightRegex,
  htmlReactParserOptions,
  linkifyOpts,
  outlineAttachment,
  fill,
}: RenderMessageContentProps) {
  const messageContent: Record<string, unknown> = getContent();
  const trimmedContent = {
    ...messageContent,
    body:
      typeof messageContent.body === 'string'
        ? trimReplyFromBody(messageContent.body)
        : messageContent.body,
    formatted_body:
      typeof messageContent.formatted_body === 'string'
        ? trimReplyFromFormattedBody(messageContent.formatted_body)
        : messageContent.formatted_body,
  };

  const [mediaEmbedHosts] = useSetting(settingsAtom, 'mediaEmbedHosts');
  // A bridged GIF plays straight from its host, which tells that host who is reading. It is a
  // link embed like any other, so it follows the URL preview setting (off by default in
  // encrypted rooms); with previews off the message shows as the text it is.
  const bridgedGif = () => (urlPreview ? parseOoyeGif(trimmedContent, mediaEmbedHosts) : undefined);
  // An OOYE GIF whose video host is not on the list gets a one-click allow prompt.
  const withGifAllowPrompt = (node: ReactNode) => {
    if (!urlPreview) return node;
    const videoUrl = getOoyeGifVideoUrl(trimmedContent);
    const host = videoUrl && getHostToAllow(videoUrl, mediaEmbedHosts);
    return host ? (
      <>
        {node}
        <MediaEmbedAllow host={host} />
      </>
    ) : (
      node
    );
  };

  const renderUrlsPreview = (urls: string[]) => {
    const filteredUrls = urls.filter((url) => !testMatrixTo(url));
    if (filteredUrls.length === 0) return undefined;
    const mediaUrls = filteredUrls.filter((url) => isMediaAutoEmbedUrl(url, mediaEmbedHosts));
    const previewUrls = filteredUrls.filter((url) => !isMediaAutoEmbedUrl(url, mediaEmbedHosts));
    const allowHosts = Array.from(
      new Set(
        filteredUrls
          .filter(isOoyeMediaUrl)
          .map((url) => getHostToAllow(url, mediaEmbedHosts))
          .filter((host): host is string => host !== undefined)
      )
    );
    return (
      <>
        {allowHosts.map((host) => (
          <MediaEmbedAllow key={host} host={host} />
        ))}
        {mediaUrls.length > 0 && (
          <Box direction="Column" gap="200" style={{ marginTop: config.space.S200 }}>
            {mediaUrls.map((url) =>
              isDirectGifUrl(url, mediaEmbedHosts) ? (
                <DirectGifContent key={url} url={url} autoLoad={mediaAutoLoad} />
              ) : (
                <MediaAutoEmbed key={url} url={url} autoLoad={mediaAutoLoad} />
              )
            )}
          </Box>
        )}
        {previewUrls.length > 0 && (
          <UrlPreviewHolder>
            {previewUrls.map((url) => (
              <UrlPreviewCard key={url} url={url} ts={ts} />
            ))}
          </UrlPreviewHolder>
        )}
      </>
    );
  };
  const renderCaption = () => {
    const content: IImageContent = getContent();
    if (content.filename && content.filename !== content.body) {
      return (
        <MText
          style={{ marginTop: config.space.S200 }}
          edited={edited}
          content={content}
          renderBody={(props) => (
            <RenderBody
              {...props}
              highlightRegex={highlightRegex}
              htmlReactParserOptions={htmlReactParserOptions}
              linkifyOpts={linkifyOpts}
            />
          )}
          renderUrlsPreview={urlPreview ? renderUrlsPreview : undefined}
        />
      );
    }
    return null;
  };

  const renderFile = () => (
    <>
      <MFile
        content={getContent()}
        renderFileContent={({ body, mimeType, info, encInfo, url }) => (
          <FileContent
            body={body}
            mimeType={mimeType}
            renderAsPdfFile={() => (
              <ReadPdfFile
                body={body}
                mimeType={mimeType}
                url={url}
                encInfo={encInfo}
                renderViewer={(p) => <PdfViewer {...p} />}
              />
            )}
            renderAsTextFile={() => (
              <ReadTextFile
                body={body}
                mimeType={mimeType}
                url={url}
                encInfo={encInfo}
                renderViewer={(p) => <TextViewer {...p} />}
              />
            )}
          >
            <DownloadFile body={body} mimeType={mimeType} url={url} encInfo={encInfo} info={info} />
          </FileContent>
        )}
        outlined={outlineAttachment}
      />
      {renderCaption()}
    </>
  );

  if (msgType === MsgType.Text) {
    const ooyeGif = bridgedGif();
    if (ooyeGif) {
      return (
        <OoyeGifContent
          title={ooyeGif.title}
          videoUrl={ooyeGif.videoUrl}
          autoPlay={mediaAutoLoad}
        />
      );
    }
    return withGifAllowPrompt(
      <MText
        edited={edited}
        content={getContent()}
        renderBody={(props) => (
          <RenderBody
            {...props}
            highlightRegex={highlightRegex}
            htmlReactParserOptions={htmlReactParserOptions}
            linkifyOpts={linkifyOpts}
          />
        )}
        renderUrlsPreview={urlPreview ? renderUrlsPreview : undefined}
      />
    );
  }

  if (msgType === MsgType.Emote) {
    return (
      <MEmote
        displayName={displayName}
        edited={edited}
        content={getContent()}
        renderBody={(props) => (
          <RenderBody
            {...props}
            highlightRegex={highlightRegex}
            htmlReactParserOptions={htmlReactParserOptions}
            linkifyOpts={linkifyOpts}
          />
        )}
        renderUrlsPreview={urlPreview ? renderUrlsPreview : undefined}
      />
    );
  }

  if (msgType === MsgType.Notice) {
    const ooyeGif = bridgedGif();
    if (ooyeGif) {
      return (
        <OoyeGifContent
          title={ooyeGif.title}
          videoUrl={ooyeGif.videoUrl}
          autoPlay={mediaAutoLoad}
        />
      );
    }
    return withGifAllowPrompt(
      <MNotice
        edited={edited}
        content={getContent()}
        renderBody={(props) => (
          <RenderBody
            {...props}
            highlightRegex={highlightRegex}
            htmlReactParserOptions={htmlReactParserOptions}
            linkifyOpts={linkifyOpts}
          />
        )}
        renderUrlsPreview={urlPreview ? renderUrlsPreview : undefined}
      />
    );
  }

  if (msgType === MsgType.Image) {
    return (
      <>
        <MImage
          content={getContent()}
          renderImageContent={(props) => (
            <ImageContent
              {...props}
              style={fill ? { width: '100%', height: '100%' } : undefined}
              autoPlay={mediaAutoLoad}
              renderImage={(p) => (
                <Image
                  {...p}
                  loading="lazy"
                  style={fill ? { width: '100%', height: '100%', objectFit: 'cover' } : undefined}
                />
              )}
              renderViewer={(p) => <ImageViewer {...p} />}
            />
          )}
          outlined={outlineAttachment}
          fill={fill}
        />
        {renderCaption()}
      </>
    );
  }

  if (msgType === MsgType.Video) {
    return (
      <>
        <MVideo
          content={getContent()}
          renderAsFile={renderFile}
          renderVideoContent={({ body, info, gifLike, ...props }) => (
            <VideoContent
              body={body}
              info={info}
              {...props}
              autoPlay={gifLike ? (mediaAutoLoad ?? false) : false}
              renderThumbnail={
                mediaAutoLoad
                  ? () => (
                      <ThumbnailContent
                        info={info}
                        renderImage={(src) => (
                          <Image alt={body} title={body} src={src} loading="lazy" />
                        )}
                      />
                    )
                  : undefined
              }
              renderVideo={(p) => <VideoPlayer {...p} playback={gifLike ? 'gif' : 'video'} />}
            />
          )}
          outlined={outlineAttachment}
        />
        {renderCaption()}
      </>
    );
  }

  if (msgType === MsgType.Audio) {
    return (
      <>
        <MAudio
          content={getContent()}
          renderAsFile={renderFile}
          renderAudioContent={(props) => (
            <AudioContent {...props} renderMediaControl={(p) => <MediaControl {...p} />} />
          )}
          outlined={outlineAttachment}
        />
        {renderCaption()}
      </>
    );
  }

  if (msgType === MsgType.File) {
    return renderFile();
  }

  if (msgType === MsgType.Location) {
    return <MLocation content={getContent()} />;
  }

  if (msgType === 'm.bad.encrypted') {
    return <MBadEncrypted />;
  }

  return <UnsupportedContent />;
}
