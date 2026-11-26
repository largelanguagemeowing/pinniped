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

## Dependencies

We own our dependency versions. Upgrade majors when it helps us, one concern per commit, and verify with `npm run typecheck`, `npm run test:unit` and `npm run build` before committing. There is no upstream lockfile to stay close to.

### Patched dependencies

`patches/` holds our fixes to dependencies. patch-package applies them on `npm install` and again in `npm run build` (the Nix build skips install scripts), and fails if one does not apply. Upgrading a patched package fails both until the patch is re-checked: if the new release fixes the bug, delete the patch; otherwise make the change in `node_modules` again, run `npx patch-package <package>` and delete the old patch file. Every patch has a regression test that fails without it.

- `matrix-js-sdk+45.0.0.patch`, two changes:
  - The sync startup retries the MSC4429 profile-field check (`/versions`) the way it retries push rules and the filter. Without it, a `/versions` error at startup stopped the sync until a reload (`tests/unit/syncStartupRecovery.test.ts`).
  - A presence event without `status_msg` clears the user's status message. Every presence event carries the whole state and servers leave an empty message out (Synapse does), so unpatched, a status someone cleared stayed on everyone else's screen until they reloaded (`tests/unit/useUserPresence.test.tsx`).
- `livekit-client+2.19.0.patch` (the ESM build the app bundles), two changes:
  - The audio contexts LiveKit makes without playing through them (the room's own when `webAudioMix` is off, silence checks, track analysers) get no output stream (`sinkId: { type: 'none' }`). Without it, every connection held an output stream that only ever played silence (`tests/unit/call-engine/livekit/processingAudio.test.ts`). Such a context is only good for measuring: Chromium renders it from a timer and skips steps when the timer is late, so on Windows machines whose timer runs at the default 64 ticks a second it renders 0.64 s of audio a second. Audio that is sent must not pass through one (a microphone processed there reached everyone cut up, at 32 packets a second instead of 50). LiveKit hands the room's context to track processors; ours (`MicProcessor`) ignores it and, like the soundboard and the desktop's shared-screen audio, makes a device-clocked context of its own with `sendingAudioContext`, closed when the feature stops.
  - In an encrypted call, a remote participant's media is always decrypted, and decryption is on before a subscribed track's first frame. Unpatched, the E2EE manager turned decryption off for every track of a participant whenever the media server said one of their tracks was unencrypted, and the worker then played that participant's frames as they arrived. That let the server inject media under their name with only a "Not encrypted" icon on the tile; now such frames fail to decrypt and are dropped ("Can't decrypt"). Our own participant's setting is untouched, since it also decides whether our tracks are published as encrypted (`tests/unit/call-engine/livekit/remoteDecryption.test.ts`).

- `vite-plugin-pwa+2.0.0.patch`: the service worker is built with Rolldown's `codeSplitting: false` instead of `inlineDynamicImports: true`, which Rolldown deprecated and which printed a warning on every build (`tests/unit/pwaServiceWorkerBuild.test.ts`). Delete it once the plugin stops using the old option.

## End-to-end tests

The Playwright suite (`tests/e2e/`, see its README) runs in CI (`.github/workflows/e2e.yml`) against a
throwaway homeserver on the runner: `tests/e2e/stack/stack.mjs` starts Synapse, LiveKit and
lk-jwt-service (as an application service, wired like
[matrix-installer](https://github.com/largelanguagemeowing/matrix-installer)) on the host network,
serves `dist/` with the production image's justserve settings (the `Containerfile`'s `server` stage), and registers four accounts. Locally:
`npm run build && npm run e2e:stack:up && npm run test:e2e:stack`. Tests drive the UI the way a person
would (rooms are created, invites sent and calls joined through Pinniped itself); the API is for
cleanup and for content the UI cannot produce. `call.spec.ts` signs two people in, meets them in a new
encrypted voice room and checks each hears the other (Chromium's fake microphone). Tests that need
rooms only the deployment has are tagged `@deployment` and skipped on the stack.

## Build and deployment

Pinniped ships as a container image to a Kubernetes cluster. The app is a static Vite SPA served by [justserve](https://github.com/belohnung/justserve) (see `Containerfile`: `node:24.22.2-alpine` builds, justserve serves). Build and deploy from `fork/dev`, after committing and pushing.

### Target

- Registry: `repo.k8s.mreow.de` (Harbor)
- Image: `repo.k8s.mreow.de/githubshit/cinny`, tagged `sha-<commit>`, deployed by digest
- Namespace: `githubshit`
- Deployment: `cinny` (manifest in `k8s.yaml`)
- Cluster: DUS, kubectl context `admin@alessandro-talos`
- URL: `https://cinny.k8s.mreow.de/`

`k8s.yaml` names the image by digest (`imagePullPolicy: IfNotPresent`), so every pod runs the same
build, a rescheduled one too, and the file records what is deployed: a deploy writes the new
digest into it, applies it and commits it. A manifest change ships the same way. To roll back,
apply an earlier digest, e.g. by reverting a deploy commit. `:latest` is no longer pushed; in the
registry it is still the last nginx build.

The two pods are replaced one at a time and keep serving for 5 s into termination, so a deploy
drops no requests. Their NetworkPolicy admits only Envoy Gateway (`envoy-gateway-system`) and
lets nothing out; anything else that needs to reach the Service has to be added there.

### Base images

Both base images in the `Containerfile` are pinned by their multi-arch index digest, so a rebuild
uses the same builder and server however the tags move; change a tag and its digest together.
For node, the digest of a tag is `skopeo inspect --raw docker://docker.io/library/node:<tag> | sha256sum`.
justserve's release notes list the digest of each release. Its releases are signed keyless by
justserve's release workflow; verify a new digest before pinning it:

```bash
cosign verify ghcr.io/belohnung/justserve@sha256:<digest> \
  --certificate-identity https://github.com/belohnung/justserve/.github/workflows/release.yml@refs/tags/<tag> \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

cosign is not installed here; `go install github.com/sigstore/cosign/v3/cmd/cosign@<version>`
builds it, with its modules checked against sum.golang.org.

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
IMAGE=repo.k8s.mreow.de/githubshit/cinny
docker --context orbstack build --platform linux/amd64 \
  --build-arg APP_COMMIT=$SHA -t "${IMAGE}:sha-${SHA}" -f Containerfile .
docker --context orbstack push "${IMAGE}:sha-${SHA}"
# $IMAGE@<the digest the registry stored>, recorded by the push
REF=$(docker --context orbstack inspect --format '{{index .RepoDigests 0}}' "${IMAGE}:sha-${SHA}")
```

Then continue with step 3 below (BSD `sed` needs `sed -i ''`) and verify. When verifying
against the pushed image, add `--platform linux/amd64` to `docker create`.

### Deploy steps

```bash
SHA=$(git rev-parse --short HEAD)
# Write it as ${IMAGE}:sha-…: zsh reads $IMAGE:s as a substitution modifier.
IMAGE=repo.k8s.mreow.de/githubshit/cinny

# 1. Build. Use --format docker; the tag names the commit the image is built from.
#    APP_COMMIT is shown in the app version and the Matrix device name (.git is not in the image).
podman build --format docker --build-arg APP_COMMIT=$SHA -t "${IMAGE}:sha-${SHA}" -f Containerfile .

# 2. Push, keeping the digest the registry stored. The saved login in
#    ~/.config/containers/auth.json has push rights to githubshit/cinny.
digestfile=$(mktemp)
podman push --digestfile "$digestfile" "${IMAGE}:sha-${SHA}"
REF=${IMAGE}@$(cat "$digestfile")

# 3. Pin it and apply it on DUS. The diff shows the new image and any manifest change.
sed -i -E "s|image: $IMAGE@sha256:[0-9a-f]{64}|image: $REF|" k8s.yaml
kubectl --context admin@alessandro-talos diff -f k8s.yaml
kubectl --context admin@alessandro-talos apply -f k8s.yaml
kubectl --context admin@alessandro-talos -n githubshit rollout status deployment/cinny --timeout=240s

# 4. Record what runs.
git commit -m "Deploy sha-$SHA" k8s.yaml && git push
```

### Verifying a deploy

Every pod's `imageID` is `$REF`:

```bash
kubectl --context admin@alessandro-talos -n githubshit get pods -l app=cinny \
  -o jsonpath='{range .items[*]}{.status.containerStatuses[0].imageID}{"\n"}{end}'
```

Compare it with the digest from the push, never with the local image ID: that is the image's config
digest, while the registry and the cluster name the manifest's.

The live site serves the image's bundle:

```bash
curl -sS https://cinny.k8s.mreow.de/ | grep -oE 'assets/index-[^"]+\.js' | head -1

# the image has no shell: copy the file out
ctr=$(podman create "$REF")
podman cp "$ctr:/srv/index.html" - | tar -xO | grep -oE 'assets/index-[^"]+\.js' | head -1
podman rm "$ctr"
```

A successful deploy: both pods run `$REF`, the live hash changed from the previous deploy, and live == pushed image. The build runs inside the container (no local `dist/` is produced), and a local `npm run build` yields a different hash than the container build (different Node version), so do not use a local build to verify the deployed bundle. Compare against the pushed image's `index.html`.

## Desktop builds

`.github/workflows/desktop.yml` builds the Electron app on Linux (AppImage, rpm, flatpak; in a privileged Fedora 45 container, so its build tools come from dnf rather than the runner's slow apt mirrors), Windows (Rust installer, see below) and macOS (dmg) from `electron/electron-builder.yml`, uploads the installers as workflow artifacts, and attaches them to a GitHub release on `v*` tags (the rpm is packaged with nfpm from electron-builder's unpacked build: `electron/linux/nfpm.yaml`). The app ID is `club.stablecat.pinniped`; the flatpak pins the 25.08 runtime and base app (electron-builder defaults to the EOL 20.08, which Flathub rejects). Flathub's AI policy forbids AI-written manifests and AI-opened submission PRs, so a human writes and submits those.

On Linux everything is named after the app ID: the desktop entry (`club.stablecat.pinniped.desktop`), the icon (`hicolor/512x512/apps/club.stablecat.pinniped.png`), its `Icon=` and `StartupWMClass=`, in the rpm (`electron/linux/`), the Nix package and the autostart entry `main.cjs` writes. `app.setDesktopName` makes it the window's Wayland app ID and X11 `WM_CLASS`, and Electron names the audio streams' icon after it (`application.icon_name`, which pavucontrol shows). The AppImage keeps electron-builder's naming (`pinniped`), which AppImage tooling expects.

### Keyboard shortcuts that end the session

The desktop app's menu (`electron/menu.cjs`, hidden but its accelerators work) has no Close item: Ctrl/Cmd+W would
close the window, which leaves the call first. File → Quit (Linux and Windows) has no key unless Settings → General →
"Quit with Ctrl+Q" is on, saved in `quit-shortcut.json` in userData (`electron/quit-shortcut.cjs`; the
`quit-shortcut:get/set` IPC rebuilds the menu at once, so no restart). macOS keeps Cmd+Q in its app menu.

### Windows installer and auto-update

The Windows build is a per-user, one-click installer written in Rust (`electron/installer`,
crate `pinniped-installer`), not electron-builder's NSIS target: that target's stub is linked
without a relocation table, so it crashes with `0xc0000374` (heap corruption) on any machine
that enforces Mandatory ASLR ("Force randomization for images", turned on by some Windows
hardening tools), and so does its uninstaller. The Rust installer is a normal relocatable
binary. Check `RELOCS_STRIPPED`/`DYNAMICBASE` in the PE header of anything new we ship.

`npm run electron:dist:win` (`scripts/fork/electron/build-windows-installer.mjs`) runs
electron-builder with `--win dir` (just `win-unpacked`), writes `resources/app-update.yml`
(electron-builder only does that for its NSIS target), builds the crate, appends the app to the
stub with `pinniped-pack` (pure-Rust LZMA2 in independent 64 MB chunks, so it packs and unpacks
on several threads; a self-extracting `[stub][payload][trailer]` file, see `src/payload.rs`;
`--preset 0-9`, default 9, about 139 MB for the 460 MB app) and writes `latest.yml` (SHA-512) next to
`Pinniped-Setup-<version>-x64.exe`. `cargo` must run inside `electron/installer`: its
`.cargo/config.toml` links the C runtime statically, and cargo reads that from the working
directory.

The installer speaks `electron-updater`'s NSIS command line, so the updater needed no changes:
`--updated`, `/S` (silent), `--force-run` (start the app afterwards), `/D=<dir>`. Without
arguments it shows a small progress window. It installs to `%LOCALAPPDATA%\Programs\Pinniped`
(or where the previous install is recorded), unpacks into `<dir>.install-new`, stops the
running app, swaps the folders (rolling back on failure), writes the uninstaller (`Uninstall
Pinniped.exe`, the same stub with no payload), the HKCU uninstall entry (same GUID as the NSIS
one, so an install over an NSIS one takes it over; the old NSIS uninstaller is never run) and
the Start Menu and desktop shortcuts with the AppUserModelID. It asks before closing a running app
on a hand-run install (an update closes it silently), blocks logoff/shutdown while it works, tells
Explorer to refresh, and starts the app through its Start Menu shortcut. On updates only shortcuts that
still exist are refreshed. It refuses to replace a folder that is not a Pinniped install. The
uninstaller copies itself to `%TEMP%`, removes everything there and then deletes itself;
`%LOCALAPPDATA%\pinniped-updater` goes too, user data in `%APPDATA%` stays. The setup log is
`%TEMP%\Pinniped-Setup.log`, the only record of why a silent update did not apply. There are no
delta updates (`disableDifferentialDownload`): the installer is downloaded whole.

The installed app (`electron/updater.cjs`, Windows and packaged only) checks the GitHub
release's `latest.yml` on launch and every 4 h, downloads in the background and installs on
quit, or via "Restart to update" in the tray. To ship an update: bump `version` in
`package.json`, push, tag `v<version>`; the `release` job uploads the `.exe` and `latest.yml`.
The release must be published, not a draft or prerelease, and the repo public.
`electron-updater` is bundled into `electron/updater.bundle.cjs` by the `beforePack` hook
(`scripts/fork/electron/before-pack.cjs`) because the app ships no node_modules. Builds are
unsigned, so SmartScreen warns on the first install; updates themselves are silent.

Test it for real (it touches the registry and `%LOCALAPPDATA%`): pack a `win-unpacked` with
`pinniped-pack`, run the result with `/S`, run it again with `--updated /S` while something from
the install folder is running, then `"Uninstall Pinniped.exe" /currentuser /S`. Do this with
Mandatory ASLR on (`Set-ProcessMitigation -System -Enable ForceRelocateImages`) at least once.

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
