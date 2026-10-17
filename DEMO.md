# Willow demo

Run `rer setup --owner-email you@example.com`, then `rer demo` and open its
private `RER_OPEN` link. `rer demo --stop` deletes the disposable state under
`.rer/demo/`; the installation's `.wrangler/state` is retained. Each start is fresh.

The sample employer is Harbor & Field, a US employer in Austin and Denver, with twelve invented people, two
locations, four departments, working schedules, completed onboarding history,
three upcoming starters, a team move, a departure, leave accounts and requests,
private welcome documents, an acknowledged payroll handoff, a configured and
previewed current payroll draft, and a proposal awaiting review.
Names reuse Willow's documented BambooHR fixtures. Dates follow the current day.
`src/demo.ts` writes native records through Willow's domain operations; no test
fixture runtime or simulated application implementation is used.

The CLI is the exact published `@runeditrun/rer` 0.2.36 package. All vendored Base runtime modules, including demo,
local identity, owner-claim, import kit and mail, are refreshed from Base tag `rer-v0.2.36`,
commit `d320c1436aaeb95d2485c1a0e69afa00ac8fb51a`, recorded byte for byte in
`base-copies.json`. The auth schema adds Base’s owner-sign-in table in forward migration 0019.
`withDemo` loads first in the Worker. Public internet reads and checks run for
real; external effects that reach people or third-party accounts return mocked
success under `RER_DEMO` only. Local and demo mail is silently suppressed.
The nav and title read Willow Demo or Willow Dev; there is no bar or outbox.
Optional model and OIDC providers remain unconfigured in the sample workspace.

The hosted demo uses Base's signed owner claim handler when its runtime supplies
trusted claim keys; it adds no independent authentication protocol. Each visitor
gets their own native Worker Loader isolate with its own session, SQLite database
and files (Willow's `FILES` objects live in the visitor's own Durable Object
storage). Base owns the 60 minute lifetime and 15 minute idle policy; signing out
also ends the copy, and its storage is erased. The signed owner claim
is the visitor's one-click sign-in; mail is suppressed silently.

`.github/workflows/run-demo.yml` is Base's `export/run-demo.yml`, recorded in
`base-copies.json`. It reads the `run-demo` environment (the
`CLOUDFLARE_ACCOUNT_ID` variable and the deploy secrets) on manual
`workflow_dispatch`. `test_only` uses a separate `demo-test` Worker at
`demo.test.run-willow.com` and Cloudflare's published passing Turnstile keys;
test starts need the private measurement token. Production uses the real widget
keys at `demo.run-willow.com`. `remove` removes the chosen demo and reads back
resource absence. All deployments use the RunEditRun account.
The demo owner is Rowan Hale (`rowan.hale@harbour-field.example`).
The front GET sets no cookie; visitor state begins only after the start POST.
The test host uses the same read/effect policy and sample data as production.
