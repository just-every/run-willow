# Adapting Willow

The editable source is [just-every/run-willow](https://github.com/just-every/run-willow).
Start with [README.md](README.md) and [AGENTS.md](AGENTS.md) for local commands,
layout and the JSON action surface. Read [CONTRACT.md](CONTRACT.md),
[ACCEPTANCE.md](ACCEPTANCE.md) and the installation's recorded requirements
before changing behavior.

You may change all MIT source to fit the employer's needs. Preserve the owner's
customizations and data, private-field permissions, effective-dated employment,
append-only leave ledger, reviewed payroll handoff and import/restore guarantees.
A changed guarantee needs an explicit requirement and matching proof; never
hide a failure with fabricated providers or fallback application behavior.

Keep applied migrations unchanged and add forward migrations for schema changes.
Before upgrading, stop dev and preview, make a private export and retain the
release that made it. Restore on that release before upgrading in place; see
[OPERATIONS.md](OPERATIONS.md) and [ACCEPTANCE.md](ACCEPTANCE.md).

Keep credentials in private runtime settings. Do not commit employee data,
exports, local evidence or provider secrets. Optional connections start off;
read [CONNECTIONS.md](CONNECTIONS.md) before enabling them. Payroll calculation,
tax and payments remain with the payroll provider.

Use the documented verification commands for affected flows and report the
result and remaining limits. Local fixture coverage does not establish hosted
operation, real provider delivery or a reconciled payroll handoff. Keep source
integrity current with `node scripts/edition-authoring/cli.mjs lock` after
intentional edits, then run its `check` command. Do not overwrite local work
when adopting upstream changes.
