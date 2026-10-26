# Willow connections and payroll handoff

Connections is an owner-only page at `/app/connections`.
Migration `0008_connections.sql` adds optional settings, delivery status,
checklist proposals, payroll mappings and frozen file previews. Base modules
remain byte copies. No provider account is needed for local work.

## Runtime configuration and activation

- Email: existing `MAIL_PROVIDER`, `MAIL_FROM`, `MAIL_API_KEY`, and
  `MAIL_ACCOUNT_ID` for Cloudflare. Local setup uses `development` and Base's
  gated outbox. The owner enables notices on Connections. Fixed notice copy
  includes only an authenticated app link. Missing, refused and failed
  transport is recorded separately; task/evidence/leave/payroll saves succeed.
  A misconfigured mail sender does not break authenticated session reads.
- OIDC: secret runtime binding `OIDC_PROVIDERS` is the Base provider array
  (id, preset, issuer/tenant where applicable, clientId, clientSecret or
  privateKey; optional trusted subjectEmails). `OIDC_TRANSACTION_SECRET` is
  at least 32 characters and independent of `SESSION_SECRET`. Set provider
  callback to `AUTH_ORIGIN/auth/oidc/ID/callback`. Follow the vendored
  `src/modules/operator-auth/identity/oidc/README.md` for presets. No value
  goes into a source file, answer archive or error. Use Connections to request
  a confirmation email then link/relink/unlink the chosen provider. Only
  owner-linked providers are offered; domain-required SSO is deliberately
  unavailable so email links remain usable. Changed issuer/client metadata
  requires an explicit relink. Malformed runtime configuration is visible
  on Connections and does not enter ordinary email authentication.
- Models: `MODELS_ENDPOINT` is an HTTPS URL ending exactly in
  `/v1/chat/completions`; `MODELS_KEY` is a secret runtime binding. Choose a
  model identifier on Connections. Requests use `Authorization: Bearer ...`
  and `x-models-feature: willow-checklist-draft`; no Origin header or browser
  key. Local tests may use loopback HTTP. Set the model blank to turn off.
  No retries, alternate providers or fabricated completion exist.

For hosted deployments, add only the optional connections you choose to
`deploy.json`: nonsecret `MODELS_ENDPOINT` in vars, and secret entries
`{ "binding": "MODELS_KEY", "environment": "MODELS_KEY" }` and/or
`OIDC_PROVIDERS` and `OIDC_TRANSACTION_SECRET` in secrets. Supply values through
the deployment environment. Do not put secrets in JSON vars or tracked files.
The unconfigured deployment does not require these credentials. Owner
archives serialize database records and document bytes, not runtime bindings;
Base excludes `oa_%` identity/session tables and the local mail outbox.
After restore, reconfigure runtime bindings and relink OIDC explicitly.

## Draft boundary

A holder of `people.manage` can select an active template revision on Proposals.
Only template ID, version, lifecycle kind and each task's position, controlled
assignee, due offset, evidence-required flag and local action are sent. Names,
titles, external system labels, user prompts, employee records and private
facets are excluded even for owners. A response must cite the supplied ID and
revision and cover every task once. Invalid/uncited/provider failure is stored
as a failed proposal with a fixed code. Accept/decline changes only that proposal.
A retired source refuses acceptance; request a new draft against its replacement.
Review the wording: model text is a draft, never proof that a task was completed.

## Payroll handoff

On Payroll, the owner maps all generic fields to target headings and ordering.
Each source must appear once. Generic files represent starts, ends, complete
terms changes, approved leave and post-handoff reversals. Missing payroll IDs
block preview until corrected and a fresh draft is made.

The named format is **ADP RUN Time Sheet Import, payroll-assigned identifier**.
Source: ADP's primary guide at
https://support.adp.com/adp_payroll/content/hybrid/@runcomplete/doc/pdf/GTS_payroll_guide.pdf,
read 2026-10-12, pages 4–7. Version row `##GENERIC## V1.0`, followed by eleven
headings and detail rows: IID, Pay Frequency, Pay Period Start Date, Pay Period
End Date, Employee ID, Earnings Code, Pay Hours, Dollars, Separate Check,
Worked In Dept, Rate Code. Dates are MM/DD/YYYY; hours have two decimals;
Dollars stays empty. Frequencies B/W/S/M/Q; rate codes follow the guide.

Supply company, frequency, rate/check/department and earnings code per leave
policy using the account's Earnings Codes and Department Numbers reports.
Employee IDs come from the employment period's payroll ID. Reconcile account
active status, pay frequency and configured Time Sheet Import before use.
Willow blocks non-leave lines, reversals, nonpositive hours, IDs too long,
unmapped policies, employees outside the period, and leave spanning the period.
It never silently drops a reconciled line or claims an unsupported line.
Use generic changes for those cases. This does not calculate pay or claim a
live ADP account has accepted the file.

Preview the exact file before export. Export checks the source snapshot and
layout revision in the same transaction as the existing one-time claims.
A source change needs a fresh draft; a layout change needs another preview.
The preview returns `previewRevision`; submit it with `batch` to
`payroll.export`. The HTML export form carries this automatically, so a
second operator cannot replace the file you reviewed before your export.
Download always serves frozen exported bytes. Older already-exported phase-one
batches retain their original generic serialization; old drafts need a preview.

## Public doors and verification

GET doors: `connections`, `payroll-layout`, `model-drafts`,
`model-drafts/:id`; owner page `/app/connections`. Model proposal views extend
`/app/proposals?draft=ID`. Writes: `connections.notices`,
`connections.identity`, `connections.model`, `model.draft`, `model.decide`,
`payroll.layout`, `payroll.preview`. All have HTML and JSON doors with session
and exact-Origin checks; read doors are registered in `doors.ts`.

Run after install/build:

```
node tests/willow/phase2.mjs
node tests/willow/flows.mjs
node tests/willow/regressions.mjs
WILLOW_PHASE2_BROWSER=1 node tests/willow/phase2.mjs
```

Provider fixtures only intercept network edges; the built Worker,
authentication, migrations, D1/R2 and access checks remain real. The payroll
flows map and preview files, resolve missing identifiers before export and
check transaction fences. These local checks do not establish real provider
delivery, identity-provider registration or payroll-account reconciliation.
See [ACCEPTANCE.md](ACCEPTANCE.md) for the owner trials before live use.


The maintained command is the exact published `@runeditrun/rer` 0.2.0 package.
Runtime, auth, mail, import kit and their dependencies are copied from Base
`4c83ea57efc3a5b462426c6abc88826b72375112`. `base-copies.json` records current
copies; `migrations/base-copies.json` records historical applied schema copies.
Both records are checked by `verify:app`. Applied 0001–0008 files are unchanged;
0009–0018 are forward migrations, including the import kit's new reversal
fences and retirement tables. The edition's retained origins describe its
original adaptation baseline; the copy records identify current verbatim bytes.

The installed homepage is Base's shared Lobby. `/setup/state` becomes claimed
only when the owner confirms `/setup`. The run site builds separately with
`rer build --site`. Browser proof images go outside the checkout through
`WILLOW_EVIDENCE_DIR` (temporary-directory
default); CI uploads them from its runner temporary directory.

Connections records the actual callback provider's pinned token exchange result,
including HTTP 200 OAuth error envelopes. Discovery cannot clear that result.
The observation stores no token or response body, is fenced to the linked
provider version and is excluded from installation archives. A subsequent
accepted token response clears the unavailable state; Base still validates the
identity token and decides whether to issue any session.

## Provider billing

Willow has no license-key, seat or paid-plan requirement. Connections names the configured email and identity providers and the model endpoint host before their activation controls. Any service fees are billed by those providers directly; Cloudflare bills Cloudflare hosting. Local development mail has no delivery charge. Endpoint paths, query strings and runtime keys are never included in the disclosure.


## Policy and workflow assistants

In Connections, the owner enables each assistant capability separately, chooses
OpenAI and a supported GPT-4.1 model, sets the maximum USD spend per run, and
selects included policies alone or policies plus permitted numeric leave inputs.
The default is disabled. HR includes approved policy versions in Settings;
ordinary reader permissions still limit each answer. Questions reduce to supported
topics locally. General handbook drafts are published under current HR source authority, with an explicit content attestation. HR separately includes an exact approved version; each numbered clause has an applicable date. Future clauses and withdrawn handbooks cannot answer current questions. Workflow requests use the sentence format shown in Proposals.
No raw request, employee name, pay, private record or task title crosses the model
edge. A request makes at most one call, bounded before sending by UTF-8 input size,
output-token limit and the supported model rate. There are no automatic retries.

Willow retains only call metadata, with minimized subject custody when numeric
leave inputs were sent. Prompts and policy answers are transient. Calls request
`store=false`; standard provider abuse-monitoring retention may last up to 30 days
and requires the owner's explicit consent. The provider also states legal and safety exceptions that can require longer retention; the owner reviews the actual account terms before attesting. Disabling the assistant invalidates
pending reviews. Restored installations need fresh consent. DATA-002 tracks
provider deletion requests for minimized leave inputs.

[OpenAI pricing](https://developers.openai.com/api/docs/pricing), [model documentation](https://developers.openai.com/api/docs/models/gpt-4.1-nano)
and [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data)
describe the provider settings and rates used here (checked 26 October 2026).


### Assistant capability checks — 26 October 2026

The supported provider is OpenAI. Its [standard API data controls](https://developers.openai.com/api/docs/guides/your-data) describe abuse-monitoring retention and its legal and safety exceptions. A successful model request proves access to that model, not account-specific retention, deletion or compliance. Applicable account terms and retention controls remain an owner evidence dependency before production-readiness claims.

Current vendor pages describe shipped capabilities that overlap these targets. [Ask BambooHR](https://www.bamboohr.com/product-updates/ask-bamboohr-ai-assistant) states that permission-filtered HRIS answers are available in Core and Pro, with selected company documents in Pro. [Rippling workflows](https://www.rippling.com/en-GB/platform/workflows) describes natural-language triggers, conditions, routing and actions, affected-person review before publication, and connected application data and actions. These are public vendor capability statements, not a trial of any employer account. Exact version invalidation, conflict behaviour, distinct privileged signoffs and country-specific account entitlements were not established by those pages. Willow's narrower supported implementation does not establish parity with every advertised capability.

AI-002 connected-system simulation still needs native typed provider adapters, capability and scope snapshots, reviewed account mappings, authorized external-state reads and an effect planner. No provider adapter or account state is invented when those inputs are absent. Exercising those integrations additionally needs an authorized employer tenant and its applicable provider credentials, scopes, mapping identifiers and any required partner approval. The existing identity connection supplies sign-in, not account provisioning.
