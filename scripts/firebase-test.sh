#!/usr/bin/env bash
set -euo pipefail
: "${GRATITUDE_TEST_JAVA_BIN:?Run Firebase tests inside nix develop for the deterministic emulator clock}"
# Direct invocation must use the same locked tools as invocation through npm.
firebase_test_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
# The clock override only changes Java emulator processes, never the app or browser.
export PATH="$GRATITUDE_TEST_JAVA_BIN:$firebase_test_root/node_modules/.bin:$PATH"
exec firebase emulators:exec --project demo-gratitude --only auth,firestore,storage "$@"
