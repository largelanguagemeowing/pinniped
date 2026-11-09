import React, { ReactNode } from 'react';
import * as css from './AlbumGrid.css';

type AlbumGridProps = {
  items: { key: string; node: ReactNode }[];
  caption?: ReactNode;
};

/** Lays out the files of one album (see `utils/album.ts`) as a two-column grid. */
export function AlbumGrid({ items, caption }: AlbumGridProps) {
  return (
    <>
      {caption && <div className={css.AlbumCaption}>{caption}</div>}
      <div className={css.AlbumGrid}>
        {items.map(({ key, node }) => (
          <div key={key} className={css.AlbumItem}>
            {node}
          </div>
        ))}
      </div>
    </>
  );
}
