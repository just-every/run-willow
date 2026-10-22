-- Unknown historical FTE remains unknown; new effective-dated versions carry it.
ALTER TABLE wl_terms ADD COLUMN fte REAL CHECK(fte IS NULL OR (fte >= 0 AND fte <= 1));
CREATE TRIGGER wl_terms_fte_immutable BEFORE UPDATE OF fte ON wl_terms
WHEN NOT EXISTS (SELECT 1 FROM wl_erasure_window)
BEGIN SELECT RAISE(ABORT, 'willow_immutable'); END;
