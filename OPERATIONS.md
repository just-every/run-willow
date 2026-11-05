# Willow operations

Run all first-party operations from the composed, runnable edition checkout
with the shared RER command path. To get a runnable checkout, run
`curl -fsSL https://runeditrun.com/install.sh | sh -s -- install just-every/run-willow`
(or start it directly with
`curl -fsSL https://runeditrun.com/install.sh | sh -s -- dev just-every/run-willow`).
With Node 22 or later, `npx -y @runeditrun/rer install just-every/run-willow`
is an alternative. In each new terminal, run `export PATH="$HOME/.local/bin:$PATH"`
before bare `rer`, or use `$HOME/.local/bin/rer` directly. Enter `run-willow`
before running the commands below. The detailed flags and effects are in
`RUN-LOCALLY.md` and `SEED-COMMAND-CONTRACT.md`. Their captured-mail and legacy
`--login` instructions are stale; use the local sign-in steps below.

```sh
rer setup --owner-email you@example.com
rer dev
```

Use the setup prompt instead of the owner-email flag when entering the real
mailbox. Open the private `RER_OPEN` link printed by `dev` to sign in as the
owner; no external email is sent and captured mail has been retired. The
supplied local personas use `rer dev --as hr` (or `payroll`, `it`, `manager`,
`employee`).
For an invited or active local member, use `rer dev --as member@example.com`
with that member’s actual mailbox and open its private `RER_OPEN` link. Hosted
emailed sign-in links require configured outbound mail. Stop `dev` with
`rer dev --stop` or Ctrl-C, and stop `preview` with
`rer preview --stop` before build, verification or deployment dry runs.

```sh
rer verify
rer reset --yes
rer export --output exports/installation.rer
rer import --input exports/installation.rer --yes
rer deploy
rer describe
```

Use `rer describe` to inspect the checkout's actual
capabilities. `rer check --profile first-party` validates the
declared command contract; it does not run application journeys or contact a
provider.

## Local data and recovery

`rer setup` takes the explicit owner mailbox and applies real local migrations.
On a fresh checkout, `rer dev` can instead prepare a local test owner and the
manifest's local defaults without prompting.
Dev and preview use the same owner and canonical `.wrangler/state`; the local
dev key is private to this checkout. Anyone who can read its `RER_OPEN` link
can sign in locally. There is no local outbox or message-body viewer. Private settings are
kept in `.dev.vars` with mode 0600 and are not copied into build output.

Local export creates a private archive with an integrity receipt and explicit
exclusions. Willow's archive holds every `wl_*` table (employer, places,
schedules, members and permissions, people and their private details,
employment periods, terms and pay, leave policies, accounts, the leave ledger,
requests and confidential reasons, lifecycle templates and cases, documents and
acknowledgements, payroll batches, proposals and the audit trail), the import
kit's `ik_*` journal with retained originals, and every object in the `FILES`
bucket (document versions keyed by SHA-256). The archive therefore contains
private employee data: keep it owner-only and out of `public/`. Willow has no
background jobs. Owner/auth, outbox, bookkeeping, private settings and
transient runtime state are excluded. Import validates and restores atomically
into an empty destination; confirmed reset preserves export archives. Run setup
after restore to establish a fresh owner. Each first-party seed verifies local
export/import/export equivalence across its supported resources. Remote transfer
is available only when the adapter declares complete resource coverage.

Preserve ambiguous state and applied migration history. Never place a remote
credential, owner secret or local resource ID in source. A schema change needs
a forward migration and verified transition/recovery.

## Deployment

`rer deploy --dry-run` validates the real owner-account
deployment declaration and builds locally without provider requests. Real
deployment requires privately supplied `CLOUDFLARE_ACCOUNT_ID` and
`CLOUDFLARE_API_TOKEN`, the declared owner/session/setup secrets, and a real
verified mail sender. A dry run accepts the shipped reserved-domain sender
and reports missing mail and Cloudflare inputs for a real deployment, without
sending mail. The current native deploy command takes the public sender from
`vars.MAIL_FROM` in `deploy.json`; it cannot yet deploy a different sender from
only the environment or `--env-file`. Treat this as a CLI limitation, and never
commit deployment-specific sender addresses or credentials to the seed. Follow the deployment sections of
`SEED-COMMAND-CONTRACT.md`; account scope, resource ownership, migrations,
receipt and health checks are defined there. Willow uses the pinned
`@runeditrun/rer` package for these operations.
Local validation does not prove hosted acceptance, provider delivery or remote
health.

## Hosted delivery package

Run `pnpm run build`, then `pnpm delivery:spec` to regenerate the committed public deployment specification. `pnpm check:deployment-spec` refuses stale policy or build output. Package the real Worker with `node scripts/delivery/base/cli.mjs package --config packaging.json --output rer-package`; the artifact command in `packaging.json` emits the same delivery payload. These commands never deploy or publish a release.

Hosted sign-in and fixed notices use the selected RER relay, Resend, SendGrid or Cloudflare provider. Assisted setup asks for that provider, a verified sender and its private credential; RER relay also needs its HTTPS relay URL. Managed hosting supplies its relay values privately. Local development suppresses mail; Connections shows attempts, not notice bodies or delivered links. Inspect actual mail only through configured hosted delivery. Missing provider configuration leaves delivery unavailable and never selects another provider.
