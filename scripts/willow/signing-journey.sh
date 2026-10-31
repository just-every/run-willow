#!/bin/sh
set -eu
: "${WILLOW_PLAYWRIGHT_PATH:?Set a current Playwright module path}"
: "${WILLOW_EVIDENCE_DIR:?Set an external screenshot directory}"
mkdir -p "$WILLOW_EVIDENCE_DIR"
# Verify's signing-journeys job runs this; retention, webhooks and restore keep their own Verify jobs.
export WILLOW_SIGN_BROWSER=1
pnpm exec vite build
node tests/willow/company-home.mjs
node tests/willow/workflows.mjs
# Retained signing language also has a native iOS/Android and Spanish browser proof.
npm ci --prefix native --no-audit --no-fund
npm --prefix native run bundle:ios
npm --prefix native run bundle:android
WILLOW_LOCALE_BROWSER=1 node tests/willow/locale.mjs
