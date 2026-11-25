export const FALLBACK_ROOMS_LIMIT = 24;
export const MAX_ROOMS_LIMIT = 100;

/**
 * The page size for a `limit` search parameter: a whole number from 1 to MAX_ROOMS_LIMIT, the
 * fallback for anything else. The page draws that many placeholder cards while it loads.
 */
export const parseRoomsLimit = (param: string | undefined): number => {
  if (!param || !/^\d+$/.test(param.trim())) return FALLBACK_ROOMS_LIMIT;
  const limit = Number(param);
  if (limit < 1) return FALLBACK_ROOMS_LIMIT;
  return Math.min(limit, MAX_ROOMS_LIMIT);
};
