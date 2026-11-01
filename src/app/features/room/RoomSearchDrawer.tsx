import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Chip, Icon, IconButton, Icons, Scroll, Spinner, Text, config } from 'folds';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Room, RoomEvent, RoomMember, RoomStateEvent, SearchOrderBy } from 'matrix-js-sdk';
import { RoomPinnedEventsEventContent } from 'matrix-js-sdk/lib/types';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import classNames from 'classnames';

import * as css from './RoomSearchDrawer.css';
import { MembersDrawer } from './MembersDrawer';
import { DmProfileDrawer } from './DmProfileDrawer';
import { ContainerColor } from '../../styles/ContainerColor.css';
import { EncryptionNotice, SearchErrorNotice } from '../message-search/SearchNotice';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useIsDirectRoom } from '../../hooks/useRoom';
import { useSpaceOptionally } from '../../hooks/useSpace';
import { useRoomNavigate } from '../../hooks/useRoomNavigate';
import { useSetting } from '../../state/hooks/settings';
import { settingsAtom } from '../../state/settings';
import { mDirectAtom } from '../../state/mDirectList';
import { allRoomsAtom } from '../../state/room-list/roomList';
import { roomToParentsAtom } from '../../state/room/roomToParents';
import {
  useDirects,
  useOrphanRooms,
  useRecursiveChildRoomScopeFactory,
  useSpaceChildren,
} from '../../state/hooks/roomList';
import {
  SearchExtensions,
  useMessageSearch,
  useRankOrderTruncated,
} from '../message-search/useMessageSearch';
import {
  QueryToken,
  ResolvedSearch,
  SearchLookup,
  makeResultFilter,
  serverMsgtypes,
  parseSearchQuery,
  removeQueryToken,
  resolveSearchQuery,
} from '../message-search/searchQuery';
import { StateEvent } from '../../../types/matrix/room';
import { SearchResultGroup } from '../message-search/SearchResultGroup';
import { VirtualTile } from '../../components/virtualizer';
import { ScrollTopContainer } from '../../components/scroll-top-container';
import {
  roomSearchTermAtom,
  roomSearchDrawerActiveAtom,
  roomSearchLookupAtom,
  roomSearchOrderAtom,
  RoomSearchOrder,
} from '../../state/roomSearch';

const FILTER_LABELS: Record<string, string> = {
  from: 'From',
  in: 'In',
  mentions: 'Mentions',
  has: 'Has',
  before: 'Before',
  after: 'After',
  during: 'On',
  pinned: 'Pinned',
};

/** Why a query cannot run yet, in words the person can act on. */
const searchProblems = (search: ResolvedSearch): string[] => {
  const problems: string[] = [];
  search.unresolved.forEach(({ operator, value }) =>
    problems.push(
      operator === 'in' ? `No room matches in:${value}.` : `No member matches ${operator}:${value}.`
    )
  );
  search.invalid.forEach((token) => problems.push(`"${token.raw}" is not a valid filter.`));
  if (!search.text && !search.hasFilters) {
    problems.push('Add a word or phrase to search for, along with your filters.');
  }
  return problems;
};

function SortChips({ order }: { order: RoomSearchOrder }) {
  const [, setOrder] = useAtom(roomSearchOrderAtom);
  const rankTruncated = useRankOrderTruncated();
  return (
    <Box gap="100" alignItems="Center">
      <Chip
        variant="SurfaceVariant"
        radii="Pill"
        aria-pressed={order === 'recent'}
        onClick={() => setOrder('recent')}
      >
        <Text size="T200">Newest</Text>
      </Chip>
      <Chip
        variant="SurfaceVariant"
        radii="Pill"
        aria-pressed={order === 'oldest'}
        onClick={() => setOrder('oldest')}
      >
        <Text size="T200">Oldest</Text>
      </Chip>
      <Chip
        variant="SurfaceVariant"
        radii="Pill"
        aria-pressed={order === 'rank'}
        onClick={() => setOrder('rank')}
      >
        <Text size="T200">{rankTruncated ? 'Relevant (top 500)' : 'Relevant'}</Text>
      </Chip>
    </Box>
  );
}

function SearchFilterChips({ query }: { query: string }) {
  const [, setSearchTerm] = useAtom(roomSearchTermAtom);
  const parsed = useMemo(() => parseSearchQuery(query), [query]);
  const filters = parsed.tokens.filter(
    (t): t is Extract<QueryToken, { kind: 'filter' }> => t.kind === 'filter' && !!t.value
  );
  if (filters.length === 0) return null;

  return (
    <Box className={css.SearchFilterChips} gap="100" wrap="Wrap">
      {filters.map((token) => (
        <Chip
          key={token.raw + token.start}
          variant="Secondary"
          radii="Pill"
          after={<Icon size="50" src={Icons.Cross} />}
          onClick={() => setSearchTerm(removeQueryToken(query, token) || undefined)}
          aria-label={`Remove filter ${token.raw}`}
        >
          <Text size="T200">{`${FILTER_LABELS[token.operator]}: ${token.value}`}</Text>
        </Chip>
      ))}
    </Box>
  );
}

type SearchResultsProps = {
  /** the query exactly as typed; keys the cache so edits to filters refetch */
  query: string;
  search: ResolvedSearch;
  order: RoomSearchOrder;
  onOpen: (roomId: string, eventId: string) => void;
};
function SearchResults({ query, search, order, onOpen }: SearchResultsProps) {
  const mx = useMatrixClient();
  const mDirects = useAtomValue(mDirectAtom);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollTopAnchorRef = useRef<HTMLDivElement>(null);
  const [mediaAutoLoad] = useSetting(settingsAtom, 'mediaAutoLoad');
  const [urlPreview] = useSetting(settingsAtom, 'urlPreview');
  const [encUrlPreview] = useSetting(settingsAtom, 'encUrlPreview');
  const [legacyUsernameColor] = useSetting(settingsAtom, 'legacyUsernameColor');
  const [hour24Clock] = useSetting(settingsAtom, 'hour24Clock');
  const [dateFormatString] = useSetting(settingsAtom, 'dateFormatString');

  const { text: term, rooms = [] } = search;
  const problems = searchProblems(search);
  const ready = problems.length === 0;
  const resultFilter = useMemo(
    () =>
      search.needsClientFilter
        ? makeResultFilter(search, (roomId) => {
            const pinned = mx
              .getRoom(roomId)
              ?.currentState.getStateEvents(StateEvent.RoomPinnedEvents, '')
              ?.getContent<RoomPinnedEventsEventContent>().pinned;
            return new Set(pinned ?? []);
          })
        : undefined,
    [mx, search]
  );
  const emptyTerm = !term;
  // ranking nothing is meaningless, and the server lists by recency in that case
  const effectiveOrder = emptyTerm && order === 'rank' ? 'recent' : order;
  const extensions = useMemo<SearchExtensions>(
    () => ({
      prefix: true,
      afterTs: search.after,
      beforeTs: search.before,
      ascending: effectiveOrder === 'oldest',
      msgtypes: serverMsgtypes(search.has),
      allowEmptyTerm: emptyTerm && search.hasFilters,
    }),
    [search.after, search.before, search.has, search.hasFilters, effectiveOrder, emptyTerm]
  );
  const msgSearchParams = useMemo(
    () => ({
      term,
      rooms,
      senders: search.senders,
      // `oldest` is not a spec order_by; it is recency plus an extension flag
      order: effectiveOrder === 'rank' ? SearchOrderBy.Rank : SearchOrderBy.Recent,
      resultFilter,
      extensions,
    }),
    [term, rooms, search.senders, effectiveOrder, resultFilter, extensions]
  );
  const searchMessages = useMessageSearch(msgSearchParams);

  const { status, data, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    enabled: ready,
    queryKey: ['room-sidebar-search', query, effectiveOrder, rooms],
    queryFn: ({ pageParam, signal }) => searchMessages(pageParam, signal),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextToken,
  });

  const groups = useMemo(() => data?.pages.flatMap((result) => result.groups) ?? [], [data]);
  const highlights = useMemo(() => {
    const mixed = data?.pages.flatMap((result) => result.highlights);
    return Array.from(new Set(mixed));
  }, [data]);
  // every page reports the same server-side total
  const totalCount = data?.pages[0]?.count;

  const virtualizer = useVirtualizer({
    count: groups.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 200,
    overscan: 1,
  });

  const vItems = virtualizer.getVirtualItems();
  const lastVItem = vItems[vItems.length - 1];
  const lastVItemIndex = lastVItem?.index;
  const lastGroupIndex = groups.length - 1;
  // A page that adds no groups (everything filtered out) must not trigger the
  // next fetch by itself, or the search would page through the whole history.
  const autoFetchedAt = useRef<{ first: unknown; groups: number }>(undefined);
  useEffect(() => {
    if (
      lastGroupIndex > -1 &&
      lastVItemIndex === lastGroupIndex &&
      !isFetchingNextPage &&
      hasNextPage &&
      !(
        autoFetchedAt.current?.first === data?.pages[0] &&
        autoFetchedAt.current?.groups === groups.length
      )
    ) {
      autoFetchedAt.current = { first: data?.pages[0], groups: groups.length };
      fetchNextPage();
    }
  }, [
    lastVItemIndex,
    lastGroupIndex,
    fetchNextPage,
    isFetchingNextPage,
    hasNextPage,
    data,
    groups.length,
  ]);

  // The server tells us which non-spec options it honoured. Say so when one that
  // changes what the person sees was ignored, instead of silently showing the
  // wrong order or an empty list.
  const applied = data?.pages[0]?.applied;
  const serverNotes: string[] = [];
  if (status === 'success') {
    if (effectiveOrder === 'oldest' && !applied?.includes('ascending')) {
      serverNotes.push('This server cannot sort oldest first, so newest messages are shown first.');
    }
    if (emptyTerm && search.hasFilters && !applied?.includes('allow_empty_term')) {
      serverNotes.push('This server needs a word or phrase to search for along with your filters.');
    }
  }

  const loadedResults = useMemo(() => groups.reduce((sum, g) => sum + g.items.length, 0), [groups]);

  let resultsLabel: string;
  if (!ready) {
    resultsLabel = 'Nothing to search yet';
  } else if (status === 'pending') {
    resultsLabel = 'Searching...';
  } else if (typeof totalCount === 'number' && totalCount > loadedResults) {
    // the spec only promises an approximate count
    resultsLabel = `${loadedResults} of ~${totalCount} Results`;
  } else if (hasNextPage && typeof totalCount !== 'number') {
    // client-side filters hide the server's total, so only say there is more
    resultsLabel = `${loadedResults}+ Results`;
  } else {
    resultsLabel = `${loadedResults} ${loadedResults === 1 ? 'Result' : 'Results'}`;
  }

  return (
    <Box className={css.RoomSearchContentBase} grow="Yes" direction="Column">
      <Box className={css.SearchResultsHeader}>
        <Text size="T200" priority="300">
          {resultsLabel}
        </Text>
        <SortChips order={effectiveOrder} />
      </Box>
      <SearchFilterChips query={query} />
      <Scroll ref={scrollRef} variant="Background" size="300" visibility="Hover" hideTrack>
        <Box direction="Column" gap="300" style={{ padding: `${config.space.S200} 0` }}>
          <Box ref={scrollTopAnchorRef} />
          <ScrollTopContainer scrollRef={scrollRef} anchorRef={scrollTopAnchorRef}>
            <IconButton
              onClick={() => virtualizer.scrollToOffset(0)}
              variant="Surface"
              radii="Pill"
              outlined
              size="300"
              aria-label="Scroll to Top"
            >
              <Icon src={Icons.ChevronTop} size="300" />
            </IconButton>
          </ScrollTopContainer>

          <EncryptionNotice
            searchedRooms={rooms}
            detailed={status === 'success' && groups.length === 0}
          />

          {problems.map((problem) => (
            <Text key={problem} style={{ padding: `0 ${config.space.S300}` }} priority="300">
              {problem}
            </Text>
          ))}

          {serverNotes.map((note) => (
            <Text key={note} style={{ padding: `0 ${config.space.S300}` }} priority="300">
              {note}
            </Text>
          ))}

          {ready && status === 'pending' && (
            <Box justifyContent="Center">
              <Spinner />
            </Box>
          )}

          {ready && status === 'success' && groups.length === 0 && (
            <Text style={{ padding: config.space.S300 }} align="Center" priority="300">
              {`No results found for "${query}"`}
            </Text>
          )}

          <Box direction="Column" gap="400">
            <div
              style={{
                position: 'relative',
                height: virtualizer.getTotalSize(),
              }}
            >
              {vItems.map((vItem) => {
                const group = groups[vItem.index];
                if (!group) return null;
                const groupRoom = mx.getRoom(group.roomId);
                if (!groupRoom) return null;

                return (
                  <VirtualTile
                    virtualItem={vItem}
                    style={{ paddingBottom: config.space.S400 }}
                    key={group.key}
                    ref={virtualizer.measureElement}
                  >
                    <SearchResultGroup
                      room={groupRoom}
                      highlights={highlights}
                      items={group.items}
                      mediaAutoLoad={mediaAutoLoad}
                      urlPreview={groupRoom.hasEncryptionStateEvent() ? encUrlPreview : urlPreview}
                      onOpen={onOpen}
                      legacyUsernameColor={legacyUsernameColor || mDirects.has(groupRoom.roomId)}
                      hour24Clock={hour24Clock}
                      dateFormatString={dateFormatString}
                    />
                  </VirtualTile>
                );
              })}
            </div>
          </Box>

          {isFetchingNextPage && (
            <Box justifyContent="Center">
              <Spinner />
            </Box>
          )}

          {error && <SearchErrorNotice error={error} />}
        </Box>
      </Scroll>
    </Box>
  );
}

type RoomSearchDrawerProps = {
  room: Room;
  members: RoomMember[];
};
export function RoomSearchDrawer({ room, members }: RoomSearchDrawerProps) {
  const mx = useMatrixClient();
  const space = useSpaceOptionally();
  const direct = useIsDirectRoom();
  const { navigateRoom } = useRoomNavigate();

  const [searchTerm, setSearchTerm] = useAtom(roomSearchTermAtom);
  const setDrawerActive = useSetAtom(roomSearchDrawerActiveAtom);

  useEffect(() => {
    setDrawerActive(true);
    return () => {
      setDrawerActive(false);
      setSearchTerm(undefined);
    };
  }, [setDrawerActive, setSearchTerm]);

  const mDirects = useAtomValue(mDirectAtom);
  const roomToParents = useAtomValue(roomToParentsAtom);
  const childRoomScopeFactory = useRecursiveChildRoomScopeFactory(mx, mDirects, roomToParents);
  const spaceChildren = useSpaceChildren(allRoomsAtom, space?.roomId ?? '', childRoomScopeFactory);
  const orphanRooms = useOrphanRooms(mx, allRoomsAtom, mDirects, roomToParents);
  const directs = useDirects(mx, allRoomsAtom, mDirects);

  const searchRooms = useMemo(() => {
    if (space) return spaceChildren;
    return [...orphanRooms, ...directs];
  }, [space, spaceChildren, orphanRooms, directs]);

  const handleOpen = (roomId: string, eventId: string) => {
    navigateRoom(roomId, eventId);
  };

  // The member and room-name lookup reads non-reactive SDK state, so bump a
  // version when either changes; otherwise someone who joins after the drawer
  // opened would never resolve in `from:`.
  const [lookupVersion, setLookupVersion] = useState(0);
  useEffect(() => {
    const bump = () => setLookupVersion((v) => v + 1);
    mx.on(RoomStateEvent.Members, bump);
    mx.on(RoomEvent.Name, bump);
    return () => {
      mx.removeListener(RoomStateEvent.Members, bump);
      mx.removeListener(RoomEvent.Name, bump);
    };
  }, [mx]);

  const lookup = useMemo<SearchLookup>(() => {
    const users = new Map<string, string>();
    const rooms: SearchLookup['rooms'] = [];
    searchRooms.forEach((roomId) => {
      const searchRoom = mx.getRoom(roomId);
      if (!searchRoom) return;
      rooms.push({ roomId, name: searchRoom.name });
      searchRoom.getJoinedMembers().forEach((member) => {
        if (!users.has(member.userId)) users.set(member.userId, member.name);
      });
    });
    return {
      users: Array.from(users, ([userId, name]) => ({ userId, name })),
      rooms,
    };
    // lookupVersion only forces a re-read of the SDK state above
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mx, searchRooms, lookupVersion]);

  const setLookup = useSetAtom(roomSearchLookupAtom);
  useEffect(() => {
    setLookup(lookup);
    return () => setLookup({ users: [], rooms: [] });
  }, [lookup, setLookup]);

  const order = useAtomValue(roomSearchOrderAtom);
  const search = useMemo(
    () =>
      searchTerm
        ? resolveSearchQuery(parseSearchQuery(searchTerm), lookup, searchRooms)
        : undefined,
    [searchTerm, lookup, searchRooms]
  );

  let drawerContent: React.ReactNode;
  if (searchTerm && search) {
    drawerContent = (
      <SearchResults query={searchTerm} search={search} order={order} onOpen={handleOpen} />
    );
  } else if (direct) {
    drawerContent = (
      <Box grow="Yes">
        <DmProfileDrawer room={room} />
      </Box>
    );
  } else {
    drawerContent = (
      <Box grow="Yes">
        <MembersDrawer room={room} members={members} hideHeader />
      </Box>
    );
  }

  return (
    <Box
      className={classNames(
        css.RoomSearchDrawer,
        ContainerColor({ variant: 'Background' }),
        searchTerm && css.RoomSearchDrawerWide
      )}
      shrink="No"
      direction="Column"
    >
      {drawerContent}
    </Box>
  );
}
