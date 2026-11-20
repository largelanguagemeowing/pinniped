# AGENTS.md

Pinniped is an independent Matrix client. It started as a fork of [cinnyapp/cinny](https://github.com/cinnyapp/cinny) and no longer follows it: we do not rebase onto upstream, send fixes back, or track its release cadence. Upstream is history, not a dependency. This file documents the workflow that any agent (human or AI) working in this repo must follow.

## Remotes

```
origin    git@github.com:largelanguagemeowing/pinniped.git   (push here)
upstream  git@github.com:cinnyapp/cinny.git                (frozen reference, optional)
```

- `origin` is the project. Push here.
- `upstream` may stay configured to read old Cinny history (`git log upstream/dev`, `git show`, cherry-picking an idea). Never push to it, and never merge or rebase it into our branches.

## Branches

- `fork/dev` is the working branch. All work lands here, and it is what you build and deploy from.
- `dev` is a frozen snapshot of `upstream/dev` as of the last sync. Do not update, commit on, or merge it. It is kept only as a reference point for what the code looked like before independence.
- The `git sync`, `git fork-log` and `git dev-log` aliases belong to the old upstream workflow. Do not run `git sync`; it would rebase onto a moving upstream.

Commit small, atomic changes with clear messages. History on `fork/dev` is ours, so regular merges and ordinary pushes are fine. Avoid force-pushing; use `--force-with-lease` only to repair a mistake.

## Taking something from upstream

Porting an upstream change is a deliberate act, not a sync: read the diff, re-implement or cherry-pick it onto `fork/dev`, and test it like any other change. Do not expect upstream files to merge cleanly any more; the code has diverged and will keep diverging.

## Dependencies

We own our dependency versions. Upgrade majors when it helps us, one concern per commit, and verify with `npm run typecheck`, `npm run test:unit` and `npm run build` before committing. There is no upstream lockfile to stay close to.

### Patched dependencies

`patches/` holds our fixes to dependencies. patch-package applies them on `npm install` and again in `npm run build` (the Nix build skips install scripts), and fails if one does not apply. Upgrading a patched package fails both until the patch is re-checked: if the new release fixes the bug, delete the patch; otherwise make the change in `node_modules` again, run `npx patch-package <package>` and delete the old patch file. Every patch has a regression test that fails without it.

- `matrix-js-sdk+45.0.0.patch`: the sync startup retries the MSC4429 profile-field check (`/versions`) the way it retries push rules and the filter. Without it, a `/versions` error at startup stopped the sync until a reload (`tests/unit/syncStartupRecovery.test.ts`).
- `livekit-client+2.19.0.patch` (the ESM build the app bundles): the audio contexts LiveKit makes without playing through them (the room's own when `webAudioMix` is off, silence checks, track analysers) get no output stream (`sinkId: { type: 'none' }`). Without it, every connection held an output stream that only ever played silence (`tests/unit/call-engine/livekit/processingAudio.test.ts`).

## Calls

Calls run in Pinniped's own document; there is no widget and no iframe. The call core in
`src/app/plugins/call/engine/` (view models, LiveKit and MatrixRTC handling, media e2ee; rxjs)
is derived from Element Call `v0.20.1` plus the fork changes below. It runs on Pinniped's own
`MatrixClient` and reads the call settings straight from Pinniped's settings atom
(`engine/settings.ts`), so nothing is synced. It reads them from `appStore`
(`src/app/state/appStore.tsx`), outside React; the React tree must use that same store
(`AppStoreProvider`), or the call keeps the settings it saw at load
(`tests/unit/call-engine/callSettings.test.tsx`). Like Cinny, upstream Element Call is history: port a
change deliberately, and keep the original copyright headers on derived files.

- `src/app/plugins/call/Call.ts` is one call: it builds the core for a room and joins, plays the
  call sounds, samples stats, and exposes the controls (`toggleMicrophone`, `toggleVideo`,
  `toggleSound` (deafen), `toggleSpotlight`, `startScreenShare`/`stopScreenShare`, `hangup`) and
  `controlState$`. `call.left` resolves with how the call ended. `callAtom`
  (`src/app/state/call.ts`) holds the call; setting another disposes the previous one, and a call
  that ends removes itself. A fatal error ends the call and the room's call view shows it
  (`callFailureAtom`).
- The views are Pinniped's own (folds, vanilla-extract) in `src/app/features/call/stage/`:
  `CallStage` (layouts, grid, tiles, incoming reactions and raised hands) in the room's call view,
  and `CallAudio`, mounted app-wide by `CallFeatures` while the call runs so it stays audible when
  the call view is not on screen. The call picks its layouts for the stage's size
  (`Call.setViewSize`). Sending reactions is not offered; incoming ones are shown.
- Full Screen (`useCallFullscreen`) fullscreens the document, not the call element (folds portals
  popouts, tooltips and modals to the body, which element fullscreen would hide), and while it is,
  the app layout leaves only the call view (`callFullscreenAtom`: `ClientLayout`, `PageRoot`,
  `Room`, `DmCallSplit`'s `callOnly`), hiding the rest without unmounting it.
- Resizing the stage (dragging the DM call divider) re-renders it in several commits per size,
  and React 19 throws error #185 when commit after commit ends with urgent work queued (the
  iframe used to escape this: the stage was a React root of its own). So the drag is a
  transition (`DmCallSplit`), the stage size reaches the layouts by context
  (`useLayoutBounds`), and `setViewSize` runs from a passive effect. The grid itself must stay
  urgent: react-spring keeps its animation state across renders, and a tile whose interrupted
  transition render was dropped stays where it was. `stage/renderTrail.ts` keeps a debug trail
  of the stage's renders and logs it on render storms and caught errors
  (`pinnipedCallStageTrail()` in the console); `node tests/call-stage-harness/run.mjs --drag`
  drags the divider.
- Tests: the core in `tests/unit/call-engine/` (the jsdom `call-engine` vitest project), the views
  in `tests/unit/call-stage/`. `node tests/call-stage-harness/run.mjs` (`--screenshots`) mounts
  the real `CallStage` around a fake call in Chromium and reports the tile layout while resizing;
  `--call-only` switches the DM split to call-only (fullscreen) and back.
- Transports come from the homeserver's MSC4143 `rtc_transports` endpoint, then `.well-known`
  (`org.matrix.msc4143.rtc_foci`); there is no app-config fallback.

Fork changes on top of upstream Element Call:

- **Audio pipeline** (`engine/livekit/denoise.ts` and its callers): the mic is always captured raw
  (browser noise suppression and AGC off; AEC stays with the browser), DeepFilterNet 3 denoising
  via `deepfilternet3-noise-filter` as an opt-in toggle (Pinniped settings → Calls, off by
  default), 96 kbps Opus, DTX off, in-band FEC off (`disableOpusFec` in
  `engine/livekit/bitrateHints.ts` rewrites the Opus fmtp in the answer; `installBitrateHints`
  patches `RTCPeerConnection` once, before the first call). An opt-in automatic gain toggle
  (Settings → Calls → Call Audio, `callAutoGain`) re-constrains the live mic track with the
  browser's AGC (`autoGainSync`), ahead of the denoiser and gate; off by default. The DF3 runtime
  wasm + model (~24 MB) are vendored under `public/df3/` and fetched from `/public/df3`. A previous
  `denoise-voice-clarity` attempt bundled an AGC/EQ/compressor "clarity chain" that sounded fried;
  it was replaced by pure DF3.
- **Voice activity gate** (Settings → Calls → Call Audio): only sends the mic while it hears speech
  (`engine/livekit/voiceGate.ts`, a track processor in `denoise.ts`'s `applyProcessing`). It sits
  after DeepFilterNet, which keeps processing everything while the gate is closed so its noise
  model keeps adapting, and listens to the denoised signal. Automatic mode (`AdaptiveVoiceGate` in
  `voiceActivity.ts`) follows the noise floor; manual mode uses a 0-1 threshold on a -70..-20 dBFS
  scale, the same scale as the live meter in Pinniped's settings (`useMicLevel`,
  `VoiceGateMeter`). Fine tuning (stickiness/hysteresis, hold, fade in/out, lookahead, automatic
  margin, speaking indicator sensitivity and hold) is one `VoiceTuning` object; the ranges,
  defaults and descriptions live in `src/app/plugins/call/voiceTuning.ts`, whose
  `normalizeVoiceTuning` clamps what the call reads.
- **Speaking detection** also measures the audio itself (`voiceActivity.ts`), so the speaking ring
  and activity are not limited to the server's coarse speaker updates. It watches the audio tracks
  a participant sends (`broadcastTracks.ts`: microphone, soundboard), so the indicator shows
  whenever the person or a sound they play is heard; shared-screen audio is deliberately left out.
  Every track this client sends (microphone with or without the voice gate, soundboard) is measured
  where any sound above digital silence counts; remote participants use the indicator sensitivity
  setting (their gate is invisible to us).
- **Call controls**: Pinniped's call bar (`features/call/CallControls.tsx`) and status panel
  (`features/call-status/`) call `Call`'s methods and read `call.controlState$`. Microphone and
  sound toggles the user makes are remembered for the next call (`call.userToggles$`).
- **Deafen** lives in `MuteStates` (`deafened$`, `setDeafened`): it mutes the microphone, silences
  the call's audio in `CallAudio` (shared-screen audio stays audible), and is shared with the other
  participants as the client-reported `club.stablecat.pinniped.deafened` LiveKit attribute,
  re-sent after every reconnect.
- **Call stats**: `Call` samples each SFU connection's `RTCPeerConnection` stats once a second
  (`engine/livekit/callStats.ts`) and keeps five minutes in `call.stats$`; clicking "Voice
  Connected" opens the ping popout and its Debug view (`src/app/features/call-status/stats/`).
- **Participant activity** (speaking, muted, deafened, sharing a screen):
  `CallViewModel.participantActivity$` (`state/CallViewModel/participantActivity.ts`) gives Matrix
  user IDs and does not depend on which tiles are mounted; `useCallParticipantActivity` reads it.
- **Call audio context** (`stage/audio/callAudioContext.ts`): voices play through one AudioContext
  on the chosen output. When that output fails (an error from the audio device, or the device
  missing from a new device list), Chromium fires `error` on the context: it stops a context on a
  chosen device, and moves one on the default to the new default itself ("Fallback to the default
  device due to an invalid audio device change"). Either way a new context replaces it; device
  changes that leave the output working need nothing. Its state, output and output failures are in
  the call report (`callPlaybackAtom`).
- **Call output**: a call holds two output streams, the call audio context and Chromium's player
  of the remote tracks. Chromium plays a remote WebRTC track out only through a media element: a
  remote track routed into an AudioContext with no element playing it is digital silence. So each
  track keeps its (muted) element, and the element plays on the call's output too, set by
  `TrackAudio` from before it is attached, on every connection. The output is not LiveKit's (no
  `audioOutput` room option, no `switchActiveDevice('audiooutput')`): LiveKit only switched the
  publishing connection's elements, and only once it was connected, so at join they stayed on the
  system default while the context went to the chosen device. Every other context only processes
  audio and opens no output (`engine/livekit/processingAudioContext.ts`: speaking detection, the
  denoiser, the soundboard, Windows share audio, the settings mic meter; LiveKit's own through
  the patch above).
- **Decryption warning**: a remote participant whose media we cannot decrypt gets a "Can't decrypt"
  pill on their tile (`Call.undecryptable$`, by LiveKit identity; `engine/livekit/decryptionHealth.ts`).
  LiveKit reports failures (`RoomEvent.EncryptionError`) but no recovery, and once it gives up on a
  key it drops that participant's frames silently until a working key arrives. So recovery is
  read from the call stats instead: a decoded video frame or non-concealed audio sample from them
  in an interval that started at least one sampling interval after the failure (audio already in
  the jitter buffer plays out for tens of milliseconds after frames stop decrypting). Stats
  samples are timed when requested, for this.
- **Publish errors**: when the media server's JWT service lets us join without the `canPublish`
  grant (it only trusts certain homeservers), `LocalMember` raises `PublishNotAllowedError` on
  `publishError$`; `CallStatus` shows it under "Voice Connected". The call uses
  `MatrixRTCMode.Compatibility` (multi-SFU), so each member publishes through their own
  homeserver's server.
- **Soundboard**: sounds live in Matrix data (`club.stablecat.pinniped.user_sounds` account data
  for the user, `club.stablecat.pinniped.room_sounds` state for a room or space,
  `club.stablecat.pinniped.sound_favorites` for favourites; `src/app/plugins/sound-pack/`).
  Pinniped downloads a sound and passes a `blob:` URL to `call.vm.soundboard(...)`;
  `engine/livekit/soundboard.ts` (owned by `Publisher`) decodes it and publishes it on an audio
  track of its own (source `unknown`); the user's own copy goes to `call.vm.soundboardMonitor$`,
  which `CallAudio` plays on the call's output. The mic track is untouched.
  Sounds go out at full level; the volume is each listener's own (`soundboardVolume`): it scales
  the local copy and the remote `soundboard` tracks. The picker is `src/app/features/soundboard/`.
- **Screen share audio** (Settings → Calls, `callScreenShareAudio`; the source follows the platform,
  `engine/livekit/screenShareAudio.ts`): `off`, `display` (what the browser offers with the
  capture), `device` (a microphone published as the share's audio; Linux, a PipeWire virtual mic
  made by the helper's `screenshare.rs` once share audio is on during a call, kept until it ends) or `pcm` (Windows).
  Either desktop path shares only what plays on the output device the call uses
  (`callAudioOutput`) from other applications, never Pinniped's own process tree (call voices,
  soundboard, notifications), so nothing echoes back. Windows has no virtual mic without a driver,
  so `electron/helper/src/windows/` (WASAPI via the `wasapi`/`windows` crates) lists the audio
  sessions of the chosen render endpoint, drops Pinniped's tree (main passes `process.pid`), starts
  one process-loopback capture (`AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK`, include mode, so
  Windows 10 2004+) per remaining process tree, rescans every 200 ms on a thread of its own (the
  scan takes tens of ms, and in the mixing loop it stalled the audio once per rescan), mixes them
  to 48 kHz stereo and emits exactly the time that has passed as 20 ms 16-bit PCM chunks, paced by
  a clock, as `audio` events (base64 in the JSON-lines protocol). Programs on the
  `callScreenShareAudioExcluded` list (Settings → Developer Tools; `Discord.exe` and
  `Pinniped.exe` by default) are never shared. The Helper Console switch there (`helperConsole`,
  or `PINNIPED_HELPER_CONSOLE=1`) starts the helper with `PINNIPED_HELPER_DEBUG=1`: its own console
  window with a debug log (scan results with process names, why a program was skipped, capture
  start and stop, a mixer summary every 2 s). `PINNIPED_HELPER_DEBUG=stderr` logs to the stderr it
  was started with instead.
  `helper.cjs` re-emits them, `screenshare-audio.cjs` → main → the `screenShareAudio.onPcm`
  preload bridge → `useScreenShareAudioBridge` → `call.vm.pushShareAudio` →
  `engine/livekit/shareAudio.ts` (an AudioWorklet player with an 80 ms lead and a 300 ms cap, a
  `MediaStreamAudioDestinationNode`) → published by `LocalMember` as the share audio track.
  Known limits: process loopback is per process, not per device, so a process tree that is
  playing on another active output device too is left out (and logged) rather than leaking that
  device or doubling the sound; a process that only reads a virtual cable is unaffected; Windows' own system sounds (session with process ID 0) are not shared: measured on
  Windows 11, include-mode process loopback of the caller, Audiosrv and audiodg captures none of
  them, and PID 0 is rejected;
  a process that starts playing is heard after at most one rescan. The helper is built for Linux
  and Windows (target-gated dependencies in `Cargo.toml`, `linux/` and `windows/` modules) and
  shipped through `extraResources` in `electron/electron-builder.yml`; there is none for macOS.
- The voice-call-layout change (pre-dating the move in-process) changed the layout behaviour that
  15 upstream tests pinned (the 35 failing cases in `CallViewModel`, `LayoutSwitch`, `InCallView`
  and `SpotlightTile`); those tests were removed rather than kept failing. Upstream `v0.20.1` still
  has them if you want to port one.

## Build and deployment

Pinniped ships as a container image to a Kubernetes cluster. The app is a static Vite SPA served by nginx (see `Dockerfile`: `node:24.22.2-alpine` builds, `nginx-unprivileged:1.31.7-alpine` serves). Build and deploy from `fork/dev`, after committing and pushing.

### Target

- Registry: `repo.k8s.mreow.de` (Harbor)
- Image: `repo.k8s.mreow.de/githubshit/cinny`
- Namespace: `githubshit`
- Deployment: `cinny` (manifest in `k8s.yaml`)
- Cluster: DUS, kubectl context `admin@alessandro-talos`
- URL: `https://cinny.k8s.mreow.de/`

Deploy only to DUS. The `cluster-gz6gk` context is the FRA cluster, which also runs a `cinny` deployment (served at `cinny.k8s-fra.mreow.de`); do not roll out there.

The deployment uses `imagePullPolicy: Always` with the `:latest` tag, so a rollout restart pulls whatever `:latest` currently points to in the registry.

### Tooling (this machine)

- `podman` (Linux) or OrbStack's `docker` (macOS, see below) for image builds and pushes
- `kubectl` (context `admin@alessandro-talos`, always pass it explicitly)

#### macOS (Apple Silicon): OrbStack

The cluster nodes are `amd64`; Apple Silicon Macs are `arm64`, so an unflagged build
pushes an image that will not run. Use [OrbStack](https://orbstack.dev) (`brew install --cask orbstack`)
and always pass `--platform linux/amd64`. Docker Desktop and podman machine work too but are slower.

- Select OrbStack explicitly with `docker --context orbstack ...` (Docker Desktop may be the default context).
- The amd64 build runs under emulation and needs memory.
  With the 8 GB default the daemon died mid-build (`error reading from server: EOF`);
  `orbctl config set memory_mib 12288 && orbctl stop && orbctl start` fixed it.
- Log in once with `docker --context orbstack login repo.k8s.mreow.de`
  (the `podman` auth file is not shared).
- `--format docker` is podman-only; omit it.

```bash
SHA=$(git rev-parse --short HEAD)
docker --context orbstack build --platform linux/amd64 \
  --build-arg APP_COMMIT=$SHA \
  -t repo.k8s.mreow.de/githubshit/cinny:latest \
  -t repo.k8s.mreow.de/githubshit/cinny:sha-$SHA \
  -f Dockerfile .
docker --context orbstack push repo.k8s.mreow.de/githubshit/cinny:sha-$SHA
docker --context orbstack push repo.k8s.mreow.de/githubshit/cinny:latest
```

Then roll out and verify as below. When verifying against the pushed image, add
`--platform linux/amd64` to `docker run`.

### Deploy steps

```bash
SHA=$(git rev-parse --short HEAD)

# 1. Build. Use --format docker; tag latest plus a sha tag for traceability.
#    APP_COMMIT is shown in the app version and the Matrix device name (.git is not in the image).
podman build --format docker \
  --build-arg APP_COMMIT=$SHA \
  -t repo.k8s.mreow.de/githubshit/cinny:latest \
  -t repo.k8s.mreow.de/githubshit/cinny:sha-$SHA \
  -f Dockerfile .

# 2. Push both tags. The saved login in ~/.config/containers/auth.json has
#    push rights to githubshit/cinny.
podman push repo.k8s.mreow.de/githubshit/cinny:sha-$SHA
podman push repo.k8s.mreow.de/githubshit/cinny:latest

# 3. Roll out on DUS so k8s pulls the new :latest.
kubectl --context admin@alessandro-talos -n githubshit rollout restart deployment/cinny
kubectl --context admin@alessandro-talos -n githubshit rollout status deployment/cinny --timeout=240s
```

### Verifying a deploy

Do not compare the local podman image digest to the cluster's `imageID`. They legitimately differ (local config digest vs registry manifest digest, and `--format docker` vs OCI). Verify by the **served bundle hash** instead:

```bash
# What the live site serves
curl -sS https://cinny.k8s.mreow.de/ | grep -oE 'assets/index-[^"]+\.js' | head -1

# What the pushed image serves (should match the live site)
podman run --rm repo.k8s.mreow.de/githubshit/cinny:latest cat /app/index.html \
  | grep -oE 'assets/index-[^"]+\.js' | head -1
```

A successful deploy: the live hash changed from the previous deploy, and live == pushed image. The build runs inside the container (no local `dist/` is produced), and a local `npm run build` yields a different hash than the container build (different Node version), so do not use a local build to verify the deployed bundle. Compare against the pushed image's `index.html`.

## Desktop builds

`.github/workflows/desktop.yml` builds the Electron app on Linux (AppImage, rpm, flatpak; in a privileged Fedora 45 container, so its build tools come from dnf rather than the runner's slow apt mirrors), Windows (NSIS exe) and macOS (dmg) from `electron/electron-builder.yml`, uploads the installers as workflow artifacts, and attaches them to a GitHub release on `v*` tags (the rpm is packaged with nfpm from electron-builder's unpacked build: `electron/linux/nfpm.yaml`). The app ID is `club.stablecat.pinniped`; the flatpak pins the 25.08 runtime and base app (electron-builder defaults to the EOL 20.08, which Flathub rejects). Flathub's AI policy forbids AI-written manifests and AI-opened submission PRs, so a human writes and submits those.

On Linux everything is named after the app ID: the desktop entry (`club.stablecat.pinniped.desktop`), the icon (`hicolor/512x512/apps/club.stablecat.pinniped.png`), its `Icon=` and `StartupWMClass=`, in the rpm (`electron/linux/`), the Nix package and the autostart entry `main.cjs` writes. `app.setDesktopName` makes it the window's Wayland app ID and X11 `WM_CLASS`, and Electron names the audio streams' icon after it (`application.icon_name`, which pavucontrol shows). The AppImage keeps electron-builder's naming (`pinniped`), which AppImage tooling expects.

### Windows auto-update

The Windows build is a per-user one-click NSIS installer (not MSI: `electron-updater` cannot
update MSI). The installed app (`electron/updater.cjs`, Windows and packaged only) checks the
GitHub release's `latest.yml` on launch and every 4 h, downloads the delta in the background and
installs on quit, or via "Restart to update" in the tray. To ship an update: bump `version` in
`package.json`, push, tag `v<version>`; the `release` job uploads the `.exe`, `.blockmap` and
`latest.yml`. The release must be published, not a draft or prerelease, and the repo public.
`electron-updater` is bundled into `electron/updater.bundle.cjs` by the `beforePack` hook
(`scripts/fork/electron/before-pack.cjs`) because the app ships no node_modules. Builds are
unsigned, so SmartScreen warns on the first install; updates themselves are silent.

## Nix flake

`flake.nix` and `package.nix` are fork-only. `package.nix` builds the Electron app from source in the nixpkgs idiom: `buildNpmPackage` builds the Vite bundle, then a wrapper launches nixpkgs' `electron` against it. No electron-builder, fpm, or asar is involved (the main process uses only node built-ins + electron, so no node_modules are shipped). `dist/` and `electron/` are installed as siblings under `$out/lib/cinny` because `electron/main.cjs` resolves `../dist`.

```bash
nix build .#cinny           # build, symlinked at ./result
nix run .#cinny             # build and launch
nix profile install .#cinny # install into the user profile
```

Caveats:

- Flakes only see git-tracked files. Freshly created `flake.nix`/`package.nix` must be committed (or `git add -N`'d) before `nix build` works in the repo.
- The package version is read from `package.json` at eval time, so it follows our own version bumps.
- When `package-lock.json` changes (dependency updates), refresh `npmDepsHash` by running:
  ```bash
  nix run .#update-npm-deps
  ```
  (fork-only script `scripts/update-npm-deps.sh`; prefetches and rewrites the hash in `package.nix` in place, no-op if already current)
- CI covers this automatically: `.github/workflows/npm-deps-hash.yml` (fork-only) runs on pushes to `fork/dev` that touch `package-lock.json` or the nix files, refreshes the hash if it is stale, verifies `nix build .#pinniped`, and opens a PR (`auto/npm-deps-hash`) that only needs merging. So normally: push the rebase, merge the PR if it appears, done.

## Fork-only files

- `AGENTS.md` itself is Pinniped-only. It does not exist upstream.
- `flake.nix` and `package.nix` are fork-only (see the Nix flake section). Upstream has none of them.
- The call core (`src/app/plugins/call/engine/`) and views (`src/app/features/call/stage/`) are fork-only (see the Calls section).
- Since we no longer rebase, new files do not need to avoid upstream paths, but keep scripts and configs clearly named.

## Frontend form sizing

- In account and settings form rows, explicitly use `size="400"` for text inputs paired with `size="400"` action buttons. Put each input in a growing column wrapper so it stretches to the available row width. Do not rely on defaults, and visually verify that newly added controls match adjacent fields and buttons.
