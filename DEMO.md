# Willow demo

Run `rer setup --owner-email you@example.com`, then `rer demo` and open its
private `RER_OPEN` link. `rer demo --stop` deletes the disposable state under
`.rer/demo/`; the installation's `.wrangler/state` is retained. Each start is fresh.

The sample employer is Harbour & Field, with twelve invented people, two
locations, four departments, working schedules, completed onboarding history,
three upcoming starters, a team move, a departure, leave accounts and requests,
private welcome documents, a payroll draft and a proposal awaiting review.
Names reuse Willow's documented BambooHR fixtures. Dates follow the current day.
`src/demo.ts` writes native records through Willow's domain operations; no test
fixture runtime or simulated application implementation is used.

The CLI is the exact published `@runeditrun/rer` 0.2.20 package. The demo,
local identity and mail runtime are refreshed from Base tag `rer-v0.2.20`,
commit `38aa7efdb3cceec585d2344ed54dd559295b9059`, recorded byte for byte in
`base-copies.json`. The auth schema adds Base’s owner-sign-in table in forward migration 0019.
`withDemo` loads first in the Worker. Public internet reads and checks run for
real; external effects that reach people or third-party accounts return mocked
success under `RER_DEMO` only. Local and demo mail is silently suppressed.
The nav and title read Willow Demo or Willow Dev; there is no bar or outbox.
Optional model and OIDC providers remain unconfigured in the sample workspace.

The hosted demo uses Base's signed owner claim handler when its runtime supplies
trusted claim keys; it adds no independent authentication protocol. Each visitor
gets a private container, session, database and files. Base owns the 60 minute
lifetime and 15 minute idle policy. The signed owner claim
is the visitor's one-click sign-in; mail is suppressed silently.

`.github/workflows/run-demo.yml` reads the `run-demo` environment on manual
`workflow_dispatch`. `test_only` uses a separate `demo-test` Worker at
`demo.test.run-willow.com` and Cloudflare's published passing Turnstile keys.
Production uses the real widget keys at `demo.run-willow.com`. No repository
variable is needed. `remove_test` with `test_only` removes the test deployment
and reads back resource absence. All deployments use the RunEditRun account.
The front GET sets no cookie; visitor state begins only after the start POST.

The test-only workflow uses the same read/effect policy and sample data as
production, with passing Turnstile test keys. Its non-credential Google and model settings exercise real public discovery and mocked model sends; it adds no probe route or production binding.
