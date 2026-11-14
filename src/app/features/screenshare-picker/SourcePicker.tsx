import React, { useEffect, useRef, useState } from 'react';
import { Box, Icon, Icons, Scroll, Spinner, Text, config, toRem } from 'folds';
import { ScreenSharePickerSource } from '../../utils/device';
import * as css from './styles.css';

type Kind = ScreenSharePickerSource['kind'];

const TABS: { kind: Kind; label: string; icon: typeof Icons.Monitor }[] = [
  { kind: 'window', label: 'Applications', icon: Icons.Category },
  { kind: 'screen', label: 'Entire Screen', icon: Icons.Monitor },
];

type SourcePickerProps = {
  list: () => Promise<ScreenSharePickerSource[]>;
  selected: string | undefined;
  onSelect: (id: string) => void;
};

/**
 * The screens and windows a share can capture, for the desktop app on Windows where Chromium
 * has no picker of its own. Loads the list when it mounts: thumbnails take a moment to build,
 * which is why the share dialog asks for them as it opens and not when Go Live is pressed.
 */
export function SourcePicker({ list, selected, onSelect }: SourcePickerProps) {
  const [sources, setSources] = useState<ScreenSharePickerSource[]>();
  const [failed, setFailed] = useState(false);
  const [kind, setKind] = useState<Kind>('window');
  // Once a tab was picked by hand, a list that arrives later must not switch it back.
  const chosenKind = useRef(false);

  useEffect(() => {
    let live = true;
    list().then(
      (found) => {
        if (!live) return;
        setSources(found);
        if (!chosenKind.current)
          setKind(found.some((source) => source.kind === 'window') ? 'window' : 'screen');
      },
      () => live && setFailed(true)
    );
    return () => {
      live = false;
    };
  }, [list]);

  const shown = sources?.filter((source) => source.kind === kind) ?? [];

  let body;
  if (failed) {
    body = <Text priority="300">The screens and windows could not be listed.</Text>;
  } else if (!sources) {
    body = <Spinner variant="Secondary" size="400" />;
  } else if (shown.length === 0) {
    body = (
      <Text priority="300">{kind === 'screen' ? 'No screens found.' : 'No windows found.'}</Text>
    );
  }

  return (
    <Box direction="Column" gap="300" style={{ flex: '1 1 0', minHeight: 0, overflow: 'hidden' }}>
      <div className={css.Tabs} role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.kind}
            type="button"
            role="tab"
            className={css.Tab}
            aria-selected={kind === tab.kind}
            onClick={() => {
              chosenKind.current = true;
              setKind(tab.kind);
            }}
          >
            <Icon size="100" src={tab.icon} />
            <Text size="B400">{tab.label}</Text>
          </button>
        ))}
      </div>
      <Scroll visibility="Hover" hideTrack style={{ flex: '1 1 0', minHeight: 0 }}>
        {body ? (
          <Box justifyContent="Center" alignItems="Center" style={{ height: toRem(240) }}>
            {body}
          </Box>
        ) : (
          <div className={css.Grid} style={{ paddingRight: config.space.S200 }}>
            {shown.map((source) => (
              <button
                key={source.id}
                type="button"
                className={css.Card}
                aria-pressed={selected === source.id}
                onClick={() => onSelect(source.id)}
              >
                <div className={css.Thumb}>
                  <img className={css.ThumbImage} src={source.thumbnail} alt="" />
                </div>
                <div className={css.CardLabel}>
                  {source.icon && <img className={css.CardIcon} src={source.icon} alt="" />}
                  <Text size="T300" truncate title={source.name}>
                    {source.name}
                  </Text>
                </div>
              </button>
            ))}
          </div>
        )}
      </Scroll>
    </Box>
  );
}
