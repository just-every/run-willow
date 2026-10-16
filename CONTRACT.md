# Willow target product contract

Target approved 16 October 2026. Willow is a connected SMB HRIS: a BambooHR
replacement that holds the employer’s authoritative people records and runs
onboarding, employee changes, time off and offboarding through to completion
across payroll, benefits, e-signature and identity systems. The first buyer is
a US people/operations lead at a 20–200-person employer retaining its payroll
provider; amounts and compensation planning are USD-first.

The competitive scope is core HR as sold by BambooHR, Rippling, HiBob and
Gusto (HR side), with Factorial and Deel HR as additional switching sources.
It includes hiring, employee/manager self-service, access levels, an open API
and webhooks, native e-signature, EEO reporting, performance/goals and
engagement, not just a private register and reviewed payroll files. This is the product
we are building towards. The status table describes current implementation;
`missing` is work to deliver, not an exclusion. Existing release manifests and
screens describe the delivered edition and are not expanded by this document.
No homepage, UI, behavior or provider configuration changes in this round.

Every clause states a buyer-visible outcome and acceptance through a public
door: authenticated pages/forms, `/api/willow/*`, checked downloads, provider
callbacks, mobile apps or the supported `rer` commands. Future journeys below
are requirements, not claims of existing routes or tests. Provider-edge tests
may fake network services; production readiness additionally needs authorized
account trials and required provider app/commercial/data agreements. An API
response or assignee checkbox is never proof that an external system agrees.

WIL-01–WIL-21 retain their stable IDs and existing guarantees. New clauses use
three-digit area IDs. [ACCEPTANCE.md](ACCEPTANCE.md) carries the same clause
journeys and statuses. Status starts from the 63-row inventory/code audit at
`aa18aa05eee369ab3c51e8ec159cb9b532342470`, which is the current main revision
inspected for this target. Those inventory-row counts differ from clause
counts because one target clause may cover several rows. `done` requires
implementation and an existing public-door test for the full clause;
`partial` names the narrower foundation and the outstanding work; `missing`
has no working target flow. No new runtime capability is claimed here.
Buyer review round 1 (17 October 2026) added HIRING-002–004, SIGN-002,
ROLE-001–003, API-001–003, EEO-001–002, OPS-002, MIGRATE-002, PEOPLE-003,
SELF-002 and BENEFITS-003 and sharpened HIRING-001, SIGN-001, WIL-01,
REPORT-001, US-002, BENEFITS-001, MIGRATE-001, OPS-001 and BOUNDARY-001; their
statuses are judged against the same inspected tree.

Private employee reads use `src/willow/profile.ts` and facets in
`src/willow/access.ts`; `src/willow/doors.ts` enumerates current read doors.
Every future module must preserve those boundaries. Model calls under WIL-20
remain structural-only; sensitive-data agents below require separately
scoped, opted-in capabilities and retain the caller’s exact permissions.

## Retained foundation

### WIL-01 — Employer setup and explicit membership.

The owner sets up one employer (name, IANA time zone, country, currency) before anything else, then locations, departments, immutable working schedules and private document categories. Members are people given sign-in access through their work email; every permission is explicit and set only by the owner (managing someone grants none). Ending access ends every session; giving it again needs a fresh sign-in and restores no permission. Owner-set direct grants are this clause's current guarantee; ROLE-001–003 add named access levels, group scoping, default self-service and delegated access administration, and must keep these guarantees (explicit grants, no rank inference, ended access restoring nothing).

**Acceptance evidence:** From setup, configure an employer, invite a member, grant access, end it and sign in again; former sessions fail and a new sign-in restores no removed grant.

### WIL-02 — Visibility preview without privilege escalation.

A member with people.manage previews exactly what another member would receive about a person, by facet, computed by the same projection as that member's own requests; ended sign-ins and records the selected member cannot enter are refused before projection; values the previewer cannot read are reported as withheld, never shown.

**Acceptance evidence:** As HR, preview an employee as a manager, employee and ended member; compare the actual member response and prove values withheld from the previewer never appear.

### WIL-03 — Private records through every public door.

A member without the grant cannot read private contact details, compensation, confidential absence reasons, end-of-employment reasons or documents in a restricted category through any door: every JSON view, page, document download, payroll CSV, summary and its CSV, visibility preview and agent context. Managers see their reports' work details and leave dates only. Each holder does read what they are entitled to, and reads of someone else's private details, pay, reasons and documents are audited.

**Acceptance evidence:** As owner, HR, payroll, manager and employee, crawl every registered API/page/download, CSV, preview and agent-context door with planted private values; only entitled readers receive each facet and privileged reads are audited.

### WIL-04 — People and separate employment periods.

A person is separate from their employment periods. A joiner creates the person, an employment period with its type and payroll-provider identifier, and the first effective-dated terms (title, department, location, manager, schedule, pay). Work email and employee number are unique; a person's periods never overlap.

**Acceptance evidence:** Create a joiner through the form or JSON action, inspect their person and first period, then attempt duplicate identifiers and overlapping periods; refuse invalid writes without partial records.

### WIL-05 — Versioned joiner, mover and leaver cases.

Joiner, mover and leaver cases start from versioned templates: each task goes to HR, the manager in force on the case date, IT, payroll or the employee, due relative to that date. A new template version leaves open cases on their version. Only the task's assignee completes it; account and device tasks need evidence. A case cannot complete while a task is open or required information is missing.

**Acceptance evidence:** Start a case, publish a new template, complete tasks as the right and wrong assignees, and attempt closure with missing evidence; the original template version and incomplete gate remain.

### WIL-06 — Private immutable documents and receipt acknowledgements.

Private documents carry a category that decides whether the person and their manager may read them; holders of documents.private read all. Versions are immutable and numbered; bytes are checksummed and verified on every read; downloads are audited. A person acknowledges receipt of the latest version only, recorded as a receipt and labelled as not a signature.

**Acceptance evidence:** Upload two private document versions, download as permitted and forbidden members, verify checksums and audit, and acknowledge the latest version; an older receipt cannot stand in for the latest or a signature.

### WIL-07 — Effective-dated terms and compensation.

A change of terms is a new complete version effective from a date: past, current and future versions all remain, the version in force is chosen by date, and a future or past version can be cancelled (kept as cancelled) but never edited. The active employment period wins on the as-of date (inclusive boundaries), otherwise the first upcoming period, otherwise former; directory, profile, manager scope and reports use that same selection. Setting pay needs pay.read.

**Acceptance evidence:** Schedule past and future changes, read profiles/directory/reports as of each boundary, cancel a version and inspect history; immutable terms and consistent manager scope survive.

### WIL-08 — Approved leave policies and opening balances.

Leave policy versions are written by leave managers and approved by the owner before use. A leave account opens against an approved version with a proposed opening balance at a stated cutover date; nothing can be requested until a leave manager signs it off, which writes the account's opening ledger entry. Accrual is posted deterministically (accrual weeks × scheduled weekly hours, pro rata per day) and only once per day range.

**Acceptance evidence:** Approve a policy, open an account, refuse requests before balance sign-off, then accrue twice for the same interval; the opening entry and accrual post once.

### WIL-09 — Schedule-based requests and routed approval.

A leave request is calculated in hours from the working schedule in force on each day, shows the balance after it and who else in the team is away (names, dates and status only), and routes to the person's manager in force on the first day (or to leave managers). The stored routed approver can read and decide that request even before their management terms start, without gaining general person or account access. The manager decides without seeing the confidential reason; nobody decides their own request.

**Acceptance evidence:** Request leave over a schedule/manager change, inspect team coverage and the quote, then decide as the routed approver; self-approval and confidential-reason disclosure are refused.

### WIL-10 — Atomic append-only leave ledger.

The leave ledger is append-only. A request reserves its hours in the same atomic step that checks the balance, so concurrent requests cannot spend the same hours; concurrent decisions produce exactly one. Cancelling approved leave writes one reversal of its use; correcting it reverses the old use and uses the corrected dates in one step, against the balance.

**Acceptance evidence:** Submit competing requests and decisions, cancel approved leave and correct dates; one spend/decision and exactly one reversal remain in the public ledger.

### WIL-11 — Reviewed payroll change batches.

A payroll change batch for a pay period gathers every start, end, terms change (with pay) and approved leave (in hours) effective by the period end and not yet handed off, keyed by the provider identifier; changes without one are listed as exceptions. All lines, exceptions and silent claims are calculated solely from one atomic source snapshot, revalidated in the draft transaction. Export atomically revalidates the reviewed source values and claims (including silent cancellation pairs), refusing stale drafts and older drafts without this calculation guarantee before any handoff; an unchanged draft hands each change off exactly once. A fresh draft nets pre-handoff cancellations to nothing; leave cancelled after handoff becomes a reversal line in the next batch; the provider's acknowledgement is recorded. Needs payroll.handoff and pay.read. Payroll calculation, tax and payment stay with the provider.

**Acceptance evidence:** Preview and export a batch; change source data before export and prove refusal, race competing exports, cancel before and after handoff, then record acknowledgement; claims and frozen lines stay consistent.

### WIL-12 — Evidence-gated departure and native access termination.

A leaver records the period's end date and a private reason and opens a leaver case. External account and device tasks stay open until their assignee records evidence; while any is open the departure cannot be marked complete. The case's "end access" task deactivates the person's sign-in and clears their permissions.

**Acceptance evidence:** End a period, inspect the leaver case, try closure before IT evidence, and finish the end-access task; sign-in and permissions end while incomplete external work stays visible.

### WIL-13 — Rehire without restored authority.

A rehire is a new employment period for the same person; earlier periods, terms and history are unchanged, and ended access is not reactivated or its permissions restored.

**Acceptance evidence:** Rehire a former person into a new period, inspect prior history and sign-in; the person is reused and prior grants remain ended.

### WIL-14 — Scoped workforce summaries.

Summaries (headcount by department and location, starters and leavers, leave taken, open lifecycle work) state their filters and calculation; reports.read covers the organisation, a manager without it sees their team, others are refused. Compensation totals appear only for members holding pay.read too; the CSV matches the page.

**Acceptance evidence:** Open summaries and their CSV as HR, manager and employee, with and without pay.read; counts, filters, as-of rules and withheld compensation match.

### WIL-15 — Human-approved agent proposals and restricted context.

Agent doors without a model account: a joiner or mover is proposed through the JSON door, validated by the code that executes it, with missing information, the record versions it was prepared against and an explicit diff. HR approves the exact plan; execution and its receipt (with the plan's SHA-256) commit in one step, and a plan whose records changed is refused. Agent context for a person contains only what the signed-in member may read, names the withheld facets and cites the leave policy versions.

**Acceptance evidence:** Propose a joiner/mover via JSON, inspect exact diff and missing fields, approve it as HR, and repeat after changing the source; execution has one bound receipt and stale approval is refused.

### WIL-16 — Reviewed BambooHR move-in with guarded undo.

BambooHR move-in kit: an employee report (documented field names, CSV or XLSX), a time-off balance CSV and a documents ZIP with a manifest. The preview writes nothing and reports active, upcoming and former employment, repeated ids, missing hire dates, conflicts with existing Willow people, inactive rows without dates, balances in days, unmapped time-off types, explicit unknowns and gaps. Apply is bound to the reviewed fingerprint through Base's import kit with a journal and retained originals; documents keep their private category; balances arrive unsigned. Re-importing the same export adds nothing; undo removes an untouched import completely and is refused, naming the records, once anything was edited or built on.

**Acceptance evidence:** Preview CSV/XLSX people, balance CSV and document ZIP, resolve conflicts, apply, repeat and undo; originals and categories survive, balances require sign-off, and edited imports cannot be undone.

### WIL-17 — Complete current-edition archive and restored sign-in.

`rer export` writes every Willow table and stored document to an owner-only archive without sessions or credentials; import restores it into an empty fresh clone, refusing corrupt or non-empty targets; a second export is identical; after normal setup, active members (including an invited member whose Willow access is active) recover ordinary email-link sign-in with the same member/person IDs and grants, HR admin authority is reconstructed from people.manage, and ended members remain denied. Source sessions and outstanding tokens fail at the destination. Records, permissions, the leave ledger and document bytes read back after those new sign-ins.

**Acceptance evidence:** Export a populated installation, refuse corrupt/nonempty restores, import into an empty fresh clone and export again; compare all portable rows and document bytes, then use new ordinary email links for active and ended members and refuse source sessions/tokens.

### WIL-18 — Optional safe business-event email.

Email notices are off until the owner enables them. Task assignment/completion, leave decisions and exception-free payroll readiness use Base mail or the local outbox. Only currently active, authorized recipients receive fixed copy and authenticated links; no names, pay, private documents, confidential absence, titles, systems or evidence enter notices. Failed, missing and refused mail are visible independently of the committed business action. External work still requires evidence.

**Acceptance evidence:** Enable notices, assign/complete a task, decide leave and prepare payroll; inspect permitted recipients and fixed-copy links, revoke a recipient before dispatch and inject mail failure; business work remains committed and failures visible.

### WIL-19 — Optional OIDC with explicit identity linking.

OIDC is optional, configured only through runtime bindings and explicitly linked/relinked/unlinked by the owner using Base's fresh local email proof. Existing active Willow members retain the same IDs, person links and grants through either sign-in route; token roles/groups assign nothing. Bad configuration, provider failure or unlinking leaves email sign-in available. Connections reports refused token exchanges as unavailable even when discovery succeeds, and clears that observation after a successful token endpoint response. Secrets and transient identity state are excluded from owner archives and errors.

**Acceptance evidence:** Link a Google OIDC identity with fresh local proof, sign in, unlink and exercise bad configuration/token exchange; member IDs and grants remain stable, provider roles grant nothing and ordinary email sign-in still works.

### WIL-20 — Structural model checklist drafts under human control.

Model controls are absent and calls refused without an owner-selected model and runtime connection. Checklist drafts send only authorized template IDs/revisions and controlled task structure, including for the owner; no free-form prompt, task title, system name or employee data is accepted. Models receives one server-only chat-completions request, with Bearer credentials and feature header. A valid response cites the actual source revision and covers each source task. Failed calls and invalid or uncited output remain failed proposals. A human accepts or declines the stored draft; acceptance never changes employment, leave or tasks, and a retired source needs a fresh proposal.

**Acceptance evidence:** With the owner-selected model enabled, request a structural checklist draft, inspect outbound payload, accept/decline valid output and refuse uncited, stale or failed output; no employee/private text leaves and acceptance changes no employment task.

### WIL-21 — Frozen mapped payroll files and ADP RUN compatibility.

The owner explicitly maps every generic CSV source column to a target heading and order, or selects ADP RUN Time Sheet Import's payroll-assigned identifier format with company, frequency, rate, check, department and policy earnings mappings. Missing source identifiers/mappings block previews; ADP hours cannot silently consume starts, ends, terms or reversals. The exact file is reviewed before export. Source and layout fences invalidate stale previews; export atomically freezes the reviewed bytes with the existing change claims, including silent pairs, and later mapping edits never change downloaded bytes. Payroll calculation stays with the provider; this compatibility handoff is one path within the connected payroll job in PAYROLL-001–004, and does not establish provider-account reconciliation.

**Acceptance evidence:** Map generic columns and ADP RUN company/frequency/earnings codes, preview, mutate source/layout and prove refusal, then export unchanged input and re-download after a mapping edit; exact reviewed bytes survive and unsupported ADP changes are refused.

## People and self-service

### PEOPLE-001 — Typed custom employee fields.

HR defines typed, validated fields with requiredness, effective dates, employee/manager visibility and restricted HR/payroll access. Imports, profiles, reports, exports and approved connector mappings use the same field definitions; retired fields retain historical meaning. Sensitive fields cannot become directory-visible through a schema edit.

**Acceptance evidence:** As HR, create a restricted field, import values, reject an invalid value, change its visibility and inspect employee, manager, agent and export doors; only authorized values appear and history remains reconstructable.

### PEOPLE-002 — Directory and navigable organizational chart.

Employees browse and search a scoped directory by name, location, department and role and navigate a manager/report org chart. Current, future and former relationships use the same effective-date rules as the profile. HR previews reorganizations, handles vacant managers and rejects cycles without exposing pay or private contact details.

**Acceptance evidence:** Open directory and org chart at desktop and phone widths; navigate a realistic multi-level team, search a location, inspect a future manager change and try a cycle. Compare chart, directory and profile on the effective date.

### PEOPLE-003 — Multi-row record tables and company assets.

Employee records hold dated multi-row tables: several emergency contacts (with a primary flag), education, certifications/licences with expiry and company assets (type, serial, assigned/returned dates, condition), plus custom tables HR defines with typed columns under the same visibility rules as PEOPLE-001. Assets assigned to a person generate device-return tasks in leaver cases (WIL-12, IDENTITY-001) that close only with return evidence; expiring certifications create renewal work (LEARN-001). Tables are importable (MIGRATE-001/002), reportable and exportable under the reader's access level.

**Acceptance evidence:** Add two emergency contacts, a certification near expiry and a laptop asset to an employee and read them as the employee, manager and HR under their levels. Start a leaver case and confirm a laptop-return task that cannot close without evidence; let the certification expire and see renewal work; export the tables and import them into a fresh employer.

### SELF-001 — Employee and manager self-service portal.

One portal gives employees their profile, documents, balances, PTO requests, assigned tasks and pending changes; managers see permitted team requests, outstanding work and coverage. Employees submit contact, name, dependent and other permitted changes with validation. The member's access level (ROLE-001) determines immediate edits versus HR approval; immutable proposals show before/after, owner, due date, outcome and downstream reconciliation. An employee never edits pay or employment authority by changing their profile.

**Acceptance evidence:** As an employee, change an allowed contact field and submit an approval-required name/dependent change; HR accepts one and rejects another. As manager, clear permitted team work and inspect the employee view. The approved revision feeds the payroll/benefits exception queue; no self-granted privilege is possible.

### SELF-002 — Company home: announcements, celebrations and shared files.

Every member's home shows employer announcements (targeted to everyone or a group, scheduled, pinned, with optional read acknowledgement), upcoming team time off, new hires, and birthday and work-anniversary celebrations for people who opt in (birthdays show month and day only). Company files (handbook, benefits guides, policies) live in versioned shared folders visible to everyone or to groups and can require a signature through SIGN-002. Announcements and files reach mobile (MOBILE-001) and Slack/Teams (COMMS-001) with the same targeting; nothing private (pay, birth year, absence reasons) is shown.

**Acceptance evidence:** Publish one company-wide and one location-targeted announcement, upload a handbook to a shared folder and open home as employees inside and outside that location; each sees only their targeted content and files. Opt one person into birthday celebrations and another out; only the opted-in month and day appear and no birth year is exposed through any door.

### MOBILE-001 — Mobile work and accessible companion apps.

The responsive portal and iOS/Android companion apps let employees update permitted details, read/sign documents, request PTO and complete tasks; managers approve and see team coverage. Secure push notifications reveal no private employee data on a locked device. Session revocation applies on every device; reconnecting a saved draft revalidates permissions and source revision before submission. Keyboard, screen-reader and 390-pixel journeys meet WCAG 2.2 AA.

**Acceptance evidence:** Use real employee/manager accounts for request, approval, task completion and document access at 1440 and 390 pixels and on iOS/Android; interrupt a draft, revoke access, reconnect and prove no stale submission or private push content. Complete keyboard and screen-reader checks.

## Access levels and the open API

### ROLE-001 — Named access levels with field-level rights.

Access is granted through named access levels: built-in Employee (self-service), Manager, HR administrator, Payroll administrator and IT, plus custom levels HR creates. Each level sets, per field and section (personal, job, compensation, documents by category, time off, benefits, performance, EEO, training), No access / View / Edit / Edit with approval, separately for "about themselves" and "about others", and which approvals, reports and settings it may use. A member may hold an employee level and one or more administrative levels; their rights are the union, shown in the WIL-02 preview. Levels compile to the server-side facets every door enforces, so the WIL-03 crawl covers each level, and edit-with-approval changes enter the SELF-001 approval queue. Editing a level shows the changed rights and affected members before saving, takes effect on the next request without a fresh sign-in and is audited. Rank alone grants nothing; pay, tax/identity, EEO and medical sections are never granted to Manager by default.

**Acceptance evidence:** Create a custom level with view-only job fields, edit-with-approval personal fields and no compensation access, assign it, and crawl every API/page/download/CSV/preview/agent-context door as that member; withheld fields never appear and an approval-required edit lands in HR's queue. Change the level and repeat the crawl in the same session; every door reflects the change and the audit names who changed it.

### ROLE-002 — Group-scoped levels and bulk assignment.

The "about others" part of a level is scoped to everyone, direct reports, direct and indirect reports, or a group defined by location, department, division, employment type, legal entity or custom field. Group membership follows effective-dated terms (WIL-07): when someone transfers, the scope changes on the effective date without manual edits. HR assigns or changes a level for many people at once by selection or filter, previews each member whose rights change, and applies it in one audited step that can be reverted as a batch while no later change depends on it.

**Acceptance evidence:** Scope a custom level to one location, assign it to ten members in one step after reviewing the preview, and verify they read only that location's employees through every door. Schedule a transfer out of that location and check access on each side of the effective date; revert the bulk assignment and confirm the prior levels return.

### ROLE-003 — Default self-service access and delegated access administration.

The owner sets the default level and invitation timing for new people: hires (HIRING-004), joiners, rehires and imported employees (MIGRATE-001/002) receive that level and a portal invitation automatically (to a personal mailbox before start under FLOW-003, otherwise the work email on the start date), with an import option to invite current employees in bulk or defer. The owner delegates access administration to HR administrators, who then create and assign levels and give or end access; a delegate can never grant a right they do not hold, change their own level or the owner's, or grant pay/tax rights without the owner's or a second administrator's approval. Ending employment ends the level and access under WIL-12; rehire restores no prior level (WIL-13).

**Acceptance evidence:** Set Employee as the default, import 50 employees and hire one candidate; every new active person has the default level and exactly one invitation at the configured time, and former rows get none. As a delegated HR administrator assign a custom level to a group, then try to raise your own rights, edit the owner and grant pay access alone; each escalation is refused and audited.

### API-001 — Employer-issued API credentials bound to an access level.

The owner or a delegated administrator issues API keys and OAuth 2.0 clients (client credentials for the employer's own tools, authorization code for partner apps the employer installs). Each credential is bound to an access level (ROLE-001) and optional read/write scopes, can never exceed the issuing member's own rights, and has a name, owner, expiry and last-used time. Secrets are shown once and stored only as hashes; revocation is immediate; every call is audited with its credential and rate limits return standard headers. Credentials are excluded from archives, never survive a restore (DATA-001) and stop working when their issuer loses the rights they carry.

**Acceptance evidence:** Issue a key bound to a custom level and confirm the API returns only that level's data; try to issue a key wider than your own rights and be refused. Rotate the key, revoke it and receive 401 on the next call; end the issuer's access and prove their remaining keys stop; inspect the audit and confirm no secret appears in logs, exports or archives.

### API-002 — Documented employee and roster API.

A versioned, published OpenAPI description covers employees (directory and full records with requested fields), employment and job history, org structure, custom fields and tables, time-off balances, requests and calendars, document metadata and downloads, and access-level metadata. Responses contain only the fields the credential's level may read and name withheld fields; lists paginate by cursor and support changed-since queries for incremental sync. Writes use the same validation, effective dating and edit-with-approval routing as the page doors. The API and webhooks are documented so unified-API providers (such as Merge, Finch and Kombo) and partner tools can integrate; their partnership listings are delivery work.

**Acceptance evidence:** Read the roster with a key whose level withholds compensation and private contact fields, page through it and fetch changes since a cursor after a hire and a transfer; restricted fields never appear and each change appears once. Submit an edit-with-approval change through the API and see it wait in HR's queue; every response validates against the published OpenAPI description.

### API-003 — Signed, replay-protected outbound webhooks.

Administrators create global webhooks (any field they may read) and permissioned webhooks limited to the creating credential's level, choosing events (employee created; updated, with monitored fields; terminated; rehired; terms change effective; time off approved/cancelled; signature completed) and posted fields. Each delivery carries a unique event ID, a timestamp and an HMAC-SHA256 signature over both and the body with a per-webhook secret, so receivers following the documented verification reject stale or repeated events. Deliveries retry with backoff, appear in a delivery log with response codes, pause after repeated failure with a visible alert and can be replayed by an administrator. Future-dated changes fire when recorded and again when effective. Payloads never contain fields outside the webhook's level.

**Acceptance evidence:** Register a permissioned webhook from a key scoped to one location, hire and terminate a person there and verify two signed events whose signatures check and whose payloads omit restricted fields; a hire elsewhere sends nothing. Re-send a captured event after the tolerance window and confirm the documented verification rejects it; fail the endpoint and observe retries, pause and manual replay; revoke the key and confirm the webhook stops.

## Hiring

### HIRING-001 — Accepted-hire handoffs from Greenhouse, Lever, Workable and JazzHR.

Employers that keep a separate ATS connect Greenhouse, Lever, Workable or JazzHR through each provider's approved API/webhook authorization. An accepted-hire event produces a reviewed joiner proposal with candidate identity, approved offer, role, start date, manager and permitted documents. HR resolves duplicate/rehire matches and missing fields before creating one employee/packet; the resulting employee ID and onboarding status return to the ATS where it accepts them, and interview evaluations are never copied into broad employee records. Employers without a separate ATS use Willow's own pipeline (HIRING-002–004).

**Acceptance evidence:** For each of Greenhouse, Lever, Workable and JazzHR, accept an offer, preview the hire in Willow, resolve a former-worker match, approve and inspect the packet plus returned status. Replay the event and withdraw the offer; neither duplicates the person nor retains unauthorized preboarding access.

### HIRING-002 — Job openings, careers page and job-board posting.

Hiring managers request openings with title, department, location, employment type, USD pay range (published where state pay-transparency laws such as California's, Colorado's, New York's and Washington's require it), hiring team and approval chain; HR approves before posting. Approved openings publish to an employer-branded, accessible careers page with structured job data for search engines, and post to Indeed, ZipRecruiter and LinkedIn through their approved posting/partner interfaces, each showing posted/live/rejected/expired state and the board's reference; partner programme access is delivery work. Closing, filling or editing an opening updates or withdraws every posting. Application forms are configurable per opening (resume, cover letter, questions, knockout questions) and applications from the careers page and each board arrive once as candidates with their source.

**Acceptance evidence:** Request and approve an opening in a pay-transparency state, publish it and read it back on the careers page and from Indeed, ZipRecruiter and LinkedIn posting status (provider-edge tests plus a consented employer-account trial). Apply once from the careers page and once from a board, then close the opening; both candidates appear once with their source and every posting reports withdrawn.

### HIRING-003 — Candidate pipeline, hiring-team review and candidate email.

Each opening has configurable stages (such as new, screen, interview, offer, hired, rejected) with candidate cards, resumes, notes, per-interviewer scorecards and a timeline. Hiring-team members see only the openings they are assigned to; HR controls who sees pay expectations and notes. Interviews are scheduled against Google Calendar or Microsoft Outlook availability with invitations to the candidate and panel. Candidate emails use editable templates (acknowledgement, interview invitation, rejection) with merge fields and are logged on the candidate; bulk rejection sends one message per candidate. A repeat applicant is matched to their earlier record and duplicates merge with history. Candidate records follow the employer's retention schedule (DATA-002) and are never visible outside the hiring team and HR. People decide who advances; no agent ranks or rejects candidates.

**Acceptance evidence:** Move two applicants through stages as a hiring manager, record two interviewer scorecards, schedule an interview against a connected calendar and send templated acknowledgement and rejection emails. Prove an employee outside the hiring team and the manager of a different opening cannot read the candidates, a repeat application merges into the earlier record, and no automated ranking or rejection exists.

### HIRING-004 — Offer approval and hire into preboarding without re-keying.

From an offer-stage candidate, HR generates an offer letter from a SIGN-001 template filled from the opening and candidate (title, USD pay, start date, manager, location), routes it for approval and sends it for native signature. A signed acceptance creates one reviewed joiner proposal (WIL-15) carrying the candidate's name, personal email, phone, address, role and terms, starts the matching preboarding packet (FLOW-003) at the personal mailbox and files the signed offer to the restricted employee record. No field is typed twice; a declined, withdrawn or expired offer reopens the candidate without creating a person, and a former worker is matched for rehire (WIL-13).

**Acceptance evidence:** Send an offer from the pipeline, approve and sign it on a phone, and inspect the joiner proposal, preboarding invitation and filed signed offer; every carried field equals the candidate record and nothing is re-entered. Decline a second offer and confirm no person or packet exists; hire a former worker and confirm the existing person is reused.

## Workflows, documents and US onboarding

### FLOW-001 — Conditional workflows with reviewed publication.

HR builds versioned joiner/mover/leaver and employee-change workflows with conditions on role, work state, employment type and location, dependencies, approvals and relative deadlines. Preview names every affected person, assignment and external action before publication. Published versions pin open cases; deliberate upgrades show a diff and retain completed work. Payroll, benefits and IT approval are separately scoped; one failed step cannot fabricate whole-case completion.

**Acceptance evidence:** Build and preview a multi-state joiner workflow, publish it, start two cases and change the template. Approve a pay step as payroll and an access step as IT, fail one provider step and verify dependent work remains blocked and existing cases retain their version.

### FLOW-002 — Persistent reminders, escalation and coverage.

Every required task, approval, missing form, signature and provider exception has an accountable owner, deadline, progress and next action. Scheduled reminders follow an HR-approved cadence and quiet hours; overdue work escalates to a substitute owner when the assignee is absent or leaves. Completion cancels future reminders, rescheduling preserves history, and restart catches missed deadlines without duplicate sends. Failed/uncertain delivery is visible separately from work completion.

**Acceptance evidence:** Create a due case, advance the scheduler across quiet hours and restart it, then make the assignee unavailable. Observe one permitted reminder/escalation, assign cover, complete the task and prove later ticks send nothing. Refuse an unauthorized recipient and expose failed delivery.

### FLOW-003 — Role-specific preboarding packets.

An accepted hire gets a secure, revocable pre-start invitation with only their required personal details, offer/policy signatures, forms, voluntary EEO self-identification (EEO-001), benefits choices and tasks. HR chooses role/work-state packets, tracks completion and resolves missing data without asking the new hire to use an unprovisioned work mailbox. Expired or withdrawn offers end preboarding access and pending invitations without deleting retained evidence.

**Acceptance evidence:** Send two role-specific packets to personal mailboxes, complete one on a phone, let the other expire/withdraw, then start employment. Inspect packet progress and prove only approved data becomes the employment record and expired links cannot read it.

### SIGN-001 — Offer and policy templates with native e-signature.

HR maintains versioned offer-letter, employment-agreement and policy signature templates with controlled employee/compensation merge fields, placed signature/initial/date/text fields, signer order (such as employee then HR countersignature), approval routing, a recipient preview and the document category (folder) the signed copy files into. Willow signs natively and needs no third-party account: each signer gives withdrawable ESIGN Act/UETA electronic-record consent, authenticates by an active session or an emailed one-time link plus code, and signs the exact approved version on desktop or phone. The completed document is sealed as a new immutable version with a SHA-256 digest and an audit certificate (signers, authentication method, consent, timestamps, IP/device, document digest), filed to the chosen category on the employee record and shown in the employee portal as that category allows. Sent/viewed/signed/declined/expired/voided states are tracked and a changed document voids and reissues. DocuSign is an optional signing provider for employers that require it, returning the signed copy, certificate and envelope ID under the same states; duplicate/out-of-order callbacks or old links cannot sign a different version. Plain receipt acknowledgements in WIL-06 remain distinct.

**Acceptance evidence:** With no DocuSign connection configured, approve an offer from a template, sign as the employee on a phone and countersign as HR; retrieve the sealed copy and certificate from the chosen category through permitted doors and verify the digest. Void and reissue a changed offer, replay an older signing link and prove it cannot complete the new version; exercise decline, expiry and consent withdrawal. Repeat the send through a connected DocuSign account and replay an older callback.

### SIGN-002 — Cohort signature requests and the signed-documents report.

HR sends a signature template (such as a handbook or policy) to named people, everyone, a location, department, employment type or access level, previews the recipient list and can include future joiners who match the cohort. Each recipient gets their own request in the portal, by email and on mobile (MOBILE-001). A signed-documents report lists every request by template, cohort and person with pending/viewed/signed/declined/expired state and dates, with filters and CSV export, scoped by level (HR sees all; a manager sees only their reports' status where the category allows). Pending requests follow the FLOW-002 reminder cadence and escalation until signed or withdrawn; a cohort send can be cancelled for unsigned recipients without touching signed copies.

**Acceptance evidence:** Without DocuSign, send a policy to one location of five people, sign as two of them (one on a phone) and confirm each signed copy is filed in the chosen category. Open the signed-documents report as HR and as a manager, advance the scheduler and see one reminder to each pending signer only, add a new joiner at that location and see their request, then cancel the remainder; signed copies remain and later ticks send nothing.

### US-001 — I-9, E-Verify and W-4 through completion.

Worksite-aware onboarding collects current I-9 and federal/state withholding forms through restricted employee and employer/authorized-representative steps. Mitratech Tracker I-9/E-Verify integration launches the correct workflow, tracks examination/attestation, corrections, rehire/reverification, provider case IDs, notices and unresolved results through closure. W-4 captures the authenticated employee signature and final declaration, keeps a printable copy and records payroll receipt/effective date. Reviewed rule versions set deadlines and retention; an E-Verify mismatch never becomes an automatic adverse employment decision.

**Acceptance evidence:** From a US hire packet, complete employee and representative I-9 steps with Mitratech, exercise a pending E-Verify referral and a correction, and return the signed records/status to HR. Submit and replace W-4, observe payroll receipt and deny manager access to tax/identity documents. Missing provider action prevents completion.

### US-002 — State new-hire reporting and employer administration.

The employer maintains one or more US legal entities under one account, each with its FEIN, registered work states, locations and payroll/benefits connections; every employment period belongs to one entity and reports, EEO-1 (EEO-002) and filings group by entity. It keeps W-2 employee versus 1099 contractor records without treating classification as an agent decision. New-hire/rehire reporting and state onboarding forms use current state-specific fields and reviewed deadlines, with configured multistate election, restricted review, submission through the state portal or authorized payroll partner, acknowledgement/rejection and correction. Owner-assigned manual portal steps retain submission receipts when a state has no machine interface; an export alone never completes reporting.

**Acceptance evidence:** Under two legal entities with different FEINs, onboard and rehire workers in California and Texas, preview the applicable forms/report destination and deadlines, approve and submit, reject/correct one report and inspect the acceptance receipt. Attempt to complete an unsubmitted report and to expose FEIN/SSN to a manager; both fail, and each worker's records and reports carry their own entity.

### EEO-001 — Voluntary EEO self-identification.

Willow asks for voluntary self-identification of ethnicity (Hispanic or Latino first, then race), sex and, where the employer is a federal contractor, protected-veteran status and disability on the OFCCP voluntary form (CC-305), with "I do not wish to self-identify" on every question. It is offered in the preboarding packet (FLOW-003), in self-service at any time and to applicants separately from their application (HIRING-002/003). Answers sit in a restricted EEO section that no Manager level, hiring team, directory, agent context or ordinary export can read; only levels granted EEO access read individual values, every read is audited and applicant answers are never visible during selection. Where an employee declines, HR may record a category from employment records only as the current EEO-1 instructions allow, labelled with that source; answers keep their history.

**Acceptance evidence:** Send preboarding packets to two hires; one completes self-ID and the other declines. Verify HR with EEO access sees each answer and its source while the manager, hiring team, directory, agent context and a standard CSV export receive nothing, and HR's read appears in the audit. Change an answer through self-service and inspect its history.

### EEO-002 — EEO job categories and the EEO-1 Component 1 report.

HR maps each job title to one of the ten EEO-1 job categories, effective-dated, and maps locations to EEO-1 establishments under their legal entity (US-002). For an employer-chosen workforce snapshot pay period, Willow produces EEO-1 Component 1 data by establishment and company (headquarters, establishment and consolidated reports where required): full- and part-time employees on payroll in that period by job category, sex and race/ethnicity, excluding 1099 contractors. A pre-filing check flags unmapped titles, missing or declined self-ID, missing establishment addresses or NAICS codes and people outside the period. HR downloads the data in the EEOC filing system's upload format, then records the submission confirmation as an owner-assigned manual step; the report never claims filing without it. Individual values stay with EEO-access levels and aggregate views suppress small cells.

**Acceptance evidence:** Map titles for a two-location employer, choose a snapshot pay period containing a hire, a leaver and a contractor, and run the report; counts by category reconcile to the roster for that period, the contractor is excluded and the declined hire is flagged. Map one missing title and rerun, validate the download against the EEOC's published data-file specification and record a confirmation; a manager cannot open the report or its drill-down.

## Leave, time and workforce planning

### LEAVE-001 — US PTO policies and scheduled accrual.

HR configures vacation, sick and unpaid leave policies with eligibility, service tiers, hours/days conversion, proration, accrual cadence, caps, carryover/expiry, negative-balance rules and reviewed state/location variants. Scheduled accruals are idempotent and explain each calculation, including hire, rehire, transfer, schedule and termination effects. Policy changes require owner approval; overrides are dated, reasoned ledger adjustments. HR configures reviewed protected-leave cases and restricted supporting documents without exposing medical reasons to managers or claiming legal adjudication.

**Acceptance evidence:** Publish policies for salaried and hourly workers in two states, accrue across a tier/carryover boundary, restart the scheduler and compare employee balances and ledger. Transfer a worker and correct a schedule; show the calculation and require approval for an override. Managers see absence dates, never supporting medical records.

### LEAVE-002 — Shared absence calendars and approval follow-up.

Employees and managers have scoped absence/holiday calendars with employer-defined US federal/state/company holidays, partial days and working schedules. Requesting leave shows balance/coverage impact, notifies the effective approver in-app and by the configured channel, and follows substitute approval/reminder rules. Calendar subscriptions and Google Calendar/Microsoft Outlook connections expose only authorized absence labels/dates; cancellation or access loss removes or redacts updates without leaking reasons.

**Acceptance evidence:** Request a partial-day absence over a company holiday, inspect the quote and shared calendar as employee/manager, deliver the manager request notice, delegate approval and cancel it. Read Google Calendar and Outlook updates and revoke access; confidential reasons never appear and stale requests cannot be approved.

### TIME-001 — Time, shifts and Deputy reconciliation.

Hourly workers record time, breaks, corrections and approved timesheets; managers publish shifts, manage availability/swaps and compare planned versus worked hours. US work-state overtime/break rules are employer-reviewed and versioned; edits preserve originals and require approval before payroll handoff. Deputy connections reconcile roster, shifts, approved hours and absences using explicit source authority; schedule changes feed PTO quotes without overwriting an approved payroll period.

**Acceptance evidence:** Publish a week of shifts, clock and correct a missed break, approve a swap/timesheet and send hours to payroll. Compare Deputy and Willow roster/leave/time, create an overtime mismatch and resolve it; denied/late edits cannot silently change approved payroll.

## Connected payroll and benefits

### PAYROLL-001 — Two-way payroll authority and reconciliation.

Payroll and HR agree per-field authority, employee/provider identity, effective dates, pay calendars, earning/leave/deduction codes and cutover. Authorized changes flow both ways; provider-owned facts never silently overwrite Willow-owned employment terms, and conflicting pay or identity matches stop for review. Each change keeps intended values, approved version, submission/idempotency key, provider acknowledgement and a fresh read-back comparison. Submitted, accepted, observed, rejected, stale and uncertain remain distinct. Disconnects, rate limits and webhooks reconcile safely after recovery; retries never duplicate an uncertain pay action. File handoff remains supported alongside live sync.

**Acceptance evidence:** Approve a hire, salary change, leave reversal and termination through a connected payroll account. Change a provider-owned field remotely, create a conflicting salary edit, duplicate callbacks and interrupt submission. The HR/payroll queue resolves conflicts by authority and closes only after provider acknowledgement and matching read-back; money and tax execution remain with payroll.

### PAYROLL-002 — Live Gusto connection.

An authorized employer connects Gusto through its approved app authorization and maps existing employees without duplicates. Two-way roster, employment/pay, applicable PTO, withholding-form status and benefit deduction synchronization follow PAYROLL-001 field authority. Supported operations and provider restrictions are explicit; unsupported required operations create accountable work with returned provider evidence, not false success. Production app approval, scopes, tenant activation and provider conformance are delivery requirements.

**Acceptance evidence:** Connect an employer Gusto tenant, match an existing roster, create a hire and scheduled pay change, receive a provider-side correction and terminate access to the connection. Compare acknowledged and read-back records, refusal/expiry states and permission boundaries using provider-edge tests plus a consented production-account trial.

### PAYROLL-003 — Live ADP RUN and Workforce Now connections.

Willow separately supports ADP RUN and ADP Workforce Now with the appropriate approved application/partner access, employer authorization, company/pay-group mappings and versioned field capability maps. Each connects employee roster, starts/ends, pay, applicable leave and deductions under PAYROLL-001, returns provider acknowledgement and checks observed state. WIL-21 ADP RUN Time Sheet Import remains compatibility support and cannot stand in for either live connection.

**Acceptance evidence:** Run the hire/pay/leave/termination reconciliation journey separately in ADP RUN and ADP Workforce Now employer accounts. Reject a wrong company/code and ambiguous identity, recover an expired authorization and confirm provider read-back. Exercise live provider-edge tests and a consented account trial for each product.

### PAYROLL-004 — Live QuickBooks Payroll connection.

Authorized employers connect QuickBooks Payroll using the required Intuit application/partner interfaces and employer scopes. Employee identities, job/pay changes, applicable time/PTO and deduction mappings reconcile two ways under PAYROLL-001. QuickBooks Online accounting access alone is not proof of payroll access; required production partnership and unsupported-field workflows are visible engineering deliverables with provider receipts.

**Acceptance evidence:** Connect a QuickBooks Payroll employer, match existing workers and reconcile a hire, pay update, leave change and exit. Return a provider correction, revoke access mid-sync and restore it; no duplicate employee or false completion results. Prove payroll-specific acknowledgement/read-back in edge tests and a consented account trial.

### BENEFITS-001 — Enrollment and life events through brokers and carriers.

HR and employees manage eligibility, dependents, plan comparison/costs, open enrollment, new-hire elections, waivers, qualifying life events and termination with effective dates and required documents. Employee Navigator and employer-authorized broker/carrier connections exchange census and elections with contracted US plans, including Aetna, UnitedHealthcare and Anthem where selected. Show per-carrier submitted/accepted/active/rejected coverage evidence, enrollment deadlines and unresolved handoffs. Carrier/API/834 agreements, broker licensing partners and protected-data agreements are delivery work; no unchecked task declares coverage active. Employers whose broker or carrier is not connected still record plans, rates, eligibility rules, waivers and elections in Willow, run open enrollment and export census/election files; each such election stays "recorded, not confirmed" until HR attaches the carrier's confirmation and never shows as active coverage before then.

**Acceptance evidence:** Enroll a new hire, waive a plan, add a dependent after a life event and terminate coverage. Send through Employee Navigator/broker to the selected carrier, ingest acknowledgement and compare active coverage/dates; reject a dependent mismatch and resolve it. Employees read their own elections, HR sees permitted status and managers cannot see health evidence. Without any connection, record a plan and an election, export the census and confirm the status stays recorded, not active, until a carrier confirmation is attached.

### BENEFITS-002 — Benefit deductions and payroll mismatch resolution.

Benefits/employee elections map to provider plans and employee/employer contribution codes, coverage effective dates, pay frequencies, pre/post-tax treatment and arrears rules approved by payroll. Reconcile carrier/broker elections, payroll deductions and observed payroll results per employee/pay period. Exceptions name the owner, amount/date discrepancy and corrective action; retroactive changes require reviewed adjustments and a returned acknowledgement.

**Acceptance evidence:** Change a benefit mid-period, preview deduction impact in USD, approve it, ingest payroll and carrier results and inspect a deliberately mismatched deduction. Resolve and re-read both systems; the mismatch remains open until evidence agrees and a duplicate event creates no duplicate adjustment.

### BENEFITS-003 — ACA full-time measurement and 1095-C data.

For employers at or near 50 full-time and full-time-equivalent employees, Willow calculates monthly full-time and FTE counts for applicable-large-employer status, tracks look-back measurement, administrative and stability periods for variable-hour and seasonal employees from TIME-001 and payroll hours, records offers of coverage, affordability inputs and waivers from BENEFITS-001, and produces per-employee monthly Form 1095-C codes and 1094-C totals for the payroll provider or broker that files. Calculations show their inputs; filing and IRS correspondence stay with that filer, and Willow records the filer's acknowledgement.

**Acceptance evidence:** For an invented employer with full-time, part-time and variable-hour staff over 12 months, compute monthly ALE counts, complete a look-back that makes one variable-hour worker full-time for the stability period, record offers and a waiver, and generate 1095-C lines that reconcile to the inputs. Hand the file to the filer and record their acknowledgement; a missing month of hours is flagged, not assumed.

### RETIRE-001 — Retirement census and contribution handoff.

Human Interest and Guideline connections maintain eligible census, employment dates, employee elections/deferrals, employer contribution mappings and payroll-period contribution status. Restricted HR/payroll owners review differences, submission receipts, provider acknowledgements and corrected census/contribution results. Custody, investment advice and plan administration stay with the plan provider while Willow follows the handoff to a verified outcome.

**Acceptance evidence:** For each of Human Interest and Guideline, send a hire/eligibility change, update a deferral, reconcile contribution results and process an exit. Fail one census row and correct it without resending accepted rows; inspect the employee-scoped record and payroll reconciliation report.

## Connected identity and collaboration

### IDENTITY-001 — Provisioning and verified deprovisioning.

Google Workspace, Microsoft 365/Entra ID and Okta connections map immutable employee identities and HR attributes to accounts, groups, licenses and role-based access rules. IT previews grants/changes and approves privileged access; join/move/leave dates drive execution. Exits suspend/disable accounts, revoke sessions/tokens, remove groups/licenses as authorized and verify observed provider state; shared mailbox/data ownership and device-return tasks (from the PEOPLE-003 asset register) have named owners. An uncertain or failed provider action blocks departure completion. Rehire requires new reviewed access and never restores prior privileges automatically.

**Acceptance evidence:** For each named service, approve a joiner, transfer departments and offboard while holding an active external session. Inspect account/group/license read-back and session revocation, inject an API failure and show the open IT exception. Rehire and prove prior grants are not silently restored.

### IDENTITY-002 — Google, Microsoft and Okta sign-in controls.

Employers use Google SSO, Microsoft Entra ID or Okta through OIDC/SAML with explicit member linking, verified domain/issuer configuration, fresh proof for relinking and employer-enforced MFA/session policies. Provider attributes/groups map only through owner-reviewed rules; no token silently grants HR/payroll access. Sign-in, recovery, offboarding and role changes preserve identity, revoke active sessions as required and leave a protected owner recovery path.

**Acceptance evidence:** Exercise Google, Entra ID and Okta sign-in separately, then enforce MFA/session policy, change groups, relink and revoke a member. Verify unchanged member/person IDs, no unapproved grants, refusal of wrong issuer/tenant and owner recovery without ended-member access.

### COMMS-001 — Slack and Microsoft Teams work notifications.

Employees connect Slack or Microsoft Teams for scoped request/task/signature notifications, reminders and secure approval entry points. Membership and approver rights are checked again at action time. Messages use minimal fixed content and authenticated links; channels, bot storage and previews receive no pay, tax, medical or document content. Delivery/interaction outcomes and revocation are recorded independently of business completion.

**Acceptance evidence:** Connect each service, request PTO and deliver a manager reminder, follow an approval link as the right/wrong actor and revoke the connection. Replay an interaction and inject delivery failure; only one authorized decision occurs, failures remain visible and private fields never appear in channel content.

## Performance and HR modules

### PERFORM-001 — Performance reviews, goals and feedback.

HR runs configurable review cycles with self, manager, peer/360 feedback, role-specific questions, due dates, reminders, calibration, acknowledgements and locked historical versions. Employees/managers maintain goals, milestones, check-ins and development actions across cycles. Confidential feedback has explicit visibility/release rules, appeals/corrections retain history, and managers cannot read private HR-only notes by rank. People decide ratings, compensation, promotion and employment outcomes; agents never rank or recommend dismissal.

**Acceptance evidence:** Launch a review cycle for two teams, request self/peer/manager inputs, complete a goal check-in, escalate a late review, calibrate and release results. Change a manager midway, test confidential peer visibility, export the completed cycle and retain its locked history after an employee exit.

### ENGAGE-001 — Engagement surveys and accountable action.

HR designs pulse/eNPS and lifecycle surveys, schedules delivery/reminders, selects cohorts and chooses named or anonymous collection with explicit participant disclosure. Anonymous cohorts suppress small groups and overlapping filters that could identify a respondent; no manager export exposes raw identities. Permitted trends, themes and comments link to human-owned action plans and follow-up surveys; optional AI summaries cite source groups and do not score individual employees.

**Acceptance evidence:** Run named onboarding and anonymous engagement surveys, collect responses, try small/overlapping cohort filters and inspect manager/HR exports. Publish a theme/action plan, assign an owner and measure the next pulse; suppression holds and no individual inference appears in AI context.

### COMP-001 — Compensation bands and planning.

HR/payroll maintain USD salary/hourly bands by job/level/location and effective date, review range position and prepare promotion/merit/bonus cycles against approved budgets. Managers propose within their scope; compensation owners approve exact amounts and effective dates, detect budget/field conflicts and publish effective-dated terms only after approval. Approved changes enter payroll reconciliation; pay equity reports use permitted cohorts and explicit calculations, never autonomous pay decisions.

**Acceptance evidence:** Create bands and a merit budget, have two managers submit proposals, inspect out-of-band/over-budget exceptions, approve a cycle and reconcile the scheduled changes with payroll. An employee or manager without pay authority cannot read another team’s amounts.

### LEARN-001 — Training assignments and TalentLMS connection.

HR assigns mandatory and development training by role/location with due dates, recurring certifications, evidence and reminder/escalation. TalentLMS exchanges rosters, enrollment and completion/certificate results; provider completion is distinguished from a manual acknowledgement and expiring certifications reopen required work. The employee record and authorized reports retain completion history when a learner leaves.

**Acceptance evidence:** Assign a hire to role-specific TalentLMS courses, ingest completion and a certificate, expire one certification and observe the renewal task. Suspend a departed learner and export the retained training record; a lost/duplicate callback cannot fabricate or duplicate completion.

## Integration operation, reporting and portability

### CONNECT-001 — Operable connections and attribute rules.

Owners authorize each named connector with least scopes, per-field mapping/authority and explicit outbound-data previews. Health shows last successful sync/read-back, freshness, scope loss, rate limits, stale/error/uncertain state and a per-person mismatch queue with owner/next action. Signed/replay-protected webhooks, durable execution IDs, reviewed safe retries and reconciliation after disconnect prevent duplicate effects. Secrets stay in protected runtime custody; rotation/revocation and provider-data deletion are explicit. Required production app review, contracts, scopes and health-data agreements are tracked to completion for every supported integration. The employer's own and partner tools read and subscribe through API-001–003 under the same health and audit.

**Acceptance evidence:** Connect a provider, change an attribute/access rule after preview, rotate credentials, lose a scope and replay a webhook. Restart during a change and inspect fresh/stale/error state and one durable outcome; no private payload/credential appears in logs, exports or unauthorized agent context.

### REPORT-001 — Custom workforce reporting and operational dashboards.

HR builds and saves scoped reports over standard/custom fields, effective-dated headcount/FTE, turnover, tenure, leave liability, pay, aggregate diversity from EEO-001 voluntary self-identification (EEO-access levels only, small cells suppressed, EEO-1 output in EEO-002), benefits mismatches, signature status (SIGN-002), hiring pipeline and overdue work. Definitions show filters, as-of dates, denominators, excluded/unknown data and data freshness; drill-down reconciles every total to authorized records. Scheduled distribution rechecks recipient rights and sends safe links; dashboards and CSV/XLSX exports apply the same row/field restrictions.

**Acceptance evidence:** Build and schedule a report joining custom fields, headcount, leave and open exceptions; reconcile totals and drill-down to source records at a past date. Remove a recipient’s rights before dispatch and prove pay/private rows remain withheld in page, file and delivery. Open a diversity breakdown as HR with EEO access and as a manager without it; the manager is refused and HR sees suppressed small cells, never individual values.

### MIGRATE-001 — Switch from each incumbent without losing history.

Named move-in paths cover BambooHR (WIL-16), Rippling, HiBob, Gusto HR, Factorial and Deel HR using approved source APIs/exports. HR maps identities/custom fields and custom/multi-row tables including assets (PEOPLE-003), org/manager history, employment/pay versions, documents, signature templates and certificates, access levels (proposed, assigning nothing until approved), leave policies/balances/requests, benefits elections, goals/reviews/training, open lifecycle work, and open job openings with candidates and application history (from the incumbent, or from Greenhouse, Lever, Workable or JazzHR for employers leaving a separate ATS). Per-source preview lists unsupported fields and originals, reconciles counts and balances, and never substitutes empty data. Source IDs/provenance survive; repeated imports are idempotent, overlap cutover freezes agreed authority and guarded undo cannot destroy subsequent work. Imported history never grants sessions or triggers external actions.

**Acceptance evidence:** For each named source, preview a representative export with current/former/rehired workers, a signed document, balance, historical change, a custom table and an open opening with candidates; resolve conflicts, apply, compare row/document/balance totals and repeat. Edit an imported record and prove undo refusal; close cutover only after HR signs a variance report and all retained originals can be exported.

### MIGRATE-002 — Complete BambooHR move-in beyond the current kit.

Extending WIL-16, the BambooHR path reads BambooHR's API with an employer-issued key, or its exports, and also carries job and compensation history tables with effective dates, custom fields and custom/multi-row tables (emergency contacts, education, certifications, assets), the full files/documents export at the OPS-002 reference size with folder-to-category mapping, signature templates and completed signed documents with their audit trail, time-off policies, history and requested/approved leave, access levels proposed as ROLE-001 levels for HR review, and open job openings, candidates and application history into HIRING-002/003. The preview lists every unmapped field or table and reconciles counts; WIL-16's guarded undo, idempotency and retained originals apply; and no imported record sends an invitation, signature request, webhook or job posting until HR enables it.

**Acceptance evidence:** From a BambooHR-shaped API fixture and export set with job history, a custom table, two assets, signed documents, open openings with candidates and three access levels, preview, map and apply; reconcile every table, document byte and balance, confirm the proposed level mapping assigns nothing until approved and that no invitation, webhook or posting fires. Repeat and undo as in WIL-16.

### DATA-001 — Usable employee exports and complete target-product portability.

Authorized users export employee CSV/XLSX with chosen standard/custom fields and explicit scope, plus documents and permitted module histories in documented formats. Owner archives include all HR, leave, workflows, signed records, performance, benefits, connector evidence, audit, automation and agent approvals, with schema/provenance and integrity verification. Restore to an empty installation preserves records and erasure fences, excludes sessions/secrets, and pauses pending external sends and live connections until owner reauthorization; no restored case or payroll action silently replays. WIL-17 remains the current-edition archive guarantee.

**Acceptance evidence:** Export selected employee fields as HR and manager and compare with their permitted records. Archive a populated target HRIS, restore into an empty installation, compare all portable records/files and re-sign in. Confirm old sessions/credentials fail and scheduled provider work stays paused until explicitly reauthorized.

### DATA-002 — Retention, legal holds and complete erasure.

Owners configure documented US record-class retention, legal holds and approved employee erasure/anonymization. The product previews retained versus erasable records and handles primary tables, immutable-history privacy exceptions, documents/blobs, search/derived data, model context and import originals/undo custody. Erasure revokes authority, retains a minimal non-identifying action receipt and fences later restores with the source erasure journal. Holds name the reason/owner/review date; held evidence is restricted, not silently erased. Previously exported offline bytes and provider-held copies are declared separately with a tracked provider deletion request.

**Acceptance evidence:** Place one document class on hold, erase an otherwise eligible former worker, inspect all public reads/downloads/import custody and export again. Attempt to restore an older archive with the later journal; the erased person cannot return. Verify held material is restricted, receipt counts are complete and a failed provider deletion remains open.

### AUDIT-001 — Traceable HR and automation history.

Authorized HR/security owners inspect and export who read or changed sensitive records, before/after revisions, approval authority, imports/undo, document/signature access, connector attempts/results and agent execution. Business changes and their audit commit atomically; denied actions and uncertain external effects remain distinguishable. Audit content avoids credentials and unnecessary private payloads, has protected retention and is anonymized consistently with approved erasure.

**Acceptance evidence:** Follow one approved employee change from its profile request through approvals, document signing and all provider acknowledgements using the audit door. Deny an unauthorized read, interrupt a provider action and perform erasure; the exported chronology is complete without secrets or the erased identity.

### SECURITY-001 — Private-by-default HR operation and Base guarantees.

Access levels (ROLE-001–003), API credentials and webhooks (API-001–003) and agent permissions are enforced server-side on every page, API, search, export, webhook and download; managerial rank alone grants no sensitive facet. Origin-bound writes, rate limiting, safe text rendering, bounded validated uploads, private no-store responses and session revocation protect all modules. Transport/storage and connector secrets use appropriate protected custody; outbound services/data/purpose/retention are visible before enabling. No third-party training on HR data is authorized by default. Base identity, audit, portability, erasure and independent-operation requirements remain obligations; category-specific manual evidence is never a replacement for revoking an external account.

**Acceptance evidence:** Exercise all registered doors with an access-level matrix (built-in and custom levels and API keys) including restricted benefits/review/EEO fields, hostile text/uploads and cross-origin writes; revoke access mid-session and inspect downloads, logs and connector/model payloads. Prove the core HRIS works without optional providers and document each explicit Base replacement with its public-door proof.

### OPS-001 — Runnable, recoverable employer-owned product.

Willow retains its supported rer install/setup/dev/build/verify/deploy/export/import commands, local provider-free operation, owner-account hosting and forward-only migrations. Health/configuration diagnostics name missing dependencies without secrets; durable work resumes without duplicate external effects and operational backups/upgrade checks preserve records, grants, audit and blobs. Capacity is committed, measured and refused by named limit as OPS-002 states; WCAG 2.2 AA, keyboard and mobile acceptance cover every HR journey. The approved homepage and UI remain the present product surface until separately authorized implementation.

**Acceptance evidence:** Use the supported commands to set up, run, stop, upgrade and recover a populated employer, compare records/grants/files and inspect missing-dependency diagnostics. Restart with pending work and verify no false completion/replay; run desktop/phone and keyboard journeys, and pass the OPS-002 reference-employer run before claiming production capacity.

### OPS-002 — Reference employer capacity with stated bounds.

A reference employer works on the owner's hosted deployment: 250 active and 150 former employees, seven years of effective-dated history (at least ten terms versions per person), 40,000 documents totalling 25 GB, the leave ledgers and lifecycle cases that history implies, and 60 concurrent signed-in members. Single documents up to 50 MB upload; migration source files and document archives up to 25 GB upload by resumable multipart transfer and are processed streaming, without holding a whole file in memory. On that data the hosted product meets: directory, profile and self-service pages p95 ≤ 1 s server time; directory search p95 ≤ 500 ms; standard reports and their CSV ≤ 5 s; custom reports ≤ 15 s or a background job with progress; a payroll change-batch preview for every employee ≤ 30 s; a full BambooHR move-in (WIL-16, MIGRATE-002) preview ≤ 30 minutes and apply ≤ 2 hours, resumable after interruption; owner archive export and restore ≤ 4 hours each. Work beyond the reference employer either completes within these bounds or is refused before any write with a named limit (such as `documents.total_bytes`); nothing is silently truncated.

**Acceptance evidence:** Generate the invented reference employer and its BambooHR-shaped export (including a 25 GB documents archive), run move-in, directory, search, standard and custom reports, payroll batch preview, export and restore on a hosted deployment, and record each timing against its bound with complete row/byte reconciliation. Interrupt the move-in and resume it without duplicates; exceed one stated limit and receive the named refusal with no partial write.

## Push further: agents that finish approved HR work

### AI-001 — Cited HR policy answers under the reader’s authority.

An opted-in policy assistant answers from employer-approved handbook/policy versions and the requesting member’s permitted record context. It cites exact clauses, dates and calculation inputs, identifies withheld/missing/conflicting information and routes uncertainty to HR. Answers never invent entitlement or legal advice, disclose another worker’s records or make employment decisions. HR controls document inclusion, provider/data retention and publication; WIL-20 checklist calls remain structural-only until a separate scoped capability is enabled.

**Acceptance evidence:** As employee and manager, ask about PTO eligibility and a policy conflict using restricted records, then change the approved policy version. Verify cited sources/calculation, withheld facets and HR escalation; planted prompt instructions cannot reveal confidential reasons or execute an action.

### AI-002 — Natural-language workflow building with impact preview.

HR describes a workflow change; the agent drafts typed conditions, roles, deadlines, approval gates and connector mappings from authorized templates/provider capability data. It validates the proposed graph, cites inputs and simulates affected employees and external writes. HR approves the exact version before publication; payroll/IT authorities approve their privileged steps. Ambiguous mappings, missing scopes and unsafe cycles remain unresolved, and a changed source invalidates approval.

**Acceptance evidence:** Ask for a two-state onboarding workflow, inspect its typed graph, missing mappings and per-person impact, then approve. Change the source template/connector scope before publication and prove refusal; an injected document instruction cannot bypass HR or grant access.

### AGENT-001 — Reconcile an approved employee change until systems agree.

An agent reads permitted effective-dated employment/pay, PTO, benefits elections/census, payroll roster and identity account state, then plans the exact diff, affected systems, authority, effective dates and expected outcomes. HR approves the employee change; payroll/benefits/IT approve privileged steps. Within those bounds it asks named owners for missing inputs, submits authorized actions and follows acknowledgement plus observed read-back until every applicable system agrees. A changed plan, ambiguous match, pay conflict, access expansion or new employment decision stops for human review; safe idempotent recovery never retries an uncertain financial effect blindly. Humans can pause/cancel, see every action and resolve exceptions.

**Acceptance evidence:** Approve a location/pay change affecting PTO, payroll, benefits and access. Let the agent discover a missing code, obtain the responsible owner’s input, execute approved steps, encounter one rejection and reopen it. Compare the original expected state with fresh provider read-back and ledger; the case closes only when all required outcomes agree, or remains owned/blocked. Revoke authority mid-run and prove execution stops.

### AGENT-002 — Policy simulation and expected-versus-observed outcomes.

Before HR publishes a PTO, eligibility or lifecycle policy, the agent simulates it against permitted current/future schedules, balances, employment terms, open cases and connected provider capability/state. It shows every affected employee, projected balances/costs/dates, missing data and downstream actions, with reproducible assumptions and current-versus-proposed comparison. Simulation writes no live records. After explicit publication, compare each predicted outcome with actual ledger/provider results, explain divergence and assign remediation; material changes require fresh approval. People decide policy, exceptions and employment outcomes.

**Acceptance evidence:** Preview a carryover/eligibility policy over an hourly worker, a future transfer and a rehire with missing provider data. Confirm no live balance or task changes before approval, publish the reviewed version and compare predictions with accrual/payroll/benefits results. A changed input invalidates the prior preview; deviations remain visible to HR.

### AGENT-003 — Recover stalled onboarding with controlled outreach.

The agent compares task deadlines, signed documents, statutory forms, benefits acknowledgements and observed account provisioning to identify why an onboarding/offboarding case is stalled. Under HR-approved cadence, channels, templates and visibility it contacts assigned owners, gathers missing inputs, suggests authorized substitutes and rechecks evidence. Human approval is required for new access, changed terms, policy exceptions or non-template employee messages. Completion stops outreach; HR can pause or take over without losing the case history.

**Acceptance evidence:** Stall one signature, one IT account and one benefits handoff. Enable an approved chase policy, inspect each message/recipient and proposed substitute, resolve the items and verify provider/document evidence before completion. Restart and replay events; there is no duplicate outreach, autonomous access grant or continued reminder after closure.

## Honest boundaries

### BOUNDARY-001 — US-first HRIS with accountable external execution.

The first buyer is a US 20–200-person employer using USD, US work states, W-2 employees and separately classified 1099 contractors. Willow owns core HR, hiring (openings, careers page, board posting, candidates, offers), self-service, access levels, the open API and webhooks, native e-signature, PTO, lifecycle completion, EEO-1 preparation, ACA measurement data, HR performance/engagement and the integrations above. Payroll providers execute gross-to-net, ACH/wage payments, tax filing and W-2/1099 issuance; brokers/carriers administer coverage and COBRA, retirement providers hold funds, Mitratech/enrolled employers perform official I-9/E-Verify work, and identity/device platforms enforce their accounts/devices. Employers that keep Greenhouse, Lever, Workable or JazzHR hand accepted hires over (HIRING-001); background screening goes to a consumer reporting agency under the FCRA; EEO-1 submission is completed in the EEOC's filing system and ACA filing by the payroll provider or broker, with Willow recording each receipt; the LMS owns course delivery. Willow must complete its connected handoffs and record verified outcomes; provider approval, native apps, protected-data agreements and commercial partnerships remain delivery obligations, never reasons to remove clauses. Non-US payroll/EOR, insurance underwriting, investment advice, device-management networks, surveillance and automated employment decisions are outside this HRIS; buyers use licensed providers and dedicated products for them.

**Acceptance evidence:** Walk a US hire/change/exit through the employee, HR, payroll, benefits and IT doors; inspect the system of record, external owner, USD amounts, required approval, receipt and final observed outcome for each step. An unconnected or unacknowledged dependency remains open, and the UI never claims payroll payment, insurance coverage or legal compliance from a checked task.

## Operating limits and sources

Current local admission limits are 10 MB per document upload and 8 MB per
move-in file. They are today's limits, below the OPS-002 reference employer
that the target commits to (50 MB documents, 25 GB migration archives).
Required migrations and large archives must either finish with complete
evidence or refuse with a named limit; no silent truncation. Hosted capacity
and latency bounds are OPS-002 acceptance; real mail receipt, provider account
conformance and accessibility remain separately measured acceptance.

EEO work follows the EEOC's [EEO-1 Component 1 data collection](https://www.eeoc.gov/data/eeo-1-data-collection)
instructions and the OFCCP voluntary disability form; ACA data follows the IRS
[Form 1095-C](https://www.irs.gov/forms-pubs/about-form-1095-c) instructions.
Native signing follows the federal ESIGN Act and state UETA consent and record
rules. Reviewed rule versions are part of EEO-001/002, BENEFITS-003 and SIGN-001.

The mapped ADP compatibility layout follows [ADP’s Time Sheet Import and RUN
guide](https://support.adp.com/adp_payroll/content/hybrid/@runcomplete/doc/pdf/GTS_payroll_guide.pdf),
pages 4–7: payroll-assigned identifiers, version row, eleven ordered columns,
MM/DD/YYYY dates, positive leave hours and one frequency per file. The employer
reconciles identifiers/codes before use; this format is not live certification.

US form delivery work uses current [USCIS I-9 instructions](https://www.uscis.gov/sites/default/files/document/forms/i-9instr.pdf),
[IRS electronic W-4 requirements](https://www.irs.gov/publications/p15t),
[Mitratech Tracker integration and compliance services](https://mitratech.com/products/tracker-i-9-compliance/)
and the applicable state reporting authority. These sources guide implementation;
Willow does not guarantee legal compliance or let an agent replace employer
attestation. Human-reviewed rule/form versions, access agreements and provider
acceptance are part of US-001/002, not implied shipped capabilities.

## Current status per clause

**80 clauses: 21 done / 33 partial / 26 missing.** Evidence paths refer to the inspected current tree; a partial citation proves only the foundation named.

| Clause | Status | Current evidence and remaining gap |
| --- | --- | --- |
| WIL-01 | done | `src/willow/employer.ts`, `src/willow/members.ts`; `tests/willow/flows.mjs` (WIL-01), `tests/willow/regressions.mjs` |
| WIL-02 | done | `src/willow/profile.ts`; `tests/willow/flows.mjs` (WIL-02), `tests/willow/regressions.mjs` |
| WIL-03 | done | `src/willow/access.ts`, `src/willow/profile.ts`, `src/willow/doors.ts`; `tests/willow/flows.mjs` (WIL-03) |
| WIL-04 | done | `src/willow/people.ts`, `src/willow/lifecycle.ts`; `tests/willow/flows.mjs` (WIL-04) |
| WIL-05 | done | `src/willow/lifecycle.ts`; `tests/willow/flows.mjs` (WIL-05) |
| WIL-06 | done | `src/willow/documents.ts`; `tests/willow/flows.mjs` (WIL-06) |
| WIL-07 | done | `src/willow/people.ts`, `src/willow/employment.ts`; `tests/willow/flows.mjs` (WIL-07), `tests/willow/regressions.mjs` |
| WIL-08 | done | `src/willow/leave.ts`; `tests/willow/flows.mjs` (WIL-08) |
| WIL-09 | done | `src/willow/leave.ts`; `tests/willow/flows.mjs` (WIL-09), `tests/willow/regressions.mjs` |
| WIL-10 | done | `src/willow/leave.ts`; `tests/willow/flows.mjs` (WIL-10) |
| WIL-11 | done | `src/willow/payroll.ts`; `tests/willow/flows.mjs` (WIL-11), `tests/willow/regressions.mjs` |
| WIL-12 | done | `src/willow/lifecycle.ts`; `tests/willow/flows.mjs` (WIL-12) |
| WIL-13 | done | `src/willow/lifecycle.ts`; `tests/willow/flows.mjs` (WIL-13), `tests/willow/regressions.mjs` |
| WIL-14 | done | `src/willow/reports.ts`; `tests/willow/flows.mjs` (WIL-14) |
| WIL-15 | done | `src/willow/proposals.ts`; `tests/willow/flows.mjs` (WIL-15) |
| WIL-16 | done | `src/willow/movein/bamboohr.ts`, `src/willow/movein/target.ts`; `tests/willow/flows.mjs` (WIL-16) |
| WIL-17 | done | `scripts/installer/local.mjs`; `tests/willow/restore.mjs`, `tests/willow/restore-access.mjs`, `tests/willow/journey.mjs` |
| WIL-18 | done | `src/willow/notices.ts`; `tests/willow/phase2.mjs` (WIL-18) |
| WIL-19 | done | `src/auth.server.ts`, `src/willow/connections.ts`; `tests/willow/phase2.mjs` (WIL-19) |
| WIL-20 | done | `src/willow/model-drafts.ts`; `tests/willow/phase2.mjs` (WIL-20) |
| WIL-21 | done | `src/willow/payroll-layout.ts`, `src/willow/payroll.ts`; `tests/willow/phase2.mjs` (WIL-21), `tests/willow/regressions.mjs` |
| PEOPLE-001 | missing | No product custom-field schema or public workflow in the audited tree. |
| PEOPLE-002 | partial | `src/willow/profile.ts:88`, `src/willow/employment.ts`; directory/manager relationships exist, org chart and reorganization preview do not. |
| PEOPLE-003 | missing | `src/willow/people.ts:13` holds one private `emergency_contact` value; multi-row tables, custom tables and the asset register are absent. |
| SELF-001 | partial | `src/willow/people.ts:85`, `src/willow/leave.ts:344`, `src/willow/ui/home.ts`; `tests/willow/flows.mjs` (WIL-05/WIL-09). Approval-based profile/dependent changes and unified pending-change tracking are absent. |
| SELF-002 | missing | `src/willow/ui/home.ts` shows the member's own tasks, approvals and leave; announcements, celebrations and shared company folders are absent. |
| MOBILE-001 | partial | `src/willow/ui/leave.ts`; `tests/willow/journey.mjs` exercises responsive requests/approval. Native apps, secure push and full accessibility acceptance are missing. |
| ROLE-001 | partial | `src/willow/actor.ts:10` (fixed permission set), `src/willow/actor.ts:26` (preset bundles), `src/willow/access.ts`, `src/willow/members.ts:27`; `tests/willow/flows.mjs` (WIL-01/WIL-03). Explicit per-member permissions and facet enforcement exist; named/custom levels, field-level rights and edit-with-approval do not. |
| ROLE-002 | partial | `src/willow/actor.ts:41` derives manager scope from effective-dated terms; `tests/willow/flows.mjs` (WIL-07). Location/department/custom-field group scopes and bulk assignment are absent. |
| ROLE-003 | partial | `src/willow/members.ts:45` lets people.manage holders give access per person with no permissions; `tests/willow/flows.mjs` (WIL-01). Default levels, automatic/bulk invitations and delegated level administration are absent. |
| API-001 | missing | `src/willow/http.ts` resolves every JSON request to a signed-in member session (`currentActor`, `src/willow/actor.ts`); no employer-issued keys, OAuth clients or credential audit exist. |
| API-002 | partial | `src/willow/doors.ts`, `src/willow/http.ts`; `tests/willow/flows.mjs` (WIL-03) prove session JSON doors return only permitted facets. Credential access, a published OpenAPI description, cursors and changed-since sync are absent. |
| API-003 | missing | No outbound webhooks in the audited tree. |
| HIRING-001 | missing | No Greenhouse, Lever, Workable or JazzHR handoff in the audited tree. |
| HIRING-002 | missing | No job openings, careers page or Indeed/ZipRecruiter/LinkedIn posting in the audited tree. |
| HIRING-003 | missing | No candidate pipeline, scorecards, interview scheduling or candidate email in the audited tree. |
| HIRING-004 | partial | `src/willow/proposals.ts`, `src/willow/lifecycle.ts`; `tests/willow/flows.mjs` (WIL-15/WIL-13) prove reviewed joiner proposals with missing-field lists and rehire reuse. Candidate and offer sources, signed offers and preboarding hand-off are absent. |
| FLOW-001 | partial | `src/willow/lifecycle.ts`, `src/willow/proposals.ts`; `tests/willow/flows.mjs` (WIL-05/WIL-15). Conditional editor, external dependencies and reviewed publication are incomplete. |
| FLOW-002 | partial | `src/willow/lifecycle.ts:199`, `src/willow/notices.ts`; `tests/willow/phase2.mjs` (WIL-18). Task progress/notices exist; timed reminders, coverage and escalation do not. |
| FLOW-003 | partial | `src/willow/lifecycle.ts` creates dated employee tasks; `tests/willow/flows.mjs` (WIL-05). Dedicated preboarding access, packets and personal-email invitation lifecycle are absent. |
| SIGN-001 | missing | `src/willow/documents.ts` and WIL-06 provide immutable checksummed versions and receipt acknowledgements only; no signature templates, native signing, audit certificate or DocuSign flow. |
| SIGN-002 | missing | No cohort signature requests or signed-documents report in the audited tree; WIL-06 receipts are per person and are not signatures. |
| US-001 | missing | No product statutory-form collection, Mitratech connection or payroll form acknowledgement in the audited tree. |
| US-002 | missing | Existing employer/person records do not implement US legal entities (single or multiple), FEINs, contractor classification workflows or state reporting. |
| EEO-001 | missing | No EEO self-identification fields, restricted EEO facet or applicant self-ID in the audited tree. |
| EEO-002 | missing | No EEO job-category mapping, establishments or EEO-1 report in the audited tree. |
| LEAVE-001 | partial | `src/willow/leave.ts`; `tests/willow/flows.mjs` (WIL-08/WIL-10). Approved policy versions and deterministic accrual exist; scheduling, tier/cap/carryover rules and protected-leave case administration are incomplete. |
| LEAVE-002 | partial | `src/willow/ui/leave.ts`, `src/willow/leave.ts`, `src/willow/notices.ts`; `tests/willow/flows.mjs` (WIL-09), `tests/willow/phase2.mjs` (WIL-18). Team coverage and decision notices exist; shared holidays/calendars, request notices and delegation are incomplete. |
| TIME-001 | partial | `src/willow/employer.ts` working schedules and `src/willow/leave.ts` schedule quotes exist; `tests/willow/flows.mjs` (WIL-01/WIL-09). Clocks, shifts, timesheets and Deputy synchronization are absent. |
| PAYROLL-001 | partial | `src/willow/payroll.ts`, `src/willow/payroll-layout.ts`; `tests/willow/regressions.mjs`, `tests/willow/phase2.mjs` (WIL-21). Snapshot/file mapping and manual acknowledgement exist; live sync and provider read-back do not. |
| PAYROLL-002 | missing | No Gusto product connector or public connection journey in the audited tree. |
| PAYROLL-003 | missing | `src/willow/payroll-layout.ts` implements an ADP RUN file layout only. Neither ADP live connector exists. |
| PAYROLL-004 | missing | No QuickBooks Payroll product connector in the audited tree. |
| BENEFITS-001 | missing | No benefits enrollment, Employee Navigator or carrier workflow in the audited tree. |
| BENEFITS-002 | missing | No benefit deduction mapping or reconciliation reports in the audited tree. |
| BENEFITS-003 | missing | No ACA measurement, offer-of-coverage records or 1095-C data in the audited tree. |
| RETIRE-001 | missing | No Human Interest or Guideline connector or retirement census workflow in the audited tree. |
| IDENTITY-001 | partial | `src/willow/lifecycle.ts:156`; `tests/willow/flows.mjs` (WIL-12/WIL-13). Native access ending and evidence-required manual IT tasks exist; external provider actions/read-back are absent. |
| IDENTITY-002 | partial | `src/auth.server.ts`, `src/modules/operator-auth/identity/oidc/presets.mjs`; `tests/willow/phase2.mjs` (WIL-19) proves Google/generic OIDC only. Entra/Okta-specific journeys, SAML and enterprise session-policy acceptance are incomplete. |
| COMMS-001 | missing | No Slack or Microsoft Teams product integration in the audited tree; WIL-18 is email only. |
| PERFORM-001 | missing | No performance, goals or feedback product module in the audited tree. |
| ENGAGE-001 | missing | No survey/engagement collection, anonymity controls or action-plan module in the audited tree. |
| COMP-001 | partial | `src/willow/people.ts`, `src/willow/reports.ts:42`; `tests/willow/flows.mjs` (WIL-07/WIL-14) cover pay terms/totals. Bands, budgets and planning cycles are absent. |
| LEARN-001 | missing | No training roster, certification or TalentLMS connection in the audited tree. |
| CONNECT-001 | partial | `src/willow/connections.ts`, `src/willow/payroll-layout.ts`; `tests/willow/phase2.mjs` cover optional connection diagnostics and file mappings. General connector execution/health/reconciliation is missing. |
| REPORT-001 | partial | `src/willow/reports.ts`; `tests/willow/flows.mjs` (WIL-14). Fixed scoped summaries/CSV exist; report builder, saved/scheduled reports and broader dashboards are absent. |
| MIGRATE-001 | partial | `src/willow/movein/bamboohr.ts`, `src/willow/movein/target.ts`; `tests/willow/flows.mjs` (WIL-16) proves BambooHR-shaped people/balances/documents. Other named kits and expanded history types are absent. |
| MIGRATE-002 | partial | `src/willow/movein/bamboohr.ts`, `src/willow/movein/target.ts`; `tests/willow/flows.mjs` (WIL-16) cover the employee report, balances and documents ZIP within 8 MB. API source, history and custom tables, signatures, access levels, ATS data and large archives are absent. |
| DATA-001 | partial | `src/willow/reports.ts`, `scripts/installer/local.mjs`; `tests/willow/restore.mjs`, `tests/willow/restore-access.mjs` prove current owner archive. General employee export and future-module/no-replay coverage remain incomplete. |
| DATA-002 | missing | No Willow erasure/retention public action; vendored import-kit erasure helpers alone do not satisfy native record/blob/restore coverage. |
| AUDIT-001 | partial | `src/willow/core.ts`, `src/willow/views.ts`; `tests/willow/flows.mjs` checks business/private-read audit and rollback. Cross-provider history and erasure anonymization are missing. |
| SECURITY-001 | partial | `src/willow/access.ts`, `src/willow/profile.ts`, `src/willow/http.ts`, `src/willow/input.ts`; `tests/willow/flows.mjs` (WIL-03). Existing private core is tested; future modules, complete erasure and wider security/egress coverage are not. |
| OPS-001 | partial | `scripts/installer/local.mjs`, `AGENTS.md`, `SEED-COMMAND-CONTRACT.md`; `tests/willow/journey.mjs`, `tests/willow/restore-access.mjs`. Current local lifecycle is tested; comprehensive upgrade, capacity, accessibility and future-work recovery acceptance remains open. |
| OPS-002 | partial | `src/willow/documents.ts:12` (10 MB) and `src/willow/movein/bamboohr.ts:21` (8 MB) refuse oversize files with `file_size` before writing. Reference-employer bounds, multipart transfer and hosted measurement are absent. |
| AI-001 | partial | `src/willow/proposals.ts:141`; `tests/willow/flows.mjs` (WIL-15) proves scoped, policy-citing context only. Interactive policy answers and associated provider controls are absent. |
| AI-002 | partial | `src/willow/model-drafts.ts`, `src/willow/proposals.ts`; `tests/willow/phase2.mjs` (WIL-20) proves controlled checklist drafts only. Natural-language conditions, cross-system simulation and publication are missing. |
| AGENT-001 | partial | `src/willow/proposals.ts`, `src/willow/payroll.ts`; `tests/willow/flows.mjs` (WIL-15/WIL-11) prove bound human approvals and file handoff. Multi-provider agent execution/read-back is missing. |
| AGENT-002 | partial | `src/willow/leave.ts:19`, `src/willow/proposals.ts`; `tests/willow/flows.mjs` (WIL-08/WIL-15) prove versioned policies and exact change diffs. Cross-person policy simulation and outcome measurement are absent. |
| AGENT-003 | partial | `src/willow/lifecycle.ts:199`, `src/willow/notices.ts`; `tests/willow/phase2.mjs` (WIL-18) proves progress/notices only. Agent detection, chasing, substitutions and external verification are missing. |
| BOUNDARY-001 | partial | `src/willow/payroll.ts`, `src/willow/lifecycle.ts`; `tests/willow/flows.mjs` (WIL-11/WIL-12) prove current provider/manual-work boundaries. Target connected execution and US entity/classification workflows are incomplete. |
