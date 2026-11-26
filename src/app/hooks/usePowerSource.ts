import { useEffect, useState } from 'react';

export type PowerSource = 'battery' | 'mains';

/** The Battery Status API (Chromium), which TypeScript's DOM types do not have. */
type Battery = EventTarget & { charging: boolean };
type BatteryNavigator = Navigator & { getBattery?(): Promise<Battery> };

/**
 * Whether the machine runs on battery, as it changes; undefined where the browser does not say.
 * A machine without a battery reports that it is charging, so it counts as on mains power.
 */
export function usePowerSource(): PowerSource | undefined {
  const [source, setSource] = useState<PowerSource>();
  useEffect(() => {
    let battery: Battery | undefined;
    let gone = false;
    const update = (): void => setSource(battery?.charging === false ? 'battery' : 'mains');
    (navigator as BatteryNavigator)
      .getBattery?.()
      .then((b) => {
        if (gone) return;
        battery = b;
        b.addEventListener('chargingchange', update);
        update();
      })
      .catch(() => undefined);
    return () => {
      gone = true;
      battery?.removeEventListener('chargingchange', update);
    };
  }, []);
  return source;
}
