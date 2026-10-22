-- Complete, immutable versions of native bonus and equity awards.
CREATE TABLE wl_comp_records (
 revision TEXT PRIMARY KEY,
 record_id TEXT NOT NULL,
 version INTEGER NOT NULL CHECK(version > 0),
 previous_revision TEXT REFERENCES wl_comp_records(revision),
 person_id TEXT NOT NULL REFERENCES wl_people(id),
 period_id TEXT NOT NULL REFERENCES wl_periods(id),
 kind TEXT NOT NULL CHECK(kind IN ('bonus','equity')),
 effective_date TEXT NOT NULL,
 amount_cents INTEGER,
 currency TEXT,
 units TEXT,
 security TEXT,
 note TEXT NOT NULL,
 recorded_by TEXT NOT NULL,
 recorded_at INTEGER NOT NULL,
 UNIQUE(record_id,version),
 UNIQUE(previous_revision),
 CHECK((version=1 AND previous_revision IS NULL) OR (version>1 AND previous_revision IS NOT NULL)),
 CHECK((kind='bonus' AND amount_cents IS NOT NULL AND amount_cents>=0 AND currency IS NOT NULL AND length(currency)=3 AND units IS NULL AND security IS NULL)
    OR (kind='equity' AND amount_cents IS NULL AND currency IS NULL AND units IS NOT NULL AND security IS NOT NULL))
);
CREATE INDEX wl_comp_records_person ON wl_comp_records(person_id,kind,record_id,version);
CREATE TRIGGER wl_comp_records_no_update BEFORE UPDATE ON wl_comp_records
WHEN NOT EXISTS(SELECT 1 FROM wl_erasure_window)
BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_comp_records_no_delete BEFORE DELETE ON wl_comp_records
WHEN NOT EXISTS(SELECT 1 FROM wl_erasure_window)
BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
