/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import React, { type ReactNode, useEffect, useRef } from 'react';
import { Box, Checkbox, config, Menu, MenuItem, PopOut, type RectCords, Text, toRem } from 'folds';

interface Props {
  /** Where the menu opened; undefined while closed. */
  anchor: RectCords | undefined;
  hideVideoless: boolean;
  onToggleHideVideoless: () => void;
  requestClose: () => void;
}

function BackgroundMenu({
  hideVideoless,
  onToggleHideVideoless,
  requestClose,
}: Omit<Props, 'anchor'>): ReactNode {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on a click (or right-click) anywhere outside the menu, and on Escape.
  useEffect(() => {
    const onPointerDown = (evt: Event) => {
      if (evt.target instanceof Node && menuRef.current?.contains(evt.target)) return;
      requestClose();
    };
    const onKeyDown = (evt: KeyboardEvent) => {
      if (evt.key === 'Escape') requestClose();
    };
    document.addEventListener('mousedown', onPointerDown, true);
    document.addEventListener('contextmenu', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown, true);
      document.removeEventListener('contextmenu', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [requestClose]);

  return (
    <Menu ref={menuRef} style={{ minWidth: toRem(240) }}>
      <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
        <MenuItem
          size="300"
          radii="300"
          role="menuitemcheckbox"
          aria-checked={hideVideoless}
          onClick={() => {
            onToggleHideVideoless();
            requestClose();
          }}
          after={
            <Checkbox size="200" variant="Primary" checked={hideVideoless} readOnly tabIndex={-1} />
          }
        >
          <Text size="B300" style={{ flexGrow: 1 }}>
            Hide non-video participants
          </Text>
        </MenuItem>
      </Box>
    </Menu>
  );
}

/** The menu of the grid's empty background: what the grid shows. */
export function GridBackgroundMenu({ anchor, ...menu }: Props): ReactNode {
  return (
    <PopOut
      anchor={anchor}
      offset={0}
      alignOffset={0}
      position="Bottom"
      align="Start"
      content={anchor && <BackgroundMenu {...menu} />}
    />
  );
}
