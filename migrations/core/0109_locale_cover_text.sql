-- Employer-authored cover text is versioned and approved with its signature template.
ALTER TABLE wl_sign_templates ADD COLUMN cover_text TEXT NOT NULL DEFAULT '';
