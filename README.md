<img src="public/brand/mark.svg" alt="Willow's lantern mark" width="48">

# Willow

Willow keeps one employer's people register, employment history, leave ledger
and joiner, mover and leaver work, and hands accurate changes to the payroll
provider you already use. Optional connections add notices, OIDC sign-in and
checklist drafts.

Source: [just-every/run-willow](https://github.com/just-every/run-willow).
The site is at [run-willow.com](https://run-willow.com).
See [ACCEPTANCE.md](ACCEPTANCE.md) for validation boundaries and owner trials.

## Run it locally

One line installs the maintained command (the [RER installer](https://runeditrun.com)),
clones Willow and starts it:

```sh
npx -y @runeditrun/rer dev just-every/run-willow
```

Without Node, `curl -fsSL https://runeditrun.com/install.sh | sh -s -- dev just-every/run-willow` does the same. To start it again later, run `cd run-willow && rer dev`. To supply the real owner mailbox, run `npx -y @runeditrun/rer install just-every/run-willow`, then these from the checkout instead:

```sh
rer setup --owner-email you@example.com
rer dev
```

`rer dev` also bootstraps a fresh checkout without prompting, using a local
owner at `owner@<checkout-name>.test` and the manifest's local defaults. Run
`rer setup` first when you want to supply the real owner mailbox.

`setup` builds the app, applies every local migration, claims the first owner
and prepares one-click local sign-in with mail silently suppressed; it exits
with nothing running. Use the setup prompt instead of `--owner-email` to enter
the real owner mailbox, or pass a private mode-0600 answers file inside the
checkout: `rer setup --answers exports/answers.json --non-interactive`
with `{"OWNER_EMAIL":"you@example.com"}`. No external email is sent; nothing
needs a provider account.

After `RER_READY`, `dev` prints `RER_SIGNED_IN` and `RER_OPEN URL`. Open that
URL on this computer: Willow opens signed in as the owner, confirms first-run
at `/setup`, then asks for the employer. Treat the line as a credential. Try
the other roles with dev personas, each a real local member:

```sh
rer dev --as hr        # Alex Rivers: HR (people, private details, documents, leave, reports, audit)
rer dev --as payroll   # Casey Moore: pay and payroll handoff
rer dev --as it        # Riley Chen: IT lifecycle tasks
rer dev --as manager   # Jordan Lee: no permissions; a manager once HR links a person
rer dev --as employee  # Sam Patel: no permissions; an employee once HR links a person
```

A persona becomes someone's manager or an employee when HR records a person
with the persona's work email (`manager@dev.localhost`, `employee@dev.localhost`)
and presses **Give access** on that person. With `dev` already running, these
print a fresh `RER_OPEN` for that persona and exit. `dev --login` turns dev
identity off and opens the ordinary sign-in page instead. Stop `dev` with
`rer dev --stop` or Ctrl-C, and stop `preview` with
`rer preview --stop` before build or verification.

```sh
rer verify                                   # checks, build, typecheck, email-link and flow proofs
rer reset --yes                              # removes local data, owner and settings
rer export --output exports/installation.rer # every Willow table and stored document
rer import --input exports/installation.rer --yes  # into an empty checkout only
rer deploy --dry-run                         # validates and builds; no provider request
rer describe                                 # the commands and flags this checkout supports
```

Reset is destructive: export first if you want the data back. An export holds
private employee data: keep it owner-only and never inside `public/` (export
refuses that destination and a build refuses to ship an archive). Import needs an empty destination and explicit
confirmation; after it, run `setup` and sign in again (sessions and credentials
never travel in an archive). Active members request new email links through the
normal sign-in page; their member/person IDs and grants survive, and HR sign-in
authority follows the restored people.manage grant. Ended members stay denied.
An export restores with the Willow release that made it. Before upgrading, keep
a private export and retain that release for recovery. To move to a new release,
upgrade the existing installation in place with `rer install` and `rer setup`.
If recovery is needed, restore the export on its original release first, then
upgrade that installation in place. Existing inactive sign-in identities are never
reactivated by recovery. Real `deploy` needs your own Cloudflare account
and a verified mail sender. Pins: Node 22.20.0 and pnpm 10.12.4, selected
automatically. `RUN-LOCALLY.md` and `SEED-COMMAND-CONTRACT.md` hold the full
command and state contract.

## What a person can do

- **Owner:** sets up the employer, approves leave policy versions, sets every
  member's permissions and holds them all.
- **HR (people.manage and the HR bundle):** adds locations, departments,
  working schedules, document categories and versioned joiner/mover/leaver
  templates; starts joiners and rehires, schedules effective-dated changes,
  records leavers; gives and ends access; previews exactly what any member sees
  about any person; stores private documents; opens leave accounts and signs
  off opening balances; moves the workforce in from BambooHR; approves
  proposals prepared by the owner's agent; reads summaries and the audit trail.
- **Payroll (pay.read, payroll.handoff):** prepares a change batch per pay
  period, resolves exceptions, exports the CSV once and records the provider's
  acknowledgement.
- **IT (it.tasks):** completes account and device tasks with evidence.
- **Manager (no permission needed):** sees their team's work details and leave
  dates, decides routed leave requests without seeing confidential reasons,
  completes manager tasks and reads team summaries — never pay or private
  details.
- **Employee:** keeps their own private details, requests leave calculated from
  their working schedule, reads documents shared with them and acknowledges
  receipt (not a signature), and completes their own joiner tasks.

## Moving in

The first move-in kit reads a BambooHR employee report (CSV or Excel, by
BambooHR's documented field names), a time-off balance CSV and a documents ZIP.
The preview writes nothing; apply is bound to the reviewed preview; balances
arrive as proposals to sign off; undo removes an untouched import and refuses
once anything was built on it. See [IMPORTING.md](IMPORTING.md) and the
[cutover checklist](FIELD-AUTHORITY.md#cutover-checklist).

## Documents

[CONTRACT.md](CONTRACT.md) — clauses and proofs. [ACCEPTANCE.md](ACCEPTANCE.md) —
release scope, verification and owner trials. [AGENTS.md](AGENTS.md) — how
to change Willow, including its JSON API for agents. [FIELD-AUTHORITY.md](FIELD-AUTHORITY.md)
— which system owns each field, and the cutover checklist. [IMPORTING.md](IMPORTING.md)
— move-in file shapes. [OPERATIONS.md](OPERATIONS.md) — data custody and
deployment. Schema: `migrations/core/0006_willow.sql`. Licence: MIT
([LICENSE](LICENSE)); its fonts are under the SIL Open Font License
([public/fonts](public/fonts/README.md)).

Payroll drafts are bound to the payroll source values reviewed when drafted.
Changing those sources before export requires discarding the draft and reviewing
a fresh one; the comparison and handoff commit atomically. Drafts created by an
earlier release lack that source fence and must also be recreated.

## Run site and docs

An installed Willow answers `/` with the shared Lobby (Sign in, or Finish setup
before the owner's claim). The public homepage is the run site,
run-willow.com: `rer build --site` writes it to `dist/site` from
`src/site/pages.tsx` — the homepage (`src/site/landing`, tokens in
`public/site/theme.css`), the Run page and the
owner guides at `/docs`, rendered from `docs/*.md` in the order `docs/site.json`
lists them. `rer dev` serves it locally as `RER_SITE`. Edit a guide in `docs/`;
a broken docs link fails the build.

## Optional connections

The owner opens **Connections** to enable notices, link optional OIDC or
select a model. All three begin off. Tasks, decisions and mapped CSV handoff
remain useful without provider accounts. See [CONNECTIONS.md](CONNECTIONS.md) for
runtime bindings, activation, failure handling and proof commands.

Payroll now requires an explicit owner mapping on the Payroll page. Map each
generic field to its target heading and order, or enter ADP RUN Time Sheet
Import codes from the provider reports. Draft the batch, resolve exceptions,
preview the actual file, then export. Changed sources require a fresh batch;
changed mappings require another preview. Exported bytes remain fixed.
