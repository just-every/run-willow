-- ROLE-001: additive, default-off subject status access. Existing full reads stay intact.
ALTER TABLE wl_levels ADD COLUMN follow_own_changes INTEGER NOT NULL DEFAULT 0 CHECK(follow_own_changes IN (0,1));
