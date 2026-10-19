-- PEOPLE-004: HR's alerts on standard and custom employee dates. A fire is
-- claimed once per alert, person, item, date value and lead time, so restarts
-- never repeat one and a changed date starts fresh. Deliveries record each
-- permitted recipient and channel; an alert may open one review task per date.
CREATE TABLE wl_date_alerts (
  id TEXT NOT NULL PRIMARY KEY,
  label TEXT NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 120),
  source TEXT NOT NULL CHECK (length(source) BETWEEN 1 AND 200),
  leads_json TEXT NOT NULL CHECK (json_valid(leads_json) AND json_type(leads_json) = 'array' AND json_array_length(leads_json) BETWEEN 1 AND 6),
  recipients_json TEXT NOT NULL CHECK (json_valid(recipients_json) AND json_type(recipients_json) = 'array' AND json_array_length(recipients_json) BETWEEN 1 AND 6),
  channels_json TEXT NOT NULL CHECK (json_valid(channels_json) AND json_type(channels_json) = 'array'),
  task_title TEXT CHECK (task_title IS NULL OR length(trim(task_title)) BETWEEN 1 AND 160),
  task_assignee TEXT CHECK (task_assignee IS NULL OR task_assignee IN ('hr', 'manager')),
  status TEXT NOT NULL CHECK (status IN ('active', 'retired')),
  recorded_by TEXT NOT NULL,
  recorded_at INTEGER NOT NULL CHECK (typeof(recorded_at) = 'integer'),
  retired_by TEXT,
  retired_at INTEGER
) WITHOUT ROWID;
CREATE TRIGGER wl_date_alerts_retire_only BEFORE UPDATE ON wl_date_alerts
  WHEN OLD.status = 'retired' OR NEW.label IS NOT OLD.label OR NEW.source IS NOT OLD.source OR NEW.leads_json IS NOT OLD.leads_json OR NEW.recipients_json IS NOT OLD.recipients_json OR NEW.channels_json IS NOT OLD.channels_json
BEGIN SELECT RAISE(ABORT, 'date alerts are retired, never edited'); END;

CREATE TABLE wl_date_alert_fires (
  id TEXT NOT NULL PRIMARY KEY,
  alert_id TEXT NOT NULL REFERENCES wl_date_alerts(id),
  person_id TEXT NOT NULL REFERENCES wl_people(id),
  item TEXT NOT NULL,
  date TEXT NOT NULL,
  lead_days INTEGER NOT NULL CHECK (typeof(lead_days) = 'integer' AND lead_days >= 0),
  fired_at INTEGER NOT NULL,
  UNIQUE (alert_id, person_id, item, date, lead_days)
) WITHOUT ROWID;

CREATE TABLE wl_date_alert_deliveries (
  id TEXT NOT NULL PRIMARY KEY,
  fire_id TEXT NOT NULL REFERENCES wl_date_alert_fires(id),
  member_id TEXT NOT NULL REFERENCES wl_members(id),
  channel TEXT NOT NULL CHECK (channel IN ('in_app', 'email')),
  status TEXT NOT NULL CHECK (status IN ('delivered', 'claimed', 'accepted', 'development', 'disabled', 'failed', 'refused', 'uncertain')),
  failure TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (fire_id, member_id, channel)
) WITHOUT ROWID;
CREATE INDEX wl_date_alert_deliveries_member ON wl_date_alert_deliveries(member_id, created_at);

CREATE TABLE wl_date_alert_tasks (
  id TEXT NOT NULL PRIMARY KEY,
  alert_id TEXT NOT NULL REFERENCES wl_date_alerts(id),
  person_id TEXT NOT NULL REFERENCES wl_people(id),
  item TEXT NOT NULL,
  date TEXT NOT NULL,
  title TEXT NOT NULL,
  assignee TEXT NOT NULL CHECK (assignee IN ('hr', 'manager')),
  status TEXT NOT NULL CHECK (status IN ('open', 'done', 'cancelled')),
  created_at INTEGER NOT NULL,
  closed_by TEXT,
  closed_at INTEGER,
  evidence TEXT,
  UNIQUE (alert_id, person_id, item, date)
) WITHOUT ROWID;
