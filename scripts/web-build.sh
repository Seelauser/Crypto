#!/usr/bin/env bash
# Build the Next.js web app for standalone deployment.
#
# Wraps `pnpm --filter @orderflow/web build` and the two asset-copy steps
# that standalone output requires but Next.js does not perform:
#   - apps/web/public         → .next/standalone/apps/web/public
#   - apps/web/.next/static   → .next/standalone/apps/web/.next/static
#
# Without those copies the standalone server.js serves blank /_next/static
# requests and missing favicons. Captures the manual step flagged as a
# TODO in session 17 (see checkpoint_session17.md).
#
# Optional second arg: a systemd unit to restart once the build is staged.
#   ./scripts/web-build.sh             # build only
#   ./scripts/web-build.sh --restart   # build + restart orderflow-web

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo "[web-build] building @orderflow/web…"
pnpm --filter @orderflow/web build

WEB_DIR="apps/web"
STANDALONE_WEB="$WEB_DIR/.next/standalone/apps/web"

if [[ ! -d "$STANDALONE_WEB" ]]; then
  echo "[web-build] FATAL: $STANDALONE_WEB missing — confirm next.config.js has output:'standalone'"
  exit 1
fi

echo "[web-build] staging public/ → standalone"
rm -rf "$STANDALONE_WEB/public"
cp -r "$WEB_DIR/public" "$STANDALONE_WEB/public"

echo "[web-build] staging .next/static/ → standalone"
rm -rf "$STANDALONE_WEB/.next/static"
cp -r "$WEB_DIR/.next/static" "$STANDALONE_WEB/.next/static"

if [[ "${1:-}" == "--restart" ]]; then
  echo "[web-build] restarting orderflow-web.service…"
  systemctl restart orderflow-web.service
  sleep 2
  systemctl is-active orderflow-web.service
fi

echo "[web-build] done."
