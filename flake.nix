{
  description = "Gratitude development and browser testing";
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in {
      devShells = forAllSystems (system:
        let pkgs = import nixpkgs { inherit system; };
        in {
          default = pkgs.mkShell {
            packages = [ pkgs.nodejs_24 pkgs.chromium pkgs.python3 pkgs.gh pkgs.actionlint ];
            PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = "${pkgs.chromium}/bin/chromium";
            # No host/user font directories or configuration: baselines must be portable to CI.
            FONTCONFIG_FILE = pkgs.writeText "gratitude-e2e-fonts.conf" ''
              <?xml version="1.0"?>
              <!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
              <fontconfig>
                <dir>${pkgs.dejavu_fonts}/share/fonts/truetype</dir>
                <cachedir prefix="xdg">fontconfig</cachedir>
                <alias><family>sans-serif</family><prefer><family>DejaVu Sans</family></prefer></alias>
                <alias><family>system-ui</family><prefer><family>DejaVu Sans</family></prefer></alias>
                <alias><family>serif</family><prefer><family>DejaVu Serif</family></prefer></alias>
                <alias><family>monospace</family><prefer><family>DejaVu Sans Mono</family></prefer></alias>
              </fontconfig>
            '';
            PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
          };
        });
    };
}
