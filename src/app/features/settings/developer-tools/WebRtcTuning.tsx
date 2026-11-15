import React, { useEffect, useState } from 'react';
import { Box, Button, Switch, Text } from 'folds';
import { SequenceCard } from '../../../components/sequence-card';
import { SettingTile } from '../../../components/setting-tile';
import { SequenceCardStyle } from '../styles.css';

/**
 * Chromium's bandwidth estimation, tuned with WebRTC field trials (see electron/webrtc-tuning.cjs).
 * They are read when the app starts, so the switch asks for a restart.
 */
export function WebRtcTuning() {
  const bridge = window.pinnipedDesktop?.webrtcTuning;
  const [enabled, setEnabled] = useState<boolean | undefined>();
  const [saved, setSaved] = useState<boolean | undefined>();

  useEffect(() => {
    let alive = true;
    bridge?.get().then((value) => {
      if (!alive) return;
      setEnabled(value);
      setSaved(value);
    });
    return () => {
      alive = false;
    };
  }, [bridge]);

  if (!bridge || enabled === undefined) return null;

  const change = (value: boolean) => {
    setEnabled(value);
    bridge.set(value);
  };

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Call Network</Text>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title="Tuned Bandwidth Estimation"
          description="Turns on WebRTC field trials for the congestion controller: loss-based estimator v2, separate delay detection for audio, and a capped delay trend. Applies after a restart; compare in the call's Debug stats."
          after={<Switch variant="Primary" value={enabled} onChange={change} />}
        />
        {enabled !== saved && (
          <SettingTile
            title="Restart To Apply"
            description="Pinniped leaves any call you are in."
            after={
              <Button variant="Primary" size="300" radii="300" onClick={() => bridge.restart()}>
                <Text size="B300">Restart</Text>
              </Button>
            }
          />
        )}
      </SequenceCard>
    </Box>
  );
}
