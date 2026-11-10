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

## Element Call fork

Calls run in an embedded Element Call widget (`element-call/`, vendored in the
tree). It is NOT built by cinny's own build: `scripts/fork/element-call/build.mjs`
runs `pnpm install && pnpm build:embedded` in `element-call/` and copies
`dist/` to `node_modules/.cache/cinny-element-call-fork`, which
`scripts/fork/element-call/prepare.mjs` (called from vite.config.js) embeds
under `public/element-call/`. The Dockerfile and `element-call.nix` build it
separately and point `ELEMENT_CALL_FORK_DIST` at the result.
`vite` and `vite build` rebuild it automatically when anything under `element-call/` is newer than the last build (the Dockerfile and nix set `ELEMENT_CALL_FORK_REBUILD=0`). There is no fallback: without a widget build, vite fails and says to run `npm run build:element-call`.

The vendored tree is upstream `v0.20.1` with the former patch series
(voice-call-layout, sound-overrides) applied plus fork changes made in place.
There are no patch files anymore; edit `element-call/` directly. Its `matrix-js-sdk` is the pinned npm release (41.6.0), not the upstream git `develop` checkout: a git dependency builds itself in an install script, which the offline Nix build cannot run. To upgrade:
refresh the tree from a new Element Call tag and re-do the fork changes (see
`git log -- element-call/` for what they are).

Fork changes on top of upstream + old patches:

- **Audio pipeline** (`src/livekit/denoise.ts` and its callers): the mic is
  always captured raw (browser noise suppression and AGC off; AEC stays with
  the browser), DeepFilterNet 3 denoising via `deepfilternet3-noise-filter` as
  an opt-in toggle (Cinny settings → Calls, off by default; Cinny seeds
  the widget via the `denoise`/`audioInput`/`audioOutput` URL params and updates
  them mid-call with the `io.cinny.call_settings` widget action; the mic and
  speaker pickers live there too, and the widget's settings modal is not reachable
  when embedded (all its entry points are hidden when `widget !== null`; its
  remaining tabs — effect volume, camera, background blur — are dead there),
  96 kbps Opus, DTX off, in-band FEC off and constant bitrate (`tuneOpus` in
  `src/livekit/bitrateHints.ts` rewrites the Opus fmtp in the answer; a page cannot set a
  minimum audio bitrate, so CBR keeps the encoder at its target). An opt-in automatic
  gain toggle (Cinny settings → Calls → Call Audio, `autoGain` URL param and
  `io.cinny.call_settings` field) re-constrains the live mic track with the browser's
  AGC (`autoGainSync` in `denoise.ts`), ahead of the denoiser and gate; off by default.
  The DF3 runtime wasm + model (~24 MB) are vendored
  under `element-call/public/df3/` and copied into the widget output by
  `scripts/fork/element-call/build.mjs` (the embedded vite build disables
  publicDir). A previous `denoise-voice-clarity` attempt bundled an AGC/EQ/
  compressor "clarity chain" that sounded fried; it was replaced by pure DF3.
- **Voice activity gate** (Cinny settings → Calls → Call Audio): only sends the mic
  while it hears speech (`src/livekit/voiceGate.ts`, a track processor in
  `denoise.ts`'s `applyProcessing`). It sits after DeepFilterNet, which keeps
  processing everything while the gate is closed so its noise model keeps adapting,
  and listens to the denoised signal. Automatic mode (`AdaptiveVoiceGate` in
  `voiceActivity.ts`) follows the noise floor; manual mode uses a 0-1 threshold on
  a -70..-20 dBFS scale, the same scale as the live meter in Cinny's settings
  (`useMicLevel`, `VoiceGateMeter`). Settings reach the widget through the
  `voiceGate`, `voiceGateAuto` and `voiceGateThreshold` URL params and
  `io.cinny.call_settings`. Fine tuning (stickiness/hysteresis, hold, fade in/out,
  lookahead, automatic margin, speaking indicator sensitivity and hold) is one
  `VoiceTuning` object, sent whole as the `voiceTuning` param/field; the ranges,
  defaults and descriptions live in `src/app/plugins/call/voiceTuning.ts` (the widget
  keeps a clamping copy of the defaults in `element-call/src/livekit/voiceTuning.ts`,
  so add a knob in both).
- **Speaking detection** also measures the audio itself (`voiceActivity.ts`), so the
  speaking ring and activity are not limited to the server's coarse speaker updates.
  It watches every audio track a participant sends (`broadcastTracks.ts`: microphone,
  soundboard, shared-screen audio), so the indicator shows whenever anything is
  broadcast. Every track this client sends (microphone with or without the voice gate,
  soundboard, shared-screen audio) is measured where any sound above digital silence
  counts; remote participants use the indicator sensitivity setting (their gate is
  invisible to us).
- **Call stats**: the widget (`src/livekit/callStats.ts`, reported from
  `InCallView`) samples each SFU connection's `RTCPeerConnection` stats once a
  second and sends the raw counters to Cinny as the `io.cinny.call_stats`
  widget action. `CallEmbed` keeps five minutes of history; clicking "Voice
  Connected" opens the ping popout and its Debug view
  (`src/app/features/call-status/stats/`).
- **Participant activity** (speaking, muted, sharing a screen): the widget derives
  it from its view models (`CallViewModel.participantActivity$`, built in
  `state/CallViewModel/participantActivity.ts`) and sends a snapshot of Matrix user
  IDs as the `io.cinny.call_activity` action whenever it changes; `CallEmbed`
  keeps the latest and `useCallParticipantActivity` reads it. It does not depend on
  which tiles are mounted. (It used to scrape `data-cinny-*` attributes off tiles,
  which only the grid tile set; those attributes remain only as styling hooks.)
- **Publish errors**: when the media server's JWT service lets us join without
  the `canPublish` grant (it only trusts certain homeservers), `LocalMember`
  raises `PublishNotAllowedError` on `publishError$`. The widget shows it as a
  toast and sends it to Cinny as `io.cinny.call_error`; `CallStatus` shows it
  under "Voice Connected". The widget defaults to `MatrixRTCMode.Compatibility`
  (multi-SFU), so each member publishes through their own homeserver's server.
- **Soundboard**: sounds live in Matrix data (`club.stablecat.pinniped.user_sounds`
  account data for the user, `club.stablecat.pinniped.room_sounds` state for a
  room or space, `club.stablecat.pinniped.sound_favorites` for favourites;
  `src/app/plugins/sound-pack/`). Cinny downloads a sound, hands the widget a
  same-origin `blob:` URL via the `io.cinny.soundboard` action, and the widget
  (`src/livekit/soundboard.ts`, owned by `Publisher`) decodes it and publishes it
  on an audio track of its own (source `unknown`, which `MatrixAudioRenderer`
  already plays) while also playing it locally. The mic track is untouched.
  Sounds go out at full level; the volume is each listener's own
  (`soundboardVolume`, sent to the widget with the other call settings): it
  scales the local copy and the remote `soundboard` tracks.
  The picker is `src/app/features/soundboard/`.
- Note: `element-call/` has its own pnpm/eslint/vitest setup. Its
  `.eslintrc.cjs` sets `root: true` so the outer repo's eslint does not
  cascade in. Run `pnpm lint:types`/`pnpm test:unit` inside `element-call/`.
  The voice-call-layout change (pre-dating the vendoring) changed the layout
  behaviour that 15 upstream tests pinned (the 35 failing cases in
  `CallViewModel`, `LayoutSwitch`, `InCallView` and `SpotlightTile`); those
  tests were removed rather than kept failing, so the suite is expected to be
  green. Upstream `v0.20.1` still has them if you want to port one.

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
- The amd64 build runs under emulation and the Element Call widget build needs memory.
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

`.github/workflows/desktop.yml` builds the Electron app on Linux (AppImage, rpm, flatpak), Windows (msi) and macOS (dmg) from `electron/electron-builder.yml`, uploads the installers as workflow artifacts, and attaches them to a GitHub release on `v*` tags. The app ID is `club.stablecat.pinniped`; the flatpak pins the 25.08 runtime and base app (electron-builder defaults to the EOL 20.08, which Flathub rejects). Flathub's AI policy forbids AI-written manifests and AI-opened submission PRs, so a human writes and submits those.

## Nix flake

`flake.nix`, `package.nix` and `element-call.nix` are fork-only. `element-call.nix` builds the vendored Element Call widget with pnpm (`fetchPnpmDeps`); `package.nix` builds the Electron app from source in the nixpkgs idiom, embedding that widget through `ELEMENT_CALL_FORK_DIST`: `buildNpmPackage` builds the Vite bundle, then a wrapper launches nixpkgs' `electron` against it. No electron-builder, fpm, or asar is involved (the main process uses only node built-ins + electron, so no node_modules are shipped). `dist/` and `electron/` are installed as siblings under `$out/lib/cinny` because `electron/main.cjs` resolves `../dist`.

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
- When `element-call/pnpm-lock.yaml` changes, the pnpm store hash in `element-call.nix` goes stale. It is per system (`x86_64-linux` is refreshed by CI with `scripts/update-pnpm-deps.sh <hash>`; `aarch64-linux` is still `lib.fakeHash` and needs a manual refresh on that architecture).
- CI covers this automatically: `.github/workflows/npm-deps-hash.yml` (fork-only) runs on pushes to `fork/dev` that touch `package-lock.json`, `element-call/pnpm-lock.yaml` or the nix files, refreshes whichever hash is stale (npm and pnpm), verifies `nix build .#pinniped`, and opens a PR (`auto/npm-deps-hash`) that only needs merging. So normally: push the rebase, merge the PR if it appears, done.

## Fork-only files

- `AGENTS.md` itself is Pinniped-only. It does not exist upstream.
- `flake.nix`, `package.nix` and `element-call.nix` are fork-only (see the Nix flake section). Upstream has none of them.
- `element-call/` is fork-only (see the Element Call fork section).
- Since we no longer rebase, new files do not need to avoid upstream paths, but keep scripts and configs clearly named.

## Frontend form sizing

- In account and settings form rows, explicitly use `size="400"` for text inputs paired with `size="400"` action buttons. Put each input in a growing column wrapper so it stretches to the available row width. Do not rely on defaults, and visually verify that newly added controls match adjacent fields and buttons.
