#!/bin/sh
set -eu
: "${WILLOW_PLAYWRIGHT_PATH:?Set a current Playwright module path}"
: "${WILLOW_CHROMIUM:?Set a current headless Chromium path}"
: "${WILLOW_EVIDENCE_DIR:?Set an external screenshot directory}"
mkdir -p "$WILLOW_EVIDENCE_DIR"
export WILLOW_SIGN_BROWSER=1
pnpm exec vite build
node tests/willow/company-home.mjs
node tests/willow/workflows.mjs
WILLOW_SIGN_BROWSER=0 node tests/willow/retention.mjs
WILLOW_SIGN_BROWSER=0 node tests/willow/webhooks.mjs
WILLOW_SIGN_BROWSER=0 node tests/willow/restore-access.mjs
