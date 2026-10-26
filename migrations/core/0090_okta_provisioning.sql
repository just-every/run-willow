-- Provider credentials remain runtime bindings. Reviews are single-use and
-- uncertain writes require observation rather than automatic replay.
CREATE TABLE wl_okta_settings (
 singleton INTEGER PRIMARY KEY CHECK(singleton=1),
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
 revision TEXT NOT NULL,
 approved_by TEXT NOT NULL,
 approved_at INTEGER NOT NULL
);
CREATE TABLE wl_okta_accounts (
 person_id TEXT NOT NULL REFERENCES wl_people(id),
 tenant TEXT NOT NULL,
 account_id TEXT NOT NULL,
 linked_by TEXT NOT NULL,
 linked_at INTEGER NOT NULL,
 PRIMARY KEY(person_id,tenant),
 UNIQUE(tenant,account_id)
);
CREATE TABLE wl_okta_reviews (
 id TEXT PRIMARY KEY,
 person_id TEXT NOT NULL REFERENCES wl_people(id),
 task_id TEXT NOT NULL REFERENCES wl_case_tasks(id),
 actor TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 configuration TEXT NOT NULL,
 native_snapshot TEXT NOT NULL,
 before_state TEXT NOT NULL,
 plan TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('pending','applying','verified','uncertain','closed')),
 observed TEXT,
 failure TEXT,
 completed_at INTEGER
);
CREATE UNIQUE INDEX wl_okta_task_inflight ON wl_okta_reviews(task_id) WHERE status IN ('applying','uncertain');
