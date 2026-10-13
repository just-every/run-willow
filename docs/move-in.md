Willow's move-in kit brings your team across from BambooHR without retyping: people, their employment, time-off balances and documents. Nothing is written until you have reviewed a preview, and an import can be undone while nothing has been built on it. Open **Move in** (this needs **Manage people, employment and lifecycle**).

## Prepare the files

- **Employee report** (required, `.csv` or `.xlsx`): a BambooHR report with fields such as `id`, `employeeNumber`, `firstName`, `lastName`, `workEmail`, `hireDate`, `terminationDate`, `jobTitle`, `department`, `location`, `supervisorEId`, `payRate`, `payType` and `paidPer`. Columns are matched by BambooHR's field names or their report labels.
- **Time-off balances** (optional `.csv`): `id`, `timeOffType`, `balance`, `units` (hours) and `asOf`, the cutover date. Each type maps to a Willow leave policy with an approved version.
- **Documents** (optional `.zip`): a `manifest.csv` with `file`, `id`, `category` and `title`, and the files it names. Each category must already exist in Willow.

Choose how dates are written in the files and, if you like, the working schedule for imported employment.

## Preview

**Preview import** is a dry run: nothing has been written. It shows active, upcoming and former employment periods, the departments and locations it will create, balances to sign off and documents, every rejected row with its reason, people whose manager is not in the export, what will be unknown after the import, and the gaps BambooHR's fields leave out (schedules, emergency contacts and payroll identifiers).

## Apply

**Apply import** writes exactly the preview you reviewed. If anything changed since, Willow asks you to preview again. Balances arrive as proposed opening balances for a leave manager to sign off, and documents keep their category's privacy. Importing the same export again adds nothing.

## Undo

**Undo this import** removes an untouched import completely: people, employment, balances, documents and the departments or locations it created. Once anything was built on it (a signed-off balance, a leave request, a later change, a case, a payroll handoff, a new document version or a linked sign-in), undo lists those records so you can reverse them first.

Keep BambooHR read-only until Willow has produced one reconciled [payroll handoff](/docs/payroll).
