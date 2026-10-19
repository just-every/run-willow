-- LEAVE-001: separate restricted case custody; ordinary documents/profiles never select it.
CREATE TABLE wl_protected_cases (
 id TEXT PRIMARY KEY, person_id TEXT NOT NULL REFERENCES wl_people(id), title TEXT NOT NULL,
 start_date TEXT NOT NULL, end_date TEXT NOT NULL, entitlement_minutes INTEGER NOT NULL CHECK(entitlement_minutes>0),
 review_note TEXT NOT NULL, created_by TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE wl_protected_certifications (
 id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES wl_protected_cases(id), filename TEXT NOT NULL,
 media_type TEXT NOT NULL, size INTEGER NOT NULL, sha256 TEXT NOT NULL, uploaded_by TEXT NOT NULL, uploaded_at INTEGER NOT NULL
);
CREATE TABLE wl_protected_absences (
 id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES wl_protected_cases(id), start_date TEXT NOT NULL, end_date TEXT NOT NULL,
 minutes INTEGER NOT NULL CHECK(minutes<>0), note TEXT NOT NULL, reverses TEXT UNIQUE REFERENCES wl_protected_absences(id),
 recorded_by TEXT NOT NULL, recorded_at INTEGER NOT NULL
);
CREATE TABLE wl_leave_overrides (
 id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES wl_leave_accounts(id), minutes INTEGER NOT NULL CHECK(minutes<>0),
 effective_date TEXT NOT NULL, note TEXT NOT NULL, ledger_count INTEGER NOT NULL,
 requested_by TEXT NOT NULL, requested_at INTEGER NOT NULL
);
CREATE TABLE wl_leave_override_decisions (
 override_id TEXT PRIMARY KEY REFERENCES wl_leave_overrides(id), decision TEXT NOT NULL CHECK(decision IN ('approved','declined')),
 decided_by TEXT NOT NULL, decided_at INTEGER NOT NULL, ledger_id TEXT REFERENCES wl_ledger(id)
);
CREATE TRIGGER wl_protected_cases_immutable BEFORE UPDATE ON wl_protected_cases BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_protected_cases_no_delete BEFORE DELETE ON wl_protected_cases BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_protected_certifications_immutable BEFORE UPDATE ON wl_protected_certifications BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_protected_certifications_no_delete BEFORE DELETE ON wl_protected_certifications BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_protected_absences_immutable BEFORE UPDATE ON wl_protected_absences BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_protected_absences_no_delete BEFORE DELETE ON wl_protected_absences BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_leave_overrides_immutable BEFORE UPDATE ON wl_leave_overrides BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_leave_overrides_no_delete BEFORE DELETE ON wl_leave_overrides BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_leave_override_decisions_immutable BEFORE UPDATE ON wl_leave_override_decisions BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_leave_override_decisions_no_delete BEFORE DELETE ON wl_leave_override_decisions BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
