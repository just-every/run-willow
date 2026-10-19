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
