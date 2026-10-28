-- Preserve work custody when legacy training approvals enter the shared queue.
INSERT INTO wl_work_schedule(source,owner,substitute,due_date,next_action,revision,updated_by,updated_at)
SELECT 'self-change:'||r.id,w.owner,w.substitute,w.due_date,w.next_action,w.revision,w.updated_by,w.updated_at
FROM wl_training_requests r JOIN wl_work_schedule w ON w.source='training-request:'||r.id
JOIN wl_self_changes c ON c.id=r.id AND c.kind='training'
WHERE true
ON CONFLICT(source) DO UPDATE SET
 owner=excluded.owner,substitute=excluded.substitute,due_date=excluded.due_date,
 next_action=excluded.next_action,revision=excluded.revision,
 updated_by=excluded.updated_by,updated_at=excluded.updated_at
WHERE wl_work_schedule.updated_by='system' OR wl_work_schedule.updated_at<excluded.updated_at;

UPDATE wl_work_history SET source='self-change:'||substr(source,length('training-request:')+1)
WHERE source IN (SELECT 'training-request:'||r.id FROM wl_training_requests r JOIN wl_self_changes c ON c.id=r.id AND c.kind='training');
UPDATE wl_work_deliveries SET source='self-change:'||substr(source,length('training-request:')+1)
WHERE source IN (SELECT 'training-request:'||r.id FROM wl_training_requests r JOIN wl_self_changes c ON c.id=r.id AND c.kind='training');
DELETE FROM wl_work_schedule
WHERE source IN (SELECT 'training-request:'||r.id FROM wl_training_requests r JOIN wl_self_changes c ON c.id=r.id AND c.kind='training');
