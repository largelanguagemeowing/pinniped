import React, { useState } from 'react';
import { Icon, IconButton, RectCords, Text, Tooltip, TooltipProvider } from 'folds';
import type { Call } from '../../plugins/call/Call';
import { SoundboardIcon } from './icon';
import { SoundboardPicker } from './SoundboardPicker';

type SoundboardButtonProps = {
  call: Call;
  /** `panel` fills a cell of the sidebar's call controls; `bar` is the call view's control bar. */
  variant: 'panel' | 'bar';
  disabled?: boolean;
};
export function SoundboardButton({ call, variant, disabled }: SoundboardButtonProps) {
  const [anchor, setAnchor] = useState<RectCords>();
  const bar = variant === 'bar';

  return (
    <>
      <TooltipProvider
        position="Top"
        delay={bar ? 500 : undefined}
        tooltip={
          <Tooltip>
            <Text size="T200">Soundboard</Text>
          </Tooltip>
        }
      >
        {(anchorRef) => (
          <IconButton
            ref={anchorRef}
            variant="Surface"
            fill="Soft"
            radii={bar ? '400' : '300'}
            size={bar ? '400' : '300'}
            style={bar ? undefined : { width: '100%' }}
            outlined
            aria-label="Soundboard"
            aria-pressed={!!anchor}
            disabled={disabled}
            onClick={(evt) => setAnchor(evt.currentTarget.getBoundingClientRect())}
          >
            <Icon size={bar ? '400' : '100'} src={SoundboardIcon} />
          </IconButton>
        )}
      </TooltipProvider>
      <SoundboardPicker
        call={call}
        room={call.room}
        anchor={anchor}
        requestClose={() => setAnchor(undefined)}
      />
    </>
  );
}
