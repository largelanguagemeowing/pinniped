# Builds the Pinniped Electron app from source,
# nixpkgs-style. Same pattern as nixpkgs' pocket-casts / jitsi-meet-electron:
# buildNpmPackage for the web bundle + a wrapper around nixpkgs' electron.
{
  lib,
  buildNpmPackage,
  electron,
  makeDesktopItem,
  copyDesktopItems,
  makeWrapper,
}:

buildNpmPackage {
  pname = "pinniped";
  # follows our own package.json version
  version = (lib.importJSON ./package.json).version;

  src = lib.cleanSourceWith {
    src = ./.;
    filter =
      name: _type:
      !(builtins.elem (baseNameOf (toString name)) [
        "node_modules"
        "dist"
        "out" # electron/out
        "result"
      ]);
  };

  npmDepsHash = "sha256-QniKOBUd7fBHqPSk2LqjObfsQBZzWpeaNr53VAQhJKc=";

  # electron's postinstall would try to download a binary in the sandbox.
  env.ELECTRON_SKIP_BINARY_DOWNLOAD = "1";

  # No dependency needs its lifecycle scripts for the vite build; skipping
  # them also stops husky's `prepare` from failing (no .git in the sandbox).
  npmFlags = [ "--ignore-scripts" ];

  nativeBuildInputs = [
    copyDesktopItems
    makeWrapper
  ];

  # buildNpmPackage runs `npm run build` (vite build -> dist/) in buildPhase.

  installPhase = ''
    runHook preInstall

    # main.cjs resolves the web bundle as ../dist relative to electron/,
    # so keep the two as siblings. The main process only uses node
    # built-ins + electron, no node_modules are shipped.
    mkdir -p $out/lib/pinniped
    cp -r dist $out/lib/pinniped/dist
    cp -r electron $out/lib/pinniped/electron
    cp package.json $out/lib/pinniped/package.json

    install -Dm644 electron/build/icon.png \
      $out/share/icons/hicolor/512x512/apps/pinniped.png

    makeWrapper ${lib.getExe electron} $out/bin/pinniped \
      --add-flags "$out/lib/pinniped/electron/main.cjs" \
      --add-flags "\''${NIXOS_OZONE_WL:+\''${WAYLAND_DISPLAY:+--ozone-platform-hint=auto --enable-features=WaylandWindowDecorations --enable-wayland-ime=true}}" \
      --inherit-argv0

    runHook postInstall
  '';

  desktopItems = [
    (makeDesktopItem {
      name = "pinniped";
      desktopName = "Pinniped";
      genericName = "Matrix client";
      comment = "Yet another Matrix client";
      exec = "pinniped";
      icon = "pinniped";
      categories = [
        "Network"
        "InstantMessaging"
        "Chat"
      ];
      keywords = [
        "Matrix"
        "Chat"
        "Messenger"
      ];
      startupWMClass = "pinniped";
      terminal = false;
    })
  ];

  meta = {
    description = "Yet another Matrix client";
    homepage = "https://github.com/largelanguagemeowing/pinniped";
    downloadPage = "https://github.com/largelanguagemeowing/pinniped/releases";
    license = lib.licenses.agpl3Only;
    mainProgram = "pinniped";
    inherit (electron.meta) platforms;
  };
}
