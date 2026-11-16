import { AvatarFallback, AvatarImage, color } from 'folds';
import React, { ReactEventHandler, ReactNode } from 'react';
import classNames from 'classnames';
import * as css from './UserAvatar.css';
import colorMXID, { gradientMXID } from '../../../util/colorMXID';
import { useImageFailure } from '../../hooks/useImageFailure';

type UserAvatarProps = {
  className?: string;
  userId: string;
  src?: string;
  alt?: string;
  renderFallback: () => ReactNode;
};
export function UserAvatar({ className, userId, src, alt, renderFallback }: UserAvatarProps) {
  const { failed, onError, onLoad } = useImageFailure(src);

  const handleLoad: ReactEventHandler<HTMLImageElement> = (evt) => {
    onLoad();
    evt.currentTarget.setAttribute('data-image-loaded', 'true');
  };

  if (!src || failed) {
    return (
      <AvatarFallback
        style={{
          backgroundColor: colorMXID(userId),
          backgroundImage: gradientMXID(userId),
          color: color.Surface.Container,
        }}
        className={classNames(css.UserAvatar, className)}
      >
        {renderFallback()}
      </AvatarFallback>
    );
  }

  return (
    <AvatarImage
      className={classNames(css.UserAvatar, className)}
      src={src}
      alt={alt}
      onError={onError}
      onLoad={handleLoad}
      draggable={false}
    />
  );
}
