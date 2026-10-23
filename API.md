# Willow API version 1

The machine-readable OpenAPI 3.1 description is published at
`/api/willow/v1/openapi.json`. All other version 1 routes require an
employer-issued bearer key. Cookie sessions do not substitute for a key.
Use HTTPS and keep keys in the integrating tool's protected credential store.
The versioned transport is additive; the existing session API is unchanged.
Merge, Finch, Kombo and other partner tools can consume this description;
no partnership listing is implied.

## Reading employees

`GET /api/willow/v1/employees` returns `apiVersion`, `data`, `nextCursor`,
`syncCursor` and `resetRequired`. Each employee has an `id` and the selected
readable fields. `fields` is a comma-separated list of top-level native fields;
the default is `name,workEmail,status,current`. An unavailable requested field
is absent and named in `withheld`. A readable field with no recorded value may
be null. `GET /api/willow/v1/employees/{id}` uses the same selection and returns
one `data` record plus `withheld`. `asOf=YYYY-MM-DD` selects dated values while
current credential authority always governs access. Out-of-scope records
return 404. Keys cannot read individual EEO records or impersonate a person.

`employment` contains the permission-filtered native employment and job history.
`customFields`, `recordTables`, `leave` and `documents` select their native
projections. Requesting a field never grants access to it.

## Pagination and incremental sync

`limit` defaults to 50 and accepts 1 through 100. Follow `nextCursor`, keeping
all query parameters except `limit` unchanged. Records are ordered by ID.
Cursors are encrypted, bound to the issuing key and query, and expire after
24 hours. Treat them as opaque private sync state. They contain identifiers and
projection digests, never record values. A changed visible projection during
pagination returns 409 `cursor_stale`; restart from the previous completed
sync cursor. Cursors from another key or query, or modified cursors, are refused.

Only the final page returns a `syncCursor`. Send it as `changedSince` with
the same query to obtain current permitted records whose selected projection
has changed, once per traversal. An empty result still yields a new sync cursor.
New hires and effective transfers into scope are included. Unrelated reads and
changes to withheld values do not create increments. Repeating the same request
is safe and may repeat its result; consumers upsert by employee ID.

If a formerly visible record leaves scope or disappears, `resetRequired` is
true. Discard the local baseline and run a full sync without `changedSince`.
No newly forbidden identity or value is returned to explain a removal. A level
revision, rotation, revocation or loss of issuer authority invalidates the key,
and therefore its cursors. Restoring an archive never restores source keys.

## Other native reads

The following collections use the same list envelope and cursor semantics:

- `/api/willow/v1/organization`: directory-only organization nodes.
- `/api/willow/v1/custom-fields`: readable typed field definitions.
- `/api/willow/v1/tables`: readable native table definitions.
- `/api/willow/v1/balances`: permitted minute balances.
- `/api/willow/v1/requests`: permitted native time-off requests.
- `/api/willow/v1/calendar`: permitted absence dates and status.
- `/api/willow/v1/documents`: permitted document metadata and version metadata.

`/api/willow/v1/tables/{key}` returns the native permission-filtered table report.
`/api/willow/v1/access-level` returns only the key's bound level ID, name and
version. `/api/willow/v1/documents/{id}/download` downloads a readable published
document version through the native file door, with current category and scope
checks and a download audit. It does not expose pending document proposals.

## Approval requests

Keys are read-only by default. The owner can explicitly supply
`writeScopes: ["personal.approval"]` to the existing `apiKey.issue` JSON action.
This permits only `POST /api/willow/v1/changes` with `person`, `field` and `value`.
The bound level must give that exact personal field Edit with approval for that
person. The request runs the native field validation and immutable SELF-001
queue; it returns a pending ID without changing the employee record. HR uses
the existing queue and decision door. The decision rechecks the live key,
level, field mode, scope and native person revision. Revocation before approval
prevents execution. No key can approve its own request or acquire direct-edit
or administration authority from this scope. Rotation preserves explicit scopes.
Other write families remain unimplemented and API-002 remains partial.

Errors return a value-free `error` code and optional refusal detail. Standard
rate-limit headers and further OAuth credential types remain API-001 work.

## Permissioned webhooks

The owner may issue a key with `webhooks.manage`. That key registers
`POST /api/willow/v1/webhooks` with an HTTPS `endpoint`, posted `fields`,
`events` and optional `monitoredFields` (defaults to posted fields).
The response shows the signing `secret` once. Registration is inactive.
The owner opens Webhooks from API credentials, reviews the endpoint, fields
and events, and checks explicit consent before activating the subscription.
The equivalent session action is `webhook.approve` with the webhook ID and
`consent: true`. No outbound request occurs before this audited consent.
The conservative default is owner-only activation and replay; delegated and
global subscriptions remain unimplemented pending ct review.

Current events are `employee.created`, `employee.updated`,
`employee.terminated`, `employee.rehired`, `terms.recorded`, `terms.effective`,
`timeoff.approved` and `timeoff.canceled`. Native personal, typed-field and
table edits select monitored field families. Signature completion awaits a
native signing source. Future terms changes queue one recorded event and one
effective event in the employer's time zone. Other future source boundaries
and complete monitored-field coverage remain API-003 work.

Deliveries use the creating key's current level and scope, with its current
field-safe native record. Selected unavailable fields are named in `withheld`.
Bodies are reconstructed from current authority on every attempt; no historical
payload snapshot is retained. A retry can therefore carry newer permitted
values for the same event ID. Consumers upsert current values and deduplicate
by the signed event ID. Out-of-scope events send nothing. Key rotation,
revocation, expiry or authority loss stops the subscription. New activation
requires an active explicitly scoped key. Redirects are never followed.

The JSON body contains `id`, `type`, `data` and `withheld`. Request headers are
`webhook-id`, `webhook-timestamp` (Unix seconds) and `webhook-signature`
(`v1=` followed by lowercase HMAC-SHA256 hex). The exact signed UTF-8 string is
the event ID, a period, the timestamp, a period and the exact raw body.
The HMAC key is the UTF-8 signing-secret string. Verify before parsing or
performing effects. The receiver module at `/willow-webhook-verifier.mjs`
exports `verifyWillowWebhook`; supply its `secret`, `id`, `timestamp`,
`signature`, raw `body` and a durable `seen` set. Keep the receiver clock
synchronized, reject timestamps more than 300 seconds away in either direction
and persist consumed IDs across restarts. The verifier rejects repeated IDs,
modified bodies and stale timestamps, and marks an ID consumed only after
valid verification. Retain consumed IDs for the full lifetime of your effects.

A definite non-success response retries after one minute, then five minutes.
Three failed attempts pause the subscription. A network outcome whose
acceptance is unknown also pauses it for explicit review. Interrupted sending
claims become uncertain after five minutes rather than automatically sending
again. `GET /api/willow/v1/webhooks` and
`GET /api/willow/v1/webhooks/{id}/deliveries` expose status, response codes,
attempts and a pause alert, without the signing secret or payload values.
The owner can replay a failed or uncertain delivery from its delivery log,
or call `webhook.replay` with its delivery ID;
this preserves its event ID, rechecks current authority and resumes the queue.
The owner-only `webhook.run` action requests an ordinary scheduler tick.

The owner can stop delivery from Settings or call `webhook.disable` with
the webhook ID. Pending and failed deliveries are canceled. A request already
handed to the receiver may have completed; stopping does not retract outside
copies. Reactivation requires fresh explicit owner consent.

Signing secrets are encrypted with the installation runtime secret. Webhook
authority and queued delivery custody are excluded from installation archives.
Delivery rows belong to the employee erasure inventory. Attempted handoffs
are declared as possible outside copies, producing the existing owner-assigned
provider deletion work at erasure; a successful local deletion never claims
that an outside receiver erased its copy. Owner consent, stop and replay forms and delivery logs have native browser
proof at 1440 and 390. The native archive and erasure journeys prove excluded
signing authority, removed delivery custody and tracked outside copies.
Global subscriptions and complete future event sources remain unproved. API-003 remains partial.
