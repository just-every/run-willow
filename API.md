# Willow API version 1

The machine-readable OpenAPI 3.1 description is published at
`/api/willow/v1/openapi.json`. All other version 1 routes require an
employer-issued bearer key or OAuth access token. Cookie sessions do not substitute for a credential.
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
projections. Requesting a field never grants access to it. The published schemas describe typed custom-field definitions and validation rules, effective values and correction history, plus record-table columns, versions, current rows and removed-row history. Decimal values remain exact strings; boolean false and optional null values retain their native types. Table reports use the same typed values and current credential population.

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

Keys are read-only by default. An owner or eligible access administrator can explicitly supply
`writeScopes: ["personal.approval"]` to the existing `apiKey.issue` JSON action.
This permits only `POST /api/willow/v1/changes` with `person`, `field` and `value`.
The bound level must give that exact personal field Edit with approval for that
person. The request runs the native field validation and immutable SELF-001
queue; it returns a pending ID without changing the employee record. HR uses
the existing queue and decision door. The decision rechecks the live key,
level, field mode, scope and native person revision. Revocation before approval
prevents execution. No key can approve its own request or acquire direct-edit
or administration authority from this scope. Rotation preserves explicit scopes.
Job and compensation requests use the separate native employment-change transport below. Further module write families remain API-002 work.

Errors return a value-free `error` code and optional refusal detail.

### Native job and compensation requests

Issue a credential with `job.approval`, `compensation.approval`, or both.
`POST /api/willow/v1/employment-changes` accepts `person`, `effectiveFrom`,
`reason`, and the same native job or pay fields as `change.request`. Job fields
include title, department, location, manager, schedule, employment type and
status, FTE and employment dates. Pay uses `payBasis` and `payAmount`, or
`payIncreasePercent`. The published OpenAPI description lists the exact inputs.
A mixed request requires both scopes. Unknown inputs and fields outside the
level's current authority are refused; out-of-scope people return 404.

The response contains only a pending ID and status. HR reviews it in the native
employee-change queue and uses the existing FLOW-004 chain. An app remains a
non-person requester identified as `credential:<id>`; it never becomes the
issuer or employee and cannot approve or decide. Even a level's direct Edit
mode produces a human approval request. Native validation, dated terms,
source revisions and workflow steps remain unchanged. Final approval rechecks
the credential's current scope, modes, expiry, issuer and independent approval.
Revocation before approval refuses execution. Existing human requests and their
append-only event history survive the forward migration.


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

## Delegated key administration

An explicit employer-wide access administrator (`access.admin` and
`people.manage`) may issue a key through `apiKey.issue`. The bound level's
carried read facets, field modes and structural scope must fit the issuer's
current authority. Human self-service, decisions, individual EEO values and
access administration never transfer to a key. Wider requests are refused and
audited by actor and reason without credential material.

A delegated key carrying pay, private-contact or document reads
is shown once but remains inactive pending independent approval. The owner
or a distinct access administrator who holds every carried right approves
through `apiKey.approve` with `credential` and a nonempty `reason`. The native
API credentials page provides the same review. Issuers cannot approve their
own keys; rotation requires a fresh independent approval for sensitive keys.
Delegates rotate or revoke only their own keys; the owner can manage any key.
Authority or assignment changes and revisions of an issuer's assigned levels
permanently revoke issued keys, including when the prior rights return before
another API call. The entire credential row, including approval custody, stays
excluded from archives.

Every bearer response from the credential transport includes `RateLimit-Limit`,
`RateLimit-Remaining`, `RateLimit-Reset` and `RateLimit-Policy`. The limit is
120 calls per credential per fixed minute. Reset is seconds until the next
window; exhausted requests return 429 with `Retry-After`. Refused credential
doors count against the same limit and include the headers. Invalid or pending
credentials report zero remaining authority.

## OAuth client credentials

On API credentials, choose **OAuth client**, a name, level and expiry.
The JSON twin is `apiKey.issue` with `credentialType: "oauth_client"` and the
same name, level, expiry and optional `writeScopes` as a key. The returned `id`
is the client ID and `token` is the one-time client secret. Listings return only
metadata. Clients inherit the same delegated rights and scope ceiling and
independent sensitive-right approval. A pending client cannot obtain client-credentials tokens. Partner grants may issue inert tokens before approval; these return 401 on resource doors until independent approval, then the same token works.

Send `POST /api/willow/oauth/token` with HTTP Basic authentication using the
client ID and secret, and an `application/x-www-form-urlencoded` body containing
`grant_type=client_credentials`. A client secret cannot authenticate resource
requests. The response contains `access_token`, `token_type: "Bearer"`,
`expires_in` and `scope`. Use that access token as the bearer credential on the
same API doors. No employee is impersonated and no refresh token is issued.

Tokens last at most one hour and never beyond the client's expiry. The fixed
granted scope is `level.read` plus the write scopes selected at issuance. Omit
`scope` at exchange, or supply that exact space-separated set; narrower or wider
sets return `invalid_scope`. Each request still checks the current level's
fields, modes and population. The existing personal approval and webhook
scopes retain their native checks and consent obligations.

Token exchange and resource calls share the client's rate budget and standard
rate-limit headers. Audit events identify the client without storing either
secret or access token. Rotate, revoke and approve clients with the existing
credential actions. Rotation changes both the client ID and secret and ends all
old tokens at once; sensitive delegated rotation requires approval again.
Issuer authority loss or level change permanently ends the client and its
tokens. Client secrets and token hashes are excluded from native archives;
restoring an archive requires fresh client issuance. Approver access changes also permanently end approved credentials and all child tokens.

## Employer-installed partner authorization

Register an exact HTTPS `redirectUri` when issuing an OAuth client. It is immutable;
changing it requires fresh issuance. The client remains a non-person app. There is
no employee impersonation or employee self-service grant.

An owner or eligible access administrator explicitly installs the partner through
`POST /api/willow/oauth.authorize` with their ordinary session and same-origin
header. The JSON body names `client`, `redirectUri`, `codeChallenge`,
`codeChallengeMethod: "S256"`, `state` and an audited `reason`. The administrator
must currently hold all carried rights and scope. The response returns a private
`redirectUri` containing the code and unchanged state; Willow sends no outbound
request. The integrating tool validates state and handles the callback.

Exchange the code at the existing token endpoint with HTTP Basic client authentication,
`grant_type=authorization_code`, `code`, exact `redirect_uri` and `code_verifier`.
Only S256 proof keys are supported. Codes expire within five minutes and are consumed
atomically once. The response also supplies a refresh token. Exchange it with
`grant_type=refresh_token` and `refresh_token`; each successful refresh consumes
and replaces it. Refresh tokens expire within 30 days and never beyond client expiry.
A repeated, mismatched or expired code or refresh is refused. Scope is fixed to
`level.read` and the explicit issuance write scopes throughout every grant.

Delegated document reads require independent approval by an owner or eligible
access administrator who holds every carried right. Requesters never approve
their own credential. Approval audit receipts name requester, approver, reason,
read and write rights, document categories, structural scope and level revision.
The approver can withdraw approval with `apiKey.revoke`; no already issued token
continues to read. Any change to approver authority permanently ends the approval.
Changing the level, including widening scope or rights, ends existing credentials;
new issuance stays inactive until fresh approval. Secrets, codes and all token
custody are excluded from archives. A restore accepts none of the source authority.
Partners may instead open `/app/oauth/authorize` with `response_type=code`,
`client_id`, exact `redirect_uri`, `code_challenge`,
`code_challenge_method=S256`, `state`, and optional exact granted `scope`.
The signed-in employer access administrator reviews the app, level rights,
population, expiry and partner destination. A required reason accompanies
Install app or Deny access. No GET installs an app or issues a code. Approval
uses the same bounded and audited grant as the JSON action; denial returns
`error=access_denied` and unchanged state to the registered destination.
Malformed requests and unregistered destinations fail locally. The consent
page permits form navigation only to Willow and the registered partner origin;
it contains no third-party code and sends no referrer. Independent sensitive
approval still governs every resource request after installation.

Native time-off requests use `POST /api/willow/v1/requests` with the explicit
`leave.approval` issuance scope. Send `account`, `startDate`, `endDate`, and an
optional confidential `reason`. The level must allow requests about that
person; direct Edit becomes a pending human decision. The response contains
`apiVersion` and `data` with `id`, `minutes`, `status: pending`, and `approver`.
The native policy, schedule on each requested date, overlap checks and guarded
balance reservation apply. Only a human routed approver or eligible leave
administrator decides through Willow. Approval rechecks current credential
validity, level and population; revoked requests cannot execute. HR can decline
a pending request to release its reservation even after the credential ends.
Keys and both OAuth grants use the same route. Credentials cannot decide,
cancel approved leave or change balances directly. The served OpenAPI includes
request and success and refusal schemas for this route.
