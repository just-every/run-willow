# Willow target product contract

Target approved 16 October 2026. Willow is a connected SMB HRIS: a BambooHR
replacement that holds the employer’s authoritative people records and runs
onboarding, employee changes, time off and offboarding through to completion
across payroll, benefits, e-signature and identity systems. The first buyer is
a US people/operations lead at a 20–200-person employer retaining its payroll
provider; amounts and compensation planning are USD-first.

The competitive scope is core HR as sold by BambooHR, Rippling, HiBob and
Gusto (HR side), with Factorial and Deel HR as additional switching sources.
It includes employee/manager self-service, performance/goals and engagement,
not just a private register and reviewed payroll files. This is the product
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

Private employee reads use `src/willow/profile.ts` and facets in
`src/willow/access.ts`; `src/willow/doors.ts` enumerates current read doors.
Every future module must preserve those boundaries. Model calls under WIL-20
remain structural-only; sensitive-data agents below require separately
scoped, opted-in capabilities and retain the caller’s exact permissions.

## Retained foundation

### WIL-01 — Employer setup and explicit membership.

The owner sets up one employer (name, IANA time zone, country, currency) before anything else, then locations, departments, immutable working schedules and private document categories. Members are people given sign-in access through their work email; every permission is explicit and set only by the owner (managing someone grants none). Ending access ends every session; giving it again needs a fresh sign-in and restores no permission.

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

### SELF-001 — Employee and manager self-service portal.

One portal gives employees their profile, documents, balances, PTO requests, assigned tasks and pending changes; managers see permitted team requests, outstanding work and coverage. Employees submit contact, name, dependent and other permitted changes with validation. Field policy determines immediate edits versus HR approval; immutable proposals show before/after, owner, due date, outcome and downstream reconciliation. An employee never edits pay or employment authority by changing their profile.

**Acceptance evidence:** As an employee, change an allowed contact field and submit an approval-required name/dependent change; HR accepts one and rejects another. As manager, clear permitted team work and inspect the employee view. The approved revision feeds the payroll/benefits exception queue; no self-granted privilege is possible.

### MOBILE-001 — Mobile work and accessible companion apps.

The responsive portal and iOS/Android companion apps let employees update permitted details, read/sign documents, request PTO and complete tasks; managers approve and see team coverage. Secure push notifications reveal no private employee data on a locked device. Session revocation applies on every device; reconnecting a saved draft revalidates permissions and source revision before submission. Keyboard, screen-reader and 390-pixel journeys meet WCAG 2.2 AA.

**Acceptance evidence:** Use real employee/manager accounts for request, approval, task completion and document access at 1440 and 390 pixels and on iOS/Android; interrupt a draft, revoke access, reconnect and prove no stale submission or private push content. Complete keyboard and screen-reader checks.

## Workflows, documents and US onboarding

### FLOW-001 — Conditional workflows with reviewed publication.

HR builds versioned joiner/mover/leaver and employee-change workflows with conditions on role, work state, employment type and location, dependencies, approvals and relative deadlines. Preview names every affected person, assignment and external action before publication. Published versions pin open cases; deliberate upgrades show a diff and retain completed work. Payroll, benefits and IT approval are separately scoped; one failed step cannot fabricate whole-case completion.

**Acceptance evidence:** Build and preview a multi-state joiner workflow, publish it, start two cases and change the template. Approve a pay step as payroll and an access step as IT, fail one provider step and verify dependent work remains blocked and existing cases retain their version.

### FLOW-002 — Persistent reminders, escalation and coverage.

Every required task, approval, missing form, signature and provider exception has an accountable owner, deadline, progress and next action. Scheduled reminders follow an HR-approved cadence and quiet hours; overdue work escalates to a substitute owner when the assignee is absent or leaves. Completion cancels future reminders, rescheduling preserves history, and restart catches missed deadlines without duplicate sends. Failed/uncertain delivery is visible separately from work completion.

**Acceptance evidence:** Create a due case, advance the scheduler across quiet hours and restart it, then make the assignee unavailable. Observe one permitted reminder/escalation, assign cover, complete the task and prove later ticks send nothing. Refuse an unauthorized recipient and expose failed delivery.

### FLOW-003 — Role-specific preboarding packets.

An accepted hire gets a secure, revocable pre-start invitation with only their required personal details, offer/policy signatures, forms, benefits choices and tasks. HR chooses role/work-state packets, tracks completion and resolves missing data without asking the new hire to use an unprovisioned work mailbox. Expired or withdrawn offers end preboarding access and pending invitations without deleting retained evidence.

**Acceptance evidence:** Send two role-specific packets to personal mailboxes, complete one on a phone, let the other expire/withdraw, then start employment. Inspect packet progress and prove only approved data becomes the employment record and expired links cannot read it.

### SIGN-001 — Offer and policy templates with completed e-signatures.

HR maintains versioned offer-letter, employment agreement and policy templates with controlled employee/compensation fields, approval routing and a recipient preview. DocuSign sends the exact approved document, records consent and signer attribution, tracks sent/viewed/signed/declined/expired/voided states, and returns the signed copy plus certificate and provider envelope ID to the restricted employee record and employee portal. Duplicate/out-of-order callbacks cannot sign a different version. Plain receipt acknowledgements in WIL-06 remain distinct.

**Acceptance evidence:** Approve an offer, send it through DocuSign, sign as the intended recipient and retrieve the identical signed copy/certificate through permitted doors. Void and reissue a changed offer; replay an older callback and prove it cannot complete the new packet. Exercise refusal, expiry and consent withdrawal.

### US-001 — I-9, E-Verify and W-4 through completion.

Worksite-aware onboarding collects current I-9 and federal/state withholding forms through restricted employee and employer/authorized-representative steps. Mitratech Tracker I-9/E-Verify integration launches the correct workflow, tracks examination/attestation, corrections, rehire/reverification, provider case IDs, notices and unresolved results through closure. W-4 captures the authenticated employee signature and final declaration, keeps a printable copy and records payroll receipt/effective date. Reviewed rule versions set deadlines and retention; an E-Verify mismatch never becomes an automatic adverse employment decision.

**Acceptance evidence:** From a US hire packet, complete employee and representative I-9 steps with Mitratech, exercise a pending E-Verify referral and a correction, and return the signed records/status to HR. Submit and replace W-4, observe payroll receipt and deny manager access to tax/identity documents. Missing provider action prevents completion.

### US-002 — State new-hire reporting and employer administration.

The employer maintains US legal entity/FEIN, work states, locations and W-2 employee versus 1099 contractor records without treating classification as an agent decision. New-hire/rehire reporting and state onboarding forms use current state-specific fields and reviewed deadlines, with configured multistate election, restricted review, submission through the state portal or authorized payroll partner, acknowledgement/rejection and correction. Owner-assigned manual portal steps retain submission receipts when a state has no machine interface; an export alone never completes reporting.

**Acceptance evidence:** Onboard and rehire workers in California and Texas, preview the applicable forms/report destination and deadlines, approve and submit, reject/correct one report and inspect the acceptance receipt. Attempt to complete an unsubmitted report and to expose FEIN/SSN to a manager; both fail.

## Leave, time and workforce planning

### LEAVE-001 — US PTO policies and scheduled accrual.

HR configures vacation, sick and unpaid leave policies with eligibility, service tiers, hours/days conversion, proration, accrual cadence, caps, carryover/expiry, negative-balance rules and reviewed state/location variants. Scheduled accruals are idempotent and explain each calculation, including hire, rehire, transfer, schedule and termination effects. Policy changes require owner approval; overrides are dated, reasoned ledger adjustments. HR configures reviewed protected-leave cases and restricted supporting documents without exposing medical reasons to managers or claiming legal adjudication.

**Acceptance evidence:** Publish policies for salaried and hourly workers in two states, accrue across a tier/carryover boundary, restart the scheduler and compare employee balances and ledger. Transfer a worker and correct a schedule; show the calculation and require approval for an override. Managers see absence dates, never supporting medical records.

### LEAVE-002 — Shared absence calendars and approval follow-up.

Employees and managers have scoped absence/holiday calendars with employer-defined US federal/state/company holidays, partial days and working schedules. Requesting leave shows balance/coverage impact, notifies the effective approver in-app and by the configured channel, and follows substitute approval/reminder rules. Calendar subscriptions and Google Calendar/Microsoft Outlook connections expose only authorized absence labels/dates; cancellation or access loss removes or redacts updates without leaking reasons.

**Acceptance evidence:** Request a partial-day absence over a company holiday, inspect the quote and shared calendar as employee/manager, deliver the manager request notice, delegate approval and cancel it. Read Google Calendar and Outlook updates and revoke access; confidential reasons never appear and stale requests cannot be approved.

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

HR and employees manage eligibility, dependents, plan comparison/costs, open enrollment, new-hire elections, waivers, qualifying life events and termination with effective dates and required documents. Employee Navigator and employer-authorized broker/carrier connections exchange census and elections with contracted US plans, including Aetna, UnitedHealthcare and Anthem where selected. Show per-carrier submitted/accepted/active/rejected coverage evidence, enrollment deadlines and unresolved handoffs. Carrier/API/834 agreements, broker licensing partners and protected-data agreements are delivery work; no unchecked task declares coverage active.

**Acceptance evidence:** Enroll a new hire, waive a plan, add a dependent after a life event and terminate coverage. Send through Employee Navigator/broker to the selected carrier, ingest acknowledgement and compare active coverage/dates; reject a dependent mismatch and resolve it. Employees read their own elections, HR sees permitted status and managers cannot see health evidence.

### BENEFITS-002 — Benefit deductions and payroll mismatch resolution.

Benefits/employee elections map to provider plans and employee/employer contribution codes, coverage effective dates, pay frequencies, pre/post-tax treatment and arrears rules approved by payroll. Reconcile carrier/broker elections, payroll deductions and observed payroll results per employee/pay period. Exceptions name the owner, amount/date discrepancy and corrective action; retroactive changes require reviewed adjustments and a returned acknowledgement.

**Acceptance evidence:** Change a benefit mid-period, preview deduction impact in USD, approve it, ingest payroll and carrier results and inspect a deliberately mismatched deduction. Resolve and re-read both systems; the mismatch remains open until evidence agrees and a duplicate event creates no duplicate adjustment.

### RETIRE-001 — Retirement census and contribution handoff.

Human Interest and Guideline connections maintain eligible census, employment dates, employee elections/deferrals, employer contribution mappings and payroll-period contribution status. Restricted HR/payroll owners review differences, submission receipts, provider acknowledgements and corrected census/contribution results. Custody, investment advice and plan administration stay with the plan provider while Willow follows the handoff to a verified outcome.

**Acceptance evidence:** For each of Human Interest and Guideline, send a hire/eligibility change, update a deferral, reconcile contribution results and process an exit. Fail one census row and correct it without resending accepted rows; inspect the employee-scoped record and payroll reconciliation report.

## Connected identity and collaboration

### IDENTITY-001 — Provisioning and verified deprovisioning.

Google Workspace, Microsoft 365/Entra ID and Okta connections map immutable employee identities and HR attributes to accounts, groups, licenses and role-based access rules. IT previews grants/changes and approves privileged access; join/move/leave dates drive execution. Exits suspend/disable accounts, revoke sessions/tokens, remove groups/licenses as authorized and verify observed provider state; shared mailbox/data ownership and device-return tasks have named owners. An uncertain or failed provider action blocks departure completion. Rehire requires new reviewed access and never restores prior privileges automatically.

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

## Leave, time and workforce planning

### TIME-001 — Time, shifts and Deputy reconciliation.

Hourly workers record time, breaks, corrections and approved timesheets; managers publish shifts, manage availability/swaps and compare planned versus worked hours. US work-state overtime/break rules are employer-reviewed and versioned; edits preserve originals and require approval before payroll handoff. Deputy connections reconcile roster, shifts, approved hours and absences using explicit source authority; schedule changes feed PTO quotes without overwriting an approved payroll period.

**Acceptance evidence:** Publish a week of shifts, clock and correct a missed break, approve a swap/timesheet and send hours to payroll. Compare Deputy and Willow roster/leave/time, create an overtime mismatch and resolve it; denied/late edits cannot silently change approved payroll.

## Connected identity and collaboration

### HIRING-001 — Greenhouse accepted-hire handoff.

A Greenhouse accepted-hire event produces a reviewed joiner proposal with candidate identity, approved offer, role, start date, manager and permitted documents. HR resolves duplicate/re-hire matches and missing fields before creating one employee/packet. Send resulting employee ID and onboarding status back without copying interview evaluations into broad employee records. Recruiting pipelines remain in the ATS.

**Acceptance evidence:** Accept a Greenhouse offer, preview the hire in Willow, resolve a former-worker match, approve and inspect the packet plus returned status. Replay the event and withdraw the offer; neither duplicates the person nor retains unauthorized preboarding access.

## Integration operation, reporting and portability

### CONNECT-001 — Operable connections and attribute rules.

Owners authorize each named connector with least scopes, per-field mapping/authority and explicit outbound-data previews. Health shows last successful sync/read-back, freshness, scope loss, rate limits, stale/error/uncertain state and a per-person mismatch queue with owner/next action. Signed/replay-protected webhooks, durable execution IDs, reviewed safe retries and reconciliation after disconnect prevent duplicate effects. Secrets stay in protected runtime custody; rotation/revocation and provider-data deletion are explicit. Required production app review, contracts, scopes and health-data agreements are tracked to completion for every supported integration.

**Acceptance evidence:** Connect a provider, change an attribute/access rule after preview, rotate credentials, lose a scope and replay a webhook. Restart during a change and inspect fresh/stale/error state and one durable outcome; no private payload/credential appears in logs, exports or unauthorized agent context.

### REPORT-001 — Custom workforce reporting and operational dashboards.

HR builds and saves scoped reports over standard/custom fields, effective-dated headcount/FTE, turnover, tenure, leave liability, pay, diversity where lawfully collected, benefits mismatches and overdue work. Definitions show filters, as-of dates, denominators, excluded/unknown data and data freshness; drill-down reconciles every total to authorized records. Scheduled distribution rechecks recipient rights and sends safe links; dashboards and CSV/XLSX exports apply the same row/field restrictions.

**Acceptance evidence:** Build and schedule a report joining custom fields, headcount, leave and open exceptions; reconcile totals and drill-down to source records at a past date. Remove a recipient’s rights before dispatch and prove pay/private rows remain withheld in page, file and delivery.

### MIGRATE-001 — Switch from each incumbent without losing history.

Named move-in paths cover BambooHR (WIL-16), Rippling, HiBob, Gusto HR, Factorial and Deel HR using approved source APIs/exports. HR maps identities/custom fields, org/manager history, employment/pay versions, documents and signature certificates, leave policies/balances/requests, benefits elections, goals/reviews/training and open lifecycle work. Per-source preview lists unsupported fields and originals, reconciles counts and balances, and never substitutes empty data. Source IDs/provenance survive; repeated imports are idempotent, overlap cutover freezes agreed authority and guarded undo cannot destroy subsequent work. Imported history never grants sessions or triggers external actions.

**Acceptance evidence:** For each named source, preview a representative export with current/former/rehired workers, a signed document, balance and historical change; resolve conflicts, apply, compare row/document/balance totals and repeat. Edit an imported record and prove undo refusal; close cutover only after HR signs a variance report and all retained originals can be exported.

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

HR, payroll, benefits, IT, manager, employee and agent permissions are enforced server-side on every page, API, search, export and download; managerial rank alone grants no sensitive facet. Origin-bound writes, rate limiting, safe text rendering, bounded validated uploads, private no-store responses and session revocation protect all modules. Transport/storage and connector secrets use appropriate protected custody; outbound services/data/purpose/retention are visible before enabling. No third-party training on HR data is authorized by default. Base identity, audit, portability, erasure and independent-operation requirements remain obligations; category-specific manual evidence is never a replacement for revoking an external account.

**Acceptance evidence:** Exercise all registered doors with a role matrix including restricted benefits/review fields, hostile text/uploads and cross-origin writes; revoke access mid-session and inspect downloads, logs and connector/model payloads. Prove the core HRIS works without optional providers and document each explicit Base replacement with its public-door proof.

### OPS-001 — Runnable, recoverable employer-owned product.

Willow retains its supported rer install/setup/dev/build/verify/deploy/export/import commands, local provider-free operation, owner-account hosting and forward-only migrations. Health/configuration diagnostics name missing dependencies without secrets; durable work resumes without duplicate external effects and operational backups/upgrade checks preserve records, grants, audit and blobs. Capacity limits are disclosed and measured before promises; WCAG 2.2 AA, keyboard and mobile acceptance cover every HR journey. The approved homepage and UI remain the present product surface until separately authorized implementation.

**Acceptance evidence:** Use the supported commands to set up, run, stop, upgrade and recover a populated employer, compare records/grants/files and inspect missing-dependency diagnostics. Restart with pending work and verify no false completion/replay; run desktop/phone and keyboard journeys, plus a consented hosted acceptance before claiming production capacity.

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

The first buyer is a US 20–200-person employer using USD, US work states, W-2 employees and separately classified 1099 contractors. Willow owns core HR, self-service, PTO, lifecycle completion, HR performance/engagement and the integrations above. Payroll providers execute gross-to-net, ACH/wage payments, tax filing and W-2/1099 issuance; brokers/carriers administer coverage and COBRA, retirement providers hold funds, Mitratech/enrolled employers perform official I-9/E-Verify work, and identity/device platforms enforce their accounts/devices. Greenhouse owns recruiting pipelines and the LMS owns course delivery. Willow must complete its connected handoffs and record verified outcomes; provider approval, native apps, protected-data agreements and commercial partnerships remain delivery obligations, never reasons to remove clauses. Non-US payroll/EOR, insurance underwriting, investment advice, device-management networks, surveillance and automated employment decisions are outside this HRIS; buyers use licensed providers and dedicated products for them.

**Acceptance evidence:** Walk a US hire/change/exit through the employee, HR, payroll, benefits and IT doors; inspect the system of record, external owner, USD amounts, required approval, receipt and final observed outcome for each step. An unconnected or unacknowledged dependency remains open, and the UI never claims payroll payment, insurance coverage or legal compliance from a checked task.

## Operating limits and sources

Current local admission limits are 10 MB per document upload and 8 MB per
move-in file; they are not hosted capacity promises. Required migrations and
large archives must either finish with complete evidence or refuse with a
named limit; no silent truncation. Hosted latency, real mail receipt, provider
account conformance and accessibility remain separately measured acceptance.

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

**63 clauses: 21 done / 26 partial / 16 missing.** Evidence paths refer to the inspected current tree; a partial citation proves only the foundation named.

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
| SELF-001 | partial | `src/willow/people.ts:85`, `src/willow/leave.ts:344`, `src/willow/ui/home.ts`; `tests/willow/flows.mjs` (WIL-05/WIL-09). Approval-based profile/dependent changes and unified pending-change tracking are absent. |
| MOBILE-001 | partial | `src/willow/ui/leave.ts`; `tests/willow/journey.mjs` exercises responsive requests/approval. Native apps, secure push and full accessibility acceptance are missing. |
| FLOW-001 | partial | `src/willow/lifecycle.ts`, `src/willow/proposals.ts`; `tests/willow/flows.mjs` (WIL-05/WIL-15). Conditional editor, external dependencies and reviewed publication are incomplete. |
| FLOW-002 | partial | `src/willow/lifecycle.ts:199`, `src/willow/notices.ts`; `tests/willow/phase2.mjs` (WIL-18). Task progress/notices exist; timed reminders, coverage and escalation do not. |
| FLOW-003 | partial | `src/willow/lifecycle.ts` creates dated employee tasks; `tests/willow/flows.mjs` (WIL-05). Dedicated preboarding access, packets and personal-email invitation lifecycle are absent. |
| SIGN-001 | missing | `src/willow/documents.ts` and WIL-06 provide receipt acknowledgements only; no template generation or DocuSign signing flow. |
| US-001 | missing | No product statutory-form collection, Mitratech connection or payroll form acknowledgement in the audited tree. |
| US-002 | missing | Existing employer/person records do not implement US entity identifiers, contractor classification workflows or state reporting. |
| LEAVE-001 | partial | `src/willow/leave.ts`; `tests/willow/flows.mjs` (WIL-08/WIL-10). Approved policy versions and deterministic accrual exist; scheduling, tier/cap/carryover rules and protected-leave case administration are incomplete. |
| LEAVE-002 | partial | `src/willow/ui/leave.ts`, `src/willow/leave.ts`, `src/willow/notices.ts`; `tests/willow/flows.mjs` (WIL-09), `tests/willow/phase2.mjs` (WIL-18). Team coverage and decision notices exist; shared holidays/calendars, request notices and delegation are incomplete. |
| PAYROLL-001 | partial | `src/willow/payroll.ts`, `src/willow/payroll-layout.ts`; `tests/willow/regressions.mjs`, `tests/willow/phase2.mjs` (WIL-21). Snapshot/file mapping and manual acknowledgement exist; live sync and provider read-back do not. |
| PAYROLL-002 | missing | No Gusto product connector or public connection journey in the audited tree. |
| PAYROLL-003 | missing | `src/willow/payroll-layout.ts` implements an ADP RUN file layout only. Neither ADP live connector exists. |
| PAYROLL-004 | missing | No QuickBooks Payroll product connector in the audited tree. |
| BENEFITS-001 | missing | No benefits enrollment, Employee Navigator or carrier workflow in the audited tree. |
| BENEFITS-002 | missing | No benefit deduction mapping or reconciliation reports in the audited tree. |
| RETIRE-001 | missing | No Human Interest or Guideline connector or retirement census workflow in the audited tree. |
| IDENTITY-001 | partial | `src/willow/lifecycle.ts:156`; `tests/willow/flows.mjs` (WIL-12/WIL-13). Native access ending and evidence-required manual IT tasks exist; external provider actions/read-back are absent. |
| IDENTITY-002 | partial | `src/auth.server.ts`, `src/modules/operator-auth/identity/oidc/presets.mjs`; `tests/willow/phase2.mjs` (WIL-19) proves Google/generic OIDC only. Entra/Okta-specific journeys, SAML and enterprise session-policy acceptance are incomplete. |
| COMMS-001 | missing | No Slack or Microsoft Teams product integration in the audited tree; WIL-18 is email only. |
| PERFORM-001 | missing | No performance, goals or feedback product module in the audited tree. |
| ENGAGE-001 | missing | No survey/engagement collection, anonymity controls or action-plan module in the audited tree. |
| COMP-001 | partial | `src/willow/people.ts`, `src/willow/reports.ts:42`; `tests/willow/flows.mjs` (WIL-07/WIL-14) cover pay terms/totals. Bands, budgets and planning cycles are absent. |
| LEARN-001 | missing | No training roster, certification or TalentLMS connection in the audited tree. |
| TIME-001 | partial | `src/willow/employer.ts` working schedules and `src/willow/leave.ts` schedule quotes exist; `tests/willow/flows.mjs` (WIL-01/WIL-09). Clocks, shifts, timesheets and Deputy synchronization are absent. |
| HIRING-001 | missing | No Greenhouse handoff in the audited tree. |
| CONNECT-001 | partial | `src/willow/connections.ts`, `src/willow/payroll-layout.ts`; `tests/willow/phase2.mjs` cover optional connection diagnostics and file mappings. General connector execution/health/reconciliation is missing. |
| REPORT-001 | partial | `src/willow/reports.ts`; `tests/willow/flows.mjs` (WIL-14). Fixed scoped summaries/CSV exist; report builder, saved/scheduled reports and broader dashboards are absent. |
| MIGRATE-001 | partial | `src/willow/movein/bamboohr.ts`, `src/willow/movein/target.ts`; `tests/willow/flows.mjs` (WIL-16) proves BambooHR-shaped people/balances/documents. Other named kits and expanded history types are absent. |
| DATA-001 | partial | `src/willow/reports.ts`, `scripts/installer/local.mjs`; `tests/willow/restore.mjs`, `tests/willow/restore-access.mjs` prove current owner archive. General employee export and future-module/no-replay coverage remain incomplete. |
| DATA-002 | missing | No Willow erasure/retention public action; vendored import-kit erasure helpers alone do not satisfy native record/blob/restore coverage. |
| AUDIT-001 | partial | `src/willow/core.ts`, `src/willow/views.ts`; `tests/willow/flows.mjs` checks business/private-read audit and rollback. Cross-provider history and erasure anonymization are missing. |
| SECURITY-001 | partial | `src/willow/access.ts`, `src/willow/profile.ts`, `src/willow/http.ts`, `src/willow/input.ts`; `tests/willow/flows.mjs` (WIL-03). Existing private core is tested; future modules, complete erasure and wider security/egress coverage are not. |
| OPS-001 | partial | `scripts/installer/local.mjs`, `AGENTS.md`, `SEED-COMMAND-CONTRACT.md`; `tests/willow/journey.mjs`, `tests/willow/restore-access.mjs`. Current local lifecycle is tested; comprehensive upgrade, capacity, accessibility and future-work recovery acceptance remains open. |
| AI-001 | partial | `src/willow/proposals.ts:141`; `tests/willow/flows.mjs` (WIL-15) proves scoped, policy-citing context only. Interactive policy answers and associated provider controls are absent. |
| AI-002 | partial | `src/willow/model-drafts.ts`, `src/willow/proposals.ts`; `tests/willow/phase2.mjs` (WIL-20) proves controlled checklist drafts only. Natural-language conditions, cross-system simulation and publication are missing. |
| AGENT-001 | partial | `src/willow/proposals.ts`, `src/willow/payroll.ts`; `tests/willow/flows.mjs` (WIL-15/WIL-11) prove bound human approvals and file handoff. Multi-provider agent execution/read-back is missing. |
| AGENT-002 | partial | `src/willow/leave.ts:19`, `src/willow/proposals.ts`; `tests/willow/flows.mjs` (WIL-08/WIL-15) prove versioned policies and exact change diffs. Cross-person policy simulation and outcome measurement are absent. |
| AGENT-003 | partial | `src/willow/lifecycle.ts:199`, `src/willow/notices.ts`; `tests/willow/phase2.mjs` (WIL-18) proves progress/notices only. Agent detection, chasing, substitutions and external verification are missing. |
| BOUNDARY-001 | partial | `src/willow/payroll.ts`, `src/willow/lifecycle.ts`; `tests/willow/flows.mjs` (WIL-11/WIL-12) prove current provider/manual-work boundaries. Target connected execution and US entity/classification workflows are incomplete. |
