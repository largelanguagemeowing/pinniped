import React, { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Button,
  Icon,
  IconButton,
  Icons,
  Menu,
  MenuItem,
  PopOut,
  RectCords,
  Scroll,
  Switch,
  Text,
  config,
} from 'folds';
import FocusTrap from 'focus-trap-react';
import { stopPropagation } from '../../../utils/keyboard';
import { Page, PageContent, PageHeader } from '../../../components/page';
import { SequenceCard } from '../../../components/sequence-card';
import { SettingTile } from '../../../components/setting-tile';
import { useSetting } from '../../../state/hooks/settings';
import { settingsAtom } from '../../../state/settings';
import { SequenceCardStyle } from '../styles.css';
import { UserSoundPack } from '../../soundboard/UserSoundPack';
import { useMicLevel } from '../../../hooks/useMicLevel';
import { VoiceGateMeter } from './VoiceGateMeter';
import { VoiceTuningControls } from './VoiceTuningControls';
import { CallShortcuts } from './CallShortcuts';
import {
  VoiceTuning,
  autoTuningSpecs,
  defaultVoiceTuning,
  gateTuningSpecs,
  indicatorTuningSpecs,
  withDefaultTuning,
} from '../../../plugins/call/voiceTuning';

const denoiseSupported = () =>
  typeof AudioWorkletNode !== 'undefined' &&
  typeof WebAssembly === 'object' &&
  typeof WebAssembly.compileStreaming === 'function';

type AudioDevices = {
  inputs: MediaDeviceInfo[];
  outputs: MediaDeviceInfo[];
  /** Browsers hide device labels until the page has been granted microphone access. */
  labelled: boolean;
};

const useAudioDevices = (): [AudioDevices, () => Promise<void>] => {
  const [devices, setDevices] = useState<AudioDevices>({
    inputs: [],
    outputs: [],
    labelled: true,
  });

  const refresh = useCallback(async () => {
    const all = await navigator.mediaDevices.enumerateDevices();
    const inputs = all.filter((d) => d.kind === 'audioinput');
    const outputs = all.filter((d) => d.kind === 'audiooutput');
    setDevices({
      inputs,
      outputs,
      labelled: [...inputs, ...outputs].every((d) => d.label !== ''),
    });
  }, []);

  useEffect(() => {
    refresh().catch(() => undefined);
    navigator.mediaDevices.addEventListener('devicechange', refresh);
    return () => navigator.mediaDevices.removeEventListener('devicechange', refresh);
  }, [refresh]);

  const requestAccess = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    await refresh();
  }, [refresh]);

  return [devices, requestAccess];
};

type DeviceSelectProps = {
  value: string;
  devices: MediaDeviceInfo[];
  fallbackName: string;
  onChange: (id: string) => void;
};

function DeviceSelect({ value, devices, fallbackName, onChange }: DeviceSelectProps) {
  const [menuCords, setMenuCords] = useState<RectCords>();
  const nameOf = (d: MediaDeviceInfo, index: number) => d.label || `${fallbackName} ${index + 1}`;
  const selected = devices.findIndex((d) => d.deviceId === value);

  const handleSelect = (id: string) => {
    onChange(id);
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
        onClick={(evt) => setMenuCords(evt.currentTarget.getBoundingClientRect())}
      >
        <Text size="T300" truncate>
          {selected >= 0 ? nameOf(devices[selected], selected) : 'System default'}
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
                <MenuItem
                  size="300"
                  variant={selected < 0 ? 'Primary' : 'Surface'}
                  radii="300"
                  onClick={() => handleSelect('')}
                >
                  <Text size="T300">System default</Text>
                </MenuItem>
                {devices
                  // 'default' and 'communications' are aliases that the empty id already covers.
                  .filter((d) => d.deviceId !== 'default' && d.deviceId !== 'communications')
                  .map((d) => (
                    <MenuItem
                      key={d.deviceId}
                      size="300"
                      variant={value === d.deviceId ? 'Primary' : 'Surface'}
                      radii="300"
                      onClick={() => handleSelect(d.deviceId)}
                    >
                      <Text size="T300">{nameOf(d, devices.indexOf(d))}</Text>
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

function CallAudio() {
  const [callDenoise, setCallDenoise] = useSetting(settingsAtom, 'callDenoise');
  const [voiceGate, setVoiceGate] = useSetting(settingsAtom, 'callVoiceGate');
  const [voiceGateAuto, setVoiceGateAuto] = useSetting(settingsAtom, 'callVoiceGateAuto');
  const [voiceGateThreshold, setVoiceGateThreshold] = useSetting(
    settingsAtom,
    'callVoiceGateThreshold'
  );
  const [storedTuning, setStoredTuning] = useSetting(settingsAtom, 'callVoiceTuning');
  const tuning = withDefaultTuning(storedTuning);
  const changeTuning = (key: keyof VoiceTuning, value: number) =>
    setStoredTuning({ ...storedTuning, [key]: value });
  const resetTuning = (keys: (keyof VoiceTuning)[]) =>
    setStoredTuning({
      ...storedTuning,
      ...Object.fromEntries(keys.map((k) => [k, defaultVoiceTuning[k]])),
    });
  const [audioInput, setAudioInput] = useSetting(settingsAtom, 'callAudioInput');
  const [audioOutput, setAudioOutput] = useSetting(settingsAtom, 'callAudioOutput');
  const [devices, requestAccess] = useAudioDevices();
  const supported = denoiseSupported();
  // Only listen to the microphone once access is granted, so opening settings never prompts.
  const micLevel = useMicLevel(audioInput, voiceGate && devices.labelled);

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Call Audio</Text>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Microphone"
          description={
            devices.labelled ? (
              'Applies immediately, including during a call.'
            ) : (
              <>
                Device names are hidden until you allow microphone access.{' '}
                <Button
                  size="300"
                  variant="Secondary"
                  fill="None"
                  onClick={() => requestAccess().catch(() => undefined)}
                >
                  <Text size="T200">Allow access</Text>
                </Button>
              </>
            )
          }
          after={
            <DeviceSelect
              value={audioInput}
              devices={devices.inputs}
              fallbackName="Microphone"
              onChange={setAudioInput}
            />
          }
        />
      </SequenceCard>
      {devices.outputs.length > 0 && (
        <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
          <SettingTile
            title="Speaker"
            description="Where call audio plays."
            after={
              <DeviceSelect
                value={audioOutput}
                devices={devices.outputs}
                fallbackName="Speaker"
                onChange={setAudioOutput}
              />
            }
          />
        </SequenceCard>
      )}
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Noise Suppression"
          description={
            supported
              ? 'Remove background noise from your microphone with DeepFilterNet 3.'
              : 'Not supported by this browser.'
          }
          after={
            <Switch
              variant="Primary"
              disabled={!supported}
              value={callDenoise && supported}
              onChange={setCallDenoise}
            />
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
          title="Voice Activity Gate"
          description="Only send your microphone while it hears you. Noise suppression keeps running either way, so it stays adapted to your room."
          after={<Switch variant="Primary" value={voiceGate} onChange={setVoiceGate} />}
        />
        {voiceGate && (
          <>
            <SettingTile
              title="Automatically Adjust Input Sensitivity"
              description="Follow the background noise in your room instead of a fixed level."
              after={<Switch variant="Primary" value={voiceGateAuto} onChange={setVoiceGateAuto} />}
            />
            <Box direction="Column" gap="200">
              <VoiceGateMeter
                level={micLevel}
                threshold={voiceGateAuto ? undefined : voiceGateThreshold}
                onThreshold={voiceGateAuto ? undefined : setVoiceGateThreshold}
                hysteresisDb={tuning.hysteresisDb}
                holdMs={tuning.holdMs}
              />
              <Text size="T200" priority="300">
                {devices.labelled
                  ? 'Speak to test your mic. Green means it is being sent. The call listens after noise suppression, so it hears a little less than this meter.'
                  : 'Allow microphone access above to see the live meter.'}
              </Text>
            </Box>
            <VoiceTuningControls
              label="Advanced"
              specs={voiceGateAuto ? [...gateTuningSpecs, ...autoTuningSpecs] : gateTuningSpecs}
              tuning={tuning}
              onChange={changeTuning}
              onReset={resetTuning}
            />
          </>
        )}
      </SequenceCard>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title="Speaking Indicator"
          description="The ring and highlight that show who is talking. It reacts to the sound itself, so it is quick even on a bad connection."
        />
        <VoiceTuningControls
          label="Adjust"
          specs={indicatorTuningSpecs}
          tuning={tuning}
          onChange={changeTuning}
          onReset={resetTuning}
        />
      </SequenceCard>
    </Box>
  );
}

type CallsProps = {
  requestClose: () => void;
};
function CallVideo() {
  const [simulcast, setSimulcast] = useSetting(settingsAtom, 'callSimulcast');

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Call Video</Text>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        <SettingTile
          title="Multiple Quality Layers"
          description="Send camera and screen share at several qualities so viewers on weak connections can drop down. Off sends one high-quality stream. Applies the next time you start video."
          after={<Switch variant="Primary" value={simulcast} onChange={setSimulcast} />}
        />
      </SequenceCard>
    </Box>
  );
}

export function Calls({ requestClose }: CallsProps) {
  return (
    <Page>
      <PageHeader outlined={false}>
        <Box grow="Yes" gap="200">
          <Box grow="Yes" alignItems="Center" gap="200">
            <Text size="H3" truncate>
              Calls
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
              <CallAudio />
              <CallShortcuts />
              <CallVideo />
              <UserSoundPack />
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}
