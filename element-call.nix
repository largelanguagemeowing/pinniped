# Fork-only file: builds the Element Call widget vendored in element-call/ with pnpm,
# the same output as scripts/fork/element-call/build.mjs. package.nix embeds it via
# ELEMENT_CALL_FORK_DIST.
{
  lib,
  stdenv,
  nodejs,
  pnpm_10,
  fetchPnpmDeps,
  pnpmConfigHook,
  pnpmBuildHook,
}:

stdenv.mkDerivation (finalAttrs: {
  pname = "pinniped-element-call";
  version = (lib.importJSON ./element-call/package.json).version;

  src = lib.cleanSourceWith {
    src = ./element-call;
    filter = name: _type: !(builtins.elem (baseNameOf (toString name)) [
      "node_modules"
      "dist"
    ]);
  };

  nativeBuildInputs = [
    nodejs
    pnpm_10
    pnpmConfigHook
    pnpmBuildHook
  ];

  # package.json pins pnpm@10.33.0; without this pnpm tries to download that exact
  # version instead of using the one from nixpkgs, which cannot work offline.
  prePnpmInstall = "pnpm config set manage-package-manager-versions false";

  pnpmDeps = fetchPnpmDeps {
    inherit (finalAttrs) pname version src prePnpmInstall;
    pnpm = pnpm_10;
    fetcherVersion = 4;
    # The pnpm store holds platform-specific binaries (esbuild, rollup, ...), so the
    # hash is per system. CI refreshes x86_64-linux (scripts/update-pnpm-deps.sh).
    hash =
      {
        x86_64-linux = "sha256-6MMws0HC7sl2Yd4XwSu8IxXfZrUMcAHxH3yiynTQCbM=";
        aarch64-linux = lib.fakeHash;
      }
      .${stdenv.hostPlatform.system};
  };

  pnpmBuildScript = "build:embedded";
  # The widget build needs more heap than Node's default (was a prefix on build:full).
  NODE_OPTIONS = "--max-old-space-size=16384";

  installPhase = ''
    runHook preInstall

    mkdir -p $out
    cp -r dist/. $out/
    # The embedded vite build disables publicDir, so the self-hosted DeepFilterNet
    # runtime assets are copied explicitly (as build.mjs does).
    cp -r public/df3 $out/df3

    runHook postInstall
  '';
})
