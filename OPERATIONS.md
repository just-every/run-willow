# Willow operations

Run all first-party operations from the composed, runnable edition checkout
with the shared RER command path. To get a runnable checkout, run
`npx -y @runeditrun/rer install just-every/run-willow` (or start it directly with
`npx -y @runeditrun/rer dev just-every/run-willow`). The detailed flags and effects are in
`RUN-LOCALLY.md` and `SEED-COMMAND-CONTRACT.md`.

```sh
rer setup --owner-email you@example.com
rer dev
```

Use the setup prompt instead of the owner-email flag when entering the real
mailbox. Follow the newest ordinary sign-in message in the printed local
outbox; no external email is sent. Stop `dev` with
`rer dev --stop` or Ctrl-C, and stop `preview` with
`rer preview --stop` before build or verification.

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
development outbox is available only on loopback. Any process with access to
the machine can read that outbox and sign in as the owner. Private settings are
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
verified mail sender in `deploy.json`. Follow the deployment sections of
`SEED-COMMAND-CONTRACT.md`; account scope, resource ownership, migrations,
receipt and health checks are defined there. Willow uses the pinned
`@runeditrun/rer` package for these operations.
Local validation does not prove hosted acceptance, provider delivery or remote
health.
