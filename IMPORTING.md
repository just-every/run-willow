# Moving in from BambooHR

Willow's signed-in owner opens **Move in** (`/app/import`). The page, `rer` /
Business clients share Base's single import door: upload → plan → reviewed
fingerprint → apply → reconcile → undo. The former `import.preview`,
`import.apply` and `import.job` APIs are removed. People managers retain their
existing legacy import summaries; new import authority belongs to the owner.

Uploads and plans are private custody, not new people or employment records.
The owner reviews counts, rejections, unknowns and gaps before applying the
exact fingerprint. Document uploads are privately staged under their content
digests before the native records are created. Each import keeps original
bundle bytes, a journal and the source row behind every native record.

The public owner transport is POST `/api/operator/import/{uploads,plan,apply,
status,reconcile,undo}`, with the ordinary signed-in cookie, exact `Origin`,
`Content-Type: application/json` and `X-Import-Source: bamboohr`. Upload a JSON
bundle whose `employees`, optional `balances` and `documents` values contain
`{filename,base64}`; `dateFormat`, `schedule` and `map_<normalized-type>` select
the same mappings as the form. The string fields `employees_name` plus
`employees_b64` (and the corresponding optional file pairs) are also accepted
by the same reader. Files remain limited to 8 MB each. Send chunks of at most
65,536 bytes with upload name, total size/count, index, bundle/chunk SHA-256
and base64. Plan with `{uploadId}`; apply with `{planId,reviewedFingerprint}`
until `job.state` is `completed`; reconcile/status/undo take `{planId}`.
Undo repeats until `undone`; interrupted calls keep the same plan and review.
The Base [door protocol](src/modules/import-kit/src/door/README.md) describes
these fields and responses.

Business uses `/api/rer/import/*` with action-bound signed grants from the
configured owner-claim trust ring. It starts disabled unless the trusted provisioning flag `RER_IMPORT_DOOR=on` records prior owner approval. That flag heals an interrupted first claim or later owner sign-in only when no setting exists, never overriding an owner disable or key revocation. The owner controls it
and permanent key revocations through `import.settings` / `import-settings`.
The owner can always reconcile and undo Business jobs even while Business is
off. History labels who approved locally or via Business. Revoked keys never
return when the setting is enabled again. Imported records confer no access
or external activation. Installation restore disables Business imports and
connections, while keeping custody, approvals and permanent revocations.
DATA-002 must cover door uploads, snapshots, lineage and grant metadata when
native retention/erasure is added; this adoption does not claim erasure exists.

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

Importing the same export again adds nothing. To compare a changed export,
select catch-up (or plan with `catchup:true`): the shared door previews additions,
replacements, unchanged and absent rows. Absent rows remain; an imported row
edited or built on in Willow is not overwritten. Undo a catch-up before its
baseline; it restores the baseline's values. **Undo** removes an untouched
baseline completely (people, employment, balances, documents and created
departments/locations). Once anything was edited or built on — a signed-off
balance, leave request, later terms change, case, payroll handoff, new document
version or linked sign-in — Willow refuses before starting and lists the
records. Reverse those in Willow first; a signed-off opening is a ledger entry
and stays. Existing pre-door imports remain in history with owner undo; no
separate importer can create or apply them.

## Not yet

Personio (company export ZIPs) and HiBob (People API JSON) kits, and an
authenticated BambooHR Datasets adapter, are later. The fixtures in
`tests/willow/fixtures.mjs` follow the documented field names with invented
people; a real BambooHR export is the owner trial that confirms them.
