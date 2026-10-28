# Verification procedures

- `node scripts/edition-authoring/cli.mjs check` checks the tracked source lock.
  After intentional contract edits, regenerate it with the repository’s `lock`
  command and confirm only the two document entries changed.
- `rer verify` checks source integrity and copied Base modules, builds,
  typechecks and runs email-link, Willow flow, regression and optional-connection
  tests against the built Worker with real local D1/R2. Private-field checks
  crawl every current registered read door with different member grants.
- `WILLOW_TEST_CHECKOUT=1 pnpm run test:journey` runs in a disposable fresh
  clone that the test installs and sets up with an answers file, then personas, build, preview, export and fresh-clone restore,
  including ordinary sign-in after recovery at 1440 and 390 pixels.
- `pnpm run test:open-source` proves OPEN-001 through the exact public npx start in an empty, credential-free environment, then a 48-person employer tour. This installer journey runs on release tags/nightly; the current-tree billing proof runs in `tests/willow/open-billing.mjs` during Verify.
- `pnpm run test:phase2-browser` checks connections/payroll views;
  `pnpm run test:site` checks the separate run site. GitHub Verify runs these
  and the browser journey. Existing tests remain intact in this document round.
- Before publication, Base’s publication scan must pass on the exact committed
  tree. Document integrity and a green existing CI do not prove unimplemented
  target journeys below.

People and import files in tests are invented. Fakes replace only provider
network edges. Each new connector needs public-door tests for authorization,
identity/mapping, conflict, failure/uncertainty, replay, restart and read-back,
plus a consented real employer-account trial before production readiness.
Commercial app review, scopes, protected-data agreements and production partner
access are implementation tasks, not acceptance exemptions. Browser artifacts
use `WILLOW_EVIDENCE_DIR` outside the checkout. No hosted capacity, legal
compliance, inbox receipt or provider certification is inferred from local CI.
