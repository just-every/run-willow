# Employee exports

On **People**, open **Export employee records**, choose fields, scope and an
as-of date, then download CSV or XLSX. The current directory search, location,
department, role and status filters apply. This is the standard-field slice of
DATA-001; complete target-product portability remains work. Custom fields and
tables use the shared projections described below. The owner archive is still the separate `rer export` / `rer import` flow
covered by WIL-17.

Both signed-in download doors accept identical query parameters:

- `/app/exports/employees.csv`
- `/app/exports/employees.xlsx`

`scope` is required: `self`, `team` (current direct reports), or `organization`
(for members allowed to list everyone). A date never expands today's team or
permissions. `asOf=YYYY-MM-DD` defaults to today in the employer's time zone.
`fields` is required and accepts repeated parameters or comma-separated keys,
in the chosen column order. Unknown or repeated fields are refused.
Optional repeated `person` IDs select records inside the scope; any outside ID
refuses the download. Search parameters are `q`, `name`, `location`,
`department`, `role`, and `status=all|active|upcoming|former|none`, matching the
directory. IDs or names may identify a location or department.

For example, a manager can request:

```text
/app/exports/employees.csv?scope=team&fields=name,jobTitle,phone,payAmount&asOf=2026-10-19
```

Every row starts with `person_id`, `as_of`, `scope`, `withheld_fields`, then the
requested fields. `withheld_fields` lists semicolon-separated field keys the
member cannot read, with blank cells for their values. A blank cell without
that marker means no recorded value. Headers and field keys are stable English
identifiers. All response data comes from the same permission projection as
the person's page; exports and sensitive person reads are audited. Downloads
require a live session, use private/no-store caching, and recheck authority on
each request.

Available fields:

| Keys | Authority |
| --- | --- |
| `name`, `legalName`, `preferredName`, `workEmail`, `status`, `jobTitle`, `department`, `location`, `manager` | Person's directory projection |
| `employeeNumber`, `employmentType`, `startDate`, `endDate`, `schedule` | Employment facet |
| `payrollId` | Payroll facet |
| `payBasis`, `payAmount`, `payCurrency` | Compensation facet |
| `personalEmail`, `phone`, `address`, `dateOfBirth`, `emergencyContact` | Private-contact facet |

Employment dates/type and payroll ID describe the selected employment period;
job, manager, schedule and pay describe its terms in force at the chosen date.
Amounts are decimal strings in the recorded currency, and dates use ISO format.
A future selection may show scheduled terms, matching the profile. Private
contacts are the current contact record, as on the dated profile.

CSV is UTF-8 with quoted cells, escaped quotes and CRLF row endings. Text that
could execute as a spreadsheet formula (including a marker after whitespace or
control characters) is prefixed with an apostrophe; this prefix is intentional.
XLSX is an Office Open XML workbook with an Employees sheet. Every cell is a
literal string, preserving identifiers, dates, decimals and leading zeros
without executing formulas. No macro, external reference or formula is emitted.

## Typed custom fields: PEOPLE-001 acceptance

The approved custom-field export interface uses `custom.<key>` in `fields`,
alongside standard keys and in the requested column order. PEOPLE-001 is
implemented and proved separately; these exports do not complete DATA-001.

CSV, XLSX, bundles and reports must use the same definitions and dated values
as the profile and agent context. Select the latest definition effective on
or before `asOf`, choosing the highest version on a same-date tie. Immutable
value revisions and corrections retain their definition version, so retired
fields and historical validation retain their meaning. Numbers remain exact
decimal strings and dates valid Gregorian ISO dates. The profile's
`customFields` representation carries field definitions and value history
with version IDs; readable bundle history must preserve that meaning too.

Every download, historical selection and agent read rechecks current field
visibility and current reader grants. HR/private values require
`people.private`; payroll values require `pay.read`; self/manager flags apply
only to general fields. The owner can read all fields. Withheld custom values
must not appear in exported cells, history, report groups or agent context.
Classification/sensitivity is immutable, and no custom field enters directory
or org-chart output. Definition management and value writes require
`people.manage`, with the matching restricted-value grant for writes.

An owner may explicitly select permission-checked general custom fields as
optional generic payroll columns using the same `custom.<key>` source keys.
The reviewed batch freezes values and definition versions at its period end;
changed sources or mappings require another review. Current visibility and
reader authority are rechecked when downloading the frozen file. ADP RUN
retains its fixed schema. Before a future connector/source mapping ships,
CONNECT-001 and MIGRATE-001/002 require these same shared-definition,
validation, effective-date/history, retirement and current-permission rules.

## Records and document bundles

The same People form offers **Download records and files ZIP**. Choose which
history sections to include using its checkboxes. The signed-in door is
`/app/exports/employees.zip`, using the same `scope`, `fields`, date, filters and
optional `person` selections as CSV/XLSX. It also requires `history`, repeated
or comma-separated: `employment`, `leave`, `lifecycle`, `documents`, `tables`,
`profileChanges`, `goals`, `reviews`.

The ZIP is a readable export, not an installation backup. It contains:

- `manifest.json`: schema `willow.employee-bundle/v1`, project, export time,
  as-of date, scope, chosen fields/sections, person count and every other file's
  path, media type, byte size and SHA-256 digest.
- `employees.csv`: exactly the chosen standard fields, with the same
  withholding and spreadsheet protections as the standalone download.
- `records.json`: schema `willow.employee-records/v1`, person IDs/revisions,
  selected permitted sections and an explicit `withheldSections` list.
- `documents/PERSON_ID/VERSION_ID.bin`: original bytes for every document
  version visible to the reader and filed by the chosen date. Original
  filenames/media types, category, title, version number and receipt timestamps
  stay in `records.json`; the stored digest also appears in the manifest.

Employment history includes immutable terms versions, canceled/scheduled state,
selected-period references and compensation only where the reader has that
facet. Leave includes accounts, dated ledger entries, balances and requests;
confidential reasons follow the same field authority as the profile. Lifecycle
includes the pinned template and tasks, with completion/evidence cut off at the
chosen day. Document categories are checked before listing, and access is
rechecked before opening each file during a long download. Missing, corrupt or
newly forbidden bytes fail the download; there is no substitute or empty file.
A consumer should reject an incomplete ZIP and verify all manifest digests.

Document bytes stream sequentially with backpressure; the whole archive is not
buffered. Each individual file still uses the ordinary checksummed document
reader and its existing size bound. The current bundle format is standard
ZIP32, so more than its 4 GiB size/address range or 65,534 entries is refused
as `export_bundle.zip32_limit` before download. Reference-size multipart/ZIP64
transfer remains OPS-002 work. Only selected sections that exist in this edition
are exported; benefits and other unfinished module histories, complete
target-product archives and erasure restore fences remain the
outstanding DATA-001 target.

## Profile approvals and goals

`profileChanges` contains the native SELF-001 request projection: immutable
before/after values, pending/approved/rejected decisions, and recorded HR/payroll
handoffs. It uses the same self or current `people.private` access as the native
request door; managers and payroll holders gain no private proposal values.
`goals` contains each selected person's goals, milestones, check-ins and
development-completion evidence from PERFORM-001's current self/manager/HR
projection. Unrelated people and member pickers never enter the bundle. A section
the reader cannot enter is named in `withheldSections`; a readable section with
no records is an empty array. Review-cycle feedback uses the separate `reviews` section.

The inclusive `asOf` cutoff uses the employer's time zone for request, decision,
handoff, goal, check-in and completion timestamps. A later request or goal is
absent; a later decision leaves its request pending; a later handoff leaves an
approved request unresolved without that handoff's reference, actor or time.
Later check-ins and completion evidence are absent. Current permissions and
current manager scope still govern all dates. The ZIP manifest covers these
histories in `records.json` with the same byte count and SHA-256 verification.

## Performance review history

`reviews` reuses the current native PERFORM-001 review projection and then
restricts every assignment, authored input revision, HR calibration note,
released summary, acknowledgment, appeal and release/withholding custody row to
the selected person. Other subjects and member pickers are excluded, including
feedback the selected employee authored about somebody else. Existing native
rules still govern: employees and reviewers receive their own authored input;
HR receives calibration notes; summaries require their explicit native release
receipt, including succession withholding and retained former-manager releases.
Payroll authority alone grants no review history. An accessible review section
with no permitted cycles is an empty array.

The inclusive employer-local cutoff applies to cycle creation and every recorded
history timestamp. Assignment creation and cycle closure use their native audit
events; a close after the cutoff leaves the exported status open. Later feedback,
notes, releases, appeals and acknowledgment/custody events are omitted. Current
reader authority governs historical exports, as on the native review door.

## Record tables: PEOPLE-003

The `tables` section adds each person's readable record tables to
`records.json` (rows in force on the export date plus every dated version) and
one `tables/<key>.csv` per table: `person_id`, `employeeNumber` (only where the
reader sees employment), `row_id`, `effectiveFrom` and one column per table
column. Tables the reader may not read are absent, never blank: managers never
receive emergency contacts or HR/payroll custom tables. Reports offer the same
CSV per table at `/app/reports/tables/<key>.csv?asOf=YYYY-MM-DD` and JSON at
`/api/willow/record-tables/<key>`. BambooHR move-in reads the ZIP back into
another employer (IMPORTING.md).

## Owner archives and restored connection consent

`rer export` now writes notice delivery disabled, OIDC consent disabled and no
selected model in its portable connection settings. This changes only the
archive: the source installation keeps its enabled settings. Business import
access also exports disabled and requires the owner's explicit enablement in
Import settings after restore; the owner's own reviewed imports remain available.
Permanent revoked keys, consumed grant nonces, approval history and import
custody remain portable and unchanged. Notice-delivery history, including any
uncertain/pending outcome, and business records stay
unchanged. Existing pending cases and payroll drafts restore as work to finish;
restoring or reenabling connections never replays historical actions. Sessions,
provider links and credentials remain excluded under WIL-17/WIL-19.

After `rer import` and ordinary setup/sign-in, the owner explicitly enables
notices or selects a model in Connections; identity connections need a fresh
owner link. This is required even if the new runtime already has provider
bindings. The current edition has no background dispatcher that resends stored
pending notice rows or restarts stored model requests.

Older archives with enabled notices, OIDC, a selected model or Business import
access remain restorable. Base verifies the original backup and normalizes its
staged connection and import settings rows before applying them, leaving the
original file and its authenticated digests
unchanged. Willow's seed-owned `localPortability` policy declares only the safe
replacements `wl_connections.notices=0`, `wl_connections.oidc=0`,
`wl_connections.model=null` and `ik_door_settings.enabled=0`; Base bounds and
journals the changes. The JSON import receipt exposes Base's actual `safetyChanges`, each
with `table`, `column`, safe replacement `value` and changed `rows` count, plus
`ownerReauthorizationRequired` for notices, OIDC, model connections and
`businessImport`.
Already-disabled values do not count as changes. The ordinary command prints
Base's change counts and Willow's required authorization guidance. All other
business records, history and files keep their original values.

The executable policy uses Base's native local transfer. The CLI explicitly
refuses executable policy modules on container transport. New exports use
Base's verified atomic publication and never overwrite an existing backup.
This restore consent slice leaves DATA-001 partial: complete target-product
portability and the other outstanding export work above remain open.

## Signing custody

Selecting the documents section includes permitted native signing lineage,
exact consent wording and language, signing values, protected execution events
and a completed certificate. The employee and authorized employer-wide HR need
current category rights; a manager status grant exports no execution evidence.
Session bindings and unused payload reviews are excluded from employee bundles.
The sealed document bytes remain in the existing documents collection and the
manifest verifies their SHA-256 against the execution certificate.

Request-owned signing records inherit their filing category's retention class,
expiry and holds. Erasure moves retained evidence into restricted custody and
keeps other recipients' shared-cohort records independent. Unassigned rendered
preview files retain the existing preview-custody boundary; full erasure and
purge coverage is still recorded as partial in the signing clauses.

Owner archives preserve historical signed records and consent evidence, while
excluding payload reviews, consuming old issue reviews, voiding unsigned requests
and stopping cohort enrollment and outbound policies. Restore never recreates
source sessions or authority to continue an unfinished signing request. Reissue
requires fresh employer review and each signer's own applicable consent.
