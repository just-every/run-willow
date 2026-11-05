Willow's move-in kit brings your team across from BambooHR without retyping: people, their employment, time-off balances and documents. The **installation owner** opens **Move in**, reviews the preview and applies the import. HR can prepare the files for the owner. Uploads and plans are retained privately; no people or employment records change until the owner applies a reviewed plan. An untouched import can be undone.

## Prepare the files

- **Employee report** (required, `.csv` or `.xlsx`): a BambooHR report with fields such as `id`, `employeeNumber`, `firstName`, `lastName`, `workEmail`, `hireDate`, `terminationDate`, `jobTitle`, `department`, `location`, `supervisorEId`, `payRate`, `payType` and `paidPer`. Columns are matched by BambooHR's field names or their report labels.
- **Time-off balances** (optional `.csv`): `id`, `timeOffType`, `balance`, `units` (hours) and `asOf`, the cutover date. Each type maps to a Willow leave policy with an approved version.
- **Documents** (optional `.zip`): a `manifest.csv` with `file`, `id`, `category` and `title`, and the files it names. Each category must already exist in Willow.

Choose how dates are written in the files and, if you like, the working schedule for imported employment.

## Preview

**Preview import** is a dry run: no people or employment records change. It shows active, upcoming and former employment periods, the departments and locations it will create, balances to sign off and documents, every rejected row with its reason, people whose manager is not in the export, what will be unknown after the import, and the gaps BambooHR's fields leave out (schedules, emergency contacts and payroll identifiers).

An employee row without a readable hire date is rejected whole, including its person record. The preview names the employee file and the employment and native-record counts as your review reference; Apply remains bound to that exact review.

The preview distinguishes **native records to write** from **source records processed**. Each employee contributes a person and an employment source record; departments, locations, balances, documents and table rows are separate source records. Existing departments and locations need no native write. Import history shows source records processed, so six native writes from eight source records appears as eight source records in history.

## Apply

**Apply import** writes exactly the preview you reviewed. If anything changed since, Willow asks you to preview again. Balances arrive as proposed opening balances for a leave manager to sign off, and documents keep their category's privacy. Importing the same export again adds nothing.

## Undo

**Undo this import** removes an untouched import completely: people, employment, balances, documents and the departments or locations it created. Once anything was built on it (a signed-off balance, a leave request, a later change, a case, a payroll handoff, a new document version or a linked sign-in), undo lists those records so you can reverse them first.

Blockers name the person and account or record and link to it. A signed-off opening balance is a permanent leave ledger entry and cannot be deleted to undo an import. Interrupted Apply and Undo operations keep their reviewed plan; use **Resume** from the import history. **Reconcile** compares the applied records with the reviewed source.

Keep BambooHR read-only until Willow has produced one reconciled [payroll handoff](/docs/payroll).
