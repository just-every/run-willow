# Employee exports

On **People**, open **Export employee records**, choose fields, scope and an
as-of date, then download CSV or XLSX. The current directory search, location,
department, role and status filters apply. This is the standard-field slice of
DATA-001; custom fields/tables and complete target-product portability remain
work. The owner archive is still the separate `rer export` / `rer import` flow
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

## Records and document bundles

The same People form offers **Download records and files ZIP**. Choose which
history sections to include using its checkboxes. The signed-in door is
`/app/exports/employees.zip`, using the same `scope`, `fields`, date, filters and
optional `person` selections as CSV/XLSX. It also requires `history`, repeated
or comma-separated: `employment`, `leave`, `lifecycle`, `documents`.

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
are exported; custom tables, signatures, performance, benefits and other future
modules, complete target-product archives and restore send fences remain the
outstanding DATA-001 target.
