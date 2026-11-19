// jsdom has no matchMedia; the call core only asks about reduced motion and pointer types.
window.matchMedia = (): MediaQueryList =>
  ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }) as Partial<MediaQueryList> as MediaQueryList;
