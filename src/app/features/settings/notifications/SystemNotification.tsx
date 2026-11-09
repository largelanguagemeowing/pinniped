import React, { useCallback, useState } from 'react';
import {
  Box,
  Text,
  Switch,
  Button,
  color,
  Spinner,
  Icon,
  Icons,
  Menu,
  MenuItem,
  config,
  PopOut,
  RectCords,
} from 'folds';
import FocusTrap from 'focus-trap-react';
import { IPusherRequest } from 'matrix-js-sdk';
import { stopPropagation } from '../../../utils/keyboard';
import { logSound } from '../../../sound/log';
import { getCoreSoundUrl, soundBundles } from '../../../sound/bundles';
import { SequenceCard } from '../../../components/sequence-card';
import { SequenceCardStyle } from '../styles.css';
import { VolumeSlider } from '../../../components/slider';
import { SettingTile } from '../../../components/setting-tile';
import { useSetting } from '../../../state/hooks/settings';
import { getSettings, settingsAtom } from '../../../state/settings';
import { getNotificationState, usePermissionState } from '../../../hooks/usePermission';
import { useEmailNotifications } from '../../../hooks/useEmailNotifications';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { useMatrixClient } from '../../../hooks/useMatrixClient';

function EmailNotification() {
  const mx = useMatrixClient();
  const [result, refreshResult] = useEmailNotifications();

  const [setState, setEnable] = useAsyncCallback(
    useCallback(
      async (email: string, enable: boolean) => {
        if (enable) {
          await mx.setPusher({
            kind: 'email',
            app_id: 'm.email',
            pushkey: email,
            app_display_name: 'Email Notifications',
            device_display_name: email,
            lang: 'en',
            data: {
              brand: 'Pinniped',
            },
            append: true,
          });
          return;
        }
        await mx.setPusher({
          pushkey: email,
          app_id: 'm.email',
          kind: null,
        } as unknown as IPusherRequest);
      },
      [mx]
    )
  );

  const handleChange = (value: boolean) => {
    if (result && result.email) {
      setEnable(result.email, value).then(() => {
        refreshResult();
      });
    }
  };

  return (
    <SettingTile
      title="Email Notification"
      description={
        <>
          {result && !result.email && (
            <Text as="span" style={{ color: color.Critical.Main }} size="T200">
              Your account does not have any email attached.
            </Text>
          )}
          {result && result.email && <>Send notification to your email. {`("${result.email}")`}</>}
          {result === null && (
            <Text as="span" style={{ color: color.Critical.Main }} size="T200">
              Unexpected Error!
            </Text>
          )}
          {result === undefined && 'Send notification to your email.'}
        </>
      }
      after={
        <>
          {setState.status !== AsyncStatus.Loading &&
            typeof result === 'object' &&
            result?.email && <Switch value={result.enabled} onChange={handleChange} />}
          {(setState.status === AsyncStatus.Loading || result === undefined) && (
            <Spinner variant="Secondary" />
          )}
        </>
      }
    />
  );
}

function SelectSoundBundle() {
  const [menuCords, setMenuCords] = useState<RectCords>();
  const [bundle, setBundle] = useSetting(settingsAtom, 'notificationSoundBundle');

  const handleSelect = (id: string) => {
    setBundle(id);
    setMenuCords(undefined);
    // Preview, so the choice can be judged without waiting for a message.
    logSound('play', 'message', `preview of bundle ${id}`);
    const preview = new Audio(getCoreSoundUrl(id, 'message'));
    preview.volume = getSettings().soundVolume;
    preview.play().catch(() => undefined);
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
        onClick={(evt) => setMenuCords(evt.currentTarget.getBoundingClientRect())}
      >
        <Text size="T300">{soundBundles.find((b) => b.id === bundle)?.name ?? 'Default'}</Text>
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
                {soundBundles.map((b) => (
                  <MenuItem
                    key={b.id}
                    size="300"
                    variant={bundle === b.id ? 'Primary' : 'Surface'}
                    radii="300"
                    onClick={() => handleSelect(b.id)}
                  >
                    <Text size="T300">{b.name}</Text>
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

export function SystemNotification() {
  const notifPermission = usePermissionState('notifications', getNotificationState());
  const [showNotifications, setShowNotifications] = useSetting(settingsAtom, 'showNotifications');
  const [isNotificationSounds, setIsNotificationSounds] = useSetting(
    settingsAtom,
    'isNotificationSounds'
  );
  const [soundVolume, setSoundVolume] = useSetting(settingsAtom, 'soundVolume');

  const requestNotificationPermission = () => {
    window.Notification.requestPermission();
  };

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">System</Text>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title="Desktop Notifications"
          description={
            notifPermission === 'denied' ? (
              <Text as="span" style={{ color: color.Critical.Main }} size="T200">
                {'Notification' in window
                  ? 'Notification permission is blocked. Please allow notification permission from browser address bar.'
                  : 'Notifications are not supported by the system.'}
              </Text>
            ) : (
              <span>Show desktop notifications when message arrive.</span>
            )
          }
          after={
            notifPermission === 'prompt' ? (
              <Button size="300" radii="300" onClick={requestNotificationPermission}>
                <Text size="B300">Enable</Text>
              </Button>
            ) : (
              <Switch
                disabled={notifPermission !== 'granted'}
                value={showNotifications}
                onChange={setShowNotifications}
              />
            )
          }
        />
      </SequenceCard>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title="Notification Sound"
          description="Play sound when new message arrive."
          after={<Switch value={isNotificationSounds} onChange={setIsNotificationSounds} />}
        />
        <SettingTile
          title="Sound Bundle"
          description="Sounds used for messages, invitations and calls."
          after={<SelectSoundBundle />}
        />
        <SettingTile
          title="Sound Volume"
          description="Volume of ringing, message, invitation and call sounds."
          after={
            <Box alignItems="Center" gap="200">
              <VolumeSlider
                aria-label="Sound volume"
                value={soundVolume}
                onChange={setSoundVolume}
              />
              <Text size="T300" style={{ minWidth: '4ch', textAlign: 'right' }}>
                {Math.round(soundVolume * 100)}%
              </Text>
            </Box>
          }
        />
      </SequenceCard>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <EmailNotification />
      </SequenceCard>
    </Box>
  );
}
