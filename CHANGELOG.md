# Changes

## 0.1.1 — 2026-11-26

Willow keeps one employer's people register, employment history, leave ledger and joiner, mover and leaver work, and hands accurate changes to the payroll provider you already use. This release follows the 0.1.0 source release and runs on `@runeditrun/rer` 0.2.134.

### What changed since 0.1.0

- **Hosted installation.** A reproducible Worker artifact, a digest-bound setup form and deployment specification, and optional relay or direct email-provider configuration. A Business can run Willow with mail off; the owner signs in with a one-time link.
- **People work.** Custom fields and record tables, change requests and approvals, date alerts, self-service, leave policies, compensation records, surveys, performance reviews and goals, hiring, preboarding, training and native document signing.
- **Access and integrations.** Access levels and delegation, field rights, API credentials and OAuth clients, webhooks, Okta provisioning and an agent door for declared Willow jobs.
- **Your data stays yours.** Owner export and restore keep the archive identity and applied migration bytes; erasure covers applicants and preboarding records.

### Upgrading

Keep an export made with 0.1.0 and apply only forward migrations with `rer setup`; every migration added since 0.1.0 is listed in RELEASE.json. Configure hosted email, or leave mail off, before inviting members.
