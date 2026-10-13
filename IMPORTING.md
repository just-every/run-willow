# Moving in from BambooHR

Willow's first move-in kit runs on Base's import kit: **Move in** (`/app/import`,
people.manage) or `POST /api/willow/import.preview` then `import.apply`. The
preview is a dry run that writes nothing; apply needs the preview's
fingerprint and refuses if anything changed since. Every import keeps its
original files, a journal and the source row behind each record.

## Files

**Employee report** (required, `.csv` or `.xlsx`, first sheet). Columns are
matched by BambooHR's documented field names (documentation.bamboohr.com,
"List of field names", read 2026-10-11) or their report labels (case and
punctuation ignored, so `Employee #` matches `employeeNumber`):

| Field | Used for |
| --- | --- |
| `id` (or `employeeNumber`) | the stable identifier; rows without one are rejected |
| `firstName`, `lastName`, `preferredName` | the person |
| `workEmail` | sign-in access later; must not belong to an existing Willow person |
| `homeEmail`, `mobilePhone`, `address1`, `address2`, `city`, `state`, `zipcode`, `country`, `dateOfBirth` | private details |
| `hireDate` (required), `terminationDate`, `status` | the employment period; `Inactive` without a termination date is rejected |
| `employmentStatus` | Full-Time, Part-Time, Casual, Contract/Fixed term; anything else is imported as unknown |
| `jobTitle` (required), `department`, `location`, `supervisorEId` (or `reportsTo`) | the first terms; missing departments and locations are created |
| `payRate`, `payType`, `paidPer` | pay when it is a yearly salary or an hourly rate; otherwise pay is imported as unknown |

**Time-off balances** (optional `.csv`; Willow's shape, since BambooHR has no
single balance export): `id` (or `employeeNumber`), `timeOffType`, `balance`,
`units` (`hours`), `asOf` (the cutover date). The type maps to a Willow leave
policy of the same name (or one you choose in the preview) that has an
approved version. Balances in days are rejected: convert them with the
person's schedule first. Each balance arrives as a **proposed** opening
balance that a leave manager signs off.

**Documents** (optional `.zip`): a `manifest.csv` with `file`, `id`,
`category`, `title`, and the files it names. The category must already exist
in Willow; documents keep its access and never appear in the directory.

Dates are read as `YYYY-MM-DD` (BambooHR's API form) unless you choose
day/month/year or month/day/year in the preview. Files up to 8 MB each.

## What the preview reports

Active, upcoming and former employment periods; departments and locations to
create; rejected rows with the reason (repeated ids, missing hire dates,
conflicts with people already in Willow, inactive rows without dates, balances
in days, unmapped time-off types, unknown categories or missing files);
managers not in the export; unknowns per person (work email, private details,
employment type, department, location, manager, schedule, pay); and gaps:
fields BambooHR leaves out for users who cannot see them, missing former
employees (reports default to active people), schedules, emergency contacts and
payroll identifiers, which are not part of these fields.

## Re-import and undo

Importing the same export again adds nothing. A row that changed since an
earlier import is not overwritten: edit the record in Willow. **Undo** removes
an untouched import completely (people, employment, balances, documents and
created departments or locations). Once anything was edited or built on — a
signed-off balance, a leave request, a later terms change, a case, a payroll
handoff, a new document version, a linked sign-in — undo is refused and lists
the records; reverse those in Willow first (a signed-off opening balance is a
ledger entry and stays).

## Not yet

Personio (company export ZIPs) and HiBob (People API JSON) kits, and an
authenticated BambooHR Datasets adapter, are later. The fixtures in
`tests/willow/fixtures.mjs` follow the documented field names with invented
people; a real BambooHR export is the owner trial that confirms them.
