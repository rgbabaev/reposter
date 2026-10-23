-- Temporary recovery state, removed in the same transaction as processing positions.
CREATE TABLE recovery_items (account_id TEXT NOT NULL, external_id TEXT NOT NULL, item_id TEXT NOT NULL, position INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(account_id,external_id,item_id));
CREATE INDEX recovery_order ON recovery_items(account_id,external_id,position);
