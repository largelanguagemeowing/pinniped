import React, { ReactNode, useState } from 'react';
import { IPreviewUrlResponse } from 'matrix-js-sdk';
import { Button, Icon, Icons, Text, as, toRem } from 'folds';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { mxcUrlToHttp } from '../../utils/matrix';
import { useSetting } from '../../state/hooks/settings';
import { settingsAtom } from '../../state/settings';
import { timeDayMonYear, timeHourMinute } from '../../utils/time';
import { ImageOverlay } from '../ImageOverlay';
import { ImageViewer } from '../image-viewer';
import * as css from './UrlPreviewPost.css';
import { isMxcUrl } from '../../utils/mxc';

// The homeserver adds these next to the og:* keys for fediverse-style posts.
const POST = 'club.stablecat.post.';
const MEDIA_MAX = 10;

type PostMedia = {
  mxc: string;
  kind: string;
  link?: string;
  w?: number;
  h?: number;
};

const getString = (prev: IPreviewUrlResponse, key: string): string | undefined => {
  const value = prev[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};

const getHttpUrl = (prev: IPreviewUrlResponse, key: string): string | undefined => {
  const value = getString(prev, key);
  return value && /^https?:\/\//i.test(value) ? value : undefined;
};

export const isPostPreview = (prev: IPreviewUrlResponse): boolean =>
  !!getString(prev, `${POST}text`) || Number(prev[`${POST}media_count`]) > 0;

const getPostMedia = (prev: IPreviewUrlResponse): PostMedia[] => {
  const count = Math.min(Number(prev[`${POST}media_count`]) || 0, MEDIA_MAX);
  const media: PostMedia[] = [];
  for (let i = 0; i < count; i += 1) {
    const mxc = getString(prev, `${POST}media.${i}`);
    if (isMxcUrl(mxc)) {
      media.push({
        mxc,
        kind: getString(prev, `${POST}media.${i}.kind`) ?? 'image',
        link: getHttpUrl(prev, `${POST}media.${i}.link`),
        w: Number(prev[`${POST}media.${i}.w`]) || undefined,
        h: Number(prev[`${POST}media.${i}.h`]) || undefined,
      });
    }
  }
  return media;
};

const getAccentColor = (prev: IPreviewUrlResponse): string | undefined => {
  const value = getString(prev, `${POST}accent_color`);
  return value && /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value) ? value : undefined;
};

// "instagram.com" -> "Instagram", for the "open original" button.
const getSiteLabel = (url?: string): string | undefined => {
  if (!url) return undefined;
  try {
    const [name] = new URL(url).hostname.replace(/^www\./, '').split('.');
    return name ? name.charAt(0).toUpperCase() + name.slice(1) : undefined;
  } catch {
    return undefined;
  }
};

// Bold the numbers in "❤️ 51,976  💬 158" so they stand out from the icons.
const renderStats = (stats: string): ReactNode[] =>
  stats.split(/(\d[\d.,]*[KkMm]?)/).map((part, i) => (i % 2 === 1 ? <b key={i}>{part}</b> : part));

// Media mosaic: 1 big; 2 side by side; 1 big + 2 stacked; 2x2; then rows
// of three with any remainder (1 or 2 tiles) in a wider first row.
const getGalleryRows = (count: number): number[] => {
  if (count <= 2) return [count];
  if (count === 4) return [2, 2];
  const rows: number[] = [];
  if (count % 3) rows.push(count % 3);
  for (let i = 0; i < Math.floor(count / 3); i += 1) rows.push(3);
  return rows;
};

const ROW_ASPECT: Record<number, string> = { 1: '16 / 9', 2: '2 / 1', 3: '3 / 1' };

// A lone image keeps its own shape, within portrait 3:4 and landscape 2:1.
const singleAspect = ({ w, h }: PostMedia): string =>
  w && h ? String(Math.min(2, Math.max(0.75, w / h))) : ROW_ASPECT[1];

type PostTileProps = {
  media: PostMedia;
  src: string;
  alt: string;
  onOpen: () => void;
};

function PostTile({ media, src, alt, onOpen }: PostTileProps) {
  const [failed, setFailed] = useState(false);
  const video = media.kind === 'video' || media.kind === 'gifv';

  const content = (
    <>
      {!failed && (
        <img className={css.PostTileImg} src={src} alt={alt} onError={() => setFailed(true)} />
      )}
      {video && (
        <span className={css.PostTilePlay}>
          <Icon size="400" src={Icons.Play} filled />
        </span>
      )}
    </>
  );

  if (video && media.link) {
    return (
      <a
        className={css.PostTile}
        href={media.link}
        target="_blank"
        rel="noreferrer noopener"
        aria-label={alt}
      >
        {content}
      </a>
    );
  }
  return (
    <button className={css.PostTile} type="button" onClick={onOpen} aria-label={alt}>
      {content}
    </button>
  );
}

export const UrlPreviewPost = as<'article', { url: string; prev: IPreviewUrlResponse }>(
  ({ url, prev, style, ...props }, ref) => {
    const mx = useMatrixClient();
    const useAuthentication = useMediaAuthentication();
    const [hour24Clock] = useSetting(settingsAtom, 'hour24Clock');
    const [dateFormatString] = useSetting(settingsAtom, 'dateFormatString');
    const [viewerSrc, setViewerSrc] = useState<string>();
    const [avatarFailed, setAvatarFailed] = useState(false);
    const [iconFailed, setIconFailed] = useState(false);

    const thumb = (mxc: string | undefined, size: number, method = 'scale') =>
      (mxc && mxcUrlToHttp(mx, mxc, useAuthentication, size, size, method, false)) || undefined;
    const full = (mxc: string) => mxcUrlToHttp(mx, mxc, useAuthentication) ?? undefined;

    const authorName = getString(prev, `${POST}author_name`);
    const authorHandle = getString(prev, `${POST}author_handle`);
    const authorUrl = getHttpUrl(prev, `${POST}author_url`);
    const avatarMxc = getString(prev, `${POST}author_avatar`);
    const stats = getString(prev, `${POST}stats`);
    const text = getString(prev, `${POST}text`);
    const media = getPostMedia(prev);
    const accent = getAccentColor(prev);
    const siteIconMxc = getString(prev, `${POST}site_icon`);
    const siteName = getString(prev, 'og:site_name');
    const originalUrl = getHttpUrl(prev, `${POST}button_url`) ?? getHttpUrl(prev, 'og:url') ?? url;
    const siteLabel = getString(prev, `${POST}button_label`) ?? getSiteLabel(originalUrl);

    const publishedTs = Date.parse(getString(prev, `${POST}published`) ?? '');
    const published = Number.isFinite(publishedTs)
      ? `${timeDayMonYear(publishedTs, dateFormatString)}, ${timeHourMinute(
          publishedTs,
          hour24Clock
        )}`
      : undefined;

    const avatarSrc = !avatarFailed ? thumb(avatarMxc, 200, 'crop') : undefined;
    const siteIconSrc = !iconFailed ? thumb(siteIconMxc, 64) : undefined;
    const alt = text ?? authorName ?? '';

    let tileIndex = 0;
    const renderTile = (item: PostMedia) => {
      const src = thumb(item.mxc, 800);
      if (!src) return null;
      tileIndex += 1;
      return (
        <PostTile
          key={item.mxc}
          media={item}
          src={src}
          alt={`${alt.slice(0, 80)} (${tileIndex}/${media.length})`}
          onOpen={() => setViewerSrc(full(item.mxc))}
        />
      );
    };

    const renderGallery = () => {
      if (media.length === 0) return null;
      if (media.length === 3) {
        return (
          <div className={css.PostGallery}>
            <div className={css.PostGalleryOneByTwo}>{media.map(renderTile)}</div>
          </div>
        );
      }
      let start = 0;
      return (
        <div className={css.PostGallery}>
          {getGalleryRows(media.length).map((cols) => {
            const row = media.slice(start, start + cols);
            start += cols;
            return (
              <div
                key={row[0].mxc}
                className={css.PostGalleryRow}
                style={{
                  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                  aspectRatio: media.length === 1 ? singleAspect(row[0]) : ROW_ASPECT[cols],
                  maxHeight: media.length === 1 ? toRem(350) : undefined,
                }}
              >
                {row.map(renderTile)}
              </div>
            );
          })}
        </div>
      );
    };

    return (
      <article
        className={css.Post}
        style={{ ...(accent && { borderLeftColor: accent }), ...style }}
        {...props}
        ref={ref}
      >
        {(authorName || authorHandle || stats || avatarSrc) && (
          <div className={css.PostHeader}>
            <div className={css.PostAuthor}>
              {authorName && (
                <Text size="T400">
                  <b>{authorName}</b>
                </Text>
              )}
              {authorHandle &&
                (authorUrl ? (
                  <Text
                    as="a"
                    size="T300"
                    className={css.PostHandle}
                    href={authorUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    {authorHandle}
                  </Text>
                ) : (
                  <Text size="T300">{authorHandle}</Text>
                ))}
              {stats && (
                <Text size="T300" className={css.PostStats}>
                  {renderStats(stats)}
                </Text>
              )}
            </div>
            {avatarSrc && avatarMxc && (
              <button
                className={css.PostAvatar}
                type="button"
                onClick={() => setViewerSrc(full(avatarMxc))}
              >
                <img
                  className={css.PostTileImg}
                  src={avatarSrc}
                  alt={authorName ?? authorHandle ?? ''}
                  onError={() => setAvatarFailed(true)}
                />
              </button>
            )}
          </div>
        )}
        {text && (
          <Text size="T300" className={css.PostText}>
            {text}
          </Text>
        )}
        {renderGallery()}
        <div className={css.PostFooter}>
          <div className={css.PostFooterInfo}>
            {siteIconSrc && (
              <img
                className={css.PostSiteIcon}
                src={siteIconSrc}
                alt=""
                onError={() => setIconFailed(true)}
              />
            )}
            <Text size="T200" truncate>
              {[siteName, published].filter(Boolean).join(' · ')}
            </Text>
          </div>
          {siteLabel && (
            <Button
              as="a"
              href={originalUrl}
              target="_blank"
              rel="noreferrer noopener"
              size="300"
              variant="Secondary"
              fill="Soft"
              radii="300"
              after={<Icon size="100" src={Icons.External} />}
            >
              <Text size="B300">{siteLabel}</Text>
            </Button>
          )}
        </div>
        {viewerSrc && (
          <ImageOverlay
            src={viewerSrc}
            alt={alt}
            viewer
            requestClose={() => setViewerSrc(undefined)}
            renderViewer={(p) => <ImageViewer {...p} />}
          />
        )}
      </article>
    );
  }
);
