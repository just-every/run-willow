<!-- Generated from CONTRACT.md by contract-docs. Edit CONTRACT.md, then regenerate. -->

# Accept a Willow installation

The primary journey: Import the employer’s people and history, onboard a hire, approve and reconcile a dated change, run time off and payroll handoff, then offboard with verified outcomes.

## Progress

| Tier | Done | Partial | Missing | Total |
| --- | ---: | ---: | ---: | ---: |
| Core | 46 | 55 | 23 | 124 |
| Agent surface | 0 | 0 | 5 | 5 |
| Later | 0 | 0 | 0 | 0 |
| Full target | 46 | 55 | 28 | 129 |

Judged from the code and tests at commit `0497caac7cd702abb9b61e66729853e39f304a6a` (26 October 2026). Field proof register: 24 rows; 0 passed, 0 failed, 24 not run.

## Core

### Retained foundation

#### WIL-01 — Employer setup and explicit membership

Core · published · **done** · Cites BASE-ACCESS-004, BASE-INPUT-001, BASE-ROLE-001 · Rules D-1

**Requirement.** The employer record holds its name, time zone, country and currency, locations, departments, immutable schedules and private document categories. Owner-set direct grants remain explicit; managing a person grants none. Named levels and delegated administration add only their stated rights, and reactivation restores no removed grant.

**Acceptance.**
1. Configure an employer and its locations, departments, schedules and categories, invite a member and assign explicit rights.
2. End access, then grant access again: a fresh sign-in is required and no removed permission returns.

**Evidence.** `tests/willow/flows.mjs` — “WIL-01”
**Gap.** None.

#### WIL-02 — Visibility preview without privilege escalation

Core · published · **done** · Cites BASE-ACCESS-004, BASE-INPUT-001, BASE-ROLE-001

**Requirement.** A member with people.manage previews exactly what another member would receive about a person, by facet, computed by the same projection as that member's own requests; ended sign-ins and records the selected member cannot enter are refused before projection; values the previewer cannot read are reported as withheld, never shown.

**Acceptance.**
1. As HR, preview an employee as a manager, employee and ended member; compare the actual member response and prove values withheld from the previewer never appear.

**Evidence.** `tests/willow/flows.mjs` — “WIL-02”; `tests/willow/regressions.mjs` — “records-people / regression-transactions: ended-member-preview and former-record-preview”
**Gap.** None.

#### WIL-03 — Private records through every public door

Core · published · **done** · Cites BASE-ACCESS-004, BASE-INPUT-001, BASE-ROLE-001

**Requirement.** A member without the grant cannot read private contact details, compensation, confidential absence reasons, end-of-employment reasons or documents in a restricted category through any door: every JSON view, page, document download, payroll CSV, summary and its CSV, visibility preview and agent context. Managers see their reports' work details and leave dates only. Each holder does read what they are entitled to, and reads of someone else's private details, pay, reasons and documents are audited.

**Acceptance.**
1. As owner, HR, payroll, manager and employee, crawl every registered API/page/download, CSV, preview and agent-context door with planted private values; only entitled readers receive each facet and privileged reads are audited.

**Evidence.** `tests/willow/flows.mjs` — “WIL-03”
**Gap.** None.

#### WIL-04 — People and separate employment periods

Core · published · **partial** · Cites BASE-ACCESS-004, BASE-INPUT-001, BASE-ROLE-001 · Rules D-1, D-5

**Requirement.** A person is separate from their employment periods. A joiner creates the person, an employment period with its type and payroll-provider identifier, and the first effective-dated terms (title, department, location, manager, schedule, pay). Work email and employee number are unique; a person's periods never overlap.

**Acceptance.**
1. Create a joiner through the form or JSON action, inspect their person and first period, then attempt duplicate identifiers and overlapping periods; refuse invalid writes without partial records.

**Evidence.** `tests/willow/flows.mjs` — “WIL-04”
**Gap.** Missing a journey that tries a duplicate employee number and reads unchanged people/periods after refusal; WIL-04 exercises duplicate email and overlapping periods.

#### WIL-05 — Versioned joiner, mover and leaver cases

Core · published · **done** · Cites BASE-ACCESS-004, BASE-INPUT-001, BASE-ROLE-001 · Rules D-1

**Requirement.** Joiner, mover and leaver cases start from versioned templates: each task goes to HR, the manager in force on the case date, IT, payroll or the employee, due relative to that date. A new template version leaves open cases on their version. Only the task's assignee completes it; account and device tasks need evidence. A case cannot complete while a task is open or required information is missing.

**Acceptance.**
1. Start a case, publish a new template, complete tasks as the right and wrong assignees, and attempt closure with missing evidence; the original template version and incomplete gate remain.

**Evidence.** `tests/willow/flows.mjs` — “WIL-05”
**Gap.** None.

#### WIL-06 — Private immutable documents and receipt acknowledgments

Core · published · **done** · Cites BASE-ACCESS-004, BASE-INPUT-001, BASE-ROLE-001

**Requirement.** Private documents carry a category that decides whether the person and their manager may read them; holders of documents.private read all. Versions are immutable and numbered; bytes are checksummed and verified on every read; downloads are audited. A person acknowledges receipt of the latest version only, recorded as a receipt and labeled as not a signature.

**Acceptance.**
1. Upload two private document versions, download as permitted and forbidden members, verify checksums and audit, and acknowledge the latest version; an older receipt cannot stand in for the latest or a signature.

**Evidence.** `tests/willow/flows.mjs` — “WIL-06”
**Gap.** None.

#### WIL-07 — Effective-dated terms and compensation

Core · published · **done** · Cites BASE-ACCESS-004, BASE-INPUT-001, BASE-ROLE-001 · Rules D-1

**Requirement.** A change of terms is a new complete version effective from a date: past, current and future versions all remain, the version in force is chosen by date, and a future or past version can be canceled (kept as canceled) but never edited. The active employment period wins on the as-of date (inclusive boundaries), otherwise the first upcoming period, otherwise former; directory, profile, manager scope and reports use that same selection. Setting pay needs pay.read.

**Acceptance.**
1. Schedule past and future changes, read profiles/directory/reports as of each boundary, cancel a version and inspect history; immutable terms and consistent manager scope survive.

**Evidence.** `tests/willow/flows.mjs` — “WIL-07”; `tests/willow/regressions.mjs` — “records-people / regression-transactions: effective-date selection”
**Gap.** None.

#### WIL-08 — Approved leave policies and opening balances

Core · published · **done** · Cites BASE-ACCESS-004, BASE-INPUT-001, BASE-ROLE-001 · Rules D-1

**Requirement.** Leave policy versions are written by leave managers and approved by the owner before use. A leave account opens against an approved version with a proposed opening balance at a stated cutover date; nothing can be requested until a leave manager signs it off, which writes the account's opening ledger entry. Accrual is posted deterministically (accrual weeks × scheduled weekly hours, pro rata per day) and only once per day range.

**Acceptance.**
1. Approve a policy, open an account, refuse requests before balance sign-off, then accrue twice for the same interval; the opening entry and accrual post once.

**Evidence.** `tests/willow/flows.mjs` — “WIL-08”
**Gap.** None.

#### WIL-09 — Schedule-based requests and routed approval

Core · published · **done** · Cites BASE-ACCESS-004, BASE-INPUT-001, BASE-ROLE-001 · Rules D-1

**Requirement.** A leave request is calculated in hours from the working schedule in force on each day, shows the balance after it and who else in the team is away (names, dates and status only), and routes to the person's manager in force on the first day (or to leave managers). The stored routed approver can read and decide that request even before their management terms start, without gaining general person or account access. The manager decides without seeing the confidential reason; nobody decides their own request.

**Acceptance.**
1. Request leave over a schedule/manager change, inspect team coverage and the quote, then decide as the routed approver; self-approval and confidential-reason disclosure are refused.

**Evidence.** `tests/willow/flows.mjs` — “WIL-09”; `tests/willow/regressions.mjs` — “records-people / regression-transactions: routed approver”
**Gap.** None.

#### WIL-10 — Atomic append-only leave ledger

Core · published · **done** · Cites BASE-ACCESS-004, BASE-INPUT-001, BASE-ROLE-001

**Requirement.** The leave ledger is append-only. A request reserves its hours in the same atomic step that checks the balance, so concurrent requests cannot spend the same hours; concurrent decisions produce exactly one. Canceling approved leave writes one reversal of its use; correcting it reverses the old use and uses the corrected dates in one step, against the balance.

**Acceptance.**
1. Submit competing requests and decisions, cancel approved leave and correct dates; one spend/decision and exactly one reversal remain in the public ledger.

**Evidence.** `tests/willow/flows.mjs` — “WIL-10”
**Gap.** None.

#### WIL-11 — Reviewed payroll change batches

Core · published · **done** · Cites BASE-ACCESS-004, BASE-INPUT-001, BASE-ROLE-001 · Rules D-1, D-5

**Requirement.** A payroll change batch for a pay period gathers every start, end, terms change (with pay) and approved leave (in hours) effective by the period end and not yet handed off, keyed by the provider identifier; changes without one are listed as exceptions. All lines, exceptions and silent claims are calculated solely from one atomic source snapshot, revalidated in the draft transaction. Export atomically revalidates the reviewed source values and claims (including silent cancellation pairs), refusing stale drafts and older drafts without this calculation guarantee before any handoff; an unchanged draft hands each change off exactly once. A fresh draft nets pre-handoff cancellations to nothing; leave canceled after handoff becomes a reversal line in the next batch; the provider's acknowledgment is recorded. Needs payroll.handoff and pay.read. Payroll calculation, tax and payment stay with the provider.

**Acceptance.**
1. Preview and export a batch; change source data before export and prove refusal, race competing exports, cancel before and after handoff, then record acknowledgment; claims and frozen lines stay consistent.

**Evidence.** `tests/willow/flows.mjs` — “WIL-11”; `tests/willow/regressions.mjs` — “records-people / regression-transactions: payroll source and competing export”
**Gap.** None.

#### WIL-12 — Evidence-gated departure and native access termination

Core · published · **done** · Cites BASE-ACCESS-004, BASE-INPUT-001, BASE-ROLE-001 · Rules D-1

**Requirement.** A leaver records the period's end date and a private reason and opens a leaver case. External account and device tasks stay open until their assignee records evidence; while any is open the departure cannot be marked complete. The case's "end access" task deactivates the person's sign-in and clears their permissions.

**Acceptance.**
1. End a period, inspect the leaver case, try closure before IT evidence, and finish the end-access task; sign-in and permissions end while incomplete external work stays visible.

**Evidence.** `tests/willow/flows.mjs` — “WIL-12”
**Gap.** None.

#### WIL-13 — Rehire without restored authority

Core · published · **done** · Cites BASE-ACCESS-004, BASE-INPUT-001, BASE-ROLE-001 · Rules D-1

**Requirement.** A rehire is a new employment period for the same person; earlier periods, terms and history are unchanged, and ended access is not reactivated or its permissions restored.

**Acceptance.**
1. Rehire a former person into a new period, inspect prior history and sign-in; the person is reused and prior grants remain ended.

**Evidence.** `tests/willow/flows.mjs` — “WIL-13”
**Gap.** None.

#### WIL-14 — Scoped workforce summaries

Core · published · **partial** · Cites BASE-ACCESS-004, BASE-INPUT-001, BASE-ROLE-001 · Rules D-1

**Requirement.** Summaries (headcount by department and location, starters and leavers, leave taken, open lifecycle work) state their filters and calculation; reports.read covers the organization, a manager without it sees their team, others are refused. Compensation totals appear only for members holding pay.read too; the CSV matches the page.

**Acceptance.**
1. Open summaries and their CSV as HR, manager and employee, with and without pay.read; counts, filters, as-of rules and withheld compensation match.

**Evidence.** `tests/willow/flows.mjs` — “WIL-14”
**Gap.** Missing a journey that reads filters, calculation and non-headcount summary outcomes and reconciles page with CSV; WIL-14 reads headcount, scope and withheld compensation only.

#### WIL-15 — Version-bound agent plans and cited context

Core · published · **partial** · Cites BASE-ACCESS-004, BASE-AGENT-003, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-008, BASE-DATA-004, BASE-INPUT-001, BASE-ROLE-001 · Rules D-2

**Requirement.** A joiner or mover plan shows missing information, source versions and the exact proposed diff. Execution binds the unchanged plan and its receipt atomically. Join/move writes carry standard, adding money for pay changes, access for authority changes and sensitive for regulated fields; the company policy decides their execution. The context names withheld facets and the leave-policy versions behind its figures.

**Acceptance.**
1. Prepare a joiner and mover through the JSON door and inspect missing fields, exact diff and policy citations.
2. Under the held company policy, HR approves the exact saved plan; one bound receipt and one employment change result.
3. Change a source before execution: the stale plan changes nothing; an unauthorized preparer cannot create it.

**Evidence.** `tests/willow/flows.mjs` — “WIL-15”
**Gap.** Missing the joiner/mover journey under a company risk policy; WIL-15 proves exact-plan approval, stale refusal, receipt and restricted context under its fixed native review path.

#### WIL-16 — Reviewed BambooHR move-in with guarded undo

Core · published · **done** · Cites BASE-ACCESS-004, BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-INPUT-001, BASE-ROLE-001

**Requirement.** BambooHR move-in kit: an employee report (documented field names, CSV or XLSX), a time-off balance CSV and a documents ZIP with a manifest. Only the signed-in owner or a valid action-bound Business grant imports; HR can still read legacy import summaries without originals. The page and clients use one Base import door, with Business disabled until the owner opts in and permanent key revocations retained. Uploads and plans are private custody; the preview changes no native people or employment records and reports active, upcoming and former employment, repeated ids, missing hire dates, conflicts with existing Willow people, inactive rows without dates, balances in days, unmapped time-off types, explicit unknowns and gaps. Apply is bound to the reviewed fingerprint through Base's single upload/plan/apply/reconcile/undo door with a journal and retained originals; owner history and undo include locally and Business-approved jobs, even with Business disabled; documents keep their private category; balances arrive unsigned. Re-importing the same export adds nothing; undo removes an untouched import completely and is refused, naming the records, once anything was edited or built on. Catch-up previews and applies changes only to untouched imported records; undoing it restores the baseline before that baseline can be undone.

**Acceptance.**
1. Preview CSV/XLSX people, balance CSV and document ZIP, resolve conflicts, apply, repeat and undo; originals and categories survive, balances require sign-off, and edited imports cannot be undone.

**Evidence.** `tests/willow/import-door.mjs` — “exerciseImportDoor”
**Gap.** None.

#### WIL-17 — Complete current-edition archive and restored sign-in

Core · published · **done** · Cites BASE-ACCESS-002, BASE-ACCESS-004, BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-INPUT-001, BASE-ROLE-001, BASE-SIGNIN-001

**Requirement.** Willow archives preserve member/person identities, explicit grants, HR administration, leave-ledger history and document bytes. After normal setup, active and invited members regain ordinary sign-in while ended members remain denied. Connection consent, selected models and Business import enablement are non-portable, including in older enabled archives; the import report lists actual safe replacements and flags reauthorization. Consumed nonces, revoked keys, approvals and custody remain intact without changing the source backup.

**Acceptance.**
1. Export a populated installation, refuse corrupt/nonempty restores, import into an empty fresh clone and export again; compare all portable rows and document bytes, then use new ordinary email links for active and ended members and refuse source sessions/tokens.

**Evidence.** `tests/willow/restore-access.mjs` — “restore-access: ordinary identities, roles, private/pay/document/leave boundaries and HR invitation work”; `tests/willow/restore.mjs` — “archive restore”
**Gap.** None.

#### WIL-18 — Optional safe business-event email

Core · published · **partial** · Cites BASE-ACCESS-004, BASE-INPUT-001, BASE-MAIL-001, BASE-OPS-004, BASE-ROLE-001

**Requirement.** Email notices are off until the owner enables them. Task assignment/completion, leave decisions and exception-free payroll readiness use Base mail or the local outbox. Only currently active, authorized recipients receive fixed copy and authenticated links; no names, pay, private documents, confidential absence, titles, systems or evidence enter notices.  External work still requires evidence.

**Acceptance.**
1. Enable notices, assign/complete a task, decide leave and prepare payroll; inspect permitted recipients and fixed-copy links, revoke a recipient before dispatch and inject mail failure; business work remains committed and failures visible.

**Evidence.** `tests/willow/phase2.mjs` — “WIL-18 safe notices and independent manual completion”
**Gap.** Missing a journey that withdraws an authorized recipient after notice preparation and before dispatch; the cited safe-notice journey tests ended recipients at creation and visible mail failures.

#### WIL-19 — Optional OIDC with explicit identity linking

Core · published · **done** · Cites BASE-ACCESS-002, BASE-ACCESS-004, BASE-INPUT-001, BASE-ROLE-001, BASE-SECRET-001, BASE-SIGNIN-001 · Rules D-5

**Requirement.** OIDC is optional, configured only through runtime bindings and explicitly linked/relinked/unlinked by the owner using Base's fresh local email proof. Existing active Willow members retain the same IDs, person links and grants through either sign-in route; token roles/groups assign nothing. Bad configuration, provider failure or unlinking leaves email sign-in available. Connections reports refused token exchanges as unavailable even when discovery succeeds, and clears that observation after a successful token endpoint response. Secrets and transient identity state are excluded from owner archives and errors.

**Acceptance.**
1. Link a Google OIDC identity with fresh local proof, sign in, unlink and exercise bad configuration/token exchange; member IDs and grants remain stable, provider roles grant nothing and ordinary email sign-in still works.

**Evidence.** `tests/willow/phase2.mjs` — “WIL-19 optional OIDC preserves identity, grants and email sign-in”
**Gap.** None.

#### WIL-20 — Structural model checklist drafts

Core · published · **partial** · Cites BASE-ACCESS-004, BASE-AGENT-003, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-008, BASE-DATA-004, BASE-INPUT-001, BASE-ROLE-001 · Rules D-2, D-5

**Requirement.** An employer-selected model drafts checklist structure from structural inputs alone; employee records, free text, names, pay, documents, absence reasons and evidence never cross this model boundary. Draft selection carries standard and template publication commitment under the company policy. Accepting a draft creates no employment or task execution.

**Acceptance.**
1. With model calls disabled, request a draft and observe no provider request.
2. With the selected model enabled, inspect the complete structural request; accept and decline a valid cited draft under the held policy.
3. Refuse uncited, stale and failed output without creating employment work.

**Evidence.** `tests/willow/phase2.mjs` — “WIL-20 cited structured model proposals never execute employment changes”
**Gap.** Missing model draft selection/publication through company risk policy; the cited structural-model journey proves payload minimization, citation and stale/failed output under fixed native review.

#### WIL-21 — Frozen mapped payroll files and ADP RUN compatibility

Core · published · **done** · Cites BASE-ACCESS-004, BASE-INPUT-001, BASE-ROLE-001 · Rules D-5

**Requirement.** The owner explicitly maps every generic CSV source column to a target heading and order, or selects ADP RUN Time Sheet Import's payroll-assigned identifier format with company, frequency, rate, check, department and policy earnings mappings. Missing source identifiers/mappings block previews; ADP hours cannot silently consume starts, ends, terms or reversals. The exact file is reviewed before export. Source and layout fences invalidate stale previews; export atomically freezes the reviewed bytes with the existing change claims, including silent pairs, and later mapping edits never change downloaded bytes. Payroll calculation stays with the provider; this compatibility handoff is one path within the connected payroll job in PAYROLL-001–005, and does not establish provider-account reconciliation.

**Acceptance.**
1. Map generic columns and ADP RUN company/frequency/earnings codes, preview, mutate source/layout and prove refusal, then export unchanged input and re-download after a mapping edit; exact reviewed bytes survive and unsupported ADP changes are refused.

**Evidence.** `tests/willow/phase2.mjs` — “WIL-21 explicit mapped previews freeze exact files and refuse unsupported changes”; `tests/willow/regressions.mjs` — “records-people / regression-transactions: mapped payroll races”
**Gap.** None.

### People and self-service

#### PEOPLE-001 — Typed custom employee fields

Core · target · **done** · Cites BASE-INPUT-001, BASE-ROLE-001 · Rules D-1

**Requirement.** HR defines typed general, HR/private and payroll fields with requiredness, immutable classification, effective-dated definitions and values. General self/manager visibility never exposes restricted values, and custom fields stay out of the directory. Historical reads retain definition meaning and use current field authority. Detailed type and version rules are in [record rules](docs/contract/record-rules.md#people-001--typed-custom-employee-fields).

**Acceptance.**
1. Create each field class and reject invalid types, bounds, dates and missing required values without partial records.
2. Append dated definitions, values, corrections, same-date versions and retirement; reconstruct each boundary without changing sensitivity.
3. Change visibility and revoke rights; compare current and historical profiles, previews, context, reports and CSV/XLSX/ZIP projections.

**Evidence.** `tests/willow/custom-fields.mjs` — “PEOPLE-001 typed fields”
**Gap.** None.

#### PEOPLE-002 — Directory and navigable organizational chart

Core · target · **done** · Cites BASE-INPUT-001, BASE-ROLE-001 · Rules D-1

**Requirement.** Employees browse and search a scoped directory by name, location, department and role and navigate a manager/report org chart. Current, future and former relationships use the same effective-date rules as the profile. HR previews reorganizations, handles vacant managers and rejects cycles without exposing pay or private contact details.

**Acceptance.**
1. Open directory and org chart at desktop and phone widths; navigate a realistic multi-level team, search a location, inspect a future manager change and try a cycle.
2. Compare chart, directory and profile on the effective date.
3. Record a manager change effective today and open the chart that day without any chart edit: it shows the new reporting line, and its people count equals the directory's active count for the same date.

**Evidence.** `tests/willow/people.mjs` — “PEOPLE-002”
**Gap.** None.

#### PEOPLE-003 — Multi-row record tables and company assets

Core · target · **done** · Cites BASE-INPUT-001, BASE-ROLE-001 · Rules D-1

**Requirement.** Employee records hold dated emergency contacts with one primary contact, education, certifications and assets, plus HR-defined typed custom tables. Private contacts and restricted tables keep their distinct field rights; general tables use HR-selected self/manager visibility. Immutable dated correction and removal preserve history. Table imports, reports and exports share these definitions and current projections.

**Acceptance.**
1. Create multiple contacts, education and a typed custom table; reject two primary contacts, invalid values and undefined imported tables.
2. Append dated corrections and removal, then compare earlier and current histories through employee, manager, HR, payroll, preview, context, report and file doors.
3. Export a table and import it into a fresh employer; repeat and undo without duplicating or losing rows.

**Evidence.** `tests/willow/record-tables.mjs` — “PEOPLE-003 record tables”
**Gap.** None.

#### PEOPLE-004 — Date alerts on employee dates

Core · target · **partial** · Cites BASE-INPUT-001, BASE-ROLE-001 · Rules D-1

**Requirement.** HR configures alerts on standard, custom and table dates, including visa/work authorization, probation, certification, contract end, anniversaries, statutory I-9 reverification and benefits eligibility. Alerts choose lead times, current recipients and in-app, email, Slack or Teams channels. They show a permitted upcoming date with owner and due date and may create dated review work. Date changes, retirement and employment end stop obsolete alerts.

**Acceptance.**
1. Configure 30- and 7-day alerts on a restricted visa-expiry custom field to HR and a probation-end alert to the manager and HR that opens a review task, then advance the scheduler across every lead time and restart it.
2. HR receives each visa alert once; the manager receives only the probation alert and its task; a manager without access to the visa field receives nothing and no notice contains its value.
3. Move the probation date and end another person's employment; their earlier alerts no longer fire.
4. Record an I-9 reverification date (US-001) for a worker whose work authorization expires: HR receives its alert at each lead time, the upcoming-dates list shows it with its owner and due date, and a manager without access to the field sees neither.
5. Retire an alert, move a date and withdraw recipient access; earlier and future alert reads retain current field visibility.

**Evidence.** `tests/willow/date-alerts.mjs` — “PEOPLE-004 date alerts”
**Gap.** Missing native statutory I-9 and benefits-eligibility alert journeys and Slack/Teams delivery; the cited journey proves custom-date I-9/visa, probation and certification alerts, restart, visibility and fixed email.

#### PEOPLE-005 — Any person's record as of a chosen date

Core · target · **partial** · Cites BASE-INPUT-001, BASE-ROLE-001 · Rules D-1

**Requirement.** A member opens a person's record and picks any past or future date to see that person as they were, or are scheduled to be, on that day: the employment period, job title, department, location, manager, working schedule and pay in force, the document versions filed by then, leave balances from the ledger up to that date and the lifecycle work open on it, each linked to the version history behind it. “Documents filed by then” and “lifecycle work open on it” use recorded timestamps in the employer’s time zone: only documents filed by the end of the selected day appear, with full version history still linked, and case/task completion is reconstructed as it stood on that day. Leave balances filter the ledger by effective date, rather than the timestamp when an entry was recorded. Record visibility always uses the reader’s current authority. The view uses the WIL-07 selection rules (inclusive boundaries, canceled versions never in force, scheduled versions shown as scheduled) and the reader's current access (WIL-03, ROLE-001): choosing a date never reveals pay, private contact details, reasons or documents the reader cannot read today, and a privileged as-of read is audited like a current one. The page, the JSON door and the agent context accept the same as-of date and return the same values.

**Acceptance.**
1. Give a person a pay change and a manager change last year, a canceled title change and a transfer scheduled next month, file a document and take leave between them.
2. As HR and as their manager, open the record through the page and the record JSON door as of a day before, between and after each boundary: each view shows exactly the period, terms, documents and balance in force that day, the canceled version is never in force, the scheduled transfer appears only on and after its date, the manager sees no pay on any date and HR's as-of pay read is in the audit.
3. At an employer-time-zone day boundary, file documents and complete a case and task before and after the selected day; see only the documents filed by that day, linked full version history, and the case/task completion state on that day.
4. Record a ledger entry later with an earlier effective date and see the as-of balance include it by effective date.
5. Revoke a reader’s authority and verify every historical view immediately respects their current authority.

**Evidence.** `tests/willow/people.mjs` — “PEOPLE-005”
**Gap.** Missing a journey that crosses an employer-time-zone recorded-time boundary and then revokes the reader before historical reads; PEOPLE-005 proves dated terms, same-day documents/work, ledger dates and future-manager refusal.

#### SELF-001 — Employee and manager self-service portal

Core · target · **partial** · Cites BASE-INPUT-001, BASE-ROLE-001 · Rules D-1

**Requirement.** Employees use one portal for profile, documents, balances, PTO, assigned tasks and pending changes; managers use permitted team work and coverage. Personal changes follow the field mode and immutable before/after queue, never self-grant employment or pay authority. A distinct authorized reviewer decides a proposal; source changes require resubmission. Name/dependent changes retain history and metadata-only downstream payroll and benefits reconciliation.

**Acceptance.**
1. Edit an immediate contact field and submit name/dependent proposals; read before/after, owner, deadline and pending state.
2. Accept one and reject another; read the native revision, immutable decision and history, and refuse self-decision, stale sources and replay.
3. Resolve the metadata-only payroll and benefits follow-up and read its reference as the subject; no dependent values enter the payroll queue.
4. As manager, clear permitted team work and inspect the employee projection without private dependent proposals.

**Evidence.** `tests/willow/self-service.mjs` — “SELF-001 portal, decisions, team work and reconciliation”
**Gap.** Missing the benefits exception/reconciliation journey from an approved name/dependent change; the cited portal journey proves native decisions and metadata-only payroll follow-up.

#### SELF-002 — Company home: announcements, celebrations and shared files

Core · target · **partial** · Cites BASE-INPUT-001, BASE-ROLE-001

**Requirement.** Member home carries targeted, scheduled and pinned announcements with version-bound read acknowledgments, shared versioned folders, upcoming team time off and new hires. Subjects alone choose birthday and anniversary celebrations, initially off; withdrawal removes them immediately. Birthday publication shows month/day only. Shared files can request signatures, and mobile and collaboration channels carry the same targeting and consent.

**Acceptance.**
1. Publish one company-wide and one location-targeted announcement, upload a handbook to a shared folder and open home as employees inside and outside that location; each sees only their targeted content and files.
2. Opt one person into birthday celebrations and another out; only the opted-in month and day appear and no birth year is exposed through any door.
3. Read old file links after audience change or retirement; inaccessible files remain withheld.
4. Publish a required acknowledgment and see its work close only for the exact current version.
5. Request a signature on a shared file and read matching announcements, files and celebrations through the native apps and Slack/Teams with the same audience.

**Evidence.** `tests/willow/company-home.mjs` — “SELF-002 current company delivery, immutable files, receipts and self-owned consent”
**Gap.** Missing native-app and Slack/Teams company-home delivery with the same audience and consent; the cited home journey proves current web delivery, version receipts, files and self-only celebrations.

#### MOBILE-001 — Mobile work and accessible companion apps

Core · target · **partial** · Cites BASE-ACCESSIBILITY-001, BASE-INPUT-001, BASE-ROLE-001 · Register R-19, R-22

**Requirement.** The responsive portal and native iOS/Android apps support permitted profile updates, document reading/signing, PTO and tasks, hourly clock/breaks and manager timesheet/leave decisions. Locked-device push exposes no private employee data. Reconnected drafts use current authority and source revisions. Company-home audiences/celebration consent, review releases and anonymous-survey boundaries follow their native doors. Accessibility uses Base’s single bar.

**Acceptance.**
1. Use real employee/manager accounts for request, approval, task completion, document access and an hourly worker's clock-in, break and clock-out at 1440 and 390 pixels and on iOS/Android; interrupt a draft, revoke access, reconnect and prove no stale submission or private push content.
2. A manager approves a pending PTO request from the push notice or the home list with one confirming action and no further form, while WIL-09's routed-approver and self-approval rules still hold.
3. Before shipping, MOBILE-001 preserves ENGAGE-001 named/anonymous result grants, HR-only anonymous comments and recipient-only anonymous participation/reminder visibility in its new doors or channels.
4. Before adding levels, app doors or channels, MOBILE-001 preserves PERFORM-001's own-input/HR-note boundaries, explicit immutable releases, named audited succession withholding and retained former-manager releases, including current-authority exports and reminders.

**Evidence.** `tests/willow/journey.mjs` — “journey public-door journey”
**Gap.** Native iOS/Android apps, secure push, mobile clock-in and full accessibility acceptance.

#### LOCALE-001 — Employee-facing languages, starting with Spanish

Core · target · **missing** · Cites BASE-INPUT-001, BASE-ROLE-001

**Requirement.** Each member and candidate chooses their own display language. Willow ships English and US Spanish for every employee- and candidate-facing screen: self-service and company home (SELF-001/002), mobile apps and push notices (MOBILE-001), preboarding packets (FLOW-003), native signing screens and ESIGN consent (SIGN-001/002), careers pages and application forms (HIRING-002), the time clock (TIME-001), EEO self-identification (EEO-001/003), surveys (ENGAGE-001) and fixed notices and reminders (WIL-18, FLOW-002). Administrators add translations for custom field labels and options (PEOPLE-001), announcements, task and workflow templates, signature-template cover text and survey questions; untranslated employer content shows in its original language, marked as such, and is never machine-translated silently. Official forms appear in the versions their agencies publish (such as the IRS's Spanish Form W-4(SP)); where an agency restricts a translation (USCIS permits the Spanish I-9 only in Puerto Rico), the official English form is completed with the Spanish version offered for reference. A signature records the language shown at signing. Stored values are language-independent; reports and exports translate labels only. Further languages are added from translation files without code changes.

**Acceptance.**
1. As an hourly employee, switch to Spanish and complete a PTO request, a preboarding packet with a native signature and EEO self-ID, and a phone clock-in; every screen, validation message, consent text and notice appears in Spanish and the signed copy's certificate records Spanish.
2. As HR, translate a custom field label and an announcement; Spanish readers see the translations, an untranslated custom field is marked untranslated, and the employee's stored values and report totals are identical in English and Spanish.

**Evidence.** `src/willow/ui/html.ts` — “html public-door journey”
**Gap.** No delivered public-door journey for employee-facing languages, starting with spanish. The full field modes, named integrations and statutory outcomes remain required as specified.

#### PEOPLE-006 — Asset return evidence

Core · target · **partial** · From PEOPLE-003 · Cites BASE-INPUT-001, BASE-ROLE-001 · Rules D-1

**Requirement.** Assets retain serial, assignment and return dates and condition. A leaver case creates one IT return task per unreturned asset, due on the last day. Closing that task requires return evidence, date and condition and appends the asset version atomically; workflow upgrades preserve the task.

**Acceptance.**
1. Assign a laptop, start a leaver case and read its evidence-required return task.
2. Refuse closure without return evidence; complete it with date and condition and read the returned asset version.
3. Refuse a return before assignment and retain completed evidence through a case upgrade.

**Evidence.** `tests/willow/record-tables.mjs` — “PEOPLE-003 record tables”
**Gap.** Missing an asset-return journey through a deliberate case upgrade retaining the return task; the cited table journey proves evidence/date/condition refusal and atomic returned history.

#### PEOPLE-007 — Certification renewal work

Core · target · **partial** · From PEOPLE-003 · Cites BASE-INPUT-001, BASE-ROLE-001 · Rules D-1, D-5

**Requirement.** Certifications retain expiry and version history. For current or upcoming employment, a certification nearing expiry or already expired creates HR-owned renewal work due on expiry; renewal or removal closes that work. TalentLMS completions reuse these records and renewal work.

**Acceptance.**
1. Record near-expiry and expired certifications and read their HR-owned renewal work.
2. Renew or remove a version and see its work close without losing history.
3. For a provider completion, read the same certification record and renewed deadline through the training door.

**Evidence.** `tests/willow/record-tables.mjs` — “PEOPLE-003 record tables”
**Gap.** Missing a provider completion journey writing certification and renewing native work; the cited table journey proves near-expiry/expired native records and manual renewal.

#### PEOPLE-008 — Custom-field import and payroll mappings

Core · target · **partial** · From PEOPLE-001 · Cites BASE-INPUT-001, BASE-ROLE-001 · Rules D-4, D-1, D-5

**Requirement.** BambooHR move-in and generic payroll mappings use the shared custom-field definitions and dated values. The period-end values and definitions freeze with the reviewed payroll batch; ADP RUN keeps its fixed schema. Every additional connector or source repeats these field rules at its own door.

**Acceptance.**
1. Import general and restricted custom values, repeat and undo an untouched import; after editing a value, undo refuses without losing that edit.
2. Map a permitted general field into a generic payroll file, change the source or mapping and observe renewed review; read the frozen file with current rights.
3. Confirm ADP RUN retains its fixed schema, and exercise these rules for each additional mapped provider or source.

**Evidence.** `tests/willow/custom-fields.mjs` — “PEOPLE-001 typed fields”
**Gap.** Missing the shared-field journey through each additional connector/source; the cited custom-field journey proves BambooHR repeat/undo and generic/ADP payroll-file mappings only.

### Access levels and the open API

#### ROLE-001 — Named access levels with field-level rights

Core · target · **done** · Cites BASE-ACCESS-004, BASE-INPUT-001, BASE-ROLE-001

**Requirement.** Named built-in and custom levels set personal-field modes separately about themselves and other people. A member holds the union of independent direct, self, manager and level sources; a missing mode adds no right and denies no independent source. Migration preserves each member’s exact existing rights and provenance. A reviewed level change shows every affected member’s before/after rights and applies once. Detailed field and migration rules are in [record rules](docs/contract/record-rules.md#role-001--named-access-levels-with-field-level-rights).

**Acceptance.**
1. Create and assign a custom personal-field level and read the member impact before applying it.
2. Migrate direct grants into individually named levels and compare every member’s before/after report: no right widens.
3. Change a level and inspect the same session and audit; the reviewed changed rights appear and reuse of the review is refused.

**Evidence.** `tests/willow/levels.mjs` — “ROLE-001 named-level slice”; `tests/willow/levels-migration.mjs` — “migrationProof”
**Gap.** None.

#### ROLE-002 — Group-scoped levels and bulk assignment

Core · target · **done** · Cites BASE-ACCESS-004, BASE-INPUT-001, BASE-ROLE-001 · Rules D-1

**Requirement.** Each level’s about-others rights apply to everyone, direct reports, direct/indirect reports or a structural group using location, department, division, employment type, legal entity or a general custom field. Scope limits only that source. Membership follows current dated terms, so a transfer changes reach without editing the level and historical viewing restores no access. Scope combinations never widen another field source. Group and division/entity rules are in [record rules](docs/contract/record-rules.md#role-002--group-scoped-levels-and-bulk-assignment).

**Acceptance.**
1. Review a scoped level and inspect only its people and fields through record, task, decision, report and file doors.
2. Combine independently scoped levels and confirm neither scope grants the other’s fields; employer-wide settings remain outside scoped rights.
3. Transfer a person across the boundary and read both sides of the effective date; a historical view grants no old access.

**Evidence.** `tests/willow/levels-scope.mjs` — “scopeProof and transferProof”; `tests/willow/levels-scope-kinds.mjs` — “scopeKindsProof”; `tests/willow/levels-scope-decisions.mjs` — “decisionProof”
**Gap.** None.

#### ROLE-003 — Default self-service access and delegated access administration

Core · target · **partial** · Cites BASE-ACCESS-004, BASE-INPUT-001, BASE-ROLE-001

**Requirement.** The owner chooses the default level and invitation timing for hires, joiners, rehires and imported people. Invitations use the personal mailbox before start and work mailbox on start, support explicit bulk/deferred import, exclude former people and never restore prior rehire authority. Second-factor reset is a separate delegable right, never usable on oneself.

**Acceptance.**
1. Choose a default, import 50 people and hire a candidate; read one invitation per eligible person at its configured time and none for former people.
2. Change the bound default definition and require renewed consent; repeat a bulk invitation without duplicate access.
3. Use the separate delegated factor-reset right and refuse self-reset; read ended sessions and required reenrollment.

**Evidence.** `tests/willow/flows.mjs` — “flows public-door journey”; `tests/willow/levels-bulk.mjs` — “levels-bulk public-door journey”; `tests/willow/levels-bulk-browser.mjs` — “levels-bulk-browser public-door journey”
**Gap.** Automatic and timed invitations for hires, joiners, rehires and imports, complete delivery to all 50 imported employees and the hire journey remain unproved. Maintained Base invitation support and delegated native-factor resets are still required.

#### ROLE-004 — Job and employment fields

Core · target · **done** · Cites BASE-ACCESS-004, BASE-INPUT-001, BASE-ROLE-001 · Rules D-1

**Requirement.** Levels independently select job fields: title, department, location, manager, schedule, employment status, FTE, start and end dates. Self modes permit reads only. Other-person Edit appends one dated native change; Edit with approval follows FLOW-004. Directory access does not grant historical employment fields or editing. Date changes preserve period boundaries and reject overlap or reporting cycles.

**Acceptance.**
1. Read selected current and historical fields through profile, context, preview, directory/chart and CSV/XLSX/ZIP while compensation stays withheld.
2. Edit each permitted native field with its revision; self-edit, stale, out-of-scope and cyclic changes leave terms and cases unchanged.
3. Submit an approval-mode job change, revise and decide it through FLOW-004, then read the dated terms and mover work.
4. Change the level in the same session and repeat the record and file reads.

**Evidence.** `tests/willow/levels-job-write.mjs` — “jobWriteProof”; `tests/willow/levels-job-read.mjs` — “jobReadProof”
**Gap.** None.

#### ROLE-005 — Compensation

Core · target · **done** · Cites BASE-ACCESS-004, BASE-INPUT-001, BASE-ROLE-001 · Rules D-1

**Requirement.** Levels independently select pay in force, salary history, bands, bonuses, equity and cycle data. Self View requires an explicit source and self Edit does not exist; Manager and migrated matrices gain none implicitly. Other-person Edit preserves dated award history; approval uses FLOW-004. A field mode grants neither cycle approval/publication nor payroll handoff. Exact calculations and custody are in [record rules](docs/contract/record-rules.md#role-005--compensation).

**Acceptance.**
1. Read each field at View and without its grant through every record, report and file door, including dated pay and independent history.
2. Append salary-history, bonus and equity corrections and read exact values and preserved prior versions.
3. Use the typed compensation chain and refuse self, stale, revoked or moved-scope publication.
4. Maintain employer-wide bands and draft cycles only with that scope; field grants do not approve budgets, publish cycles or hand off payroll.
5. Export, hold, erase and restore award custody with its current authority.

**Evidence.** `tests/willow/levels-compensation-pay.mjs` — “compensationPayProof”; `tests/willow/levels-compensation-records.mjs` — “compensationRecordProof”; `tests/willow/levels-compensation-definitions.mjs` — “compensationDefinitionProof”; `tests/willow/levels-compensation-custody.mjs` — “compensationCustodyProof”
**Gap.** None.

#### ROLE-006 — Time off and absence

Core · target · **done** · Cites BASE-ACCESS-004, BASE-INPUT-001, BASE-ROLE-001

**Requirement.** Levels independently select balances, ledger, requests, coverage calendars and assigned policies. Self Edit requests or cancels leave; other-person entry follows native routing and reservation/reversal rules. Balance overrides retain the owner decision even for a non-owner Edit grant. Coverage outside field reach exposes only names, dates and status, never reasons, accounts or protected cases.

**Acceptance.**
1. Read independent absence fields and refuse a View-only adjustment.
2. Submit a balance override; the ledger stays unchanged until its owner decision, then shows the approved delta.
3. Refuse stale source, revoked mode, moved scope and ended requester before posting.
4. Request on behalf, cancel and inspect outside-scope coverage with no private absence detail.

**Evidence.** `tests/willow/levels-leave.mjs` — “leaveLevelProof”
**Gap.** None.

#### ROLE-007 — Benefits, dependents and beneficiaries

Core · target · **missing** · Cites BASE-ACCESS-004, BASE-INPUT-001, BASE-ROLE-001

**Requirement.** Levels separately select benefits enrollment, life events, dependents, beneficiaries and deductions about themselves and scoped others. Self dependent and beneficiary changes use SELF-001 approval. Medical, disability and confidential absence material is absent from Manager’s built-in rights; broker/carrier feeds use only explicitly readable fields.

**Acceptance.**
1. At benefits View read elections while dependent medical detail remains withheld without its separate right.
2. Submit a dependent change, read its unchanged native value while pending, and decide through SELF-001.
3. Exercise each supported mode and refuse out-of-scope or ungranted changes.

**Evidence.** None.
**Gap.** No delivered public-door journey for benefits, dependents and beneficiaries. The full field modes, named integrations and statutory outcomes remain required as specified.

#### ROLE-008 — Performance and engagement

Core · target · **partial** · Cites BASE-ACCESS-004, BASE-INPUT-001, BASE-ROLE-001

**Requirement.** Levels separately select reviews, goals, feedback, 1:1 notes and engagement results. Released-review corrections preserve earlier delivered summaries; a level cannot expose raw inputs, private HR notes, anonymous authors or unreleased results. Goal proposals use SELF-001 and independent work ownership. Authored feedback and private 1:1 notes remain visible only to their current field-authorized author and employer-wide HR, never to another author’s subject or manager through a level. Published themes require the whole fixed cohort within reach, including nonrespondents and former members, and the existing minimum cohort. Detailed mode and release rules are in [record rules](docs/contract/record-rules.md#role-008--performance-and-engagement).

**Acceptance.**
1. Crawl a performance View level over real confidential inputs, HR notes, anonymous comments and an unreleased cycle; none appear.
2. Edit and approve goals and latest released-summary corrections, preserving immutable prior deliveries; refuse stale sources, closed cycles, self-decision and lost authority.
3. Read published themes only for a qualifying whole cohort; move a nonrespondent outside scope and observe the change.
4. Exercise all modes for feedback, 1:1 notes and raw engagement results without widening native result or participation grants.

**Evidence.** `tests/willow/performance.mjs` — “performanceLevelProof, reviewModeProof, authoredEntryProof and engagementThemeProof”; `tests/willow/levels-performance.mjs` — “authoredEntryProof”
**Gap.** Released reviews, goals, authored feedback and private 1:1 notes have native modes. Raw engagement-result field modes remain unimplemented independently of anonymous-comment grants. Adopted conservative default: retain existing employer-wide HR-only raw named results, protected anonymous aggregates and HR-only released anonymous comments; published-theme levels gain none of those raw records. A compatible ct ruling is required before widening that disclosure or enabling raw-result editing and approval. The target and ENGAGE-001 suppression, consent and recipient-only participation boundaries remain unchanged.

#### ROLE-009 — Training and learning

Core · target · **partial** · Cites BASE-ACCESS-004, BASE-INPUT-001, BASE-ROLE-001 · Rules D-1, D-5

**Requirement.** Training assignments, completions, certificates and TalentLMS connection state have independent self and scoped other-person modes. Edit assigns, waives or records completion; self completion requires an existing assignment and a course that permits it. Certificate approval holds the whole completion. Approval uses SELF-001’s immutable proposal, distinct reviewer, source fence, history and applicable downstream exception. Native manual records never imply provider verification.

**Acceptance.**
1. Assign an in-scope course with deadline and refuse outside-scope assignment or completion.
2. Use all modes, read independent certification View, and preserve completion/waiver evidence and exact pending proposals.
3. Refuse self-decision, stale/concurrent source, revoked mode, moved scope and ended requester before a different eligible reviewer publishes.
4. Read required-work opening/closure and retained evidence after departure; compare the disconnected and provider-verified TalentLMS states.

**Evidence.** `tests/willow/performance.mjs` — “trainingModeProof and trainingMigrationProof”; `tests/willow/levels-performance.mjs` — “trainingModeProof and trainingMigrationProof”
**Gap.** DONE certification is deferred under the pending evidence rule.

#### ROLE-010 — EEO, tax and identity, and medical sections

Core · target · **missing** · Cites BASE-ACCESS-004, BASE-INPUT-001, BASE-ROLE-001

**Requirement.** EEO, tax/identity and medical sections have independent modes. EEO field modes grant only the subject’s own self-identification; individual compliance access remains a separate explicit owner-assigned grant absent from built-in and migrated levels and API credentials. Tax/identity values need their own read/reveal rights; medical rights never arise from Manager’s built-in level.

**Acceptance.**
1. With every built-in level, refuse a non-subject individual EEO read.
2. Read masked tax values at View and reveal them only through the separately authorized audited reveal.
3. Exercise field modes without exposing medical, identity or EEO records through unrelated sections.

**Evidence.** None.
**Gap.** No delivered public-door journey for eeo, tax and identity, and medical sections. The full field modes, named integrations and statutory outcomes remain required as specified.

#### ROLE-011 — Approval selection

Core · target · **done** · Cites BASE-ACCESS-004, BASE-INPUT-001, BASE-ROLE-001

**Requirement.** Levels select approvals by SELF-001 change type, FLOW-004 request type/step, leave, document category and custom field. Selection adds only scoped decision authority and the currently permitted proposal projection. A step bound to a level tracks membership; impact names pending work reassigned or orphaned. The requester and subject never decide their own request.

**Acceptance.**
1. Grant and revoke leave and personal-change decisions; pending work follows current members and scope.
2. Decide a permitted exact revision, then refuse self, stale, revoked and moved-scope decisions without publication.
3. Select a chain step, document category and custom field independently; no selection grants unrelated reads or editing.
4. Inspect each member’s approval impact and affected pending work before applying the level.

**Evidence.** `tests/willow/levels-approvals-personal.mjs` — “personalApprovalProof”; `tests/willow/levels-approvals-routing.mjs` — “approvalRoutingProof”
**Gap.** None.

#### ROLE-012 — Built-in report selection

Core · target · **done** · Cites BASE-ACCESS-004, BASE-INPUT-001, BASE-ROLE-001

**Requirement.** Levels select built-in headcount, turnover, absence, compensation and compliance reports individually. Report admission never grants source fields, general profiles, report definitions or editing. People and fields remain within the contributing scope; small-cell and erased-record rules remain those of the native report.

**Acceptance.**
1. Select one built-in report and compare page, JSON, CSV and XLSX with the permitted source rows and fields.
2. Refuse every unselected report and unrelated profile or edit door.
3. Revoke selection or a field right in-session and inspect withholding, drill-down and scheduled delivery.
4. Include selected report custody in export, hold, erasure and restore.

**Evidence.** `tests/willow/levels-builtins.mjs` — “builtinSelectionProof”; `tests/willow/levels-builtins-custody.mjs` — “builtinCustodyProof”
**Gap.** None.

#### ROLE-013 — Settings selection

Core · target · **done** · Cites BASE-ACCESS-004, BASE-INPUT-001, BASE-ROLE-001

**Requirement.** Levels independently select employer settings and API credential administration; employer-wide settings require everyone scope. A settings grant changes only its named section and never grants employee content, protected owner decisions or access administration. Credential administration retains API-001’s bounded issuer and independent sensitive-right rules.

**Acceptance.**
1. Grant one settings selection and inspect only that page, JSON and action; unrelated settings remain refused.
2. Review the member impact, change it in the same session and inspect its audited result.
3. Issue, rotate and revoke a bounded credential through the selected administration door without gaining private content.
4. Archive and restore settings with external connection consent off.

**Evidence.** `tests/willow/levels-settings.mjs` — “settingsSelectionProof and apiKeyProof”; `tests/willow/restore-access.mjs` — “DATA-001 restore pause”
**Gap.** None.

#### ROLE-014 — Built-in level definitions

Core · target · **missing** · Cites BASE-ACCESS-004, BASE-INPUT-001, BASE-ROLE-001 · Rules D-1

**Requirement.** the written field-level definitions for built-in Employee, Manager, HR administrator, Payroll administrator and IT across every section, shown in the level editor, with migrations preserving every current effective right and a per-built-in before/after report. Depends on ROLE-004..ROLE-013. Acceptance: each built-in's matrix renders from the compiled facets, and a crawl as each built-in agrees with its matrix and with today's effective rights before any custom change.

**Acceptance.**
1. the written field-level definitions for built-in Employee, Manager, HR administrator, Payroll administrator and IT across every section, shown in the level editor, with migrations preserving every current effective right and a per-built-in before/after report.
2. Depends on ROLE-004..ROLE-013.
3. each built-in's matrix renders from the compiled facets, and a crawl as each built-in agrees with its matrix and with today's effective rights before any custom change.
4. Depends on ROLE-004..ROLE-013.
5. each built-in's matrix renders from the compiled facets, and a crawl as each built-in agrees with its matrix and with today's effective rights before any custom change.

**Evidence.** None.
**Gap.** No delivered public-door journey for built-in level definitions. The full field modes, named integrations and statutory outcomes remain required as specified.

#### ROLE-015 — All-section crawl

Core · target · **missing** · Cites BASE-ACCESS-004, BASE-INPUT-001, BASE-ROLE-001

**Requirement.** the WIL-03 crawl extended over every level, every section and every door (API, page, download, CSV/XLSX/ZIP, preview, agent context, webhooks, mobile, notifications), generated from the compiled facets, failing on any value outside the member's modes. Depends on ROLE-004..ROLE-013; each earlier clause adds its own section to the crawl in the same round, so ROLE-015 stays the final conformance gate. Acceptance: a generated matrix over every built-in and a two-level custom set shows zero out-of-mode values and zero denied reads that a mode grants.

**Acceptance.**
1. the WIL-03 crawl extended over every level, every section and every door (API, page, download, CSV/XLSX/ZIP, preview, agent context, webhooks, mobile, notifications), generated from the compiled facets, failing on any value outside the member's modes.
2. Depends on ROLE-004..ROLE-013; each earlier clause adds its own section to the crawl in the same round, so ROLE-015 stays the final conformance gate.
3. a generated matrix over every built-in and a two-level custom set shows zero out-of-mode values and zero denied reads that a mode grants.
4. Depends on ROLE-004..ROLE-013; each earlier clause adds its own section to the crawl in the same round, so ROLE-015 stays the final conformance gate.
5. a generated matrix over every built-in and a two-level custom set shows zero out-of-mode values and zero denied reads that a mode grants.

**Evidence.** None.
**Gap.** No delivered public-door journey for all-section crawl. The full field modes, named integrations and statutory outcomes remain required as specified.

#### API-001 — Employer-issued API credentials bound to an access level

Core · target · **done** · Cites BASE-AUDIT-001, BASE-INPUT-001, BASE-OPS-003, BASE-ROLE-001, BASE-SECRET-001 · Rules D-1

**Requirement.** Employer-issued API keys and OAuth clients bind an explicit level, population, expiry and write scopes within their issuer’s current authority. Credentials are non-person principals. Delegated private-contact, compensation and document reads require an independent eligible administrator’s exact-rights decision; withdrawal or either actor’s authority change ends access. Partner installation shows destination, rights, population and expiry before a reasoned consent or denial. Protocol and custody details are in [API documentation](API.md).

**Acceptance.**
1. Issue a bounded key and refuse wider rights; read only that level’s people and fields.
2. Rotate, revoke and end issuer access; the next resource call fails and audit/archives expose no secret.
3. Exercise pending, approved and withdrawn delegated sensitive access, including rotation and changed approver authority.
4. Install a registered partner with exact redirect and proof key; refuse unsolicited code issuance and stale/replayed grants.

**Evidence.** `tests/willow/levels-settings.mjs` — “apiKeyProof, delegatedCredentialProof and oauthClientProof”; `tests/willow/levels-settings.mjs` — “authorizationCodeProof”
**Gap.** None.

#### API-002 — Documented employee and roster API

Core · target · **done** · Cites BASE-AUDIT-001, BASE-INPUT-001, BASE-OPS-003, BASE-ROLE-001, BASE-SECRET-001

**Requirement.** The versioned OpenAPI surface covers employees, requested fields, job history, organization, custom fields/tables, leave, calendars, document metadata/bytes and access levels. Cursor and changed-since reads compare permitted projections; population loss requests a full cache reset without revealing removed identities. Non-person integrations submit explicit scoped native proposals; the native queue rechecks current credential, population, field and source before a distinct reviewer publishes. Agent-token calls instead carry their computed classes under company policy. Transport details are in [API documentation](API.md).

**Acceptance.**
1. Page a restricted roster and sync a hire/transfer once from a changed-since cursor; every response matches its OpenAPI schema and restricted values stay absent.
2. Refuse stale pagination; on scope loss return a cache reset without removed identities.
3. Submit personal, job, compensation, leave, custom-field, table and document changes; inspect exact pending native proposals and unchanged unpublished values/bytes.
4. Decide through the native queues and refuse stale, revoked, moved-scope and self-decided writes; document publication retains prior versions and uses decision time.

**Evidence.** `tests/willow/levels-settings-api.mjs` — “apiRosterProof”
**Gap.** None.

#### API-003 — Signed, replay-protected outbound webhooks

Core · target · **partial** · Cites BASE-AUDIT-001, BASE-INPUT-001, BASE-OPS-003, BASE-ROLE-001, BASE-SECRET-001 · Rules D-1, D-5

**Requirement.** Administrators and permissioned clients choose employee, terms, time-off and signing events, destination and readable fields. Deliveries retain unique identities, signature verification, recorded/effective-date identities and current level scope. Failure, uncertain sends, pause, replay and stop have visible states. The non-person subscription consent rule and delegated-right inheritance are documented in [API documentation](API.md); agent calls carry external and security under the company policy.

**Acceptance.**
1. Register a one-location subscription, hire and terminate there and verify signed events with permitted fields; an outside-location hire sends nothing.
2. Reject a stale/repeated captured event; fail delivery and inspect backoff, pause, alert and manual replay.
3. Stop or revoke the subscription and observe no pending send; inspect recorded versus effective future changes and a rehire.
4. Read a signature-completion event and its current-rights projection without treating an unobserved provider outcome as complete.

**Evidence.** `tests/willow/webhooks.mjs` — “webhooks public-door journey”; `tests/willow/sign-webhooks.mjs` — “sign-webhooks public-door journey”; `tests/willow/retention.mjs` — “retention public-door journey”; `tests/willow/restore-access.mjs` — “restore-access public-door journey”; `tests/willow/levels-settings.mjs` — “levels-settings public-door journey”
**Gap.** Owner-only explicit audited outbound consent and replay, including owner-only global registration, remain the conservative adopted default; ct approval is pending. Exhaustive monitored-field coverage beyond the proved directory families, complete current-source and future boundaries (including rehire and future typed values) remain unproved. Any future transport must independently preserve delegated document-read and OAuth approval boundaries. Global subscription creation currently uses the documented JSON action; Settings supplies review, consent, logs and stop. API-003 remains PARTIAL.

#### ROLE-016 — Personal-field edits and approvals

Core · target · **done** · From ROLE-001 · Cites BASE-ACCESS-004, BASE-INPUT-001, BASE-ROLE-001 · Rules D-1

**Requirement.** Legal name, preferred name, personal email, phone, address, date of birth and emergency contact have independent self and scoped other-person modes. Field edits change only their named field. Approval modes reuse SELF-001 with a distinct reviewer, immutable history, live mode/scope/source checks and downstream metadata-only follow-up; pending values never enter ordinary records.

**Acceptance.**
1. Use View, Edit and Edit with approval on different personal fields; compare withheld and readable-empty values across every record and file door.
2. Apply an immediate edit to one field and read the unchanged other fields.
3. Approve one exact proposal, reject another and refuse self-decision, changed mode, moved scope, ended requester and stale revision.

**Evidence.** `tests/willow/levels-personal.mjs` — “personalFieldProof and otherPersonalProof”
**Gap.** None.

#### ROLE-017 — Document-category field modes

Core · target · **done** · From ROLE-001 · Cites BASE-ACCESS-004, BASE-INPUT-001, BASE-ROLE-001

**Requirement.** Document categories have independent self and scoped other-person View, Edit and Edit with approval. Only published versions enter ordinary profiles, context, previews and bundles. A different authorized category-reading HR reviewer decides pending bytes, which become visible atomically at decision time. Receipts belong only to the current subject and exact latest version and are not signatures.

**Acceptance.**
1. Review category modes and inspect metadata, preview intersections, downloads and bundles before and after scope/revocation changes.
2. Upload and append an immediate version with current authority and source checks.
3. Hold an approval-mode upload privately; inspect it only as a current participant or authorized reviewer, then approve or reject it.
4. Refuse self-decision and stale, revoked or moved-out publication; confirm rejected bytes remain private, prior published versions remain intact and public version numbers count published versions only.
5. Exercise category holds, retained custody and erasure before document signing or app doors expose these bytes.

**Evidence.** `tests/willow/levels-personal.mjs` — “documentCategoryProof and documentWriteProof”; `tests/willow/retention.mjs` — “retention and custody”
**Gap.** None.

#### ROLE-018 — Selected saved reports

Core · target · **done** · From ROLE-001 · Cites BASE-ACCESS-004, BASE-INPUT-001, BASE-ROLE-001

**Requirement.** A level can admit specific saved reports without granting general reports, profiles, exports, editing, schedules or other recipients. Selection admits only the source’s permitted people; independent current field authority still governs each value and source link. Scheduling rechecks both selection and field rights.

**Acceptance.**
1. Select one report and inspect page, JSON, CSV and XLSX; unselected reports and unrelated doors remain closed.
2. Remove field or selected-report rights in the same session; values, drill-down and scheduled links reflect the change without widening another source.

**Evidence.** `tests/willow/levels-personal.mjs` — “selectedReportProof”; `tests/willow/custom-reports.mjs` — “REPORT-001 custom workforce reports, scheduled links, dated drilldown and protected diversity”
**Gap.** None.

#### ROLE-019 — Subject change-request status

Core · target · **done** · From ROLE-001 · Cites BASE-ACCESS-004, BASE-INPUT-001, BASE-ROLE-001 · Rules D-1

**Requirement.** A default-off level setting adds a minimal view of changes about the subject when no existing full read applies. It shows request type/status, effective date, times, step number and waiting role, and only values the subject may already read. Reasons, attachments, comments, other actors, chain internals and decision/edit controls stay outside that view; full reads retain their existing scope.

**Acceptance.**
1. Grant and remove subject-follow through a reviewed level change and compare its impact and same-session reads.
2. As a subject-only reader inspect list/detail, page, context, previews, notices and files: withheld pay remains withheld and no private request detail or decision appears.
3. Confirm a subject with existing full rights keeps the full projection and cannot decide a request about themselves.

**Evidence.** `tests/willow/levels-follow.mjs` — “followProof”
**Gap.** None.

#### ROLE-020 — Bulk assignment and guarded revert

Core · target · **done** · From ROLE-002 · Cites BASE-ACCESS-004, BASE-INPUT-001, BASE-ROLE-001

**Requirement.** HR assigns levels to selected or filtered active non-owner members in one reviewed batch. The review freezes the resolved members and before/after rights; apply replaces assigned levels atomically and preserves direct grants. A reviewed revert restores captured prior assignments only when no subsequent business or authority change depends on the batch.

**Acceptance.**
1. Preview and assign a level to ten selected members and then a filtered population; compare the frozen member list and exact resulting rights.
2. Refuse changed or reused reviews without partial assignment.
3. Revert an untouched batch and read every prior assignment; later dependent work or edited definitions refuse revert while unrelated reads do not.

**Evidence.** `tests/willow/levels-bulk.mjs` — “bulkLevelProof”
**Gap.** None.

#### ROLE-021 — Bounded delegated access administration

Core · target · **partial** · From ROLE-003 · Cites BASE-ACCESS-004, BASE-INPUT-001, BASE-ROLE-001

**Requirement.** An explicit HR access administrator creates and assigns levels and gives or ends access inside a structurally bounded administrative population. They cannot widen beyond their own rights, combine groups to widen a definition, edit an assigned source of their own authority, change the owner or redelegate administration. Pay and tax authority require a distinct eligible administrator’s exact-version decision; EEO and retained-record authority stay separate.

**Acceptance.**
1. Assign a level within a delegated group and inspect the same bounded member and definition pickers.
2. Refuse out-of-scope targets, shared definitions with outside assignees, self/owner edits, redelegation and rights the delegate lacks.
3. Request pay authority and apply it only through the distinct eligible administrator under current ceilings; revoke either actor’s authority and refuse the stale review.

**Evidence.** `tests/willow/flows.mjs` — “flows public-door journey”; `tests/willow/levels-bulk.mjs` — “levels-bulk public-door journey”; `tests/willow/levels-bulk-browser.mjs` — “levels-bulk-browser public-door journey”
**Gap.** Relative-manager administrative scopes remain unimplemented; the cited native journey proves structurally group-bounded administration and independent sensitive-rights review. No status promotion is made.

### Hiring

#### HIRING-001 — Accepted-hire handoffs from Greenhouse, Lever, Workable and JazzHR

Core · target · **missing** · Cites BASE-AUDIT-001, BASE-INPUT-001, BASE-OPS-003, BASE-ROLE-001, BASE-SECRET-001 · Rules D-1, D-5 · Register R-1

**Requirement.** Employers that keep a separate ATS connect Greenhouse, Lever, Workable or JazzHR through each provider's approved API/webhook authorization. An accepted-hire event produces a reviewed joiner proposal with candidate identity, approved offer, role, start date, manager and permitted documents. HR resolves duplicate/rehire matches and missing fields before creating one employee/packet; the resulting employee ID and onboarding status return to the ATS where it accepts them, and interview evaluations are never copied into broad employee records. Employers without a separate ATS use Willow's own pipeline (HIRING-002–004).

**Acceptance.**
1. For each of Greenhouse, Lever, Workable and JazzHR, accept an offer, preview the hire in Willow, resolve a former-worker match, approve and inspect the packet plus returned status.
2. Replay the event and withdraw the offer; neither duplicates the person nor retains unauthorized preboarding access.

**Evidence.** None.
**Gap.** No delivered public-door journey for accepted-hire handoffs from greenhouse, lever, workable and jazzhr. The full field modes, named integrations and statutory outcomes remain required as specified.

#### HIRING-002 — Job openings, careers page and job-board posting

Core · target · **missing** · Cites BASE-AUDIT-001, BASE-INPUT-001, BASE-OPS-003, BASE-ROLE-001, BASE-SECRET-001 · Rules D-1, D-5 · Register R-2

**Requirement.** Hiring managers request openings with title, department, location, employment type, USD pay range (published where state pay-transparency laws such as California's, Colorado's, New York's and Washington's require it), hiring team and approval chain; HR approves before posting. Approved openings publish to an employer-branded, accessible careers page with structured job data for search engines, and post to Indeed, ZipRecruiter and LinkedIn through their approved posting/partner interfaces, each showing posted/live/rejected/expired state and the board's reference; partner program access is delivery work. Closing, filling or editing an opening updates or withdraws every posting. Application forms are configurable per opening (resume, cover letter, questions, knockout questions) and applications from the careers page and each board arrive once as candidates with their source.

**Acceptance.**
1. Request and approve an opening in a pay-transparency state, publish it and read it back on the careers page and from Indeed, ZipRecruiter and LinkedIn posting status through provider-edge fixtures.
2. Apply once from the careers page and once from a board, then close the opening; both candidates appear once with their source and every posting reports withdrawn.
3. Before shipping, extend REPORT-001 saved reports with this capability’s dated metrics and source drill-down, current row/field restrictions, unknown/freshness labels, safe scheduled links and CSV/XLSX parity; no metric may imply an unobserved provider outcome.

**Evidence.** None.
**Gap.** No delivered public-door journey for job openings, careers page and job-board posting. The full field modes, named integrations and statutory outcomes remain required as specified.

#### HIRING-003 — Candidate pipeline, hiring-team review and candidate email

Core · target · **partial** · Cites BASE-AUDIT-001, BASE-INPUT-001, BASE-OPS-003, BASE-ROLE-001, BASE-SECRET-001 · Rules D-1, D-5

**Requirement.** Each opening has configurable stages, candidate cards, immutable resumes/scorecards and stage history. Only HR and the current opening team read its candidates; HR controls pay and private notes. Interviews use Google Calendar or Microsoft Outlook availability and invitations. Editable acknowledgment/interview/rejection templates and bulk rejection log one message per candidate. Repeat applicants merge only after HR reviews verified identity under the recorded ruling; merges are reversible, prior applications require explicit release and earlier rejection reasons stay private. Candidate retention and separate self-ID follow DATA-002 and EEO-003. Candidate advancement is an interactive hiring decision; automated ranking and employment scoring are outside the product.

**Acceptance.**
1. Move two applicants through stages as a hiring manager, record two interviewer scorecards, schedule an interview against a connected calendar and send templated acknowledgment and rejection emails.
2. Prove an employee outside the hiring team and the manager of a different opening cannot read the candidates, a repeat application merges into the earlier record, and no automated ranking or rejection exists.
3. Before shipping, extend REPORT-001 saved reports with this capability’s dated metrics and source drill-down, current row/field restrictions, unknown/freshness labels, safe scheduled links and CSV/XLSX parity; no metric may imply an unobserved provider outcome.

**Evidence.** `tests/willow/phase2.mjs` — “phase2 public-door journey”; `tests/willow/hiring-browser.mjs` — “hiring-browser public-door journey”
**Gap.** HR-controlled private notes/pay expectations; connected Google/Outlook availability and invitations; candidate email/templates/bulk rejection; approved verified-identity matching, reversible merge and HR prior-application release; DATA-002 linked-application retention/erasure; FLOW-002 work and REPORT-001 reporting.

#### HIRING-004 — Offer approval and hire into preboarding without re-keying

Core · target · **partial** · Cites BASE-AUDIT-001, BASE-INPUT-001, BASE-OPS-003, BASE-ROLE-001, BASE-SECRET-001 · Rules D-3, D-1

**Requirement.** From an offer-stage candidate, HR generates an offer letter from a SIGN-001 template filled from the opening and candidate (title, USD pay, start date, manager, location), routes it for approval and sends it for native signature. A signed acceptance creates one reviewed joiner proposal (WIL-15) carrying the candidate's name, personal email, phone, address, role and terms, starts the matching preboarding packet (FLOW-003) at the personal mailbox and files the signed offer to the restricted employee record. No field is typed twice; a declined, withdrawn or expired offer reopens the candidate without creating a person, and a former worker is matched for rehire (WIL-13).

**Acceptance.**
1. Send an offer from the pipeline, approve and sign it on a phone, and inspect the joiner proposal, preboarding invitation and filed signed offer; every carried field equals the candidate record and nothing is re-entered.
2. Decline a second offer and confirm no person or packet exists; hire a former worker and confirm the existing person is reused.
3. At this door, compare the pinned workflow preview with execution; fail a step and observe blocked dependent work and closure, then upgrade deliberately without losing completed evidence.

**Evidence.** `tests/willow/flows.mjs` — “flows public-door journey”
**Gap.** Candidate and offer sources, signed offers and the preboarding hand-off.

#### HIRING-005 — Background checks on the offer stage through Checkr

Core · target · **missing** · Cites BASE-AUDIT-001, BASE-INPUT-001, BASE-OPS-003, BASE-ROLE-001, BASE-SECRET-001 · Rules D-1, D-5 · Register R-3

**Requirement.** From an offer-stage candidate, HR orders a background check through Checkr (and other FCRA consumer reporting agencies with an approved partner integration) using the package the opening requires. The candidate completes the agency's standalone FCRA disclosure and authorization, with applicable state notices, in the agency's own flow; Willow records only the order ID, package, status (invited, pending, clear, consider, suspended, canceled, complete), expected completion and a link to the report at the agency. The report and consent forms stay with the agency or in a restricted screening category readable only by access levels granted screening rights; they never enter the employee record, manager or hiring-team views, agent context or ordinary exports, and are not copied when the candidate becomes an employee. Status webhooks are signature-checked and idempotent. Decisions stay human: Willow never rejects on a result, and HR starts any pre-adverse and adverse action through the agency's notice workflow with the waiting period it enforces. An opening can require a completed check before the joiner proposal (HIRING-004) can start employment. Retention follows DATA-002.

**Acceptance.**
1. Order a Checkr check for an offer-stage candidate through provider-edge fixtures and receive invited, pending, consider and clear statuses by webhook, including a replayed one; one status timeline results.
2. Verify the hiring manager, the later employee record, agent context and a standard export hold no report content and only HR with screening rights opens the agency link.
3. A "consider" result leaves the candidate in the pipeline until HR starts the agency's pre-adverse action, and a start gated on the check waits until it completes.

**Evidence.** None.
**Gap.** No delivered public-door journey for background checks on the offer stage through checkr. The full field modes, named integrations and statutory outcomes remain required as specified.

### Workflows, documents and US onboarding

#### FLOW-001 — Conditional workflows with reviewed publication

Core · target · **done** · Cites BASE-INPUT-001, BASE-ROLE-001 · Rules D-1, D-5

**Requirement.** HR publishes conditional joiner/mover/leaver graphs after inspecting every affected person, role assignment, dependency, relative deadline and external action. Publication pins the exact version; existing cases retain theirs until a deliberate reviewed upgrade preserves completed work and evidence. A failed or unresolved step blocks dependent work and whole-case completion. Connector authority and actual observed outcomes remain obligations at each connector’s own door.

**Acceptance.**
1. Preview and publish conditional graphs for different roles, states and employment types; compare the named impact with the created cases.
2. Fail a dependency and refuse dependent work and closure; retry safely, then deliberately upgrade while retaining completed evidence.
3. Change the source or audited snapshot between review and publish and refuse the stale review.

**Evidence.** `tests/willow/workflows.mjs` — “FLOW-001 conditional rules, reviewed publication, scoped steps, failures/dependencies, pinned versions, retained upgrade history and all workflow kinds”
**Gap.** None.

#### FLOW-002 — Persistent reminders, escalation and coverage

Core · target · **done** · Cites BASE-INPUT-001, BASE-MAIL-001, BASE-ROLE-001 · Rules D-1, D-5

**Requirement.** Every required task, approval, missing form, signature and provider exception has an accountable owner, deadline, progress and next action. Scheduled reminders follow an HR-approved cadence and quiet hours; overdue work escalates to a substitute owner when the assignee is absent or leaves. Completion cancels future reminders, rescheduling preserves history, and restart catches missed deadlines without duplicate sends. Failed/uncertain delivery is visible separately from work completion.

**Acceptance.**
1. Create a due case, advance the scheduler across quiet hours and restart it, then make the assignee unavailable.
2. Observe one permitted reminder/escalation, assign cover, complete the task and prove later ticks send nothing.
3. Refuse an unauthorized recipient and expose failed delivery.

**Evidence.** `tests/willow/work-followup.mjs` — “FLOW-002 cadence, quiet hours, durable restart, coverage, revocation, reschedule, delivery failures, current work sources and completion”
**Gap.** None.

#### FLOW-003 — Role-specific preboarding packets

Core · target · **partial** · Cites BASE-INPUT-001, BASE-ROLE-001

**Requirement.** An accepted hire gets a secure, revocable pre-start invitation with only their required personal details, offer/policy signatures, forms, voluntary EEO self-identification (EEO-003), benefits choices and tasks. HR chooses role/work-state packets, tracks completion and resolves missing data without asking the new hire to use an unprovisioned work mailbox. Expired or withdrawn offers end preboarding access and pending invitations without deleting retained evidence.

**Acceptance.**
1. Send two role-specific packets to personal mailboxes, complete one on a phone, let the other expire/withdraw, then start employment.
2. Inspect packet progress and prove only approved data becomes the employment record and expired links cannot read it.

**Evidence.** `tests/willow/eeo-invitations.mjs` — “eeo-invitations public-door journey”; `tests/willow/eeo-invitations-browser.mjs` — “eeo-invitations-browser public-door journey”
**Gap.** Other role/work-state packet contents, required personal details and approvals, native signatures/forms, benefits choices and packet tasks remain. EEO-003 owns the EEO step; its answers never need HR approval.

#### FLOW-004 — Manager-initiated change requests through approval chains

Core · target · **done** · Cites BASE-INPUT-001, BASE-ROLE-001 · Rules D-1

**Requirement.** Managers or permitted members request dated promotion, pay, title, department, location, manager, status or FTE changes with reason and attachments. Versioned role chains condition on amount, band, legal entity or location, and use permitted substitutes. Revisions restart the chain; final decision binds exact values, appends one terms version, starts mover work and enters payroll reconciliation. The requester and subject cannot decide; pay remains withheld without its field right. Calculations, type and routing details are in [record rules](docs/contract/record-rules.md#flow-004--manager-initiated-change-requests-through-approval-chains).

**Acceptance.**
1. As a manager, request a promotion with a 10% raise for a direct report effective next month; it routes to the manager's manager, then HR, then payroll.
2. The manager's manager approves, HR sends it back, the manager edits the amount and the chain restarts; after all three approve, exactly one effective-dated terms version with the approved title and pay exists, the mover case has started and the payroll queue shows the change.
3. A skip-level approver without pay rights sees the request with pay withheld, the requester cannot approve their own request, and a declined request writes nothing.
4. Use band and location conditions, attach evidence, substitute an absent approver and inspect subject-follow status without widening private request reads.
5. Change the native period or relevant band before final approval and refuse stale execution.

**Evidence.** `tests/willow/change-requests.mjs` — “FLOW-004 change requests”
**Gap.** None.

#### SIGN-001 — Offer and policy templates with native e-signature

Core · target · **partial** · Cites BASE-INPUT-001, BASE-ROLE-001 · Rules D-3, D-1

**Requirement.** HR maintains versioned offer, agreement and policy templates with controlled employee/compensation merge fields, placed signature/initial/date/text fields, ordered signers, approval routing and filing category. Each recipient preview binds the exact rendered bytes and readable source values. A changed template, merge value, recipient or authority invalidates that review. Native signing and optional DocuSign use the same version and category boundaries.

**Acceptance.**
1. Create and review a template with permitted merge fields and exact recipient bytes; refuse unauthorized compensation inclusion.
2. Change a bound input and refuse creation from its stale review.
3. Use the template in a pinned workflow and preserve completed evidence through deliberate upgrade.
4. At this door, compare the pinned workflow preview with execution; fail a step and observe blocked dependent work and closure, then upgrade deliberately without losing completed evidence.

**Evidence.** `tests/willow/sign-templates.mjs` — “sign-templates public-door journey”; `tests/willow/sign-native.mjs` — “sign-native public-door journey”; `tests/willow/sign-custody.mjs` — “sign-custody public-door journey”; `tests/willow/retention-signatures.mjs` — “retention-signatures public-door journey”; `tests/willow/sign-restore.mjs` — “sign-restore public-door journey”; `tests/willow/workflow-signing.mjs` — “workflow-signing public-door journey”; `tests/willow/sign-webhooks.mjs` — “sign-webhooks public-door journey”
**Gap.** SIGN-001 remains PARTIAL. Unproved SIGN-001 obligations are: materially changed rendered-offer void and reissue with fresh review and consent, and refusal of changed sources or merge values between review and issue; signing-transition refusal after source-field, employer-wide authority or session revocation, and category revocation beyond the sequential prepared-HR-payload case now proved, including concurrent changes and forbidden access-administrator, agent and API-credential attempts, and direct same-person countersigner refusal; current category refusal for existing execution evidence; complete configured field-placement reconciliation; equality of presented and retained consent wording and actual language, supplied network metadata, exclusion of raw signing credentials from certificates and archives, and the complete protected audit schema including uncertain outcomes; distinct decline and deliberate void states; signing-specific notification custody, erased or held execution-evidence restore and erasure fences; and actual external-operation failure through the inherited reviewed workflow. Connected DocuSign sending, envelope ID, returned signed copy and certificate, duplicate and out-of-order callback refusal, old-callback refusal and an authorized employer-account trial remain unbuilt or unproved. Wider rendering support and ESIGN and UETA legal suitability remain unestablished; neither boundary supplies acceptance evidence. Active-session authentication is the supported alternative and does not additionally require an emailed signing credential.

#### SIGN-002 — Cohort signature requests and the signed-documents report

Core · target · **partial** · Cites BASE-INPUT-001, BASE-ROLE-001 · Rules D-3

**Requirement.** HR reviews a cohort by named people, everyone, location, department, employment type or level and the exact rendered template/file version for every recipient. Each person gets an independent request under SIGN-003, including SELF-002 shared files. Future joiners receive a request according to the reviewed cohort policy. Reminders follow the approved FLOW-002 cadence and current category/recipient rights; cancellation preserves sealed copies and ends unfinished work.

**Acceptance.**
1. Send a policy to a five-person location and sign as two people, one on a phone; read each filed sealed copy.
2. Advance the scheduler and read one reminder per pending signer and cadence; add a joiner and read their request.
3. Cancel the remainder and observe no later reminder while completed copies remain.
4. Revoke initiator, recipient, category or cohort authority and refuse stale/unpermitted delivery under the exact-version cohort rules.
5. At this door, compare the pinned workflow preview with execution; fail a step and observe blocked dependent work and closure, then upgrade deliberately without losing completed evidence.

**Evidence.** `tests/willow/sign-native.mjs` — “sign-native public-door journey”; `tests/willow/sign-cohorts.mjs` — “sign-cohorts public-door journey”; `tests/willow/workflow-signing.mjs` — “workflow-signing public-door journey”; `tests/willow/sign-webhooks.mjs` — “sign-webhooks public-door journey”
**Gap.** SIGN-002 remains PARTIAL. Unproved SIGN-002 obligations are: non-owner employer-wide HR report access and its comparison with manager restrictions at 1440 and 390; complete displayed cohort-review and independent-consent assertions; signature-email recipient, authenticated-link and content assertions at the network edge, including failed and uncertain outcomes; category-revocation dispatch, enrollment and signing refusal; unknown and freshness reporting cases and numeric and dated CSV and XLSX parity; actual external-operation failure through the inherited reviewed workflow; and the applicable unproved per-recipient consent, authority, audit and custody riders named under SIGN-001. Native companion-app delivery remains explicitly inherited MOBILE-001 work in both documents, including the unbuilt iOS and Android apps, real devices and developer distribution accounts. Responsive browser signing and mail-provider acceptance do not establish native app delivery or inbox receipt.

#### US-001 — I-9, E-Verify and W-4 through completion

Core · target · **missing** · Cites BASE-INPUT-001, BASE-ROLE-001 · Rules D-3, D-1, D-5 · Register R-5

**Requirement.** Worksite-aware onboarding collects current I-9 and federal/state withholding forms through restricted employee and employer/authorized-representative steps. Mitratech Tracker I-9/E-Verify integration launches the correct workflow, tracks examination/attestation, corrections, rehire/reverification, provider case IDs, notices and unresolved results through closure. W-4 captures the authenticated employee signature and final declaration, keeps a printable copy and records payroll receipt/effective date. Reviewed rule versions set deadlines and retention; an E-Verify mismatch never becomes an automatic adverse employment decision.

**Acceptance.**
1. From a US hire packet, complete employee and representative I-9 steps with Mitratech, exercise a pending E-Verify referral and a correction, and return the signed records/status to HR.
2. Submit and replace W-4, observe payroll receipt and deny manager access to tax/identity documents.
3. Missing provider action prevents completion.
4. Exercise this clause’s steps in a reviewed FLOW-001 workflow: compare the named preview and actual external action, approve only with its separately authorized role, fail a provider step and assert dependent work and closure remain blocked, then change the template and prove pinning and retained evidence on a deliberate upgrade.

**Evidence.** None.
**Gap.** No delivered public-door journey for i-9, e-verify and w-4 through completion. The full field modes, named integrations and statutory outcomes remain required as specified.

#### US-002 — State new-hire reporting and employer administration

Core · target · **missing** · Cites BASE-INPUT-001, BASE-ROLE-001 · Rules D-3, D-1, D-5 · Register R-6

**Requirement.** The employer maintains one or more US legal entities under one account, each with its FEIN, registered work states, locations and payroll/benefits connections; every employment period belongs to one entity and reports, EEO-1 (EEO-004) and filings group by entity. It keeps W-2 employee versus 1099 contractor records without treating classification as an agent decision. New-hire/rehire reporting and state onboarding forms use current state-specific fields and reviewed deadlines, with configured multistate election, restricted review, submission through the state portal or authorized payroll partner, acknowledgment/rejection and correction. Owner-assigned manual portal steps retain submission receipts when a state has no machine interface; an export alone never completes reporting.

**Acceptance.**
1. Under two legal entities with different FEINs, onboard and rehire workers in California and Texas, preview the applicable forms/report destination and deadlines, approve and submit, reject/correct one report and inspect the acceptance receipt.
2. Attempt to complete an unsubmitted report and to expose FEIN/SSN to a manager; both fail, and each worker's records and reports carry their own entity.
3. Exercise this clause’s steps in a reviewed FLOW-001 workflow: compare the named preview and actual external action, approve only with its separately authorized role, fail a provider step and assert dependent work and closure remain blocked, then change the template and prove pinning and retained evidence on a deliberate upgrade.

**Evidence.** None.
**Gap.** No delivered public-door journey for state new-hire reporting and employer administration. The full field modes, named integrations and statutory outcomes remain required as specified.

#### EEO-001 — Voluntary EEO self-identification in self-service

Core · target · **done** · Cites BASE-INPUT-001, BASE-ROLE-001

**Requirement.** Willow asks for voluntary self-identification of ethnicity (Hispanic or Latino first, then race), sex and, where the employer is a federal contractor, protected-veteran status and disability on the OFCCP voluntary form (CC-305), with "I do not wish to self-identify" on every question. It is offered in self-service at any time. Answers sit in a restricted EEO section that no Manager level, hiring team, directory, agent context or ordinary export can read; only levels granted EEO access read individual values, and every read is audited. Where an employee declines, HR may record a category from employment records only as the current EEO-1 instructions allow, labeled with that source; answers keep their history. Detailed collection, calculation and custody rules are in [record rules](docs/contract/record-rules.md#eeo-001--voluntary-eeo-self-identification-in-self-service). Individual EEO access is a separately owner-assigned right, including for the owner; aggregate access never grants it. Native answer history and HR-recorded categories stay distinct.

**Acceptance.**
1. Two employees open self-identification in self-service; one completes it and the other declines.
2. Verify HR with EEO access sees each answer and its source while the manager, hiring team, directory, agent context and a standard CSV export receive nothing, and HR's read appears in the audit.
3. Change an answer through self-service and inspect its history.

**Evidence.** `tests/willow/eeo-self-id.mjs` — “EEO-001 self-identification”
**Gap.** None.

#### EEO-003 — EEO self-identification in preboarding and for applicants

Core · target · **done** · Cites BASE-INPUT-001, BASE-ROLE-001

**Requirement.** Under EEO-001's questions, restricted section and audited reads, self-identification is offered in the preboarding packet (FLOW-003) and to applicants separately from their application (HIRING-002/003); applicant answers are never visible during selection. Detailed collection, calculation and custody rules are in [record rules](docs/contract/record-rules.md#eeo-003--eeo-self-identification-in-preboarding-and-for-applicants).

**Acceptance.**
1. Send preboarding packets to two hires; one completes self-ID and the other declines.
2. Verify HR with EEO access sees each answer and its source while the manager, hiring team, directory, agent context and a standard CSV export receive nothing, and HR's read appears in the audit.
3. Offer applicant self-ID only after the application in a separate invitation; no hiring participant reads answers during selection.
4. Withdraw or expire an invitation, start employment from a preboarding packet and inspect immutable answer custody without exposing it to HR’s ordinary response.

**Evidence.** `tests/willow/eeo-invitations.mjs` — “EEO-003 invitations, promotion and applicant separation”
**Gap.** None.

#### EEO-002 — EEO job categories, establishments and the EEO-1 snapshot

Core · target · **done** · Cites BASE-INPUT-001, BASE-ROLE-001 · Rules D-1

**Requirement.** HR maps each job title to one of the ten EEO-1 job categories, effective-dated, and maps locations to EEO-1 establishments. For an employer-chosen workforce snapshot pay period, Willow produces EEO-1 Component 1 data by establishment and company: full- and part-time employees on payroll in that period by job category, sex and race/ethnicity. A pre-filing check flags unmapped titles, missing or declined self-ID, missing establishment addresses or NAICS codes and people outside the period. Individual values stay with EEO-access levels and aggregate views suppress small cells. Detailed collection, calculation and custody rules are in [record rules](docs/contract/record-rules.md#eeo-002--eeo-job-categories-establishments-and-the-eeo-1-snapshot).

**Acceptance.**
1. Map titles for a two-location employer, choose a snapshot pay period containing a hire and a leaver, and run the report; counts by category reconcile to the roster for that period and the declined hire is flagged.
2. Map one missing title and rerun; a manager cannot open the report or its drill-down.

**Evidence.** `tests/willow/eeo-snapshot.mjs` — “EEO-002 snapshot”
**Gap.** None.

#### EEO-004 — EEO-1 by legal entity, contractor exclusion and filing

Core · target · **missing** · Cites BASE-INPUT-001, BASE-ROLE-001 · Rules D-1 · Register R-7

**Requirement.** Establishments sit under their legal entity (US-002), and EEO-002's data is produced as headquarters, establishment and consolidated reports where required, excluding 1099 contractors. HR downloads the data in the EEOC filing system's upload format, then records the submission confirmation as an owner-assigned manual step; the report never claims filing without it.

**Acceptance.**
1. Choose a snapshot pay period containing a contractor and run the report; the contractor is excluded.
2. Validate the download against the EEOC's published data-file specification and record a confirmation; a manager cannot open the report or its drill-down.

**Evidence.** None.
**Gap.** No delivered public-door journey for eeo-1 by legal entity, contractor exclusion and filing. The full field modes, named integrations and statutory outcomes remain required as specified.

#### SIGN-003 — Native signing and sealed records

Core · target · **partial** · From SIGN-001 · Cites BASE-INPUT-001, BASE-ROLE-001 · Rules D-1

**Requirement.** Without a third-party account, signers consent to electronic records, authenticate by a session or one-time emailed link plus code, and sign the exact approved document on desktop or phone. Ordered employee/HR signatures create an immutable sealed copy and certificate in the selected category. Consent withdrawal, decline, expiry and voiding end only unfinished requests; changed documents reissue. Receipt acknowledgments remain distinct. Certificate fields and byte custody are in [record rules](docs/contract/record-rules.md#sign-001--offer-and-policy-templates-with-native-e-signature).

**Acceptance.**
1. Sign as employee on a phone, then countersign as HR; download the sealed copy and certificate through allowed category doors and verify its digest.
2. Inspect signer identity, authentication, consent, times, device/IP and exact digest in the certificate.
3. Void and reissue, replay an old link and refuse any signature of the new version; exercise decline, expiry, withdrawal and wrong signer/order.
4. Read only permitted copies after category revocation; retain prior bytes and complete signing/erasure custody.

**Evidence.** `tests/willow/sign-templates.mjs` — “sign-templates public-door journey”; `tests/willow/sign-native.mjs` — “sign-native public-door journey”; `tests/willow/sign-custody.mjs` — “sign-custody public-door journey”; `tests/willow/retention-signatures.mjs` — “retention-signatures public-door journey”; `tests/willow/sign-restore.mjs` — “sign-restore public-door journey”; `tests/willow/workflow-signing.mjs` — “workflow-signing public-door journey”; `tests/willow/sign-webhooks.mjs` — “sign-webhooks public-door journey”
**Gap.** Missing the complete native signing and sealed records journey. SIGN-001 remains PARTIAL. Unproved SIGN-001 obligations are: materially changed rendered-offer void and reissue with fresh review and consent, and refusal of changed sources or merge values between review and issue; signing-transition refusal after source-field, employer-wide authority or session revocation, and category revocation beyond the sequential prepared-HR-payload case now proved, including concurrent changes and forbidden access-administrator, agent and API-credential attempts, and direct same-person countersigner refusal; current category refusal for existing execution evidence; complete configured field-placement reconciliation; equality of presented and retained consent wording and actual language, supplied network metadata, exclusion of raw signing credentials from certificates and archives, and the complete protected audit schema including uncertain outcomes; distinct decline and deliberate void states; signing-specific notification custody, erased or held execution-evidence restore and erasure fences; and actual external-operation failure through the inherited reviewed workflow. Connected DocuSign sending, envelope ID, returned signed copy and certificate, duplicate and out-of-order callback refusal, old-callback refusal and an authorized employer-account trial remain unbuilt or unproved. Wider rendering support and ESIGN and UETA legal suitability remain unestablished; neither boundary supplies acceptance evidence. Active-session authentication is the supported alternative and does not additionally require an emailed signing credential.

#### SIGN-004 — Optional DocuSign handoff

Core · target · **missing** · From SIGN-001 · Cites BASE-INPUT-001, BASE-ROLE-001 · Rules D-3, D-5 · Register R-4

**Requirement.** Employers may use DocuSign for the same exact-version signing request and states. Willow retains the returned sealed copy, certificate and envelope identity and reconciles observed signing state. Duplicate or out-of-order callbacks and old signing credentials cannot complete another version.

**Acceptance.**
1. Send an exact reviewed request to DocuSign and retrieve the completed copy, certificate and envelope identity.
2. Replay old/out-of-order callbacks, revoke authority and change the document; no different version or duplicate completion results.
3. Fail provider execution in a pinned workflow; dependent work and closure stay open until verified recovery.

**Evidence.** `tests/willow/sign-templates.mjs` — “sign-templates public-door journey”; `tests/willow/sign-native.mjs` — “sign-native public-door journey”; `tests/willow/sign-custody.mjs` — “sign-custody public-door journey”; `tests/willow/retention-signatures.mjs` — “retention-signatures public-door journey”; `tests/willow/sign-restore.mjs` — “sign-restore public-door journey”; `tests/willow/workflow-signing.mjs` — “workflow-signing public-door journey”; `tests/willow/sign-webhooks.mjs` — “sign-webhooks public-door journey”
**Gap.** No delivered DocuSign signing journey. The cited native-template, native-signing and custody journeys do not exercise DocuSign submission, returned certificate or callback replay.

#### SIGN-005 — Signed-documents reporting

Core · target · **partial** · From SIGN-002 · Cites BASE-INPUT-001, BASE-ROLE-001 · Rules D-1

**Requirement.** The signature report shows permitted sent, viewed, signed, declined, expired and voided requests, pending owners and exact source versions. Managers receive only scoped status, without signing values, rendered bytes or certificates. Saved reports and dated source drill-down share row/field restrictions, unknown/freshness labels, safe schedules and CSV/XLSX parity.

**Acceptance.**
1. Open the signed-documents report as HR and manager; compare category-scoped status and withheld certificate/byte details.
2. Read source versions, pending recipients and completed states before and after cancellation.
3. Build, export and schedule signature-status reporting with the same dated sources and live recipient rights.

**Evidence.** `tests/willow/sign-native.mjs` — “sign-native public-door journey”; `tests/willow/sign-cohorts.mjs` — “sign-cohorts public-door journey”; `tests/willow/workflow-signing.mjs` — “workflow-signing public-door journey”; `tests/willow/sign-webhooks.mjs` — “sign-webhooks public-door journey”
**Gap.** Missing the complete signed-documents reporting journey. SIGN-002 remains PARTIAL. Unproved SIGN-002 obligations are: non-owner employer-wide HR report access and its comparison with manager restrictions at 1440 and 390; complete displayed cohort-review and independent-consent assertions; signature-email recipient, authenticated-link and content assertions at the network edge, including failed and uncertain outcomes; category-revocation dispatch, enrollment and signing refusal; unknown and freshness reporting cases and numeric and dated CSV and XLSX parity; actual external-operation failure through the inherited reviewed workflow; and the applicable unproved per-recipient consent, authority, audit and custody riders named under SIGN-001. Native companion-app delivery remains explicitly inherited MOBILE-001 work in both documents, including the unbuilt iOS and Android apps, real devices and developer distribution accounts. Responsive browser signing and mail-provider acceptance do not establish native app delivery or inbox receipt.

### Leave, time and workforce planning

#### LEAVE-001 — US PTO policies and scheduled accrual

Core · target · **done** · Cites BASE-INPUT-001, BASE-ROLE-001 · Rules D-1

**Requirement.** HR configures vacation, sick and unpaid leave policies with eligibility, service tiers, hours/days conversion, proration, accrual cadence, caps, carryover/expiry, negative-balance rules and reviewed state/location variants. Scheduled accruals are idempotent and explain each calculation, including hire, rehire, transfer, schedule and termination effects. Policy changes require owner approval; overrides are dated, reasoned ledger adjustments. HR configures reviewed protected-leave cases and restricted supporting documents without exposing medical reasons to managers or claiming legal adjudication. Detailed collection, calculation and custody rules are in [record rules](docs/contract/record-rules.md#leave-001--us-pto-policies-and-scheduled-accrual).

**Acceptance.**
1. Publish policies for salaried and hourly workers in two states, accrue across a tier/carryover boundary, restart the scheduler and compare employee balances and ledger.
2. Transfer a worker and correct a schedule; show the calculation and require approval for an override.
3. Open a protected-leave case (such as FMLA) with a restricted medical certification, record intermittent absences against the case's entitlement and see the remaining entitlement; the manager sees only absence dates while HR with leave rights sees the case and certification, and nothing labels the case legally approved.

**Evidence.** `tests/willow/leave-policies.mjs` — “LEAVE-001 public-door acceptance”
**Gap.** None.

#### LEAVE-002 — Shared absence calendars and approval follow-up

Core · target · **partial** · Cites BASE-INPUT-001, BASE-ROLE-001 · Rules D-1

**Requirement.** Employees and managers have scoped absence/holiday calendars with employer-defined US federal/state/company holidays, partial days and working schedules. Requesting leave shows balance/coverage impact, notifies the effective approver in-app and by the configured channel, and follows substitute approval/reminder rules. Calendar subscriptions and Google Calendar/Microsoft Outlook connections expose only authorized absence labels/dates; cancellation or access loss removes or redacts updates without leaking reasons.

**Acceptance.**
1. Request a partial-day absence over a company holiday, inspect the quote and shared calendar as employee/manager, deliver the manager request notice, delegate approval and cancel it.
2. Read Google Calendar and Outlook updates and revoke access; confidential reasons never appear and stale requests cannot be approved.
3. Request Dec 22 to Jan 2 over company holidays on Dec 25 and Jan 1: the quote, the approved request and the ledger deduct only the scheduled hours of the other working days and show both holidays as not deducted.

**Evidence.** `tests/willow/flows.mjs` — “flows public-door journey”; `tests/willow/phase2.mjs` — “phase2 public-door journey”
**Gap.** Shared holidays and calendars, request notices, delegation and Google/Outlook calendar connections.

#### TIME-001 — Time, shifts and Deputy reconciliation

Core · target · **partial** · Cites BASE-INPUT-001, BASE-ROLE-001 · Rules D-1

**Requirement.** Hourly workers clock in and out and record breaks from the web, the companion apps (MOBILE-001) or a shared kiosk, with any employer location rule shown before use; punches made offline queue on the device and revalidate on reconnect. Workers submit corrections and approved timesheets; managers publish shifts, manage availability/swaps and compare planned versus worked hours. US work-state overtime/break rules are employer-reviewed and versioned; edits preserve originals and require approval before payroll handoff. Deputy connections reconcile roster, shifts, approved hours and absences using explicit source authority; schedule changes feed PTO quotes without overwriting an approved payroll period.

**Acceptance.**
1. Publish a week of shifts, clock in and out from a phone (one punch made offline and synced later) and correct a missed break, approve a swap/timesheet and send hours to payroll.
2. Compare Deputy and Willow roster/leave/time, create an overtime mismatch and resolve it; denied/late edits cannot silently change approved payroll.

**Evidence.** `tests/willow/flows.mjs` — “flows public-door journey”
**Gap.** Web and mobile clocks, shifts, timesheets and Deputy synchronization.

### Connected payroll and benefits

#### PAYROLL-001 — Two-way payroll authority and reconciliation

Core · target · **partial** · Cites BASE-AUDIT-001, BASE-INPUT-001, BASE-OPS-003, BASE-ROLE-001, BASE-SECRET-001 · Rules D-3, D-1, D-5

**Requirement.** Payroll and HR agree per-field authority, employee/provider identity, effective dates, pay calendars, earning/leave/deduction codes and cutover. Authorized changes flow both ways; provider-owned facts never silently overwrite Willow-owned employment terms, and conflicting pay or identity matches stop for review. Each change keeps intended values, approved version, submission/idempotency key, provider acknowledgment and a fresh read-back comparison. Submitted, accepted, observed, rejected, stale and uncertain remain distinct. Disconnects, rate limits and webhooks reconcile safely after recovery; retries never duplicate an uncertain pay action. File handoff remains supported alongside live sync. The named live connections are Gusto (PAYROLL-002), ADP RUN and ADP Workforce Now (PAYROLL-003), QuickBooks Payroll (PAYROLL-004) and Paychex Flex (PAYROLL-005).

**Acceptance.**
1. Approve a hire, salary change, leave reversal and termination through a connected payroll account.
2. Change a provider-owned field remotely, create a conflicting salary edit, duplicate callbacks and interrupt submission.
3. The HR/payroll queue resolves conflicts by authority and closes only after provider acknowledgment and matching read-back; money and tax execution remain with payroll.
4. Before shipping, PAYROLL-001 reconciles COMP-001 approved dated compensation and one-time bonuses through its connected roster/results and fresh read-back.
5. Payroll destinations include Envelope (ENV-, the sibling payroll seed) when available, alongside the named external providers; a frozen file or human-recorded receipt is never live provider verification.
6. At this door, compare the pinned workflow preview with execution; fail a step and observe blocked dependent work and closure, then upgrade deliberately without losing completed evidence.

**Evidence.** `tests/willow/regressions.mjs` — “regressions public-door journey”; `tests/willow/phase2.mjs` — “phase2 public-door journey”
**Gap.** Live two-way sync and provider read-back.

#### PAYROLL-002 — Live Gusto connection

Core · target · **missing** · Cites BASE-AUDIT-001, BASE-INPUT-001, BASE-OPS-003, BASE-ROLE-001, BASE-SECRET-001 · Rules D-3, D-1, D-5 · Register R-8

**Requirement.** An authorized employer connects Gusto through its approved app authorization and maps existing employees without duplicates. Two-way roster, employment/pay, applicable PTO, withholding-form status and benefit deduction synchronization follow PAYROLL-001 field authority. Supported operations and provider restrictions are explicit; unsupported required operations create accountable work with returned provider evidence, not false success. Production app approval, scopes, tenant activation and provider conformance are delivery requirements.

**Acceptance.**
1. Connect an employer Gusto tenant, match an existing roster, create a hire and scheduled pay change, receive a provider-side correction and terminate access to the connection.
2. Compare acknowledged and read-back records, refusal/expiry states and permission boundaries using provider-edge tests plus a consented production-account trial.
3. Before shipping, PAYROLL-002 reconciles COMP-001 approved dated compensation and one-time bonuses through its connected roster/results and fresh read-back.
4. Payroll destinations include Envelope (ENV-, the sibling payroll seed) when available, alongside the named external providers; a frozen file or human-recorded receipt is never live provider verification.
5. At this door, compare the pinned workflow preview with execution; fail a step and observe blocked dependent work and closure, then upgrade deliberately without losing completed evidence.

**Evidence.** None.
**Gap.** No delivered public-door journey for live gusto connection. The full field modes, named integrations and statutory outcomes remain required as specified.

#### PAYROLL-003 — Live ADP RUN and Workforce Now connections

Core · target · **missing** · Cites BASE-AUDIT-001, BASE-INPUT-001, BASE-OPS-003, BASE-ROLE-001, BASE-SECRET-001 · Rules D-3, D-1, D-5 · Register R-9

**Requirement.** Willow separately supports ADP RUN and ADP Workforce Now with the appropriate approved application/partner access, employer authorization, company/pay-group mappings and versioned field capability maps. Each connects employee roster, starts/ends, pay, applicable leave and deductions under PAYROLL-001, returns provider acknowledgment and checks observed state. WIL-21 ADP RUN Time Sheet Import remains compatibility support and cannot stand in for either live connection.

**Acceptance.**
1. Run the hire/pay/leave/termination reconciliation journey separately against ADP RUN and ADP Workforce Now provider-edge fixtures.
2. Reject a wrong company/code and ambiguous identity, recover an expired authorization and confirm provider read-back.
3. Exercise live provider-edge fixtures for each product.
4. Before shipping, PAYROLL-003 reconciles COMP-001 approved dated compensation and one-time bonuses through its connected roster/results and fresh read-back.
5. Payroll destinations include Envelope (ENV-, the sibling payroll seed) when available, alongside the named external providers; a frozen file or human-recorded receipt is never live provider verification.
6. At this door, compare the pinned workflow preview with execution; fail a step and observe blocked dependent work and closure, then upgrade deliberately without losing completed evidence.

**Evidence.** `src/willow/payroll-layout.ts` — “payroll-layout public-door journey”
**Gap.** No delivered public-door journey for live adp run and workforce now connections. The full field modes, named integrations and statutory outcomes remain required as specified.

#### PAYROLL-004 — Live QuickBooks Payroll connection

Core · target · **missing** · Cites BASE-AUDIT-001, BASE-INPUT-001, BASE-OPS-003, BASE-ROLE-001, BASE-SECRET-001 · Rules D-3, D-1, D-5 · Register R-10

**Requirement.** Authorized employers connect QuickBooks Payroll using the required Intuit application/partner interfaces and employer scopes. Employee identities, job/pay changes, applicable time/PTO and deduction mappings reconcile two ways under PAYROLL-001. QuickBooks Online accounting access alone is not proof of payroll access; required production partnership and unsupported-field workflows are visible engineering deliverables with provider receipts.

**Acceptance.**
1. Connect a QuickBooks Payroll employer, match existing workers and reconcile a hire, pay update, leave change and exit.
2. Return a provider correction, revoke access mid-sync and restore it; no duplicate employee or false completion results.
3. Prove payroll-specific acknowledgment/read-back in edge tests and a consented account trial.
4. Before shipping, PAYROLL-004 reconciles COMP-001 approved dated compensation and one-time bonuses through its connected roster/results and fresh read-back.
5. Payroll destinations include Envelope (ENV-, the sibling payroll seed) when available, alongside the named external providers; a frozen file or human-recorded receipt is never live provider verification.
6. At this door, compare the pinned workflow preview with execution; fail a step and observe blocked dependent work and closure, then upgrade deliberately without losing completed evidence.

**Evidence.** None.
**Gap.** No delivered public-door journey for live quickbooks payroll connection. The full field modes, named integrations and statutory outcomes remain required as specified.

#### PAYROLL-005 — Live Paychex Flex connection

Core · target · **missing** · Cites BASE-AUDIT-001, BASE-INPUT-001, BASE-OPS-003, BASE-ROLE-001, BASE-SECRET-001 · Rules D-3, D-1, D-5 · Register R-11

**Requirement.** An employer whose payroll runs on Paychex Flex connects it through Paychex's approved Flex API and integration-partner access, which Paychex's integrations team activates for that employer's company on the employer's authorization; the partner listing, production access and conformance are delivery work, as for Gusto and Intuit. The connection maps the Paychex company, worker identifiers, pay frequencies, earning, deduction and PTO codes under PAYROLL-001 field authority and matches the existing Paychex roster to Willow people without duplicates: exact provider identifier first, then reviewed matches on name and date of birth shown only to payroll levels; ambiguous matches stop for payroll review (MIGRATE-001). From then on a hire in Willow creates the Paychex worker in real time; name, contact, address, job, department, pay rate or salary and status changes, terminations and rehires reach Paychex on their effective date; approved PTO hours and benefit deductions (BENEFITS-002) go to their mapped codes where Paychex accepts them. Each change records its intended values, idempotency key, Paychex acknowledgment and a fresh read-back. Edits made in Paychex Flex to Paychex-owned fields come back to Willow and never silently overwrite Willow-owned terms; operations Paychex does not accept become accountable payroll work with Paychex's response, never false success. Revoked or expired authorization pauses the connection with a visible CONNECT-001 health state; restoring it resumes without resending acknowledged changes. The WIL-21 mapped file remains available and cannot stand in for this connection.

**Acceptance.**
1. Connect a Paychex Flex employer through provider-edge fixtures and match an existing roster in which payroll resolves one ambiguous name.
2. Then run the PAYROLL-001 journey: a hire whose Paychex worker reads back with matching fields, a pay change, a leave reversal, a termination, a correction made in Paychex Flex, and authorization revoked mid-sync and restored.
3. Each case closes only on Paychex acknowledgment plus matching read-back, with no duplicate worker, duplicate pay change or false completion.
4. Before shipping, PAYROLL-005 reconciles COMP-001 approved dated compensation and one-time bonuses through its connected roster/results and fresh read-back.
5. Payroll destinations include Envelope (ENV-, the sibling payroll seed) when available, alongside the named external providers; a frozen file or human-recorded receipt is never live provider verification.
6. At this door, compare the pinned workflow preview with execution; fail a step and observe blocked dependent work and closure, then upgrade deliberately without losing completed evidence.

**Evidence.** `src/willow/payroll-layout.ts` — “payroll-layout public-door journey”
**Gap.** No delivered public-door journey for live paychex flex connection. The full field modes, named integrations and statutory outcomes remain required as specified.

#### PAYROLL-006 — Pre-payday agreement check for every employee

Core · target · **partial** · Cites BASE-AUDIT-001, BASE-INPUT-001, BASE-OPS-003, BASE-ROLE-001, BASE-SECRET-001 · Rules D-3, D-1, D-5 · Register R-12

**Requirement.** For each pay period, before the connected provider's processing cutoff, Willow checks every employee in the pay group, not only those with changes, across the systems that feed the paycheck: Willow-owned employment status, pay rate or salary, approved leave hours and the period's handed-off changes (WIL-11) against a fresh payroll read-back (PAYROLL-001–005), and benefit and retirement elections (BENEFITS-002, RETIRE-001) against the deductions payroll will take. The result is one per-period agreement report in which each employee agrees, differs (naming the field, both values, the authoritative system under PAYROLL-001 and the owner who must act) or cannot be checked (stale read-back, missing provider identifier, uncertain submission). The period shows that every system agrees only when every employee agrees on read-backs taken after the last change and before the cutoff; a difference or unchecked employee keeps the period open with its owner under FLOW-002 escalation, and closes only when a new read-back matches. A change or provider-side edit after a passing check reopens it. Willow never alters pay to force agreement; payroll calculation and payment stay with the provider.

**Acceptance.**
1. With a connected payroll provider through provider-edge fixtures and a 48-person pay group, run the check before cutoff with every system in agreement and see the period marked as agreeing with its read-back time.
2. Then let the provider keep an old salary for one employee, deduct 4% against a 5% retirement election for another and leave a third without a provider identifier: the report lists all three with field, both values, authoritative system and owner, the period does not show agreement, and each item closes only after correction and a matching read-back.
3. Record a pay change after a passing check and confirm the period reopens until checked again.
4. Before shipping, PAYROLL-006 reconciles COMP-001 approved dated compensation and one-time bonuses through its connected roster/results and fresh read-back.
5. Payroll destinations include Envelope (ENV-, the sibling payroll seed) when available, alongside the named external providers; a frozen file or human-recorded receipt is never live provider verification.
6. At this door, compare the pinned workflow preview with execution; fail a step and observe blocked dependent work and closure, then upgrade deliberately without losing completed evidence.

**Evidence.** `tests/willow/flows.mjs` — “flows public-door journey”
**Gap.** Whole-roster comparison with provider read-back, deduction checks, the per-period agreement result and cutoff timing.

#### BENEFITS-001 — Enrollment and life events through brokers and carriers

Core · target · **missing** · Cites BASE-AUDIT-001, BASE-INPUT-001, BASE-OPS-003, BASE-ROLE-001, BASE-SECRET-001 · Rules D-3, D-1, D-5 · Register R-13

**Requirement.** HR and employees manage eligibility, dependents, plan comparison/costs, open enrollment, new-hire elections, waivers, qualifying life events and termination with effective dates and required documents. Employee Navigator and employer-authorized broker/carrier connections exchange census and elections with contracted US plans, including Aetna, UnitedHealthcare and Anthem where selected. Show per-carrier submitted/accepted/active/rejected coverage evidence, enrollment deadlines and unresolved handoffs. Carrier/API/834 agreements, broker licensing partners and protected-data agreements are delivery work; no unchecked task declares coverage active. Employers whose broker or carrier is not connected still record plans, rates, eligibility rules, waivers and elections in Willow, run open enrollment and export census/election files; each such election stays "recorded, not confirmed" until HR attaches the carrier's confirmation and never shows as active coverage before then.

**Acceptance.**
1. Enroll a new hire, waive a plan, add a dependent after a life event and terminate coverage.
2. Send through Employee Navigator/broker to the selected carrier, ingest acknowledgment and compare active coverage/dates; reject a dependent mismatch and resolve it.
3. Employees read their own elections, HR sees permitted status and managers cannot see health evidence.
4. Without any connection, record a plan and an election, export the census and confirm the status stays recorded, not active, until a carrier confirmation is attached.
5. Leave one new hire's elections incomplete as the new-hire enrollment deadline approaches: HR's enrollment view lists the hire as missing enrollment, the hire and HR receive one FLOW-002 reminder per cadence step, and reminders stop once an election or waiver is recorded.
6. Refuse payroll-only and IT-only approval of the benefits step.
7. Before shipping, approved SELF-001 legal-name/dependent revisions feed the benefits exception and reconciliation queue under the same current private-contact authority. Before shipping, extend REPORT-001 saved reports with this capability’s dated metrics and source drill-down, current row/field restrictions, unknown/freshness labels, safe scheduled links and CSV/XLSX parity; no metric may imply an unobserved provider outcome.

**Evidence.** None.
**Gap.** No delivered public-door journey for enrollment and life events through brokers and carriers. The full field modes, named integrations and statutory outcomes remain required as specified.

#### BENEFITS-002 — Benefit deductions and payroll mismatch resolution

Core · target · **missing** · Cites BASE-AUDIT-001, BASE-INPUT-001, BASE-OPS-003, BASE-ROLE-001, BASE-SECRET-001 · Rules D-3, D-1, D-5 · Register R-13

**Requirement.** Benefits/employee elections map to provider plans and employee/employer contribution codes, coverage effective dates, pay frequencies, pre/post-tax treatment and arrears rules approved by payroll. Reconcile carrier/broker elections, payroll deductions and observed payroll results per employee/pay period. Exceptions name the owner, amount/date discrepancy and corrective action; retroactive changes require reviewed adjustments and a returned acknowledgment.

**Acceptance.**
1. Change a benefit mid-period, preview deduction impact in USD, approve it, ingest payroll and carrier results and inspect a deliberately mismatched deduction.
2. Resolve and re-read both systems; the mismatch remains open until evidence agrees and a duplicate event creates no duplicate adjustment.
3. Refuse payroll-only and IT-only approval of the benefits step.
4. Before shipping, extend REPORT-001 saved reports with this capability’s dated metrics and source drill-down, current row/field restrictions, unknown/freshness labels, safe scheduled links and CSV/XLSX parity; no metric may imply an unobserved provider outcome.
5. At this door, compare the pinned workflow preview with execution; fail a step and observe blocked dependent work and closure, then upgrade deliberately without losing completed evidence.

**Evidence.** None.
**Gap.** No delivered public-door journey for benefit deductions and payroll mismatch resolution. The full field modes, named integrations and statutory outcomes remain required as specified.

#### BENEFITS-003 — ACA full-time measurement and 1095-C data

Core · target · **missing** · Cites BASE-AUDIT-001, BASE-INPUT-001, BASE-OPS-003, BASE-ROLE-001, BASE-SECRET-001 · Rules D-3, D-1, D-5 · Register R-13

**Requirement.** For employers at or near 50 full-time and full-time-equivalent employees, Willow calculates monthly full-time and FTE counts for applicable-large-employer status, tracks look-back measurement, administrative and stability periods for variable-hour and seasonal employees from TIME-001 and payroll hours, records offers of coverage, affordability inputs and waivers from BENEFITS-001, and produces per-employee monthly Form 1095-C codes and 1094-C totals for the payroll provider or broker that files. Calculations show their inputs; filing and IRS correspondence stay with that filer, and Willow records the filer's acknowledgment.

**Acceptance.**
1. For an invented employer with full-time, part-time and variable-hour staff over 12 months, compute monthly ALE counts, complete a look-back that makes one variable-hour worker full-time for the stability period, record offers and a waiver, and generate 1095-C lines that reconcile to the inputs.
2. Hand the file to the filer and record their acknowledgment; a missing month of hours is flagged, not assumed.
3. Refuse payroll-only and IT-only approval of the benefits step.
4. Before shipping, extend REPORT-001 saved reports with this capability’s dated metrics and source drill-down, current row/field restrictions, unknown/freshness labels, safe scheduled links and CSV/XLSX parity; no metric may imply an unobserved provider outcome.
5. At this door, compare the pinned workflow preview with execution; fail a step and observe blocked dependent work and closure, then upgrade deliberately without losing completed evidence.

**Evidence.** None.
**Gap.** No delivered public-door journey for aca full-time measurement and 1095-c data. The full field modes, named integrations and statutory outcomes remain required as specified.

#### RETIRE-001 — Retirement census and contribution handoff

Core · target · **missing** · Cites BASE-AUDIT-001, BASE-INPUT-001, BASE-OPS-003, BASE-ROLE-001, BASE-SECRET-001 · Rules D-1, D-5 · Register R-14

**Requirement.** Human Interest and Guideline connections maintain eligible census, employment dates, employee elections/deferrals, employer contribution mappings and payroll-period contribution status. Restricted HR/payroll owners review differences, submission receipts, provider acknowledgments and corrected census/contribution results. Custody, investment advice and plan administration stay with the plan provider while Willow follows the handoff to a verified outcome.

**Acceptance.**
1. For each of Human Interest and Guideline, send a hire/eligibility change, update a deferral, reconcile contribution results and process an exit.
2. Fail one census row and correct it without resending accepted rows; inspect the employee-scoped record and payroll reconciliation report.
3. Record a 5% deferral while payroll deducts 4%: the mismatch is flagged before the payroll cutoff with employee, period and amount, routed to its owner, and closes only after the corrected deduction reads back from payroll and the plan provider.

**Evidence.** None.
**Gap.** No delivered public-door journey for retirement census and contribution handoff. The full field modes, named integrations and statutory outcomes remain required as specified.

### Connected identity and collaboration

#### IDENTITY-001 — Provisioning and verified deprovisioning

Core · target · **partial** · Cites BASE-ACCESS-004, BASE-AUDIT-001, BASE-INPUT-001, BASE-OPS-003, BASE-ROLE-001, BASE-SECRET-001 · Rules D-3, D-2, D-6, D-1, D-5 · Register R-15

**Requirement.** Google Workspace, Microsoft 365/Entra ID and Okta connect through the reviewed identity-mapping door (D-6, RL-101). Join/move/leave dates drive account, group, license and role changes; privileged access remains separately authorized. Exits suspend accounts, revoke sessions/tokens and verify actual provider state. Data/shared-mailbox ownership and asset returns have named owners. Failed or uncertain removal keeps departure open; rehire grants are newly reviewed. Agent executions carry access, adding accounts for creation, security for credentials, sensitive for regulated attributes and external for provider disclosure; company policy decides each call.

**Acceptance.**
1. For each named service, approve a joiner, transfer departments and offboard while holding an active external session.
2. Inspect account/group/license read-back and session revocation, inject an API failure and show the open IT exception.
3. Rehire and prove prior grants are not silently restored.
4. The joiner's Google Workspace, Microsoft 365 and Okta accounts become usable on the start date, not before, and the leaver's are disabled by the end of their last day in the employer's time zone; the leaver case lists each connected system with its verified removal state and cannot report access removed while any read-back is pending or still shows the account active.
5. At this door, compare the pinned workflow preview with execution; fail a step and observe blocked dependent work and closure, then upgrade deliberately without losing completed evidence.

**Evidence.** `tests/willow/flows.mjs` — “flows public-door journey”; `tests/willow/identity.mjs` — “identity public-door journey”; `tests/willow/restore-access.mjs` — “restore-access public-door journey”
**Gap.** RL-101 resolves connection authority and minimal disclosure. Okta existing-account group add/remove and verified suspension are the foundation; Google Workspace/Microsoft 365, account creation, licenses, data ownership, complete scheduling and every session revocation remain unproved.

#### IDENTITY-002 — Google, Microsoft and Okta sign-in controls

Core · target · **partial** · Cites BASE-ACCESS-002, BASE-ACCESS-004, BASE-AUDIT-001, BASE-INPUT-001, BASE-OPS-003, BASE-ROLE-001, BASE-SECRET-001, BASE-SIGNIN-001 · Rules D-5 · Register R-15

**Requirement.** Employers use Google SSO, Microsoft Entra ID or Okta through OIDC/SAML with explicit member linking, verified domain/issuer configuration, fresh proof for relinking and employer-enforced MFA/session policies. Employers without SSO, and members who sign in by email link, meet the owner's MFA policy with Willow's native second factor (SECURITY-002). Provider attributes/groups map only through owner-reviewed rules; no token silently grants HR/payroll access. Sign-in, recovery, offboarding and role changes preserve identity, revoke active sessions as required and leave a protected owner recovery path.

**Acceptance.**
1. Exercise Google, Entra ID and Okta sign-in separately, then enforce MFA/session policy, change groups, relink and revoke a member.
2. Verify unchanged member/person IDs, no unapproved grants, refusal of wrong issuer/tenant and owner recovery without ended-member access.

**Evidence.** `tests/willow/phase2.mjs` — “phase2 public-door journey”; `tests/willow/enterprise-oidc.mjs` — “enterprise-oidc public-door journey”
**Gap.** Base-held: the pinned authentication modules have no SAML admission method and do not persist verified provider MFA assurance into sessions. Native MFA also requires SECURITY-002 and its maintained Base factor-secret sealing and installation-key custody. Owner-reviewed group mapping, employer MFA and session policy, and full live provider trials remain unproved.

#### COMMS-001 — Slack and Microsoft Teams work notifications

Core · target · **missing** · Cites BASE-AUDIT-001, BASE-INPUT-001, BASE-MAIL-001, BASE-OPS-003, BASE-ROLE-001, BASE-SECRET-001 · Register R-16

**Requirement.** Employees connect Slack or Microsoft Teams for scoped request/task/signature notifications, reminders and secure approval entry points. Membership and approver rights are checked again at action time. Messages use minimal fixed content and authenticated links; channels, bot storage and previews receive no pay, tax, medical or document content. Delivery/interaction outcomes and revocation are recorded independently of business completion.

**Acceptance.**
1. Connect each service, request PTO and deliver a manager reminder, follow an approval link as the right/wrong actor and revoke the connection.
2. Replay an interaction and inject delivery failure; only one authorized decision occurs, failures remain visible and private fields never appear in channel content.
3. Before shipping, COMMS-001 preserves ENGAGE-001 named/anonymous result grants, HR-only anonymous comments and recipient-only anonymous participation/reminder visibility in its new doors or channels.

**Evidence.** None.
**Gap.** No delivered public-door journey for slack and microsoft teams work notifications. The full field modes, named integrations and statutory outcomes remain required as specified.

### Performance and HR modules

#### PERFORM-001 — Performance reviews, goals and feedback

Core · target · **done** · Cites BASE-INPUT-001, BASE-ROLE-001

**Requirement.** HR runs configurable cycles with self, manager and peer/360 input, role questions, deadlines, reminders, calibration, acknowledgments, appeals and locked history. Contributors read only their own inputs; HR explicitly releases immutable summaries/ratings without private notes or raw inputs. Manager succession retains prior delivered releases and permits named audited withholding for the new recipient. Corrections preserve the old release. Performance material is excluded from model context and automated employment scoring is outside the product.

**Acceptance.**
1. Run a two-team cycle, request and submit role-specific inputs, escalate late work, calibrate and release.
2. Change manager and inspect confidential inputs, withheld summaries and retained prior deliveries; read corrections, appeal and acknowledgment against their original release.
3. Export a closed cycle, end employment and inspect immutable history and current field authority; closure refuses incomplete collection or unreleased results.

**Evidence.** `tests/willow/performance.mjs` — “PERFORM-001 two teams, scoped feedback, late escalation, calibration, immutable releases, succession, appeals, cross-cycle goals, current authority and retained exit history”
**Gap.** None.

#### ENGAGE-001 — Engagement surveys and accountable action

Core · target · **partial** · Cites BASE-INPUT-001, BASE-ROLE-001 · Rules D-2

**Requirement.** HR publishes named and anonymous pulse/eNPS or lifecycle surveys with fixed cohorts, disclosed collection, scheduled portal delivery and reminders. Anonymous collection preserves recipient-only participation, forbids differing overlapping cohorts and result filters, and suppresses small cells across the full survey. Anonymous comments remain unlinked, HR-only and uneditable except reasoned hiding. Themes and human-owned action plans link to protected follow-up comparisons; optional AI summaries carry sensitive and cite source groups without scoring individuals under company policy. Detailed suppression and work rules are in [record rules](docs/contract/record-rules.md#engage-001--engagement-surveys-and-accountable-action).

**Acceptance.**
1. Run named onboarding and anonymous engagement surveys, collect responses, try small/overlapping cohort filters and inspect manager/HR exports.
2. Publish a theme/action plan, assign an owner and measure the next pulse; suppression holds and no individual inference appears in AI context.
3. Inspect recipient-only anonymous work, duplicate/declined/closed participation and real reminder outcomes.
4. Release a theme to a scoped manager and plan to its named owner; neither gains raw answers, comments or other plans.

**Evidence.** `tests/willow/surveys.mjs` — “ENGAGE-001 named/anonymous collection, disclosure, suppression, comments, work and follow-up”
**Gap.** Missing the optional AI summary journey citing protected source groups under company policy; the cited survey journey proves native collection, suppression, themes, owned plans and follow-up.

#### COMP-001 — Compensation bands and planning

Core · target · **partial** · Cites BASE-INPUT-001, BASE-ROLE-001 · Rules D-2, D-1, D-5

**Requirement.** HR/payroll maintain dated USD salary/hourly bands and promotion, merit and bonus cycles. Managers propose only within scope; a distinct eligible compensation authority decides exact budgets, amounts and dates. Publication binds every source/band/proposal revision, commits all terms together and refuses conflicts or budget overrun. Out-of-band exceptions carry a recorded reason. Payroll reconciliation includes one-time bonuses and observed provider results. Agent pay writes carry money and commitment under company policy; no score generates a pay recommendation.

**Acceptance.**
1. Create dated bands and a budget; two managers submit revisions and inspect exact annualized cost and out-of-band exceptions.
2. Refuse self-decision, stale sources/bands and over-budget publication with no terms written; approve a valid cycle and reconcile its exact dated terms and separate bonus handoff.
3. As a member without pay authority, read no other team’s amount; repeat after current-rights changes.

**Evidence.** `tests/willow/compensation.mjs` — “COMP-001 bands, budgeted approvals, payroll reconciliation, equity and public forms”
**Gap.** Missing a company-policy agent pay-change journey and connected payroll read-back; the cited compensation journey proves native budget/publication guards and frozen-file human-recorded receipts.

#### LEARN-001 — Training assignments and TalentLMS connection

Core · target · **missing** · Cites BASE-AUDIT-001, BASE-INPUT-001, BASE-OPS-003, BASE-ROLE-001, BASE-SECRET-001 · Rules D-5 · Register R-17

**Requirement.** HR assigns mandatory and development training by role/location with due dates, recurring certifications, evidence and reminder/escalation. TalentLMS exchanges rosters, enrollment and completion/certificate results; provider completion is distinguished from a manual acknowledgment and expiring certifications reopen required work. The employee record and authorized reports retain completion history when a learner leaves.

**Acceptance.**
1. Assign a hire to role-specific TalentLMS courses, ingest completion and a certificate, expire one certification and observe the renewal task.
2. Suspend a departed learner and export the retained training record; a lost/duplicate callback cannot fabricate or duplicate completion.

**Evidence.** None.
**Gap.** No delivered public-door journey for training assignments and talentlms connection. The full field modes, named integrations and statutory outcomes remain required as specified.

#### COMP-002 — Protected pay-equity measurement

Core · target · **done** · From COMP-001 · Cites BASE-INPUT-001, BASE-ROLE-001 · Rules D-1

**Requirement.** Authorized pay-equity readers compare annualized USD pay by sex and race/ethnicity in a complete job-level partition with fixed title/location/basis strata. Voluntary self-ID is the only protected-class source; unknown/declined and excluded non-USD or missing-schedule data remain explicit. Small included or excluded cells suppress counts, means, percentages and totals across dimensions. The report makes no individual recommendation. Exact calculations are in [record rules](docs/contract/record-rules.md#comp-001--compensation-bands-and-planning).

**Acceptance.**
1. Run a job-level report with permitted EEO and compensation rights and reconcile the fixed cohort, controls and calculations.
2. Inspect unknown, declined and excluded data and complementary small-cell suppression without individual values or drill-down.
3. Remove one required right and refuse the report; no pay change is proposed or executed.

**Evidence.** `tests/willow/compensation.mjs` — “COMP-001 protected pay equity”
**Gap.** None.

#### PERFORM-002 — Goals and development work

Core · target · **done** · From PERFORM-001 · Cites BASE-INPUT-001, BASE-ROLE-001 · Rules D-1

**Requirement.** Goals, milestones and dated check-ins carry across review cycles. The subject, current manager and HR maintain them; an active named owner or HR completes development work with evidence. Explicit level modes add only scoped goal rights through SELF-001 and do not widen review or survey access. Work follows FLOW-002 without allowing a substitute to submit another contributor’s input.

**Acceptance.**
1. Maintain a goal and dated check-in across cycles and read its history.
2. Assign development work with owner/deadline and complete with that owner’s evidence; refuse a different actor.
3. Submit a level-approval-mode goal change and inspect its exact native queue and current-authority result.

**Evidence.** `tests/willow/performance.mjs` — “PERFORM-001 cross-cycle goals and development; goalModeProof”
**Gap.** None.

### Integration operation, reporting and portability

#### CONNECT-001 — Operable connections and attribute rules

Core · target · **partial** · Cites BASE-AUDIT-001, BASE-INPUT-001, BASE-OPS-003, BASE-ROLE-001, BASE-SECRET-001 · Rules D-3, D-4, D-1, D-5 · Register R-18

**Requirement.** Owners authorize each named connector with least scopes, per-field mapping/authority and explicit outbound-data previews. Health shows last successful sync/read-back, freshness, scope loss, rate limits, stale/error/uncertain state and a per-person mismatch queue with owner/next action. Signed/replay-protected webhooks, durable execution IDs, reviewed safe retries and reconciliation after disconnect prevent duplicate effects. Secrets stay in protected runtime custody; rotation/revocation and provider-data deletion are explicit. Required production app review, contracts, scopes and health-data agreements are tracked to completion for every supported integration. The employer's own and partner tools read and subscribe through API-001–003 under the same health and audit.

**Acceptance.**
1. Connect a provider, change an attribute/access rule after preview, rotate credentials, lose a scope and replay a webhook.
2. Restart during a change and inspect fresh/stale/error state and one durable outcome; no private payload/credential appears in logs, exports or unauthorized agent context.
3. At this door, compare the pinned workflow preview with execution; fail a step and observe blocked dependent work and closure, then upgrade deliberately without losing completed evidence.
4. At each supported source or provider, exercise the shared field-definition, dated-history, immutable-sensitivity and current-projection rules, including retired values and guarded repeat/undo.

**Evidence.** `tests/willow/phase2.mjs` — “phase2 public-door journey”
**Gap.** General connector execution, health and reconciliation.

#### REPORT-001 — Custom workforce reporting and operational dashboards

Core · target · **partial** · Cites BASE-INPUT-001, BASE-ROLE-001 · Rules D-1

**Requirement.** HR saves scoped reports over standard/custom workforce fields, dated headcount/FTE, turnover, tenure, leave liability, pay, diversity, benefits mismatches, signatures, hiring and overdue work. Definitions expose filters, dates, denominators, exclusions, unknowns, freshness and authorized source drill-down. Page and CSV/XLSX use the same calculations; mixed-source revisions refuse rather than return mixed results. Missing module metrics remain that module’s delivery obligation. Calculations are in [record rules](docs/contract/record-rules.md#report-001--custom-workforce-reporting-and-operational-dashboards).

**Acceptance.**
1. Build a report joining custom fields, workforce totals, leave and open exceptions; reconcile every total to permitted dated sources.
2. Compare page/CSV/XLSX, unknown/withheld labels and historical work exclusions; read no forbidden reason or evidence.
3. Add benefits, signature and hiring metrics from their own delivered doors and reconcile dated source drill-down.

**Evidence.** `tests/willow/custom-reports.mjs` — “REPORT-001 custom workforce reports, scheduled links, dated drilldown and protected diversity”
**Gap.** Missing dated hiring, benefits and complete signature metric journeys through the saved-report door; the cited report journey proves existing workforce/custom fields, leave, exceptions, files and drill-down.

#### MIGRATE-001 — Switch from each incumbent without losing history

Core · target · **partial** · Cites BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-INPUT-001, BASE-ROLE-001 · Rules D-4, D-1, D-5

**Requirement.** Named move-in paths cover BambooHR (WIL-16), Rippling, HiBob, Gusto HR, Factorial and Deel HR using approved source APIs/exports. HR maps identities/custom fields and custom/multi-row tables including assets (PEOPLE-003), org/manager history, employment/pay versions, documents, signature templates and certificates, access levels (proposed, assigning nothing until approved), leave policies/balances/requests, benefits elections, goals/reviews/training, open lifecycle work, and open job openings with candidates and application history (from the incumbent, or from Greenhouse, Lever, Workable or JazzHR for employers leaving a separate ATS). Per-source preview lists unsupported fields and originals, reconciles counts and balances, and never substitutes empty data. Source IDs/provenance survive; repeated imports are idempotent, overlap cutover freezes agreed authority and guarded undo cannot destroy subsequent work. Imported history never grants sessions or triggers external actions. At cutover each connected payroll provider's existing roster (Gusto, ADP RUN, ADP Workforce Now, QuickBooks Payroll, Paychex Flex) is matched to the migrated people by provider identifier, then by reviewed name and date-of-birth matches, before any live sync starts; unmatched or ambiguous workers wait in a payroll-owned queue and nothing is created in the provider until they are resolved.

**Acceptance.**
1. For each named source, preview a representative export with current/former/rehired workers, a signed document, balance, historical change, a custom table and an open opening with candidates; resolve conflicts, apply, compare row/document/balance totals and repeat.
2. Edit an imported record and prove undo refusal; close cutover only after HR signs a variance report and all retained originals can be exported.
3. Match a Paychex Flex roster with one unmatched and one ambiguous worker at cutover; no live sync runs and no Paychex worker is created until payroll resolves both.
4. Each source's export includes an open onboarding checklist with completed and outstanding tasks; it arrives as one open case whose completed tasks keep their completion and whose outstanding tasks keep assignee and due date, without sending any notice.
5. At each supported source or provider, exercise the shared field-definition, dated-history, immutable-sensitivity and current-projection rules, including retired values and guarded repeat/undo.

**Evidence.** `tests/willow/flows.mjs` — “flows public-door journey”
**Gap.** Other named kits, expanded history types and payroll-roster matching at cutover.

#### MIGRATE-002 — Complete BambooHR move-in beyond the current kit

Core · target · **partial** · Cites BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-INPUT-001, BASE-ROLE-001 · Rules D-4, D-1, D-5

**Requirement.** Extending WIL-16, the BambooHR path reads BambooHR's API with an employer-issued key, or its exports, and also carries job and compensation history tables with effective dates, custom fields and custom/multi-row tables (emergency contacts, education, certifications, assets), the full files/documents export at the OPS-002 reference size with folder-to-category mapping, signature templates and completed signed documents with their audit trail, time-off policies, history and requested/approved leave, access levels proposed as ROLE-001 levels for HR review, and open job openings, candidates and application history into HIRING-002/003. The preview lists every unmapped field or table and reconciles counts; WIL-16's guarded undo, idempotency and retained originals apply; and no imported record sends an invitation, signature request, webhook or job posting until HR enables it. Employers leaving BambooHR's payroll add-on also bring its pay history, year-to-date wages, taxes and deductions and employee tax setup from BambooHR Payroll's exports: Willow keeps them as restricted, read-only payroll history, hands the year-to-date and tax-setup files to the provider they move to, connects that provider under PAYROLL-001–005 and reconciles the provider's first live roster and year-to-date totals against the imported history.

**Acceptance.**
1. From a BambooHR-shaped API fixture and export set with job history, a custom table, two assets, signed documents, open openings with candidates and three access levels, preview, map and apply; reconcile every table, document byte and balance, confirm the proposed level mapping assigns nothing until approved and that no invitation, webhook or posting fires.
2. From a BambooHR Payroll-shaped export, import pay history and year-to-date totals as restricted history, hand them to a newly connected provider and reconcile its first roster and totals; a manager cannot read the history.
3. Repeat and undo as in WIL-16.
4. At each supported source or provider, exercise the shared field-definition, dated-history, immutable-sensitivity and current-projection rules, including retired values and guarded repeat/undo.

**Evidence.** `tests/willow/flows.mjs` — “flows public-door journey”
**Gap.** API source, history and custom tables, signatures, access levels, ATS data, BambooHR Payroll history and large archives.

#### DATA-001 — Usable employee exports and complete target-product portability

Core · target · **partial** · Cites BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-INPUT-001, BASE-ROLE-001 · Rules D-1, D-5

**Requirement.** Selected employee CSV/XLSX and document/module-history bundles use current field rights and dated native projections. Module histories include immutable proposals, decisions, handoffs, goals, development and review-release custody without other subjects or pickers. Owner archives extend Base portability to every HR, signing, benefits, connector and automation record, preserving schema, provenance and erasure fences. External consent is non-portable and pending sends stay paused; old enabled archives normalize settings without altering the source backup. EEO values remain outside ordinary employee exports.

**Acceptance.**
1. Export selected employee fields as HR and manager and compare with their permitted records.
2. Archive a populated target HRIS, restore into an empty installation, compare all portable records/files and re-sign in.
3. Confirm old sessions/credentials fail and scheduled provider work stays paused until explicitly reauthorized.

**Evidence.** `tests/willow/employee-export.mjs` — “employee-export public-door journey”; `tests/willow/employee-bundle.mjs` — “employee-bundle public-door journey”; `tests/willow/employee-bundle-browser.mjs` — “employee-bundle-browser public-door journey”; `tests/willow/restore-access.mjs` — “restore-access public-door journey”; `tests/willow/bundle-review-fixture.mjs` — “bundle-review-fixture public-door journey”
**Gap.** Other module histories, erasure restore fences, reference-size transfers and complete target-product archive/restore coverage.

#### DATA-002 — Retention, legal holds and complete erasure

Core · target · **partial** · Cites BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-INPUT-001, BASE-ROLE-001 · Rules D-2, D-1

**Requirement.** The employer adopts sourced US retention classes, confirms state rules and classifies every document/custom field/table. Longer applicable rules win and cannot be shortened below the federal table. A hold names scope, reason, owner and review date; held evidence moves to restricted custody and its review is owned work. Expired retained custody purges after warning when no hold applies; other expired records require digest-bound review. Class tables and calculations are in [record rules](docs/contract/record-rules.md#data-002--retention-legal-holds-and-complete-erasure). Agent retention/hold actions carry sensitive and security, adding destructive for purge, under company policy.

**Acceptance.**
1. Adopt the federal/state table and classify records; an unmapped holding class or unconfirmed work state prevents purge.
2. Place a dated hold on a class or person; read retained evidence and refuse removal, then release it and read a fresh warning and due work.
3. Advance retention periods and inspect restricted custody versus still-live review-list records, confirming only eligible purges.

**Evidence.** `tests/willow/retention.mjs` — “retention public-door journey”; `tests/willow/restore-erasure.mjs` — “restore-erasure public-door journey”; `tests/willow/retention-browser.mjs` — “retention-browser public-door journey”; `tests/willow/retention-import.mjs` — “retention-import public-door journey”; `tests/willow/retention-payroll.mjs` — “retention-payroll public-door journey”; `tests/willow/eeo-snapshot-erasure.mjs` — “eeo-snapshot-erasure public-door journey”; `tests/willow/eeo-snapshot.mjs` — “eeo-snapshot public-door journey”; `tests/willow/eeo-snapshot-browser.mjs` — “eeo-snapshot-browser public-door journey”; `tests/willow/eeo-preboard-erasure.mjs` — “eeo-preboard-erasure public-door journey”
**Gap.** The owner's "erasure history unverified" acknowledgement for a fresh destination is blocked on a maintained Base CLI/portability release (the pinned rer 0.2.68 has no v2 acknowledgement gate or import-report field); erasure of members without employment, complete import-redaction receipt tallies, and complete audit/history identity scrubbing for short or JSON-escaped names remain unproved. Loose files left by older imports without a native, retained or staged owner fail closed as unresolved blob custody; new imports keep unmapped ZIP entries only in the withdrawable original.

#### AUDIT-001 — Traceable HR and automation history

Core · target · **partial** · Cites BASE-AUDIT-001, BASE-DATA-003, BASE-INPUT-001, BASE-OPS-005, BASE-ROLE-001 · Rules D-5

**Requirement.** The HR chronology joins profile changes, sensitive reads, decision revisions, imports/undo, document/signature access, connector attempts and agent execution. Business changes and audit commit together. Erasure substitutes the receipt’s random label consistently in actor/subject references and named history text while preserving sequence, action, time and counts. Hold, purge, receipt and individual EEO events carry no values.

**Acceptance.**
1. Follow one approved employee change from its profile request through approvals, document signing and all provider acknowledgments using the audit door.
2. Deny an unauthorized read, interrupt a provider action and perform erasure; the exported chronology is complete without secrets or the erased identity.

**Evidence.** `tests/willow/flows.mjs` — “flows public-door journey”
**Gap.** Cross-provider history and erasure anonymization.

#### SECURITY-001 — Private-by-default HR operation and Base guarantees

Core · target · **partial** · Cites BASE-ACCESS-002, BASE-ACCESS-004, BASE-DATA-004, BASE-INPUT-001, BASE-INPUT-002, BASE-INPUT-003, BASE-ROLE-001, BASE-SECRET-001 · Rules D-5

**Requirement.** The all-door matrix uses Willow’s distinct HR facets, named levels, API identities, erasure custody and EEO rights. Managerial rank grants no sensitive facet. Before enabling a service, its data, purpose and retention are visible; model training on HR data is not authorized by activation. Category evidence does not replace external account revocation.

**Acceptance.**
1. Exercise all registered doors with an access-level matrix (built-in and custom levels and API keys) including restricted benefits/review/EEO fields, hostile text/uploads and cross-origin writes; revoke access mid-session and inspect downloads, logs and connector/model payloads.
2. Prove the core HRIS works without optional providers and document each explicit Base replacement with its public-door proof.

**Evidence.** `tests/willow/flows.mjs` — “flows public-door journey”
**Gap.** Future modules, complete erasure and wider security/egress coverage.

#### SECURITY-002 — Native second-factor sign-in and an owner MFA policy

Core · target · **missing** · Cites BASE-ACCESS-004, BASE-INPUT-001, BASE-ROLE-001, BASE-SECRET-001, BASE-SIGNIN-002 · Rules D-1

**Requirement.** The employer requires native factors for everyone or chosen levels, always including sensitive pay, tax, EEO, health and access administrators. Multiple levels take the strictest requirement. Enrollment/challenge gates every HR record door; delegated reset forbids self-reset and ends sessions. Trusted-device state ends on relevant authority/policy changes. The report lists required/enrolled state and last challenge without secrets. SSO MFA counts only where the employer accepts its assertion; non-person keys remain separately scoped. Restore requires fresh enrollment.

**Acceptance.**
1. With no SSO configured, require a second factor for the HR administrator and Payroll administrator levels.
2. An HR administrator holding only a valid email link is refused by every page, API and download door until a TOTP or passkey challenge passes, while an employee-only member signs in with the link alone.
3. Trust a device, advance the clock past the period and receive a fresh challenge.
4. A delegated administrator resets the HR administrator's lost factor (audited, sessions ended); the member's own reset attempt and the delegate's reset of their own factor are refused.
5. Remove the requirement from HR administrator for a member who also holds Payroll administrator; they are still challenged.
6. The enrollment report matches the member list, an API key keeps working without a challenge, and an owner archive contains no factor secret or recovery code.

**Evidence.** `src/auth.server.ts` — “auth.server public-door journey”
**Gap.** No delivered public-door journey for native second-factor sign-in and an owner mfa policy. The full field modes, named integrations and statutory outcomes remain required as specified.

#### OPS-001 — Runnable, recoverable employer-owned product

Core · target · **partial** · Cites BASE-ACCESSIBILITY-001, BASE-BACKUP-001, BASE-INPUT-001, BASE-INSTALL-001, BASE-OPS-001, BASE-OPS-002, BASE-ROLE-001 · Rules D-5 · Register R-22, R-23

**Requirement.** The provider-free installation runs the complete supported Willow command journey on a populated employer. Durable pending work recovers to its actual state without silently replaying an external effect. OPS-002 capacity is measured before it is claimed.

**Acceptance.**
1. Use the supported commands to set up, run, stop, upgrade and recover a populated employer, compare records/grants/files and inspect missing-dependency diagnostics.
2. Restart with pending work and verify no false completion/replay; run desktop/phone and keyboard journeys, and pass the OPS-002 reference-employer run before claiming production capacity.

**Evidence.** `tests/willow/journey.mjs` — “journey public-door journey”; `tests/willow/restore-access.mjs` — “restore-access public-door journey”
**Gap.** Upgrade, capacity, accessibility and future-work recovery acceptance.

#### OPS-002 — Reference employer capacity with stated bounds

Core · target · **partial** · Cites BASE-INPUT-001, BASE-ROLE-001 · Rules D-1 · Register R-21

**Requirement.** A reference employer works on declared CI hardware with the deployment limits published: 250 active and 150 former employees, seven years of effective-dated history (at least ten terms versions per person), 40,000 documents totaling 25 GB, the leave ledgers and lifecycle cases that history implies, and 60 concurrent signed-in members. Single documents up to 50 MB upload; migration source files and document archives up to 25 GB upload by resumable multipart transfer and are processed streaming, without holding a whole file in memory. On that data the hosted product meets: directory, profile and self-service pages p95 ≤ 1 s server time; directory search p95 ≤ 500 ms; standard reports and their CSV ≤ 5 s; custom reports ≤ 15 s or a background job with progress; a payroll change-batch preview for every employee ≤ 30 s; a full BambooHR move-in (WIL-16, MIGRATE-002) preview ≤ 30 minutes and apply ≤ 2 hours, resumable after interruption; owner archive export and restore ≤ 4 hours each. Work beyond the reference employer either completes within these bounds or is refused before any write with a named limit (such as `documents.total_bytes`); nothing is silently truncated.

**Acceptance.**
1. Generate the invented reference employer and its BambooHR-shaped export (including a 25 GB documents archive), run move-in, directory, search, standard and custom reports, payroll batch preview, export and restore on declared CI hardware, and record each timing against its bound with complete row/byte reconciliation.
2. Interrupt the move-in and resume it without duplicates; exceed one stated limit and receive the named refusal with no partial write.

**Evidence.** `src/willow/documents.ts` — “documents public-door journey”; `src/willow/movein/bamboohr.ts` — “bamboohr public-door journey”
**Gap.** Reference-employer bounds, multipart transfer and hosted measurement.

#### OPEN-001 — Free and open source under the MIT license

Core · target · **partial** · Cites BASE-DATA-005, BASE-INPUT-001, BASE-INSTALL-001, BASE-ROLE-001 · Rules D-5

**Requirement.** Willow’s source and package are MIT licensed, allowing running, modification and redistribution. Every delivered capability is available without a product license, commercial gate, seat or employee plan, upgrade prompt or author account. Capacity bounds are technical limits; missing clauses remain missing. Connected third-party providers are named as the billing party before activation. Willow is independent of the incumbents it replaces.

**Acceptance.**
1. Verify the repository's `LICENSE` is the MIT license and `package.json` declares MIT; start it from the public source with the one line `npx -y @runeditrun/rer dev just-every/run-willow`, with no account or key from Willow's authors, and reach every product area as a 48-person employer without a payment, upgrade or license prompt; begin enabling a paid provider connection and verify the screen names that provider as the party that bills for it before activation.
2. Compare available capabilities with the contract statuses: none has a commercial gate, and a missing target clause is still shown as missing rather than claimed to exist by OPEN-001.

**Evidence.** `tests/willow/open-public-start.mjs` — “OPEN-001 public main installer tour”; `tests/willow/open-billing.mjs` — “OPEN-001 provider billing before activation”
**Gap.** Missing an installer tour resolved to the candidate SHA in Verify; the old public-start journey resolves public main and the current-tree journey proves provider billing disclosure only.

#### DATA-003 — Complete employee and applicant erasure

Core · target · **partial** · From DATA-002 · Cites BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-INPUT-001, BASE-ROLE-001

**Requirement.** Erasure covers eligible former workers, every linked rejected/withdrawn application and resume, expired/withdrawn preboarding and ended non-owner members. The preview classifies tables, blobs, derived stores, import originals and outside copies and refuses unresolved business work. Exact digest confirmation journals erasure, authority termination, restricted remainder, anonymous history labels and receipt counts. Ordinary reads contain no erased person or retained remainder. Only this journaled path may amend immutable history.

**Acceptance.**
1. Erase an eligible former worker and an applicant with linked applications; compare table, class, blob and import counts with the exact preview and non-identifying receipt.
2. Keep held/retained records only in the audited restricted door; private EEO remainder still needs its separate right.
3. Inspect all ordinary pages, downloads, search, reports, context and bundles; no erased identity or retained remainder appears.
4. Refuse a stale preview or unresolved work; revoke sessions, links, invitations, levels and issued credentials in the erasure transaction.
5. Scrub retained actor/subject references and named free text while preserving sequence, action and time; affected import undo refuses and keyed repeat-import matches wait for review.

**Evidence.** `tests/willow/retention.mjs` — “retention public-door journey”; `tests/willow/restore-erasure.mjs` — “restore-erasure public-door journey”; `tests/willow/retention-browser.mjs` — “retention-browser public-door journey”; `tests/willow/retention-import.mjs` — “retention-import public-door journey”; `tests/willow/retention-payroll.mjs` — “retention-payroll public-door journey”; `tests/willow/eeo-snapshot-erasure.mjs` — “eeo-snapshot-erasure public-door journey”; `tests/willow/eeo-snapshot.mjs` — “eeo-snapshot public-door journey”; `tests/willow/eeo-snapshot-browser.mjs` — “eeo-snapshot-browser public-door journey”; `tests/willow/eeo-preboard-erasure.mjs` — “eeo-preboard-erasure public-door journey”
**Gap.** Missing the complete complete employee and applicant erasure journey. The owner's "erasure history unverified" acknowledgement for a fresh destination is blocked on a maintained Base CLI/portability release (the pinned rer 0.2.68 has no v2 acknowledgement gate or import-report field); erasure of members without employment, complete import-redaction receipt tallies, and complete audit/history identity scrubbing for short or JSON-escaped names remain unproved. Loose files left by older imports without a native, retained or staged owner fail closed as unresolved blob custody; new imports keep unmapped ZIP entries only in the withdrawable original.

#### DATA-004 — Erasure outside copies and restore fences

Core · target · **partial** · From DATA-002 · Cites BASE-DATA-001, BASE-DATA-003, BASE-DATA-006, BASE-INPUT-001, BASE-ROLE-001 · Rules D-1, D-5

**Requirement.** Erasure receipts declare exported offline copies and each provider destination. Deletion requests stay owner-assigned work until observed deleted, retained with stated reason/expiry, or failed; unanswered requests remain open. Archives preserve the journal, holds, receipts and restricted remainder. A known pre-erasure restore is refused; a fresh destination without later evidence requires the explicit unverified-history acknowledgment and never claims old archive bytes were erased.

**Acceptance.**
1. Fail a provider deletion request and read its still-open owner, evidence and next action; later record its actual outcome.
2. Restore a pre-erasure archive with known or supplied later journal and observe refusal.
3. Use a fresh destination without later evidence and read the explicit acknowledgment and import report; inspect the unchanged original archive.

**Evidence.** `tests/willow/retention.mjs` — “retention public-door journey”; `tests/willow/restore-erasure.mjs` — “restore-erasure public-door journey”; `tests/willow/retention-browser.mjs` — “retention-browser public-door journey”; `tests/willow/retention-import.mjs` — “retention-import public-door journey”; `tests/willow/retention-payroll.mjs` — “retention-payroll public-door journey”; `tests/willow/eeo-snapshot-erasure.mjs` — “eeo-snapshot-erasure public-door journey”; `tests/willow/eeo-snapshot.mjs` — “eeo-snapshot public-door journey”; `tests/willow/eeo-snapshot-browser.mjs` — “eeo-snapshot-browser public-door journey”; `tests/willow/eeo-preboard-erasure.mjs` — “eeo-preboard-erasure public-door journey”
**Gap.** Missing the complete erasure outside copies and restore fences journey. The owner's "erasure history unverified" acknowledgement for a fresh destination is blocked on a maintained Base CLI/portability release (the pinned rer 0.2.68 has no v2 acknowledgement gate or import-report field); erasure of members without employment, complete import-redaction receipt tallies, and complete audit/history identity scrubbing for short or JSON-escaped names remain unproved. Loose files left by older imports without a native, retained or staged owner fail closed as unresolved blob custody; new imports keep unmapped ZIP entries only in the withdrawable original.

#### REPORT-002 — Safe scheduled report links

Core · target · **done** · From REPORT-001 · Cites BASE-INPUT-001, BASE-MAIL-001, BASE-ROLE-001 · Rules D-1

**Requirement.** A report creator or owner schedules an exact reviewed definition for named active reporting members on employer-local dates. A new definition requires renewed schedule review; due occurrences are claimed durably without backfilling duplicate messages. Fixed text contains an authenticated link, not report values. Refused, disabled and uncertain sends stay distinct; uncertain sends are not blindly retried.

**Acceptance.**
1. Schedule a report, restart across a due occurrence and read one claimed delivery outcome.
2. Remove recipient or schedule-approver rights before dispatch and observe refusal; restore access and open only currently permitted fields.
3. Change the definition and refuse the old schedule review; inject an uncertain send and inspect it without a duplicate.

**Evidence.** `tests/willow/custom-reports.mjs` — “REPORT-001 scheduled links”
**Gap.** None.

#### REPORT-003 — Aggregate workforce diversity

Core · target · **done** · From REPORT-001 · Cites BASE-INPUT-001, BASE-ROLE-001 · Rules D-1

**Requirement.** Diversity reporting requires both aggregate EEO and report rights and uses dated voluntary self-ID, never HR-recorded categories. It is an unfiltered employer-wide aggregate without individual identity or drill-down. A positive small cell in either fixed dimension suppresses every count and total in both dimensions; erased people and retained remainders stay excluded.

**Acceptance.**
1. Read an as-of diversity breakdown with EEO/report rights and reconcile the voluntary-answer cohort.
2. Seed a small cell and read suppressed cells and total across both dimensions.
3. Refuse a manager without those grants and inspect the read audit; no individual answer or identity is returned.

**Evidence.** `tests/willow/custom-reports.mjs` — “REPORT-001 protected diversity”
**Gap.** None.

### Honest boundaries

#### BOUNDARY-001 — US-first HRIS with accountable external execution

Core · target · **partial** · Cites BASE-INPUT-001, BASE-ROLE-001 · Rules D-5

**Requirement.** Willow owns US-first core HR, hiring, self-service in English and Spanish, access, API/webhooks, native signing, PTO, lifecycle, EEO-1 preparation, ACA data, performance and engagement. Payroll calculation/payment/filing, insurance/COBRA, retirement custody, official agency filing, screening, LMS delivery and device enforcement remain with their named providers. Every connected handoff still requires its observed outcome. Provider ownership details remain in [record rules](docs/contract/record-rules.md#boundary-001--us-first-hris-with-accountable-external-execution).

**Acceptance.**
1. Walk a US hire/change/exit through the employee, HR, payroll, benefits and IT doors; inspect the system of record, external owner, USD amounts, required approval, receipt and final observed outcome for each step.
2. An unconnected or unacknowledged dependency remains open, and the UI never claims payroll payment, insurance coverage or legal compliance from a checked task.

**Evidence.** `tests/willow/flows.mjs` — “flows public-door journey”
**Gap.** Connected execution and US entity/classification workflows.

### People operations specialists

#### AI-001 — Cited HR policy answers under the reader’s authority

Core · push-further · **partial** · Cites BASE-AGENT-003, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-008, BASE-DATA-004, BASE-INPUT-001, BASE-ROLE-001 · Rules D-2, D-5

**Requirement.** The optional policy assistant answers from employer-included, approved handbook/policy versions and currently permitted context. It cites exact clauses, dates and local calculation inputs, identifies withheld/missing/conflicting information and routes uncertainty to HR. No answer invents entitlement, legal advice or an employment decision. Model steps carry standard, adding sensitive for permitted regulated numeric inputs and external for provider disclosure; company policy decides each call. WIL-20 remains a separate structural-only capability.

**Acceptance.**
1. As employee and manager, ask about PTO eligibility and a policy conflict using restricted records, then change the approved source version.
2. Read exact quotations/citations, native calculation evidence, withheld facets and a content-free HR escalation.
3. With withdrawn, stale, absent or conflicting sources, unsupported questions, injection or invalid output, observe an explicit limitation without an invented answer, data disclosure or executed action.

**Evidence.** `tests/willow/ai-policy.mjs` — “ai-policy public-door journey”; `tests/willow/ai-escalation-proof.mjs` — “ai-escalation-proof public-door journey”; `tests/willow/ai-calculation-proof.mjs` — “ai-calculation-proof public-door journey”; `tests/willow/ai-handbook-proof.mjs` — “ai-handbook-proof public-door journey”; `tests/willow/ai-policy-browser.mjs` — “ai-policy-browser public-door journey”; `tests/willow/ai-handbook-browser.mjs` — “ai-handbook-browser public-door journey”; `tests/willow/retention.mjs` — “retention public-door journey”; `tests/willow/restore-access.mjs` — “restore-access public-door journey”
**Gap.** General handbook ingestion, unrestricted questions, full original employee/manager conflict and restricted-context journeys, incumbent shipment and actual provider/account retention remain unproved.

#### AI-002 — Natural-language workflow building with impact preview

Core · push-further · **partial** · Cites BASE-AGENT-003, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-008, BASE-DATA-004, BASE-INPUT-001, BASE-ROLE-001 · Rules D-2, D-5

**Requirement.** A workflow drafting specialist turns authorized intent into typed conditions, roles, deadlines, gates and connector mappings, cites its source structure and simulates affected people and external writes locally. Drafting changes no live employment, task, access or provider state. Publication carries commitment, adding access, money, sensitive, external or live when its steps meet those tests; the company policy decides the call and each separately scoped step. Missing mappings, scopes, unsafe cycles and changed sources remain visible unresolved work.

**Acceptance.**
1. Request a two-state workflow, read its typed graph, cited coverage, missing mappings and per-person/provider impact.
2. Under the held company policy, decide the exact draft and applicable privileged steps through their currently scoped authority, then inspect pinned publication.
3. Change source, scope or capability before publication and refuse the stale graph; injected instructions cannot grant scope or publish work.

**Evidence.** `tests/willow/phase2.mjs` — “phase2 public-door journey”; `tests/willow/ai-workflows-browser.mjs` — “ai-workflows-browser public-door journey”; `tests/willow/restore-access.mjs` — “restore-access public-door journey”
**Gap.** Connected-system simulation, connector mappings, full natural-language conditions and policy-controlled privileged publication remain unproved; native structural drafting and exact review are delivered foundations.

#### AGENT-001 — Reconcile an approved employee change until systems agree

Core · push-further · **partial** · Cites BASE-AGENT-003, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-008, BASE-DATA-004, BASE-INPUT-001, BASE-ROLE-001 · Rules D-2, D-5

**Requirement.** A reconciliation specialist plans the exact permitted employment/pay, PTO, benefits, payroll and identity diff with source authority, dates and expected state. Each step carries its computed standard, money, access, sensitive, external, accounts, security or commitment class under company policy. It asks named owners for missing facts, follows observed acknowledgment/read-back and keeps mismatches owned. A changed plan is reclassified and decided again; uncertain financial effects are not blindly retried. People may pause, cancel or resolve exceptions.

**Acceptance.**
1. Under the held company policy, decide a location/pay change affecting PTO, payroll, benefits and access.
2. Find a missing code, obtain its owner’s input, perform the policy-permitted steps, encounter a rejection and reopen it.
3. Compare expected state with fresh provider read-back and ledger; close only when all outcomes agree.
4. Revoke authority mid-run and observe no later action.

**Evidence.** `tests/willow/flows.mjs` — “flows public-door journey”
**Gap.** Multi-provider agent execution and read-back.

#### AGENT-002 — Policy simulation and expected-versus-observed outcomes

Core · push-further · **partial** · Cites BASE-AGENT-003, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-008, BASE-DATA-004, BASE-INPUT-001, BASE-ROLE-001 · Rules D-2, D-5

**Requirement.** The specialist simulates a proposed PTO, eligibility or lifecycle policy against permitted schedules, balances, terms, cases and provider capabilities. It compares current/proposed people, costs, dates, assumptions and missing data without changing live records. Policy publication carries commitment, adding money, access or live according to its effects; company policy decides the call. It compares predictions with actual ledger/provider outcomes and assigns deviations.

**Acceptance.**
1. Simulate carryover/eligibility across an hourly worker, future transfer and rehire with missing provider data and read unchanged live balances/work.
2. Publish the exact version under the held company policy and compare predictions with actual accrual, payroll and benefits outcomes.
3. Change an input and invalidate the prior preview; read each divergence and its assigned remediation.

**Evidence.** `tests/willow/flows.mjs` — “flows public-door journey”
**Gap.** Cross-person policy simulation and outcome measurement.

#### AGENT-003 — Recover stalled onboarding with controlled outreach

Core · push-further · **partial** · Cites BASE-AGENT-003, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-008, BASE-DATA-004, BASE-INPUT-001, BASE-ROLE-001 · Rules D-2, D-5

**Requirement.** The specialist compares deadlines, signatures, statutory forms, benefits and observed provisioning to explain stalled onboarding/offboarding. Outreach uses the employer’s cadence, templates, channels and visibility and carries external for outside recipients; access changes carry access, changed terms money/commitment as applicable, and policy exceptions commitment. The company policy decides all such calls. Completion ends outreach and HR can take over without losing history.

**Acceptance.**
1. Stall a signature, account and benefits handoff; inspect each reason, named owner and proposed substitute.
2. Under each company policy, inspect the actual message/recipient, resolve missing items and verify provider/document evidence before closure.
3. Restart and replay events; observe no duplicate or post-closure outreach, and no access grant outside the policy decision.

**Evidence.** `tests/willow/phase2.mjs` — “phase2 public-door journey”
**Gap.** Agent detection, chasing, substitutions and external verification.

#### AI-003 — Policy-assistant provider boundary

Core · push-further · **partial** · From AI-001 · Cites BASE-AGENT-003, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-008, BASE-DATA-004, BASE-INPUT-001, BASE-ROLE-001 · Rules D-2, D-5 · Register R-20

**Requirement.** Employer-enabled policy calls use locally reduced typed topics, included approved clauses and only separately permitted minimal numeric leave inputs. Raw questions, identifiers, arbitrary text, other employee records, pay, protected-class/medical data, reasons and documents stay local. Provider retention is explicitly disclosed and consented; content is not retained in local audit/logs/archives and restored consent is off. Detailed source-inclusion, metadata and provider-retention rules are in [record rules](docs/contract/record-rules.md#ai-001--cited-hr-policy-answers-under-the-readers-authority).

**Acceptance.**
1. Capture the entire request with prohibited-data canaries and inspect only its allowed topic, source and numeric field schema.
2. Refuse egress for missing consent, current authority, unsupported topic, stale/withdrawn source and injected instructions; source inclusion grants no reading or policy-publication right.
3. Inspect content-free metadata and absence of prompt/answer content in logs and archives; restore old enabled data and observe disabled calls without changing the source.
4. Read the actual provider-stated retention position before enabling; minimal permitted inputs still carry sensitive and external under company policy.

**Evidence.** `tests/willow/ai-policy.mjs` — “ai-policy public-door journey”; `tests/willow/ai-escalation-proof.mjs` — “ai-escalation-proof public-door journey”; `tests/willow/ai-calculation-proof.mjs` — “ai-calculation-proof public-door journey”; `tests/willow/ai-handbook-proof.mjs` — “ai-handbook-proof public-door journey”; `tests/willow/ai-policy-browser.mjs` — “ai-policy-browser public-door journey”; `tests/willow/ai-handbook-browser.mjs` — “ai-handbook-browser public-door journey”; `tests/willow/retention.mjs` — “retention public-door journey”; `tests/willow/restore-access.mjs` — “restore-access public-door journey”
**Gap.** The existing typed policy path is partial; complete prohibited-input egress, real provider/account retention and the full original handbook target remain unproved.

#### AI-004 — Workflow-model structural boundary

Core · push-further · **partial** · From AI-002 · Cites BASE-AGENT-003, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-008, BASE-DATA-004, BASE-INPUT-001, BASE-ROLE-001 · Rules D-2, D-5 · Register R-20

**Requirement.** Workflow-model calls use local reduction to normalized conditions, roles, deadlines, dependencies, gates and authorized template identifiers/revisions. Raw requests, free-form task/template/system names and all employee/private content stay local; controlled capability data is structural. Validated typed drafts may be retained, raw model conversations may not. Activation and actual provider retention are explicitly disclosed, and restore disables consent. Full payload and metadata rules are in [record rules](docs/contract/record-rules.md#ai-002--natural-language-workflow-building-with-impact-preview).

**Acceptance.**
1. Capture full requests with structural and private canaries; validate the closed structural schema and exact source citations.
2. Reject invalid, uncited or failed output and inspect content-free metadata, logs and archives.
3. Restore an enabled archive and read disabled workflow calls and consent; source settings remain unchanged.

**Evidence.** `tests/willow/phase2.mjs` — “phase2 public-door journey”; `tests/willow/ai-workflows-browser.mjs` — “ai-workflows-browser public-door journey”; `tests/willow/restore-access.mjs` — “restore-access public-door journey”
**Gap.** The structural workflow slice has existing minimized provider calls; full supported structural capability inputs, company policy and actual account-retention proof remain unproved.

#### AI-005 — Exact-version privileged workflow decisions

Core · push-further · **partial** · From AI-002 · Cites BASE-AGENT-003, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-008, BASE-DATA-004, BASE-INPUT-001, BASE-ROLE-001 · Rules D-2, D-5

**Requirement.** Each privileged workflow step retains its payroll, IT or other separately scoped authority. Decisions bind the exact graph, source versions, connector scope/capability and whole privileged-step set. When the company policy holds the relevant money, access, security, commitment, external or live class, a distinct currently eligible person decides the exact step; model output, enablement and HR draft selection supply no such decision. Changed inputs or lost authority invalidate it.

**Acceptance.**
1. Under the held policy, attempt publication with missing, stale and revoked step decisions; inspect unresolved steps and their named next actions.
2. Supply all currently valid exact-version decisions and publish through the native pinned path without performing another actor’s decision.
3. Repeat under the all-autonomous company policy: classed execution follows that policy and truthful attribution while retaining each actor’s scope.

**Evidence.** `tests/willow/phase2.mjs` — “phase2 public-door journey”; `tests/willow/ai-workflows-browser.mjs` — “ai-workflows-browser public-door journey”; `tests/willow/restore-access.mjs` — “restore-access public-door journey”
**Gap.** Native exact-version human signoffs are a foundation; the complete connected-step set and company-policy execution including the all-autonomous journey remain unproved.

## Agent surface

### Agent surface

#### SURFACE-001 — People-operations registry

Agent surface · target · **missing** · From new · Cites BASE-AGENT-002, BASE-AGENT-003, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-010, BASE-AGENT-013 · Register R-24

**Requirement.** The MCP job registry matches the tool table and concrete non-tool reasons above, using the native actions and projections for each listed Core job.

**Acceptance.**
1. Compare the registry and generated agent documentation with this table and every Core clause, including the named record resources, events and specialist prompts.
2. Run the Base conformance journey on Willow’s own fixtures and compare each listed job with its native record outcome.

**Evidence.** None.
**Gap.** No MCP people-operations journey or risk-policy adapter is delivered for these outcomes.

#### SURFACE-002 — Record exposure and binding facts

Agent surface · target · **missing** · From new · Cites BASE-AGENT-002, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-013 · Rules D-1

**Requirement.** Willow computes record, recipient, financial and binding-decision facts from its native dated records and actual destinations.

**Acceptance.**
1. Read and reversibly update an internal record: standard carries the actual item count.
2. Send inside the employer, to a known provider, a new outside recipient and a public careers page: external appears exactly for outside exposure with the right recipient and counterparty facts.
3. Change compensation/deductions and read exact amount, currency and provider facts for money.
4. Sign or publish an offer, policy or workflow and read commitment with the exact version and value.
5. Read regulated and nonregulated field selections, including permitted numeric leave inputs, and inspect sensitive record counts and kinds.

**Evidence.** None.
**Gap.** No MCP people-operations journey or risk-policy adapter is delivered for these outcomes.

#### SURFACE-003 — Provisioning and irreversible work facts

Agent surface · target · **missing** · From new · Cites BASE-AGENT-002, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-013

**Requirement.** Willow classifies provisioning, protection, erasure and running-service changes from their actual operation and provider response.

**Acceptance.**
1. Change a level or end access and inspect access with people and widening/narrowing direction.
2. Change an MFA or connector credential setting and inspect security without secret values.
3. Create an outside account and inspect accounts with provider and count.
4. Use a provider consent or identity-verification step and inspect gated with provider and step; where the provider insists on a person, use its person-held door.
5. Purge retained custody or request irreversible deletion and inspect destructive item counts.
6. Change active notice or connector delivery and inspect live with its service and configuration.

**Evidence.** None.
**Gap.** No MCP people-operations journey or risk-policy adapter is delivered for these outcomes.

#### SURFACE-004 — Dated reconciliation across systems

Agent surface · target · **missing** · From new · Cites BASE-AGENT-002, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-013 · Rules D-1

**Requirement.** The people-operations coordinator compares the exact intended employee change with fresh HR, payroll, benefits and identity state; incomplete provider evidence remains an owned mismatch.

**Acceptance.**
1. Run a dated mover affecting payroll, benefits and identity; compare the intended diff and current provider read-back and retain each discrepancy with owner/deadline.
2. Use a missing code, ambiguous employee match, changed source, provider rejection and uncertain financial outcome; none becomes a duplicate effect or false completed handoff.
3. Stop after authority revocation while retaining readable truthful history.

**Evidence.** None.
**Gap.** No MCP people-operations journey or risk-policy adapter is delivered for these outcomes.

#### SURFACE-005 — A stranger specialist runs a seeded week

Agent surface · target · **missing** · From new · Cites BASE-AGENT-002, BASE-AGENT-006, BASE-AGENT-007, BASE-AGENT-013

**Requirement.** Given only the seed URL, a stranger people-operations specialist completes a seeded hire, mover, leave, payroll mismatch and departure through MCP under two named company policies.

**Acceptance.**
1. Under the all-autonomous company policy, complete the week with every computed class exercised, no policy-held call and no policy refusal.
2. Under the held company policy, standard calls enter review and every other declared class waits for its named person, then runs only after that person’s exact decision.
3. Under a blocked variant, retain the rejected step and owner while unaffected work completes.
4. Inspect the resulting native records, provider read-backs, audit and agent overview at desktop and phone widths; counts and outcomes match the week.
5. Pause during the week and resume as a person; the remaining work continues without duplicate handoffs.

**Evidence.** None.
**Gap.** No MCP people-operations journey or risk-policy adapter is delivered for these outcomes.

## Later

None.

## Field proof register

| ID | Proof | Clauses | State | Date | Receipt |
| --- | --- | --- | --- | --- | --- |
| R-1 | Consented Greenhouse, Lever, Workable and JazzHR employer-account handoff trials and required partner access. | HIRING-001 | not run | | |
| R-2 | Indeed, ZipRecruiter and LinkedIn production posting approvals and employer-account read-back. | HIRING-002 | not run | | |
| R-3 | Checkr authorized employer-account trial and required screening/commercial agreements. | HIRING-005 | not run | | |
| R-4 | DocuSign authorized account trial and provider integration approval. | SIGN-004 | not run | | |
| R-5 | Authorized Mitratech/employer tenant and official E-Verify/agency receipts. | US-001 | not run | | |
| R-6 | State agency new-hire filing receipts. | US-002 | not run | | |
| R-7 | EEOC production filing receipt and employer review. | EEO-004 | not run | | |
| R-8 | Gusto authorized employer-account trial and production partner approval. | PAYROLL-002 | not run | | |
| R-9 | ADP RUN and Workforce Now authorized employer-account trials and production approvals. | PAYROLL-003 | not run | | |
| R-10 | QuickBooks Payroll authorized account trial and payroll-specific partner approval. | PAYROLL-004 | not run | | |
| R-11 | Paychex Flex authorized account trial and integration activation. | PAYROLL-005 | not run | | |
| R-12 | Reference employer real payroll-period agreement before the processing cutoff. | PAYROLL-006 | not run | | |
| R-13 | Employee Navigator, selected Aetna/UnitedHealthcare/Anthem carrier and broker account trials, protected-data/commercial agreements and filer receipt. | BENEFITS-001, BENEFITS-002, BENEFITS-003 | not run | | |
| R-14 | Human Interest and Guideline authorized account trials and contribution receipts. | RETIRE-001 | not run | | |
| R-15 | Google Workspace, Microsoft 365 and Okta authorized tenant trials; no purchase or login is authorized by this record. | IDENTITY-001, IDENTITY-002 | not run | | |
| R-16 | Slack and Microsoft Teams production tenant/app approvals. | COMMS-001 | not run | | |
| R-17 | TalentLMS authorized tenant trial and certificate read-back. | LEARN-001 | not run | | |
| R-18 | Required production app review, commercial contracts and data agreements for every declared connector. | CONNECT-001 | not run | | |
| R-19 | Apple App Store and Google Play native-app listings and real-device human review. | MOBILE-001 | not run | | |
| R-20 | Authorized provider/account evidence for the actual data-retention position; provider-edge fixtures do not certify it. | AI-003, AI-004 | not run | | |
| R-21 | Consented customer reference installation at the stated employer size, apart from the gating seeded CI capacity run. | OPS-002 | not run | | |
| R-22 | Human screen-reader pass across the operator and public journeys. | MOBILE-001, OPS-001 | not run | | |
| R-23 | Dated independent accessibility conformance report or VPAT. | OPS-001 | not run | | |
| R-24 | Dated interoperability receipts in Claude, ChatGPT, Codex and Copilot clients. | SURFACE-001 | not run | | |
