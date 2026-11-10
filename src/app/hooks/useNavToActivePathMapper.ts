import { useEffect } from 'react';
import { useSetAtom } from 'jotai';
import { useLocation } from 'react-router-dom';
import { useNavToActivePathAtom } from '../state/hooks/navToActivePath';

// Matrix event ids start with '$' (see EVENT_ID_PREFIX in matrix-js-sdk);
// route params are percent-encoded, so it arrives as '%24'.
const EVENT_ID_PREFIXES = ['$', encodeURIComponent('$')];

const isEventIdSegment = (segment: string): boolean =>
  EVENT_ID_PREFIXES.some((prefix) => segment.startsWith(prefix));

/**
 * Message targets (notifications, mentions, message links) put the event id at
 * the end of a room path. That is a one-shot jump: remembering it would make
 * the nav tab reopen the message and replay its highlight on every visit.
 * Drop it and remember the room alone; the URL itself stays a working link.
 */
export const getNavPathname = (pathname: string): string => {
  const trailingSlash = pathname.endsWith('/');
  const segments = pathname.split('/');
  const lastIndex = segments.length - (trailingSlash ? 2 : 1);
  const lastSegment = segments[lastIndex];
  if (!lastSegment || !isEventIdSegment(lastSegment)) return pathname;
  return `${segments.slice(0, lastIndex).join('/')}${trailingSlash ? '/' : ''}`;
};

export const useNavToActivePathMapper = (navId: string) => {
  const location = useLocation();
  const setNavToActivePath = useSetAtom(useNavToActivePathAtom());

  useEffect(() => {
    const { pathname, search, hash } = location;
    setNavToActivePath({
      type: 'PUT',
      navId,
      path: { pathname: getNavPathname(pathname), search, hash },
    });
  }, [location, setNavToActivePath, navId]);
};
