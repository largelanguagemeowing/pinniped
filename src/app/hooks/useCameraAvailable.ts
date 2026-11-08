import { useEffect, useState } from 'react';

/**
 * Whether this device has a camera. Starts as available until the devices are listed, and follows
 * devices being plugged in or removed.
 */
export const useCameraAvailable = (): boolean => {
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    const mediaDevices = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
    if (!mediaDevices?.enumerateDevices) return undefined;

    let active = true;
    const check = () => {
      mediaDevices
        .enumerateDevices()
        .then((devices) => {
          if (active) setAvailable(devices.some((d) => d.kind === 'videoinput'));
        })
        .catch(() => {});
    };
    check();
    mediaDevices.addEventListener?.('devicechange', check);
    return () => {
      active = false;
      mediaDevices.removeEventListener?.('devicechange', check);
    };
  }, []);

  return available;
};
