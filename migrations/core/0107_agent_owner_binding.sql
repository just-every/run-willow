-- Fix the installation owner identity once. Transferring native roles or
-- changing addresses must not move an already accepted Business subject.
CREATE TABLE wl_agent_installation_owner (
 singleton INTEGER PRIMARY KEY CHECK(singleton=1),
 operator_id TEXT NOT NULL UNIQUE REFERENCES oa_operators(id)
);
INSERT INTO wl_agent_installation_owner(singleton,operator_id)
 SELECT 1,o.id FROM oa_operators o LEFT JOIN oa_bootstrap b ON b.claim_id=o.id
 WHERE o.role='owner' ORDER BY b.claim_id IS NULL,o.created_at,o.id LIMIT 1;
