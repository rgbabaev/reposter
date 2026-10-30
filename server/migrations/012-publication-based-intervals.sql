ALTER TABLE schedules ADD COLUMN last_published_at TEXT;

UPDATE schedules SET last_published_at =
  (SELECT completed_at FROM publication_runs
   WHERE schedule_id=schedules.id AND status IN ('sent','partial') AND completed_at IS NOT NULL
   ORDER BY completed_at DESC LIMIT 1);

UPDATE schedules
SET next_run_at = strftime(
  '%Y-%m-%dT%H:%M:%fZ', last_published_at,
  '+' || json_extract(calendar,'$.intervalHours') || ' hours'
)
WHERE deleted_at IS NULL AND json_extract(calendar,'$.frequency')='hourly' AND last_published_at IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM publication_runs
                  WHERE schedule_id=schedules.id AND status IN ('queued','deleting','publishing','uncertain','failed'));
