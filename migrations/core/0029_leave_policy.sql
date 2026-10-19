-- LEAVE-001: immutable, reviewed configuration and durable daily explanations.
CREATE TABLE wl_leave_policy_rules (
  version_id TEXT PRIMARY KEY REFERENCES wl_policy_versions(id),
  rules_json TEXT NOT NULL CHECK (json_valid(rules_json))
);
CREATE TRIGGER wl_leave_policy_rules_no_update BEFORE UPDATE ON wl_leave_policy_rules BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
CREATE TRIGGER wl_leave_policy_rules_no_delete BEFORE DELETE ON wl_leave_policy_rules BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
CREATE TRIGGER wl_leave_policy_rules_draft BEFORE INSERT ON wl_leave_policy_rules WHEN NOT EXISTS (SELECT 1 FROM wl_policy_versions WHERE id = NEW.version_id AND status = 'draft') BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;

CREATE TABLE wl_leave_accrual_state (
  account_id TEXT PRIMARY KEY REFERENCES wl_leave_accounts(id),
  pending_minutes REAL NOT NULL
);
CREATE TABLE wl_leave_carryover_pools (
  account_id TEXT NOT NULL REFERENCES wl_leave_accounts(id),
  year TEXT NOT NULL,
  initial_minutes INTEGER NOT NULL CHECK (initial_minutes >= 0),
  expires_on TEXT,
  expired_minutes INTEGER NOT NULL DEFAULT 0 CHECK (expired_minutes >= 0),
  settled INTEGER NOT NULL DEFAULT 0 CHECK (settled IN (0, 1)),
  PRIMARY KEY (account_id, year)
);
CREATE TRIGGER wl_leave_carryover_pool_source_immutable BEFORE UPDATE OF account_id, year, initial_minutes, expires_on ON wl_leave_carryover_pools BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
CREATE TRIGGER wl_leave_carryover_pool_keep BEFORE DELETE ON wl_leave_carryover_pools BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
CREATE TABLE wl_leave_calculations (
  account_id TEXT NOT NULL REFERENCES wl_leave_accounts(id),
  date TEXT NOT NULL,
  policy_version_id TEXT NOT NULL REFERENCES wl_policy_versions(id),
  calculation TEXT NOT NULL CHECK (json_valid(calculation)),
  recorded_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, date)
);
CREATE TRIGGER wl_leave_calculations_no_update BEFORE UPDATE ON wl_leave_calculations BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
CREATE TRIGGER wl_leave_calculations_no_delete BEFORE DELETE ON wl_leave_calculations BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;

CREATE TABLE wl_leave_policy_events (
  ledger_id TEXT PRIMARY KEY REFERENCES wl_ledger(id),
  event TEXT NOT NULL CHECK (event IN ('accrual', 'carryover_clamp', 'carryover_expiry'))
);
CREATE TRIGGER wl_leave_policy_events_no_update BEFORE UPDATE ON wl_leave_policy_events BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
CREATE TRIGGER wl_leave_policy_events_no_delete BEFORE DELETE ON wl_leave_policy_events BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
