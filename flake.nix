{
  description = "Gratitude development and browser testing";
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in {
      devShells = forAllSystems (system:
        let
          pkgs = import nixpkgs { inherit system; };
          testJava = pkgs.writeShellScriptBin "java" ''
            # Only emulator JVMs use the fixture date; monotonic timers keep running.
            export LD_PRELOAD="${pkgs.libfaketime}/lib/libfaketime.so.1"
            test -r "$LD_PRELOAD" || { echo "Missing emulator clock library" >&2; exit 1; }
            export FAKETIME="2026-10-01 04:31:07"
            export FAKETIME_DONT_FAKE_MONOTONIC=1
            export TZ=UTC
            exec ${pkgs.jdk21_headless}/bin/java "$@"
          '';
          shellFor = node: pkgs.mkShell {
            packages = [ node pkgs.jdk21_headless pkgs.chromium pkgs.python3 pkgs.gh pkgs.actionlint ];
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
            GRATITUDE_TEST_JAVA_BIN = "${testJava}/bin";
          };
        in {
          default = shellFor pkgs.nodejs_24;
        });
    };
}
