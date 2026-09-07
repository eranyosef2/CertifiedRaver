#!/usr/bin/env bash
# Updates this extension folder in place from GitHub — no git needed.
#
# Chrome's "Load unpacked" points at a folder path, so as long as we replace the
# folder's *contents* and leave the folder itself alone, Chrome keeps working.
# You still have to click the reload arrow afterwards; Chrome does not watch the
# filesystem for unpacked extensions.
#
# Everything is wrapped in a function so bash reads the whole file before running
# any of it — this script overwrites itself partway through.

main() {
  set -euo pipefail

  ZIP_URL="https://github.com/eranyosef2/CertifiedRaver/archive/refs/heads/main.zip"
  EXT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT

  if [ ! -f "$EXT_DIR/manifest.json" ]; then
    echo "No manifest.json in $EXT_DIR — is this script inside the extension folder?" >&2
    exit 1
  fi

  OLD_VERSION=$(grep -o '"version"[^,]*' "$EXT_DIR/manifest.json" | head -1 | grep -o '[0-9.]*')
  echo "Extension folder: $EXT_DIR"
  echo "Currently:        v${OLD_VERSION:-unknown}"
  echo "Downloading…"

  curl -fsSL "$ZIP_URL" -o "$TMP/main.zip"
  unzip -q "$TMP/main.zip" -d "$TMP"

  SRC="$TMP/CertifiedRaver-main"
  if [ ! -f "$SRC/manifest.json" ]; then
    echo "The download didn't contain a manifest.json — aborting rather than wiping your folder." >&2
    exit 1
  fi

  NEW_VERSION=$(grep -o '"version"[^,]*' "$SRC/manifest.json" | head -1 | grep -o '[0-9.]*')

  # Replace tracked content only. Anything else in the folder is left alone.
  for entry in manifest.json README.md src popup icons docs scripts; do
    [ -e "$SRC/$entry" ] || continue
    rm -rf "${EXT_DIR:?}/$entry"
    cp -R "$SRC/$entry" "$EXT_DIR/$entry"
  done
  chmod +x "$EXT_DIR/scripts/update.sh" 2>/dev/null || true

  echo "Updated:          v${NEW_VERSION:-unknown}"
  echo
  echo "Now, in Chrome:"
  echo "  1. chrome://extensions  ->  click the reload arrow on CertifiedRaver"
  echo "  2. hard-reload the Skinrave tab (Cmd/Ctrl + Shift + R)"
  echo
  echo "The console should then say: [CertifiedRaver] v${NEW_VERSION} loaded"
}

main "$@"
