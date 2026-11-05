A colleague or your own agent can prepare a joiner or mover for HR to review on **Proposals**. The preparer needs **Manage people, employment and lifecycle** access. Preparation does not change employment. HR approves the exact plan, and Willow refuses it if the underlying records have changed.

## Prepare a joiner

Use the installation's address, a signed-in session cookie and an `Origin` header matching that address. Keep the cookie private. Read `GET /api/willow/templates` and choose an active joiner template. `GET /api/willow/settings` supplies current department, location and schedule choices; `GET /api/willow/people` supplies manager choices.

Send `POST /api/willow/proposal.create` with a JSON body like this, replacing the template and schedule references with the choices you read:

```json
{
  "kind": "joiner",
  "summary": "Welcome Keisha Brooks",
  "agent": "HR planning colleague",
  "plan": {
    "template": "the selected active template reference",
    "legalName": "Keisha Brooks",
    "workEmail": "keisha@example.com",
    "startDate": "2026-11-09",
    "employmentType": "part_time",
    "jobTitle": "Designer",
    "scheduleId": "the selected schedule reference"
  }
}
```

The API uses `full_time`, `part_time`, `casual` or `fixed_term` for employment type. The review page displays their readable labels and formats dates. The same validation applies as **Start a joiner**. Optional fields include preferred name, employee number, payroll identifier, department, location and manager. Pay requires compensation access. Willow returns the proposal reference, exact changes and missing information. Open `/app/proposals/` followed by that reference, or find its summary on **Proposals**.

## Prepare a mover

Use `kind: "mover"`. Its plan needs the existing employment `period`, `effectiveFrom` date and `reason`, plus the changed fields used by **Schedule a change** (for example `jobTitle`, `managerPersonId` or `scheduleId`). Read the person's current record first to obtain the employment reference. An optional active mover `template` opens a case.

HR can approve or decline the plan in Willow. Approval shows who approved it, when, and links to the resulting person and case. A stale plan must be prepared again from current records.
