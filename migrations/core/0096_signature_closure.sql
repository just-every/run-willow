-- Preserve cohort cancellation separately from a deliberate request void.
ALTER TABLE wl_sign_requests ADD COLUMN closure_reason TEXT;
UPDATE wl_sign_requests SET closure_reason='cohort-cancelled'
 WHERE state='voided' AND cohort IN (SELECT subject FROM wl_audit WHERE action='signature.cohort.cancel')
 AND NOT EXISTS(SELECT 1 FROM wl_sign_events e WHERE e.request_id=wl_sign_requests.id AND e.kind='void');
