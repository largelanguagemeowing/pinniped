/**
 * Every knob of the voice activity gate and the speaking indicator, with the range, unit and
 * plain-language description the settings page shows. The call widget has its own copy of the
 * defaults (element-call/src/livekit/voiceTuning.ts) for when it runs without Cinny; Cinny always
 * sends the whole object, so these are the ones in effect.
 */
export type VoiceTuning = {
  hysteresisDb: number;
  holdMs: number;
  fadeInMs: number;
  fadeOutMs: number;
  lookaheadMs: number;
  autoMarginDb: number;
  indicatorHoldMs: number;
};

export const defaultVoiceTuning: VoiceTuning = {
  hysteresisDb: 6,
  holdMs: 300,
  fadeInMs: 4,
  fadeOutMs: 50,
  lookaheadMs: 20,
  autoMarginDb: 12,
  indicatorHoldMs: 250,
};

export type VoiceTuningSpec = {
  key: keyof VoiceTuning;
  title: string;
  description: string;
  min: number;
  max: number;
  step: number;
  /** Shown after the value; '' for unitless. */
  unit: string;
  /** Show the value as a percentage of the range instead (0-1 settings). */
  percent?: boolean;
};

/** Gate options that apply whichever sensitivity mode is on. */
export const gateTuningSpecs: VoiceTuningSpec[] = [
  {
    key: 'holdMs',
    title: 'Hold Time',
    description:
      'How long the gate stays open after you stop talking, so pauses between words are not cut off.',
    min: 0,
    max: 1000,
    step: 10,
    unit: 'ms',
  },
  {
    key: 'hysteresisDb',
    title: 'Stickiness',
    description:
      'How far your voice must drop below the opening level before the gate starts to close. Higher stops it from flickering when you hover around the threshold.',
    min: 0,
    max: 12,
    step: 1,
    unit: 'dB',
  },
  {
    key: 'fadeInMs',
    title: 'Fade In',
    description:
      'How quickly the sound comes in when the gate opens. Shorter is snappier, longer is softer.',
    min: 1,
    max: 50,
    step: 1,
    unit: 'ms',
  },
  {
    key: 'fadeOutMs',
    title: 'Fade Out',
    description:
      'How quickly the sound goes away when the gate closes. Longer avoids abrupt cut-offs.',
    min: 5,
    max: 300,
    step: 5,
    unit: 'ms',
  },
  {
    key: 'lookaheadMs',
    title: 'Lookahead',
    description:
      'Delays your voice slightly so the gate is already open when you start a word and does not clip the first sound. Costs the same amount of latency.',
    min: 0,
    max: 50,
    step: 1,
    unit: 'ms',
  },
];

/** Only used while sensitivity is automatic. */
export const autoTuningSpecs: VoiceTuningSpec[] = [
  {
    key: 'autoMarginDb',
    title: 'Automatic Margin',
    description:
      'How far above the background noise you must be to open the gate. Higher ignores more noise but may miss quiet speech.',
    min: 6,
    max: 24,
    step: 1,
    unit: 'dB',
  },
];

/** The speaking indicator is independent of the gate. */
export const indicatorTuningSpecs: VoiceTuningSpec[] = [
  {
    key: 'indicatorHoldMs',
    title: 'Hold Time',
    description: 'How long the indicator stays lit after someone stops talking.',
    min: 0,
    max: 1000,
    step: 10,
    unit: 'ms',
  },
];

/** Settings saved by an older version may lack newer values; fill those in. */
export const withDefaultTuning = (value: Partial<VoiceTuning> | undefined): VoiceTuning => ({
  ...defaultVoiceTuning,
  ...value,
});

export const formatTuningValue = (spec: VoiceTuningSpec, value: number): string =>
  spec.percent ? `${Math.round(value * 100)}%` : `${value} ${spec.unit}`;
