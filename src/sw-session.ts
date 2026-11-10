/**
 * Tells whatever authenticates media requests about the signed-in session. The desktop app's
 * main process adds the token itself (electron/main.cjs); the web build's service worker does
 * it for the page it controls.
 */
export function pushSessionToSW(baseUrl?: string, accessToken?: string) {
  window.pinnipedDesktop?.setMediaAuth?.(baseUrl, accessToken);

  if (!('serviceWorker' in navigator)) return;
  if (!navigator.serviceWorker.controller) return;

  navigator.serviceWorker.controller.postMessage({
    type: 'setSession',
    accessToken,
    baseUrl,
  });
}
