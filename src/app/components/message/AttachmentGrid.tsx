import React, { ReactNode } from 'react';
import * as css from './AttachmentGrid.css';

type AttachmentGridProps = {
  items: { key: string; node: ReactNode }[];
  caption?: ReactNode;
  /** Files that are not images or videos (e.g. audio) stack one above another. */
  stacked?: boolean;
};

/**
 * Lays out the files of one attachment group (see `utils/attachments.ts`):
 * images and videos in a two-column grid, other files as a stack.
 */
export function AttachmentGrid({ items, caption, stacked }: AttachmentGridProps) {
  return (
    <>
      {caption && <div className={css.AttachmentCaption}>{caption}</div>}
      <div className={stacked ? css.AttachmentStack : css.AttachmentGrid}>
        {items.map(({ key, node }) => (
          <div key={key} className={stacked ? css.AttachmentStackItem : css.AttachmentItem}>
            {node}
          </div>
        ))}
      </div>
    </>
  );
}
