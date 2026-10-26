-- Existing enabled settings require the current explicit attestation.
ALTER TABLE wl_ai_settings ADD COLUMN consent_version TEXT NOT NULL DEFAULT '';
