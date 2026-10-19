# Willow's installed homepage and run site

Willow has two homepage surfaces:

- The installed app serves the shared Lobby at `/`, with **Sign in** or
  **Finish setup** until the owner confirms `/setup`. `/setup/state` uses
  that same claim state.
- The separate run site serves Willow's marketing homepage, `/run` and owner
  guides. `rer build --site` writes it to `dist/site`; `rer dev` prints its
  local `RER_SITE` URL. Building a site does not deploy it.

## Preserve the product presentation

The homepage (`src/site/landing`, `src/site/shell`, `src/site/styles`) and its
artwork and tokens under `public/site` are the design desk's approved look (17 Oct
2026: hero K, mark 6) on the owner-approved page structure s1 (one illustrative company's year,
Sep 2026 to Aug 2027; every capability claim is in CONTRACT.md's Homepage claims). Preserve their layout, copy and palette when changing
hosting or command integration. The lantern mark is `public/brand/mark.svg` with
hand-tuned `favicon-16.svg` and `favicon-32.svg`. The primary action opens `/run`. The run site
has no links into an installed app's sign-in, setup or private routes.

`src/identity.ts` defines the product identity and shared Lobby assets.
`src/site/pages.tsx` builds the homepage, Run page and docs from `docs/site.json`
and `docs/*.md`. The shared runtime under `src/base` provides the Lobby and
run-site mechanism. Keep its copy record accurate when adopting Base changes.

The installed deployment's name is installation data. The static run site
must not read employee records or private runtime settings. Its pages work
without JavaScript, serve their assets locally and use ordinary links.

## Check changes

Check the installed Lobby before and after the owner's claim, and check the
run site's `/`, `/run` and docs at desktop and mobile widths. Preserve the
primary action's visibility and avoid horizontal overflow. `rer build --site`
checks links and assets; `pnpm run test:site` exercises Willow's site contract.
Keep screenshots outside source control.

`deploy-site.json` declares the run-site deployment. Deployment is a separate
owner action with its own account configuration; follow
[SEED-COMMAND-CONTRACT.md](SEED-COMMAND-CONTRACT.md). The repository's Run site
workflow deploys only when `RUN_SITE_DEPLOY` is enabled.
