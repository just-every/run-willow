-- COMP-001: versioned bands, owner-approved budgets, immutable proposals and bonus custody.
CREATE TABLE wl_comp_bands (
 id TEXT PRIMARY KEY, sequence INTEGER NOT NULL UNIQUE, job_title TEXT NOT NULL, level TEXT NOT NULL, location_id TEXT NOT NULL DEFAULT '',
 basis TEXT NOT NULL CHECK(basis IN ('salary','hourly')), effective_from TEXT NOT NULL,
 minimum_cents INTEGER NOT NULL, maximum_cents INTEGER NOT NULL, recorded_at INTEGER NOT NULL, recorded_by TEXT NOT NULL
);
CREATE TABLE wl_comp_cycles (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('merit','promotion','bonus')),
 effective_from TEXT NOT NULL, budget_cents INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
 created_by TEXT NOT NULL, created_at INTEGER NOT NULL, approved_by TEXT, approved_at INTEGER,
 published_by TEXT, published_at INTEGER, publication_json TEXT
);
CREATE TABLE wl_comp_proposals (
 id TEXT PRIMARY KEY, sequence INTEGER NOT NULL UNIQUE, cycle_id TEXT NOT NULL REFERENCES wl_comp_cycles(id), person_id TEXT NOT NULL,
 period_id TEXT NOT NULL, period_revision TEXT NOT NULL, base_term TEXT NOT NULL,
 basis TEXT NOT NULL, amount_cents INTEGER NOT NULL, previous_cents INTEGER NOT NULL,
 job_title TEXT NOT NULL, note TEXT NOT NULL, requested_by TEXT NOT NULL, requested_at INTEGER NOT NULL
);
CREATE TABLE wl_comp_bonuses (
 id TEXT PRIMARY KEY, cycle_id TEXT NOT NULL, person_id TEXT NOT NULL, period_id TEXT NOT NULL,
 effective_from TEXT NOT NULL, amount_cents INTEGER NOT NULL, recorded_at INTEGER NOT NULL
);
CREATE TRIGGER wl_comp_bands_no_update BEFORE UPDATE ON wl_comp_bands BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_comp_bands_no_delete BEFORE DELETE ON wl_comp_bands BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_comp_proposals_no_update BEFORE UPDATE ON wl_comp_proposals BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_comp_proposals_no_delete BEFORE DELETE ON wl_comp_proposals BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_comp_bonuses_no_update BEFORE UPDATE ON wl_comp_bonuses BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
CREATE TRIGGER wl_comp_bonuses_no_delete BEFORE DELETE ON wl_comp_bonuses BEGIN SELECT RAISE(ABORT,'willow_immutable'); END;
