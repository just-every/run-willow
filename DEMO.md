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

The CLI is the exact published `@runeditrun/rer` 0.2.19 package. The unchanged
`src/modules/demo` runtime comes from Base tag `rer-v0.2.19`, commit
`e17843562355e1b6e5068289c8e037951fbc8d3d`, recorded in `base-copies.json`.
`withDemo` loads first in the Worker. On this release, external fetches and
sockets are refused by Base, and development mail is captured by Base's existing
mail adapter. No Willow-specific blocking or capture is added. The forthcoming
Base effect-policy release will remove its bar/outbox and allow real reads with
mocked successful effects; Willow will adopt that shared release when published.
Optional model and OIDC providers remain unconfigured in the sample workspace.

The hosted demo uses Base's signed owner claim handler when its runtime supplies
trusted claim keys; it adds no independent authentication protocol. Each visitor
gets a private container, session, database and files. Base owns the 60 minute
lifetime and 15 minute idle policy. Hosted magic-link mail is unavailable on this
release; the signed owner claim is the visitor's sign-in.

`.github/workflows/run-demo.yml` reads the `run-demo` environment on manual
`workflow_dispatch`. `test_only` uses a separate `demo-test` Worker at
`demo.test.run-willow.com` and Cloudflare's published passing Turnstile keys.
Production uses the real widget keys at `demo.run-willow.com`. No repository
variable is needed. `remove_test` with `test_only` removes the test deployment
and reads back resource absence. All deployments use the RunEditRun account.
The front GET sets no cookie; visitor state begins only after the start POST.
