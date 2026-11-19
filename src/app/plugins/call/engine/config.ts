/** How long /sync may be unresponsive before the call counts as disconnected from the homeserver. */
export const SYNC_DISCONNECT_GRACE_PERIOD_MS = 10_000;

/** How long after we vanish the homeserver sends our delayed leave event. */
export const DELAYED_LEAVE_EVENT_DELAY_MS = 10_000;

/** Retry interval of the MatrixRTC membership manager after a network error. */
export const NETWORK_ERROR_RETRY_MS = 1_000;
