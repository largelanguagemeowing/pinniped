import React from 'react';
import { createRoot } from 'react-dom/client';
import { enableMapSet } from 'immer';
import '@fontsource/inter/variable.css';
import 'folds/dist/style.css';
import { configClass, varsClass } from 'folds';

enableMapSet();

import './index.css';

import { trimTrailingSlash } from './app/utils/common';
import App from './app/pages/App';

// import i18n (needs to be bundled ;))
import './app/i18n';
import { pushSessionToSW } from './sw-session';
import { getFallbackSession } from './app/state/sessions';
import { APP_VERSION, isDesktop } from './app/utils/device';

document.body.classList.add(configClass, varsClass);

console.info(`Pinniped ${APP_VERSION}`);

const mountApp = () => {
  const rootContainer = document.getElementById('root');

  if (rootContainer === null) {
    console.error('Root container element not found!');
    return;
  }

  const root = createRoot(rootContainer);
  root.render(<App />);
};

const sendSessionToSW = () => {
  const session = getFallbackSession();
  pushSessionToSW(session?.baseUrl, session?.accessToken);
};

// Register Service Worker. The desktop app has no use for it: its main process adds the media
// token to the requests itself, with nothing to wait for before the first one.
if ('serviceWorker' in navigator && !isDesktop()) {
  const swUrl =
    import.meta.env.MODE === 'production'
      ? `${trimTrailingSlash(import.meta.env.BASE_URL)}/sw.js`
      : `/dev-sw.js?dev-sw`;

  navigator.serviceWorker.register(swUrl);

  navigator.serviceWorker.addEventListener('message', (ev) => {
    const { type } = ev.data ?? {};

    if (type === 'requestSession') {
      sendSessionToSW();
    }
  });

  navigator.serviceWorker.addEventListener('controllerchange', sendSessionToSW);

  // A hard reload (Ctrl+Shift+R) bypasses the SW, and Chromium won't let the already-active
  // SW claim such a page, so authenticated media would be fetched without a token. Reload
  // normally once to get the page controlled; the flag stops a loop if that doesn't help.
  const HARD_RELOAD_KEY = 'cinny.swControlReload';
  /** Returns true when it has started a reload, in which case the app must not mount. */
  const reloadIfUncontrolled = (registration: ServiceWorkerRegistration): boolean => {
    try {
      if (navigator.serviceWorker.controller || !registration.active) {
        sessionStorage.removeItem(HARD_RELOAD_KEY);
        return false;
      }
      if (!sessionStorage.getItem(HARD_RELOAD_KEY)) {
        sessionStorage.setItem(HARD_RELOAD_KEY, '1');
        window.location.reload();
        return true;
      }
    } catch {
      // sessionStorage unavailable: mount uncontrolled rather than risk a reload loop
    }
    return false;
  };

  // Wait for the SW to be active and have the session before mounting the
  // app so that authenticated media requests are intercepted with the
  // Authorization header from the very first request. On subsequent visits
  // this resolves instantly; on first visit it adds a brief delay while
  // the SW installs. A 3s timeout ensures the app still loads if the SW
  // is slow to activate or fails to register.
  Promise.race([
    navigator.serviceWorker.ready.then(reloadIfUncontrolled),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 3000)),
  ]).then((reloading) => {
    if (reloading) return;
    sendSessionToSW();
    mountApp();
  });
} else {
  sendSessionToSW();
  mountApp();
}
