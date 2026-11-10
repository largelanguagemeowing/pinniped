import React, { useState } from 'react';
import { Box, IconButton } from 'folds';
import { useSetting } from '../../../state/hooks/settings';
import { settingsAtom } from '../../../state/settings';
import { findEmojiByUnicode, getEmojiUnicodeForTone } from '../../../plugins/emoji';

const TONES = [0, 1, 2, 3, 4, 5];
const SAMPLE = findEmojiByUnicode('✋');
const sample = (tone: number) => (SAMPLE ? getEmojiUnicodeForTone(SAMPLE, tone) : '✋');
const TONE_LABELS = ['Default', 'Light', 'Medium-light', 'Medium', 'Medium-dark', 'Dark'];

/** The preferred skin tone for emoji that have one: a hand that opens a row of swatches. */
export function SkinToneSelector() {
  const [skinTone, setSkinTone] = useSetting(settingsAtom, 'emojiSkinTone');
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <IconButton
        variant="SurfaceVariant"
        size="400"
        radii="300"
        aria-label={`Skin tone: ${TONE_LABELS[skinTone] ?? 'Default'}`}
        title="Skin tone"
        onClick={() => setOpen(true)}
      >
        <span aria-hidden>{sample(skinTone)}</span>
      </IconButton>
    );
  }

  return (
    <Box shrink="No" gap="100" alignItems="Center">
      {TONES.map((tone) => (
        <IconButton
          key={tone}
          variant={tone === skinTone ? 'Primary' : 'SurfaceVariant'}
          size="400"
          radii="300"
          aria-label={TONE_LABELS[tone]}
          aria-pressed={tone === skinTone}
          title={TONE_LABELS[tone]}
          onClick={() => {
            setSkinTone(tone);
            setOpen(false);
          }}
        >
          <span aria-hidden>{sample(tone)}</span>
        </IconButton>
      ))}
    </Box>
  );
}
