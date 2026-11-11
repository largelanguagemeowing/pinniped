# `nix build .#pinniped` / `nix run .#pinniped` builds and runs the Pinniped Electron app
# from source. The package itself lives in package.nix.
{
  description = "Pinniped, a Matrix client (Electron app built from source)";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { self, nixpkgs }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
      ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
      forAllPkgs = nixpkgs.lib.genAttrs systems (system: nixpkgs.legacyPackages.${system});
    in
    {
      apps = forAllSystems (system: {
        update-npm-deps = {
          type = "app";
          program = toString (forAllPkgs.${system}.writeShellScript "update-npm-deps" ''
            exec ${forAllPkgs.${system}.bash}/bin/bash ${./scripts/update-npm-deps.sh}
          '');
        };
      });

      packages = forAllSystems (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
        in
        {
          element-call = pkgs.callPackage ./element-call.nix { };
          pinniped = pkgs.callPackage ./package.nix { inherit (self.packages.${system}) element-call; };
          cinny = self.packages.${system}.pinniped; # alias for the old name
          default = self.packages.${system}.pinniped;
        }
      );
    };
}
