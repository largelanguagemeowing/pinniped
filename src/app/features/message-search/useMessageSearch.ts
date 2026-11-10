import {
  IEventWithRoomId,
  IResultContext,
  ISearchRequestBody,
  ISearchResponse,
  ISearchResult,
  SearchOrderBy,
} from 'matrix-js-sdk';
import { IRoomEventFilter } from 'matrix-js-sdk/lib/filter';
import { useCallback } from 'react';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { ServerSoftware, useServerSoftware } from '../../hooks/useServerSoftware';

export type ResultItem = {
  rank: number;
  event: IEventWithRoomId;
  context: IResultContext;
};

export type ResultGroup = {
  /**
   * Stable, unique key. Results stay in server order, so the same room can appear
   * in several groups when rooms interleave; roomId alone is not a usable key.
   */
  key: string;
  roomId: string;
  items: ResultItem[];
};

export type SearchResult = {
  nextToken?: string;
  /** total matches known to the server, not the amount loaded so far */
  count?: number;
  highlights: string[];
  groups: ResultGroup[];
  /**
   * What the server reports having done with our `club.stablecat.search` request.
   * undefined when the response carried no marker: the server does not know the
   * extension and answered a plain spec search, so only the spec parts applied.
   */
  applied?: string[];
};

/**
 * Optional, non-spec search options understood by this deployment's Synapse.
 * They travel under one namespaced key in the request filter, which spec
 * servers ignore, and the server echoes the options it honoured under the same
 * key in the response. See docker/synapse/stablecat_search.py in the server repo.
 */
export const SEARCH_EXTENSION_KEY = 'club.stablecat.search';
export type SearchExtensions = {
  prefix?: boolean;
  afterTs?: number;
  beforeTs?: number;
  ascending?: boolean;
  msgtypes?: string[];
  allowEmptyTerm?: boolean;
};

const toExtensionBody = (ext: SearchExtensions) => ({
  prefix: ext.prefix || undefined,
  after_ts: ext.afterTs,
  before_ts: ext.beforeTs,
  ascending: ext.ascending || undefined,
  msgtypes: ext.msgtypes && ext.msgtypes.length > 0 ? ext.msgtypes : undefined,
  allow_empty_term: ext.allowEmptyTerm || undefined,
});

const readApplied = (roomEvents: unknown): string[] | undefined => {
  const marker = (roomEvents as Record<string, unknown> | undefined)?.[SEARCH_EXTENSION_KEY] as
    { applied?: unknown } | undefined;
  if (!marker || !Array.isArray(marker.applied)) return undefined;
  return marker.applied.filter((a): a is string => typeof a === 'string');
};

const groupSearchResult = (results: ISearchResult[]): ResultGroup[] => {
  const groups: ResultGroup[] = [];

  results.forEach((item) => {
    const roomId = item.result.room_id;
    const resultItem: ResultItem = {
      rank: item.rank,
      event: item.result,
      context: item.context,
    };

    const lastAddedGroup: ResultGroup | undefined = groups[groups.length - 1];
    if (lastAddedGroup && roomId === lastAddedGroup.roomId) {
      lastAddedGroup.items.push(resultItem);
      return;
    }
    groups.push({
      key: `${roomId}/${item.result.event_id}`,
      roomId,
      items: [resultItem],
    });
  });

  return groups;
};

const parseSearchResult = (
  result: ISearchResponse,
  keep?: (event: IEventWithRoomId) => boolean
): SearchResult => {
  const roomEvents = result.search_categories.room_events;
  const results = roomEvents?.results ?? [];

  const searchResult: SearchResult = {
    nextToken: roomEvents?.next_batch,
    count: roomEvents?.count,
    highlights: roomEvents?.highlights ?? [],
    groups: groupSearchResult(keep ? results.filter((r) => keep(r.result)) : results),
    applied: readApplied(roomEvents),
  };

  return searchResult;
};

/**
 * A filtered page can come back nearly empty, which would leave the list
 * looking finished while the server still has matches. Keep paging until a page
 * is worth showing, but bound it so a rare filter cannot hammer the server.
 */
const MAX_FILTER_REQUESTS = 6;

/**
 * Whether the server truncates relevance-ordered search.
 *
 * The spec permits paginating `order_by: rank` -- it defines `next_batch` with no
 * dependency on ordering -- but Synapse never emits one for it and caps the query
 * at 500 rows. Treat any other implementation as capable until it proves otherwise.
 */
export const useRankOrderTruncated = (): boolean =>
  useServerSoftware().software === ServerSoftware.Synapse;

export type MessageSearchParams = {
  term?: string;
  order?: string;
  rooms?: string[];
  senders?: string[];
  /** server-side `contains_url` filter, used for `has:link` */
  containsUrl?: boolean;
  /** client-side predicate for what the server cannot filter on */
  resultFilter?: (event: IEventWithRoomId) => boolean;
  /** opt in to the server's search extensions; omitted = a plain spec request */
  extensions?: SearchExtensions;
};
export const useMessageSearch = (params: MessageSearchParams) => {
  const mx = useMatrixClient();
  const { term, order, rooms, senders, containsUrl, resultFilter, extensions } = params;

  const searchMessages = useCallback(
    async (nextBatch?: string, abortSignal?: AbortSignal): Promise<SearchResult> => {
      if (!term && !extensions?.allowEmptyTerm)
        return {
          highlights: [],
          groups: [],
        };
      const limit = 20;

      const requestBody: ISearchRequestBody = {
        search_categories: {
          room_events: {
            event_context: {
              before_limit: 1,
              after_limit: 1,
              include_profile: true,
            },
            filter: {
              limit,
              rooms,
              senders,
              contains_url: containsUrl || undefined,
              ...(extensions && { [SEARCH_EXTENSION_KEY]: toExtensionBody(extensions) }),
            } as IRoomEventFilter,
            include_state: false,
            order_by: order as SearchOrderBy.Recent,
            search_term: term ?? '',
          },
        },
      };

      const fetchPage = (token?: string) =>
        mx.search({ body: requestBody, next_batch: token }, abortSignal);

      let page = parseSearchResult(
        await fetchPage(nextBatch === '' ? undefined : nextBatch),
        resultFilter
      );
      if (!resultFilter) return page;

      const firstApplied = page.applied;
      let requests = 1;
      let loaded = page.groups.reduce((n, g) => n + g.items.length, 0);
      while (page.nextToken && loaded < limit && requests < MAX_FILTER_REQUESTS) {
        const more = parseSearchResult(await fetchPage(page.nextToken), resultFilter);
        requests += 1;
        loaded += more.groups.reduce((n, g) => n + g.items.length, 0);
        page = {
          nextToken: more.nextToken,
          // the server's total counts matches the client filter then discards
          count: undefined,
          highlights: Array.from(new Set([...page.highlights, ...more.highlights])),
          groups: [...page.groups, ...more.groups],
        };
      }
      return { ...page, count: undefined, applied: firstApplied };
    },
    [mx, term, order, rooms, senders, containsUrl, resultFilter, extensions]
  );

  return searchMessages;
};
