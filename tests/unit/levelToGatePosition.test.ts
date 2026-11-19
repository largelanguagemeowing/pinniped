import { expect, it } from 'vitest';
import { levelToGatePosition } from '../../src/app/hooks/useMicLevel';

it('maps -70 dBFS to the left edge and -20 dBFS to the right, matching the call', () => {
  expect(levelToGatePosition(0)).toBe(0);
  expect(levelToGatePosition(10 ** (-70 / 20))).toBeCloseTo(0, 5);
  expect(levelToGatePosition(10 ** (-45 / 20))).toBeCloseTo(0.5, 5);
  expect(levelToGatePosition(10 ** (-20 / 20 + 0))).toBeCloseTo(1, 5);
  expect(levelToGatePosition(1)).toBe(1);
});
