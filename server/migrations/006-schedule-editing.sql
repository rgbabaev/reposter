ALTER TABLE schedules ADD COLUMN previous_destination TEXT;
UPDATE schedules SET previous_destination=destination WHERE previous_ids!='[]';
ALTER TABLE publication_runs ADD COLUMN previous_destination TEXT;
UPDATE publication_runs SET previous_destination=destination;
ALTER TABLE schedules ADD COLUMN deleted_at TEXT;
