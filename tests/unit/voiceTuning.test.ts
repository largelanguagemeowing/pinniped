import { expect, it } from 'vitest';
import {
  autoTuningSpecs,
  defaultVoiceTuning,
  formatTuningValue,
  gateTuningSpecs,
  indicatorTuningSpecs,
  withDefaultTuning,
} from '../../src/app/plugins/call/voiceTuning';

it('every tuning has exactly one control, and its default sits inside the range', () => {
  const specs = [...gateTuningSpecs, ...autoTuningSpecs, ...indicatorTuningSpecs];
  expect(specs.map((s) => s.key).sort()).toEqual(Object.keys(defaultVoiceTuning).sort());
  specs.forEach((s) => {
    expect(defaultVoiceTuning[s.key]).toBeGreaterThanOrEqual(s.min);
    expect(defaultVoiceTuning[s.key]).toBeLessThanOrEqual(s.max);
  });
});

it('fills in values an older save lacks and formats them with their unit', () => {
  expect(withDefaultTuning({ holdMs: 500 })).toEqual({ ...defaultVoiceTuning, holdMs: 500 });
  expect(withDefaultTuning(undefined)).toEqual(defaultVoiceTuning);
  expect(formatTuningValue(gateTuningSpecs[0], 300)).toBe('300 ms');
  expect(formatTuningValue(indicatorTuningSpecs[0], 250)).toBe('250 ms');
});
