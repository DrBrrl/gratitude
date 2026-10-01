#!/usr/bin/env bash
set -euo pipefail
: "${GRATITUDE_TEST_JAVA_BIN:?Run Firebase tests inside nix develop for the deterministic emulator clock}"
# The wrapper only changes the Java emulator processes, never the app or browser.
export PATH="$GRATITUDE_TEST_JAVA_BIN:$PATH"
exec firebase emulators:exec --project demo-gratitude --only auth,firestore,storage "$@"
