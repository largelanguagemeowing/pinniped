import React, {
  ChangeEventHandler,
  FormEventHandler,
  MouseEventHandler,
  useEffect,
  useState,
} from 'react';
import dayjs from 'dayjs';
import {
  Box,
  Button,
  config,
  Header,
  Icon,
  IconButton,
  Icons,
  Input,
  Menu,
  MenuItem,
  PopOut,
  RectCords,
  Scroll,
  Switch,
  Text,
} from 'folds';
import FocusTrap from 'focus-trap-react';
import { Page, PageContent, PageHeader } from '../../../components/page';
import { SequenceCard } from '../../../components/sequence-card';
import { useSetting } from '../../../state/hooks/settings';
import { DateFormat, settingsAtom } from '../../../state/settings';
import { SettingTile } from '../../../components/setting-tile';
import { AutostartState } from '../../../utils/device';
import { stopPropagation } from '../../../utils/keyboard';
import { useDateFormatItems } from '../../../hooks/useDateFormat';
import { SequenceCardStyle } from '../styles.css';

type DateHintProps = {
  hasChanges: boolean;
  handleReset: () => void;
};
function DateHint({ hasChanges, handleReset }: DateHintProps) {
  const [anchor, setAnchor] = useState<RectCords>();
  const categoryPadding = { padding: config.space.S200, paddingTop: 0 };

  const handleOpenMenu: MouseEventHandler<HTMLElement> = (evt) => {
    setAnchor(evt.currentTarget.getBoundingClientRect());
  };
  return (
    <PopOut
      anchor={anchor}
      position="Top"
      align="End"
      content={
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: () => setAnchor(undefined),
            clickOutsideDeactivates: true,
            escapeDeactivates: stopPropagation,
          }}
        >
          <Menu style={{ maxHeight: '85vh', overflowY: 'auto' }}>
            <Header size="300" style={{ padding: `0 ${config.space.S200}` }}>
              <Text size="L400">Formatting</Text>
            </Header>

            <Box direction="Column">
              <Box style={categoryPadding} direction="Column">
                <Header size="300">
                  <Text size="L400">Year</Text>
                </Header>
                <Box direction="Column" tabIndex={0} gap="100">
                  <Text size="T300">
                    YY
                    <Text as="span" size="Inherit" priority="300">
                      {': '}
                      Two-digit year
                    </Text>{' '}
                  </Text>
                  <Text size="T300">
                    YYYY
                    <Text as="span" size="Inherit" priority="300">
                      {': '}Four-digit year
                    </Text>
                  </Text>
                </Box>
              </Box>

              <Box style={categoryPadding} direction="Column">
                <Header size="300">
                  <Text size="L400">Month</Text>
                </Header>
                <Box direction="Column" tabIndex={0} gap="100">
                  <Text size="T300">
                    M
                    <Text as="span" size="Inherit" priority="300">
                      {': '}The month
                    </Text>
                  </Text>
                  <Text size="T300">
                    MM
                    <Text as="span" size="Inherit" priority="300">
                      {': '}Two-digit month
                    </Text>{' '}
                  </Text>
                  <Text size="T300">
                    MMM
                    <Text as="span" size="Inherit" priority="300">
                      {': '}Short month name
                    </Text>
                  </Text>
                  <Text size="T300">
                    MMMM
                    <Text as="span" size="Inherit" priority="300">
                      {': '}Full month name
                    </Text>
                  </Text>
                </Box>
              </Box>

              <Box style={categoryPadding} direction="Column">
                <Header size="300">
                  <Text size="L400">Day of the Month</Text>
                </Header>
                <Box direction="Column" tabIndex={0} gap="100">
                  <Text size="T300">
                    D
                    <Text as="span" size="Inherit" priority="300">
                      {': '}Day of the month
                    </Text>
                  </Text>
                  <Text size="T300">
                    DD
                    <Text as="span" size="Inherit" priority="300">
                      {': '}Two-digit day of the month
                    </Text>
                  </Text>
                </Box>
              </Box>
              <Box style={categoryPadding} direction="Column">
                <Header size="300">
                  <Text size="L400">Day of the Week</Text>
                </Header>
                <Box direction="Column" tabIndex={0} gap="100">
                  <Text size="T300">
                    d
                    <Text as="span" size="Inherit" priority="300">
                      {': '}Day of the week (Sunday = 0)
                    </Text>
                  </Text>
                  <Text size="T300">
                    dd
                    <Text as="span" size="Inherit" priority="300">
                      {': '}Two-letter day name
                    </Text>
                  </Text>
                  <Text size="T300">
                    ddd
                    <Text as="span" size="Inherit" priority="300">
                      {': '}Short day name
                    </Text>
                  </Text>
                  <Text size="T300">
                    dddd
                    <Text as="span" size="Inherit" priority="300">
                      {': '}Full day name
                    </Text>
                  </Text>
                </Box>
              </Box>
            </Box>
          </Menu>
        </FocusTrap>
      }
    >
      {hasChanges ? (
        <IconButton
          tabIndex={-1}
          onClick={handleReset}
          type="reset"
          variant="Secondary"
          size="300"
          radii="300"
        >
          <Icon src={Icons.Cross} size="100" />
        </IconButton>
      ) : (
        <IconButton
          tabIndex={-1}
          onClick={handleOpenMenu}
          type="button"
          variant="Secondary"
          size="300"
          radii="300"
          aria-pressed={!!anchor}
        >
          <Icon style={{ opacity: config.opacity.P300 }} size="100" src={Icons.Info} />
        </IconButton>
      )}
    </PopOut>
  );
}

type CustomDateFormatProps = {
  value: string;
  onChange: (format: string) => void;
};
function CustomDateFormat({ value, onChange }: CustomDateFormatProps) {
  const [dateFormatCustom, setDateFormatCustom] = useState(value);

  useEffect(() => {
    setDateFormatCustom(value);
  }, [value]);

  const handleChange: ChangeEventHandler<HTMLInputElement> = (evt) => {
    const format = evt.currentTarget.value;
    setDateFormatCustom(format);
  };

  const handleReset = () => {
    setDateFormatCustom(value);
  };

  const handleSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();

    const target = evt.target as HTMLFormElement | undefined;
    const customDateFormatInput = target?.customDateFormatInput as HTMLInputElement | undefined;
    const format = customDateFormatInput?.value;
    if (!format) return;

    onChange(format);
  };

  const hasChanges = dateFormatCustom !== value;
  return (
    <SettingTile>
      <Box as="form" onSubmit={handleSubmit} gap="200">
        <Box grow="Yes" direction="Column">
          <Input
            required
            name="customDateFormatInput"
            value={dateFormatCustom}
            onChange={handleChange}
            maxLength={16}
            autoComplete="off"
            variant="Secondary"
            radii="300"
            style={{ paddingRight: config.space.S200 }}
            after={<DateHint hasChanges={hasChanges} handleReset={handleReset} />}
          />
        </Box>
        <Button
          size="400"
          variant={hasChanges ? 'Success' : 'Secondary'}
          fill={hasChanges ? 'Solid' : 'Soft'}
          outlined
          radii="300"
          disabled={!hasChanges}
          type="submit"
        >
          <Text size="B400">Save</Text>
        </Button>
      </Box>
    </SettingTile>
  );
}

type PresetDateFormatProps = {
  value: string;
  onChange: (format: string) => void;
};
function PresetDateFormat({ value, onChange }: PresetDateFormatProps) {
  const [menuCords, setMenuCords] = useState<RectCords>();
  const dateFormatItems = useDateFormatItems();

  const getDisplayDate = (format: string): string =>
    format !== '' ? dayjs().format(format) : 'Custom';

  const handleMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setMenuCords(evt.currentTarget.getBoundingClientRect());
  };

  const handleSelect = (format: DateFormat) => {
    onChange(format);
    setMenuCords(undefined);
  };

  return (
    <>
      <Button
        size="300"
        variant="Secondary"
        outlined
        fill="Soft"
        radii="300"
        after={<Icon size="300" src={Icons.ChevronBottom} />}
        onClick={handleMenu}
      >
        <Text size="T300">
          {getDisplayDate(dateFormatItems.find((i) => i.format === value)?.format ?? value)}
        </Text>
      </Button>
      <PopOut
        anchor={menuCords}
        offset={5}
        position="Bottom"
        align="End"
        content={
          <FocusTrap
            focusTrapOptions={{
              initialFocus: false,
              onDeactivate: () => setMenuCords(undefined),
              clickOutsideDeactivates: true,
              isKeyForward: (evt: KeyboardEvent) =>
                evt.key === 'ArrowDown' || evt.key === 'ArrowRight',
              isKeyBackward: (evt: KeyboardEvent) =>
                evt.key === 'ArrowUp' || evt.key === 'ArrowLeft',
              escapeDeactivates: stopPropagation,
            }}
          >
            <Menu>
              <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
                {dateFormatItems.map((item) => (
                  <MenuItem
                    key={item.format}
                    size="300"
                    variant={value === item.format ? 'Primary' : 'Surface'}
                    radii="300"
                    onClick={() => handleSelect(item.format)}
                  >
                    <Text size="T300">{getDisplayDate(item.format)}</Text>
                  </MenuItem>
                ))}
              </Box>
            </Menu>
          </FocusTrap>
        }
      />
    </>
  );
}

function SelectDateFormat() {
  const [dateFormatString, setDateFormatString] = useSetting(settingsAtom, 'dateFormatString');
  const [selectedDateFormat, setSelectedDateFormat] = useState(dateFormatString);
  const customDateFormat = selectedDateFormat === '';

  const handlePresetChange = (format: string) => {
    setSelectedDateFormat(format);
    if (format !== '') {
      setDateFormatString(format);
    }
  };

  return (
    <>
      <SettingTile
        title="Date Format"
        description={customDateFormat ? dayjs().format(dateFormatString) : ''}
        after={<PresetDateFormat value={selectedDateFormat} onChange={handlePresetChange} />}
      />
      {customDateFormat && (
        <CustomDateFormat value={dateFormatString} onChange={setDateFormatString} />
      )}
    </>
  );
}

function Startup() {
  const bridge = window.pinnipedDesktop;
  const [state, setState] = useState<AutostartState>();

  useEffect(() => {
    let cancelled = false;
    bridge?.getAutostart?.().then((value) => {
      if (!cancelled) setState(value);
    });
    return () => {
      cancelled = true;
    };
  }, [bridge]);

  if (!bridge?.getAutostart || !bridge.setAutostart) return null;

  const update = (next: AutostartState) => {
    setState(next);
    bridge.setAutostart?.(next.enabled, next.minimized).then(setState);
  };

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Startup</Text>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Open Pinniped at Login"
          description="Start Pinniped when you sign in to your computer."
          after={
            <Switch
              variant="Primary"
              value={state?.enabled === true}
              disabled={!state}
              onChange={(enabled) => state && update({ ...state, enabled })}
            />
          }
        />
        <SettingTile
          title="Start Minimized"
          description="When opened at login, keep the window out of the way."
          after={
            <Switch
              variant="Primary"
              value={state?.minimized !== false}
              disabled={!state?.enabled}
              onChange={(minimized) => state && update({ ...state, minimized })}
            />
          }
        />
      </SequenceCard>
    </Box>
  );
}

function DateAndTime() {
  const [hour24Clock, setHour24Clock] = useSetting(settingsAtom, 'hour24Clock');

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Date & Time</Text>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="24-Hour Time Format"
          after={<Switch variant="Primary" value={hour24Clock} onChange={setHour24Clock} />}
        />
      </SequenceCard>

      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SelectDateFormat />
      </SequenceCard>
    </Box>
  );
}

function Editor() {
  const [hideActivity, setHideActivity] = useSetting(settingsAtom, 'hideActivity');
  const [idleDetection, setIdleDetection] = useSetting(settingsAtom, 'idleDetection');

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Editor</Text>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Hide Typing & Read Receipts"
          description="Turn off both typing status and read receipts to keep your activity private."
          after={<Switch variant="Primary" value={hideActivity} onChange={setHideActivity} />}
        />
        <SettingTile
          title="Away When Idle"
          description="After 5 minutes without input, show as away and stop sending read receipts until you return."
          after={<Switch variant="Primary" value={idleDetection} onChange={setIdleDetection} />}
        />
      </SequenceCard>
    </Box>
  );
}

function Messages() {
  const [hideMembershipEvents, setHideMembershipEvents] = useSetting(
    settingsAtom,
    'hideMembershipEvents'
  );
  const [hideNickAvatarEvents, setHideNickAvatarEvents] = useSetting(
    settingsAtom,
    'hideNickAvatarEvents'
  );
  const [mediaAutoLoad, setMediaAutoLoad] = useSetting(settingsAtom, 'mediaAutoLoad');
  const [urlPreview, setUrlPreview] = useSetting(settingsAtom, 'urlPreview');
  const [encUrlPreview, setEncUrlPreview] = useSetting(settingsAtom, 'encUrlPreview');
  const [showHiddenEvents, setShowHiddenEvents] = useSetting(settingsAtom, 'showHiddenEvents');

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Messages</Text>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Hide Membership Change"
          after={
            <Switch
              variant="Primary"
              value={hideMembershipEvents}
              onChange={setHideMembershipEvents}
            />
          }
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Hide Profile Change"
          after={
            <Switch
              variant="Primary"
              value={hideNickAvatarEvents}
              onChange={setHideNickAvatarEvents}
            />
          }
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Disable Media Auto Load"
          after={
            <Switch
              variant="Primary"
              value={!mediaAutoLoad}
              onChange={(v) => setMediaAutoLoad(!v)}
            />
          }
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="URL Preview"
          after={<Switch variant="Primary" value={urlPreview} onChange={setUrlPreview} />}
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="URL Preview in Encrypted Rooms"
          after={<Switch variant="Primary" value={encUrlPreview} onChange={setEncUrlPreview} />}
        />
      </SequenceCard>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Show Hidden Events"
          after={
            <Switch variant="Primary" value={showHiddenEvents} onChange={setShowHiddenEvents} />
          }
        />
      </SequenceCard>
    </Box>
  );
}

function Spaces() {
  const [autoJoinSpaceRooms, setAutoJoinSpaceRooms] = useSetting(
    settingsAtom,
    'autoJoinSpaceRooms'
  );

  const [ignoreSpaceAutoJoin, setIgnoreSpaceAutoJoin] = useSetting(
    settingsAtom,
    'ignoreSpaceAutoJoin'
  );

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Spaces</Text>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Auto Join Space Rooms"
          description="Automatically join every room listed in a space, including rooms added later."
          after={
            <Switch variant="Primary" value={autoJoinSpaceRooms} onChange={setAutoJoinSpaceRooms} />
          }
        />
        <SettingTile
          title="Ignore Space Auto Join"
          description="Don't let spaces join rooms for you. Spaces that ask for auto-join are ignored; only the setting above applies."
          after={
            <Switch
              variant="Primary"
              value={ignoreSpaceAutoJoin}
              onChange={setIgnoreSpaceAutoJoin}
            />
          }
        />
      </SequenceCard>
    </Box>
  );
}

function Sidebar() {
  const [showPresenceInMemberList, setShowPresenceInMemberList] = useSetting(
    settingsAtom,
    'showPresenceInMemberList'
  );
  const [showPresenceInDMList, setShowPresenceInDMList] = useSetting(
    settingsAtom,
    'showPresenceInDMList'
  );

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Sidebar</Text>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Presence Indicators"
          description="Show online, busy, and away status badges on member avatars in the members list."
          after={
            <Switch
              variant="Primary"
              value={showPresenceInMemberList}
              onChange={setShowPresenceInMemberList}
            />
          }
        />
        <SettingTile
          title="Presence in Direct Messages"
          description="Show online, busy, and away status badges and status messages on direct message conversations in the home list."
          after={
            <Switch
              variant="Primary"
              value={showPresenceInDMList}
              onChange={setShowPresenceInDMList}
            />
          }
        />
      </SequenceCard>
    </Box>
  );
}

type GeneralProps = {
  requestClose: () => void;
};
export function General({ requestClose }: GeneralProps) {
  return (
    <Page>
      <PageHeader outlined={false}>
        <Box grow="Yes" gap="200">
          <Box grow="Yes" alignItems="Center" gap="200">
            <Text size="H3" truncate>
              General
            </Text>
          </Box>
          <Box shrink="No">
            <IconButton onClick={requestClose} variant="Surface">
              <Icon src={Icons.Cross} />
            </IconButton>
          </Box>
        </Box>
      </PageHeader>
      <Box grow="Yes">
        <Scroll hideTrack visibility="Hover">
          <PageContent>
            <Box direction="Column" gap="700">
              <Startup />
              <DateAndTime />
              <Editor />
              <Sidebar />
              <Messages />
              <Spaces />
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}
