-- Atomic fence: a private door read or pending decision arriving after an
-- erasure preview must stop the native deletion too.
CREATE TRIGGER wl_agent_people_custody BEFORE DELETE ON wl_people
 WHEN EXISTS(SELECT 1 FROM agent_door_audit)
 BEGIN SELECT RAISE(ABORT,'willow_guard_agent_custody_unresolved'); END;
CREATE TRIGGER wl_agent_applicant_custody BEFORE DELETE ON wl_hiring_applications
 WHEN EXISTS(SELECT 1 FROM agent_door_audit)
 BEGIN SELECT RAISE(ABORT,'willow_guard_agent_custody_unresolved'); END;
CREATE TRIGGER wl_agent_preboard_custody BEFORE DELETE ON wl_preboard_packets
 WHEN EXISTS(SELECT 1 FROM agent_door_audit)
 BEGIN SELECT RAISE(ABORT,'willow_guard_agent_custody_unresolved'); END;
