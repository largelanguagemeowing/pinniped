# Spike: running the call core without the widget

Branch `spike/ec-direct`. Static analysis plus the js-sdk bump; no call was run
against a live homeserver.

## Step 1: matrix-js-sdk 41.6.0 -> 45.0.0 (done)

`matrix-widget-api` moves 1.17.0 -> 1.20.0 with it (the SDK's `WidgetApi` type
otherwise mismatches in `widget.ts`). Result: `tsc` clean, 696 unit tests pass
(same as before), `pnpm build:embedded` builds. Not run: eslint (resolves the
Cinny root config in this checkout, fails the same on the unmodified tree).

The bump is a MatrixRTC API migration, not a version number:

| 41.6.0                                                | 45.0.0                                                                                                                                                     |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LivekitTransportConfig`, `isLivekitTransportConfig`  | `LivekitTransport`, `isLivekitTransport` (deprecated alias, same shape); new `UnstableLivekitTransport` carries the SFU `url` and/or `livekit_service_url` |
| `joinRTCSession(identity, preferred, active, config)` | `join(identity, publishedTransports, config)`; the preferred/active split is gone                                                                          |
| `leaveRoomSession(timeout)`                           | `leave(timeout)`                                                                                                                                           |
| `CallMembership(event, data, rtcBackendIdentity)`     | adds `backendIdentities: string[]`; `rtcBackendIdentity` deprecated                                                                                        |
| `getOldestMembership()`                               | removed                                                                                                                                                    |

Unverified at runtime: `join` now receives `[backwardCompatibleTransport]` in
both the multi-SFU and the single-SFU case (the old call passed `[]` and the
transport as "active" for multi-SFU). Only mocks cover it.

## Step 2: how much of the core needs the widget

The core is host-agnostic already: `GroupCallView` takes a `MatrixClient` and a
`MatrixRTCSession`, and `widget` in `widget.ts` is an optional singleton
(`null` outside a widget, which is the SPA mode).

- Core files (`state/`, `livekit/`) touching the widget: 9, via 4 real behaviours:
  `MuteStates` sends `DeviceMute`, `CallViewModel` listens for `HangupCall`,
  `LocalMember` sends `JoinCall`/`HangupCall`, `RtcTransportAutoDiscovery`
  skips backend transports in widget mode.
- Whole tree: about 35 files reference the widget, 28 `widget.api` /
  `lazyActions` call sites, `getUrlParams()` read in 12 files (settings arrive as
  URL params and `club.stablecat.pinniped.call_settings`).
- The host boundary is `widget.ts` (444 lines), `hostControl.ts` and the 7
  `club.stablecat.pinniped.call_*` actions: `activity`, `control`, `error`,
  `settings`, `sound`, `stats`, `view` (plus `screenshare`, `soundboard`,
  `share_audio`, `view_profile`, `user_activity`).

## Proposed seam

Replace the `widget` singleton with an injected `CallHost` (commands in, events
out) that has two implementations: the existing widget transport and an
in-process one backed by Cinny's `MatrixClient`. Then mount `GroupCallView`
inside Cinny's tree with `client.matrixRTC` sessions, without the iframe.

## Not done

- Rendering the call inside the Cinny document.
- A runtime check of `join` / transports against our LiveKit and `lk-jwt-service`.
- Moving URL-param settings onto `CallHost`.
