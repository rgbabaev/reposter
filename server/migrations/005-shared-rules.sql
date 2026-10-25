DROP TABLE rules;
CREATE TABLE rules (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES owners(id), name TEXT NOT NULL, enabled INTEGER NOT NULL, conditions TEXT NOT NULL, attachment_types TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE rule_sources (rule_id TEXT NOT NULL REFERENCES rules(id) ON DELETE CASCADE, source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE, PRIMARY KEY(rule_id,source_id));
CREATE INDEX rule_sources_source ON rule_sources(source_id,rule_id);
CREATE TRIGGER rule_sources_owner BEFORE INSERT ON rule_sources
WHEN (SELECT owner_id FROM rules WHERE id=NEW.rule_id) != (SELECT owner_id FROM sources WHERE id=NEW.source_id)
BEGIN SELECT RAISE(ABORT, 'Rule and source owners must match'); END;
CREATE TRIGGER rule_sources_unassigned AFTER DELETE ON rule_sources
BEGIN UPDATE rules SET enabled=0 WHERE id=OLD.rule_id AND NOT EXISTS (SELECT 1 FROM rule_sources WHERE rule_id=OLD.rule_id); END;
