# Willow release scope and acceptance

Willow supports one employer's people register, effective-dated employment,
private documents, schedule-based leave, lifecycle work and reviewed payroll
file handoff. It runs locally without provider accounts. [CONTRACT.md](CONTRACT.md)
holds clauses WIL-01 to WIL-21 and their verification commands.

## Verification

- `rer verify` checks source integrity, copied Base modules, builds, typechecks
  and runs email-link, Willow flow, regression and optional-connection tests.
  The built Worker uses real local D1/R2 and public JSON, form and download
  doors. Private-field checks crawl every registered read door for members
  with different grants.
- `WILLOW_TEST_CHECKOUT=1 pnpm run test:journey` runs in a disposable fresh
  clone. It exercises setup, personas, build, preview, export and fresh-clone
  restore through the maintained command, including access after recovery.
- `pnpm run test:phase2-browser` exercises the connection and payroll views;
  `pnpm run test:site` builds and checks the separate run site. GitHub Verify
  runs these checks and the browser journey.

People and import files in the tests are invented. Mail, OIDC and model
fixtures replace only provider network edges. These checks cover local
behavior, not real provider delivery, payroll-account acceptance or hosted
capacity. Browser artifacts use `WILLOW_EVIDENCE_DIR` outside the checkout.

## Upgrade and recovery

Existing installations upgrade in place. Stop dev and preview, keep a private
export and retain the release that made it: an export restores with that
release. Update the existing checkout, run `rer install`, then `rer setup` to
apply forward migrations while retaining the owner and data. For recovery,
restore on the original release before upgrading the restored installation.
Applied migrations 0001–0008 retain their original bytes; 0009–0018 add the
current auth, token-health and import-kit structures.

An upgrade needs a populated installation check: compare records, grants,
employment history, leave ledger, lifecycle work, payroll history, audit,
import custody and stored document bytes before and after the migration.
Fresh setup and export/import checks do not replace that comparison. Never
reactivate inactive sign-in identities or carry sessions and credentials into
an archive.

## Owner trials before live use

- Reconcile a real BambooHR employee report, balances and documents. The kit
  uses documented employee field names; the balance CSV and document manifest
  are Willow's own documented shapes. Confirm actual column labels, pay-rate
  formats and dates against [IMPORTING.md](IMPORTING.md).
- Reconcile one real payroll handoff with the provider before retiring the
  prior process. Check the [field authority and cutover checklist](FIELD-AUTHORITY.md).
  ADP output implements a documented file format, not live account certification.
- Review leave policies and schedules for the employer's jurisdiction. Willow
  contains no award or statutory entitlement engine. People, lifecycle and
  the reconciled leave ledger belong in Willow; payroll owns payments and tax.
- Validate hosted operation, real mail delivery and any optional OIDC/model
  connection with the owner's accounts. Review retention and privacy needs
  with appropriate advice and complete an accessibility audit.

Leave-policy model answers, Personio and HiBob move-in kits, and live
payroll/HRIS/account connectors are outside the delivered scope. Optional
models draft checklists from controlled structural context; they do not
make employment decisions or interpret policy for a person.

Willow keeps records and coordinates work. It does not calculate pay or tax,
make employment decisions or claim that a checklist is a compliance guarantee.
