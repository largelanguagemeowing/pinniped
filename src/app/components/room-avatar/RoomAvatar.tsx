import { JoinRule } from 'matrix-js-sdk';
import { AvatarFallback, AvatarImage, Icon, Icons, color } from 'folds';
import React, { ComponentProps, ReactEventHandler, ReactNode, forwardRef } from 'react';
import * as css from './RoomAvatar.css';
import { getRoomIconSrc } from '../../utils/room';
import colorMXID, { gradientMXID } from '../../../util/colorMXID';
import { useImageFailure } from '../../hooks/useImageFailure';

type RoomAvatarProps = {
  roomId: string;
  // Seeds the placeholder color; a DM passes the other person's user ID so it matches theirs.
  colorId?: string;
  src?: string;
  alt?: string;
  renderFallback: () => ReactNode;
};
export function RoomAvatar({
  roomId,
  colorId = roomId,
  src,
  alt,
  renderFallback,
}: RoomAvatarProps) {
  const { failed, onError, onLoad } = useImageFailure(src);

  const handleLoad: ReactEventHandler<HTMLImageElement> = (evt) => {
    onLoad();
    evt.currentTarget.setAttribute('data-image-loaded', 'true');
  };

  if (!src || failed) {
    return (
      <AvatarFallback
        style={{
          backgroundColor: colorMXID(colorId),
          backgroundImage: gradientMXID(colorId),
          color: color.Surface.Container,
        }}
        className={css.RoomAvatar}
      >
        {renderFallback()}
      </AvatarFallback>
    );
  }

  return (
    <AvatarImage
      className={css.RoomAvatar}
      src={src}
      alt={alt}
      onError={onError}
      onLoad={handleLoad}
      draggable={false}
    />
  );
}

export const RoomIcon = forwardRef<
  SVGSVGElement,
  Omit<ComponentProps<typeof Icon>, 'src'> & {
    joinRule?: JoinRule;
    roomType?: string;
  }
>(({ joinRule, roomType, ...props }, ref) => (
  <Icon src={getRoomIconSrc(Icons, roomType, joinRule)} {...props} ref={ref} />
));
