import React, { useState } from 'react';
import {
  Box,
  Button,
  config,
  Dialog,
  Header,
  Icon,
  IconButton,
  Icons,
  Menu,
  MenuItem,
  RadioButton,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  PopOut,
  RectCords,
  Text,
  toRem,
} from 'folds';
import FocusTrap from 'focus-trap-react';
import {
  CallEmbed,
  screenShareAudioSource,
  screenShareFrameRates,
  screenShareResolutions,
} from '../../plugins/call';
import { useSetting } from '../../state/hooks/settings';
import { settingsAtom } from '../../state/settings';
import { stopPropagation } from '../../utils/keyboard';

type OptionProps = { label: string; selected: boolean; onSelect: () => void };
function DropdownOption({ label, selected, onSelect }: OptionProps) {
  return (
    <MenuItem
      size="300"
      radii="300"
      variant="Surface"
      role="menuitemradio"
      aria-checked={selected}
      onClick={onSelect}
      after={<RadioButton variant="Primary" size="300" checked={selected} readOnly tabIndex={-1} />}
    >
      <Text size="T300">{label}</Text>
    </MenuItem>
  );
}

type DropdownOption<T> = { value: T; label: string };
type DropdownProps<T> = {
  title: string;
  value: T;
  options: DropdownOption<T>[];
  onChange: (value: T) => void;
};

/** A setting with a fixed list of choices: its current value, and a menu to change it. */
function Dropdown<T>({ title, value, options, onChange }: DropdownProps<T>) {
  const [cords, setCords] = useState<RectCords>();
  const current = options.find((option) => option.value === value)?.label ?? '';

  return (
    <Box direction="Column" gap="200">
      <Text size="L400" priority="300">
        {title}
      </Text>
      <Button
        variant="Secondary"
        fill="Soft"
        outlined
        radii="400"
        size="400"
        after={<Icon size="200" src={Icons.ChevronBottom} />}
        onClick={(evt: React.MouseEvent<HTMLButtonElement>) =>
          setCords(evt.currentTarget.getBoundingClientRect())
        }
        aria-haspopup="menu"
        aria-expanded={!!cords}
      >
        <Text size="B400">{current}</Text>
      </Button>
      <PopOut
        anchor={cords}
        offset={5}
        position="Bottom"
        align="Start"
        content={
          <FocusTrap
            focusTrapOptions={{
              initialFocus: false,
              onDeactivate: () => setCords(undefined),
              clickOutsideDeactivates: true,
              escapeDeactivates: stopPropagation,
            }}
          >
            <Menu style={{ minWidth: toRem(200) }}>
              <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
                {options.map((option) => (
                  <DropdownOption
                    key={String(option.value)}
                    label={option.label}
                    selected={option.value === value}
                    onSelect={() => {
                      onChange(option.value);
                      setCords(undefined);
                    }}
                  />
                ))}
              </Box>
            </Menu>
          </FocusTrap>
        }
      />
    </Box>
  );
}

type ScreenSharePickerProps = {
  callEmbed: CallEmbed;
  open: boolean;
  requestClose: () => void;
};

/**
 * Before a screen share starts: its resolution, frame rate and audio. The choices are
 * remembered, and Go Live starts the share with them.
 */
export function ScreenSharePicker({ callEmbed, open, requestClose }: ScreenSharePickerProps) {
  const [quality, setQuality] = useSetting(settingsAtom, 'callScreenShare');
  const [shareAudio, setShareAudio] = useSetting(settingsAtom, 'callScreenShareAudio');

  if (!open) return null;

  const goLive = () => {
    callEmbed.startScreenshare(
      `${quality.resolution}:${quality.fps}`,
      screenShareAudioSource(shareAudio)
    );
    requestClose();
  };

  return (
    <Overlay open backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            clickOutsideDeactivates: true,
            onDeactivate: requestClose,
            escapeDeactivates: stopPropagation,
          }}
        >
          <Dialog variant="Surface" style={{ maxWidth: toRem(400), width: '100%' }}>
            <Header
              style={{
                padding: `0 ${config.space.S200} 0 ${config.space.S400}`,
                borderBottomWidth: config.borderWidth.B300,
              }}
              variant="Surface"
              size="500"
            >
              <Box grow="Yes">
                <Text size="H4">Screen Share</Text>
              </Box>
              <IconButton onClick={requestClose} variant="Surface" aria-label="Close">
                <Icon src={Icons.Cross} />
              </IconButton>
            </Header>
            <Box style={{ padding: config.space.S400 }} direction="Column" gap="400">
              <Dropdown
                title="Resolution"
                value={quality.resolution}
                options={screenShareResolutions.map((r) => ({ value: r.id, label: r.name }))}
                onChange={(resolution) => setQuality({ ...quality, resolution })}
              />
              <Dropdown
                title="Frame Rate"
                value={quality.fps}
                options={screenShareFrameRates.map((fps) => ({ value: fps, label: `${fps} FPS` }))}
                onChange={(fps) => setQuality({ ...quality, fps })}
              />
              <Dropdown
                title="Audio"
                value={shareAudio}
                options={[
                  { value: false, label: 'None' },
                  { value: true, label: 'Computer audio' },
                ]}
                onChange={setShareAudio}
              />
              <Box justifyContent="End" gap="200">
                <Button variant="Secondary" fill="Soft" radii="400" onClick={requestClose}>
                  <Text size="B400">Cancel</Text>
                </Button>
                <Button variant="Primary" fill="Solid" radii="400" onClick={goLive}>
                  <Text size="B400">Go Live</Text>
                </Button>
              </Box>
            </Box>
          </Dialog>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}
