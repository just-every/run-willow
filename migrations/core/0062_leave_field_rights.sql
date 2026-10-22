-- ROLE-006 contributes no grants until a reviewed level definition adds them.
CREATE TABLE wl_level_leave_fields (
 level_id TEXT NOT NULL REFERENCES wl_levels(id),
 relation TEXT NOT NULL CHECK(relation IN ('self','others')),
 field TEXT NOT NULL CHECK(field IN ('balances','ledger','requests','calendar','policies')),
 mode TEXT NOT NULL CHECK(mode IN ('none','view','approval','edit')),
 CHECK(relation = 'others' OR field IN ('requests','calendar') OR mode IN ('none','view')),
 PRIMARY KEY(level_id,relation,field)
);
