# Field authority

Which system is the record for each field once you move to Willow. Willow
owns people and lifecycle, and the leave ledger after reconciliation; your
payroll provider owns pay runs, tax and payments.

| Field | Authority | Who reads it in Willow |
| --- | --- | --- |
| Legal and preferred name, work email, employee number | Willow | every member (employee number: HR, payroll, managers, the person) |
| Personal email, phone, address, date of birth, emergency contact | Willow | the person; people.private |
| Employment periods: start, end, type | Willow | the person, their manager, HR, payroll |
| End-of-employment reason | Willow | the person; people.private |
| Terms: job title, department, location, manager, working schedule | Willow (effective-dated) | the person, their manager, HR, payroll |
| Pay basis and amount on each terms version | Willow, as the agreed input to payroll | the person; pay.read |
| Payroll provider identifier | Payroll provider (mapped in Willow) | HR, payroll |
| Pay calculations, tax, superannuation, payments, payslips | Payroll provider | not in Willow |
| Leave policy text, accrual and negative limit | Willow (owner-approved versions you supply) | every member |
| Leave balances and their history | Willow ledger, from the signed-off opening balance | the person, their manager, leave.manage |
| Confidential absence reason | Willow | the person; leave.manage |
| Joiner, mover and leaver tasks and evidence | Willow | the case's assignees, the manager, HR |
| External accounts and devices | Their own systems; Willow records the evidence of each action | task assignees |
| Private documents | Willow (category access) | per category; documents.private |

Willow does not encode award, agreement or statutory leave rules, public
holidays or retention periods: you supply reviewed policies and schedules, and
retention follows your own legal advice.

## Cutover checklist

1. Owner: set up the employer, locations, departments and working schedules.
2. HR: write leave policies; owner: approve a version of each.
3. HR: create document categories and joiner, mover and leaver templates.
4. Agree the cutover date. Export the BambooHR employee report including
   inactive employees, the time-off balances as of the cutover date (in hours)
   and the documents you are moving.
5. Preview the import; resolve rejected rows and unknowns in BambooHR or plan
   to fill them in Willow. Apply.
6. Set each person's working schedule and payroll identifier where the import
   left them unknown.
7. A leave manager signs off every opening balance against the incumbent's
   figures at the cutover date.
8. Give people access; preview what an employee, a manager and payroll see.
9. Keep BambooHR read-only through the first pay period. Prepare Willow's
   payroll change batch for it, reconcile it against the provider's own
   changes, export it and record the provider's acknowledgement.
10. Export an owner archive (`rer export`) and keep it
    private and offline.
