-- Willow: people register, effective-dated employment, leave ledger, lifecycle
-- cases, private documents and payroll handoff for one employer.
-- Dates that belong to employment (start, end, effective, leave days) are ISO
-- calendar dates in the employer's time zone. Instants are epoch milliseconds.
-- Leave is counted in whole minutes. Money is integer cents.

CREATE TABLE wl_employer (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  name TEXT NOT NULL,
  timezone TEXT NOT NULL,
  country TEXT NOT NULL,
  currency TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE wl_locations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  timezone TEXT NOT NULL,
  origin TEXT NOT NULL DEFAULT 'native' CHECK (origin IN ('native', 'import')),
  revision TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE wl_departments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  origin TEXT NOT NULL DEFAULT 'native' CHECK (origin IN ('native', 'import')),
  revision TEXT,
  created_at INTEGER NOT NULL
);
-- Working schedules are immutable once created: a different pattern is a new schedule.
CREATE TABLE wl_schedules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  mon INTEGER NOT NULL CHECK (mon BETWEEN 0 AND 1440),
  tue INTEGER NOT NULL CHECK (tue BETWEEN 0 AND 1440),
  wed INTEGER NOT NULL CHECK (wed BETWEEN 0 AND 1440),
  thu INTEGER NOT NULL CHECK (thu BETWEEN 0 AND 1440),
  fri INTEGER NOT NULL CHECK (fri BETWEEN 0 AND 1440),
  sat INTEGER NOT NULL CHECK (sat BETWEEN 0 AND 1440),
  sun INTEGER NOT NULL CHECK (sun BETWEEN 0 AND 1440),
  created_at INTEGER NOT NULL
);
CREATE TRIGGER wl_schedules_immutable BEFORE UPDATE ON wl_schedules BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;

-- People. Directory fields live in wl_people; private contact fields live in
-- wl_person_private and are read only through the access projection.
CREATE TABLE wl_people (
  id TEXT PRIMARY KEY,
  legal_name TEXT NOT NULL,
  preferred_name TEXT,
  work_email TEXT UNIQUE,
  employee_number TEXT UNIQUE,
  origin TEXT NOT NULL DEFAULT 'native' CHECK (origin IN ('native', 'import')),
  revision TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE wl_person_private (
  person_id TEXT PRIMARY KEY REFERENCES wl_people(id),
  personal_email TEXT,
  phone TEXT,
  address TEXT,
  date_of_birth TEXT,
  emergency_contact TEXT
);

-- Signed-in members and their explicit permissions. A member may be linked to
-- the person they are; managerial rank never grants a permission.
CREATE TABLE wl_members (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  person_id TEXT UNIQUE REFERENCES wl_people(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  created_at INTEGER NOT NULL
);
CREATE TABLE wl_permissions (
  member_id TEXT NOT NULL REFERENCES wl_members(id),
  permission TEXT NOT NULL CHECK (permission IN ('people.manage', 'people.private', 'pay.read', 'leave.manage', 'payroll.handoff', 'documents.private', 'reports.read', 'it.tasks', 'audit.read')),
  granted_by TEXT NOT NULL,
  granted_at INTEGER NOT NULL,
  PRIMARY KEY (member_id, permission)
);

-- Employment periods: a person has one or more, never overlapping. Ending a
-- period is an end date, not an archive flag.
CREATE TABLE wl_periods (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES wl_people(id),
  start_date TEXT NOT NULL,
  end_date TEXT,
  end_reason TEXT,
  employment_type TEXT NOT NULL CHECK (employment_type IN ('full_time', 'part_time', 'casual', 'fixed_term', 'unknown')),
  payroll_id TEXT,
  origin TEXT NOT NULL DEFAULT 'native' CHECK (origin IN ('native', 'import')),
  revision TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  CHECK (end_date IS NULL OR end_date >= start_date)
);
CREATE INDEX wl_periods_person ON wl_periods(person_id);

-- Effective-dated terms. Each row is a complete version effective from a date;
-- rows are never edited, only cancelled, so past and future versions remain.
CREATE TABLE wl_terms (
  id TEXT PRIMARY KEY,
  period_id TEXT NOT NULL REFERENCES wl_periods(id),
  effective_from TEXT NOT NULL,
  job_title TEXT NOT NULL,
  department_id TEXT REFERENCES wl_departments(id),
  location_id TEXT REFERENCES wl_locations(id),
  manager_person_id TEXT REFERENCES wl_people(id),
  schedule_id TEXT REFERENCES wl_schedules(id),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  origin TEXT NOT NULL DEFAULT 'native' CHECK (origin IN ('native', 'import')),
  recorded_by TEXT NOT NULL,
  recorded_at INTEGER NOT NULL,
  cancelled_by TEXT,
  cancelled_at INTEGER
);
CREATE UNIQUE INDEX wl_terms_one_active ON wl_terms(period_id, effective_from) WHERE status = 'active';
CREATE TRIGGER wl_terms_immutable BEFORE UPDATE OF id, period_id, effective_from, job_title, department_id, location_id, manager_person_id, schedule_id, reason, origin, recorded_by, recorded_at ON wl_terms BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
CREATE TRIGGER wl_terms_cancel_once BEFORE UPDATE OF status ON wl_terms WHEN OLD.status <> 'active' BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
CREATE TRIGGER wl_terms_keep BEFORE DELETE ON wl_terms WHEN OLD.origin <> 'import' BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
-- Compensation for a terms version, kept apart from the terms row.
CREATE TABLE wl_term_pay (
  term_id TEXT PRIMARY KEY REFERENCES wl_terms(id),
  pay_basis TEXT NOT NULL CHECK (pay_basis IN ('salary', 'hourly', 'unknown')),
  amount_cents INTEGER CHECK (amount_cents IS NULL OR amount_cents >= 0),
  currency TEXT NOT NULL
);
CREATE TRIGGER wl_term_pay_immutable BEFORE UPDATE ON wl_term_pay BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;

-- Leave policies: versions are written by leave managers and approved by the owner.
CREATE TABLE wl_leave_policies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
CREATE TABLE wl_policy_versions (
  id TEXT PRIMARY KEY,
  policy_id TEXT NOT NULL REFERENCES wl_leave_policies(id),
  version INTEGER NOT NULL,
  summary TEXT NOT NULL,
  accrual_weeks_hundredths INTEGER NOT NULL CHECK (accrual_weeks_hundredths BETWEEN 0 AND 5200),
  negative_limit_minutes INTEGER NOT NULL CHECK (negative_limit_minutes >= 0),
  status TEXT NOT NULL CHECK (status IN ('draft', 'approved')),
  written_by TEXT NOT NULL,
  written_at INTEGER NOT NULL,
  approved_by TEXT,
  approved_at INTEGER,
  UNIQUE (policy_id, version)
);
CREATE TRIGGER wl_policy_versions_immutable BEFORE UPDATE OF policy_id, version, summary, accrual_weeks_hundredths, negative_limit_minutes ON wl_policy_versions BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;

-- A leave account belongs to one employment period and policy. Its opening
-- balance is proposed at a cutover date and becomes a ledger entry only when
-- a leave manager signs it off.
CREATE TABLE wl_leave_accounts (
  id TEXT PRIMARY KEY,
  period_id TEXT NOT NULL REFERENCES wl_periods(id),
  policy_id TEXT NOT NULL REFERENCES wl_leave_policies(id),
  policy_version_id TEXT NOT NULL REFERENCES wl_policy_versions(id),
  cutover_date TEXT NOT NULL,
  opening_minutes INTEGER NOT NULL,
  opening_note TEXT NOT NULL,
  opening_status TEXT NOT NULL CHECK (opening_status IN ('proposed', 'approved')),
  approved_by TEXT,
  approved_at INTEGER,
  accrued_through TEXT,
  origin TEXT NOT NULL DEFAULT 'native' CHECK (origin IN ('native', 'import')),
  revision TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (period_id, policy_id)
);

CREATE TABLE wl_leave_requests (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES wl_leave_accounts(id),
  person_id TEXT NOT NULL REFERENCES wl_people(id),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  minutes INTEGER NOT NULL CHECK (minutes > 0),
  calculation TEXT NOT NULL,
  approver_member_id TEXT REFERENCES wl_members(id),
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'declined', 'withdrawn', 'cancelled')),
  corrects TEXT REFERENCES wl_leave_requests(id),
  requested_by TEXT NOT NULL,
  requested_at INTEGER NOT NULL,
  decided_by TEXT,
  decided_at INTEGER,
  decision_note TEXT,
  cancelled_by TEXT,
  cancelled_at INTEGER,
  cancel_note TEXT,
  CHECK (end_date >= start_date)
);
-- Confidential absence reasons: never part of a request read unless permitted.
CREATE TABLE wl_leave_reasons (
  request_id TEXT PRIMARY KEY REFERENCES wl_leave_requests(id),
  reason TEXT NOT NULL
);

-- The leave ledger is append-only. Every balance is the sum of its entries;
-- an entry can be reversed at most once.
CREATE TABLE wl_ledger (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES wl_leave_accounts(id),
  kind TEXT NOT NULL CHECK (kind IN ('opening', 'accrual', 'reservation', 'release', 'use', 'reversal', 'adjustment')),
  minutes INTEGER NOT NULL,
  effective_date TEXT NOT NULL,
  request_id TEXT REFERENCES wl_leave_requests(id),
  reverses TEXT UNIQUE REFERENCES wl_ledger(id),
  note TEXT NOT NULL,
  recorded_by TEXT NOT NULL,
  recorded_at INTEGER NOT NULL
);
CREATE INDEX wl_ledger_account ON wl_ledger(account_id);
CREATE UNIQUE INDEX wl_ledger_one_opening ON wl_ledger(account_id) WHERE kind = 'opening';
CREATE UNIQUE INDEX wl_ledger_one_reservation ON wl_ledger(request_id) WHERE kind = 'reservation';
CREATE UNIQUE INDEX wl_ledger_one_release ON wl_ledger(request_id) WHERE kind = 'release';
CREATE UNIQUE INDEX wl_ledger_one_use ON wl_ledger(request_id) WHERE kind = 'use';
CREATE TRIGGER wl_ledger_no_update BEFORE UPDATE ON wl_ledger BEGIN SELECT RAISE(ABORT, 'willow_ledger_append_only'); END;
CREATE TRIGGER wl_ledger_no_delete BEFORE DELETE ON wl_ledger BEGIN SELECT RAISE(ABORT, 'willow_ledger_append_only'); END;

-- Lifecycle templates are versioned; a case keeps the version it started from.
CREATE TABLE wl_templates (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('joiner', 'mover', 'leaver')),
  name TEXT NOT NULL,
  required_fields TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'retired')),
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (family_id, version)
);
CREATE TABLE wl_template_tasks (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES wl_templates(id),
  position INTEGER NOT NULL,
  title TEXT NOT NULL,
  assignee TEXT NOT NULL CHECK (assignee IN ('hr', 'manager', 'it', 'payroll', 'employee')),
  due_offset_days INTEGER NOT NULL,
  evidence_required INTEGER NOT NULL CHECK (evidence_required IN (0, 1)),
  system TEXT,
  action TEXT CHECK (action IS NULL OR action IN ('end_access')),
  UNIQUE (template_id, position)
);
CREATE TABLE wl_cases (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('joiner', 'mover', 'leaver')),
  person_id TEXT NOT NULL REFERENCES wl_people(id),
  period_id TEXT NOT NULL REFERENCES wl_periods(id),
  template_id TEXT NOT NULL REFERENCES wl_templates(id),
  anchor_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'completed')),
  opened_by TEXT NOT NULL,
  opened_at INTEGER NOT NULL,
  completed_by TEXT,
  completed_at INTEGER,
  revision TEXT NOT NULL
);
CREATE TABLE wl_case_tasks (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES wl_cases(id),
  position INTEGER NOT NULL,
  title TEXT NOT NULL,
  assignee TEXT NOT NULL CHECK (assignee IN ('hr', 'manager', 'it', 'payroll', 'employee')),
  assignee_person_id TEXT REFERENCES wl_people(id),
  due_date TEXT NOT NULL,
  evidence_required INTEGER NOT NULL,
  system TEXT,
  action TEXT,
  status TEXT NOT NULL CHECK (status IN ('open', 'done')),
  evidence TEXT,
  completed_by TEXT,
  completed_at INTEGER,
  UNIQUE (case_id, position)
);

-- Private documents: categories decide who besides document holders may read.
CREATE TABLE wl_doc_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  subject_reads INTEGER NOT NULL CHECK (subject_reads IN (0, 1)),
  manager_reads INTEGER NOT NULL CHECK (manager_reads IN (0, 1)),
  acknowledgement INTEGER NOT NULL CHECK (acknowledgement IN (0, 1)),
  created_at INTEGER NOT NULL
);
CREATE TABLE wl_documents (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES wl_people(id),
  category_id TEXT NOT NULL REFERENCES wl_doc_categories(id),
  title TEXT NOT NULL,
  origin TEXT NOT NULL DEFAULT 'native' CHECK (origin IN ('native', 'import')),
  revision TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE wl_document_versions (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES wl_documents(id),
  number INTEGER NOT NULL,
  filename TEXT NOT NULL,
  media_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  uploaded_by TEXT NOT NULL,
  uploaded_at INTEGER NOT NULL,
  UNIQUE (document_id, number)
);
CREATE TRIGGER wl_document_versions_immutable BEFORE UPDATE ON wl_document_versions BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
-- A receipt acknowledgement: the person confirms they received a version. It is not a signature.
CREATE TABLE wl_acknowledgements (
  id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES wl_document_versions(id),
  person_id TEXT NOT NULL REFERENCES wl_people(id),
  member_id TEXT NOT NULL REFERENCES wl_members(id),
  statement TEXT NOT NULL,
  at INTEGER NOT NULL,
  UNIQUE (version_id, person_id)
);

-- Payroll handoff batches. Each source change is handed off at most once.
CREATE TABLE wl_payroll_batches (
  id TEXT PRIMARY KEY,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'exported', 'acknowledged')),
  lines TEXT NOT NULL,
  exceptions TEXT NOT NULL,
  csv_sha256 TEXT,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  exported_by TEXT,
  exported_at INTEGER,
  acknowledged_by TEXT,
  acknowledged_at INTEGER,
  provider_reference TEXT,
  acknowledgement_note TEXT,
  revision TEXT NOT NULL
);
CREATE TABLE wl_payroll_items (
  source_kind TEXT NOT NULL,
  source_id TEXT NOT NULL,
  batch_id TEXT NOT NULL REFERENCES wl_payroll_batches(id),
  PRIMARY KEY (source_kind, source_id)
);

-- Proposed actions from a person or the owner's own agent. Approval executes
-- the exact plan only while every expected record version is unchanged.
CREATE TABLE wl_proposals (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('joiner', 'mover')),
  summary TEXT NOT NULL,
  agent TEXT NOT NULL,
  plan TEXT NOT NULL,
  expected TEXT NOT NULL,
  diff TEXT NOT NULL,
  missing TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'declined')),
  proposed_by TEXT NOT NULL,
  proposed_at INTEGER NOT NULL,
  decided_by TEXT,
  decided_at INTEGER,
  receipt TEXT
);

CREATE TABLE wl_audit (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  subject TEXT NOT NULL,
  detail TEXT NOT NULL
);

-- Atomic preconditions: a write batch inserts one row per precondition and
-- deletes them at the end. A false precondition aborts the whole batch.
CREATE TABLE wl_guard (code TEXT NOT NULL, ok INTEGER NOT NULL);
CREATE TRIGGER wl_guard_stale BEFORE INSERT ON wl_guard WHEN NEW.ok IS NOT 1 AND NEW.code = 'stale' BEGIN SELECT RAISE(ABORT, 'willow_guard_stale'); END;
CREATE TRIGGER wl_guard_balance BEFORE INSERT ON wl_guard WHEN NEW.ok IS NOT 1 AND NEW.code = 'insufficient_balance' BEGIN SELECT RAISE(ABORT, 'willow_guard_insufficient_balance'); END;
CREATE TRIGGER wl_guard_tasks BEFORE INSERT ON wl_guard WHEN NEW.ok IS NOT 1 AND NEW.code = 'tasks_open' BEGIN SELECT RAISE(ABORT, 'willow_guard_tasks_open'); END;
CREATE TRIGGER wl_guard_exported BEFORE INSERT ON wl_guard WHEN NEW.ok IS NOT 1 AND NEW.code = 'already_handed_off' BEGIN SELECT RAISE(ABORT, 'willow_guard_already_handed_off'); END;
CREATE TRIGGER wl_guard_overlap BEFORE INSERT ON wl_guard WHEN NEW.ok IS NOT 1 AND NEW.code = 'period_overlap' BEGIN SELECT RAISE(ABORT, 'willow_guard_period_overlap'); END;
CREATE TRIGGER wl_guard_other BEFORE INSERT ON wl_guard WHEN NEW.ok IS NOT 1 AND NEW.code NOT IN ('stale', 'insufficient_balance', 'tasks_open', 'already_handed_off', 'period_overlap') BEGIN SELECT RAISE(ABORT, 'willow_guard_failed'); END;
