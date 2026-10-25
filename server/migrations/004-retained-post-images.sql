ALTER TABLE post_images ADD COLUMN selected INTEGER NOT NULL DEFAULT 1 CHECK(selected IN (0,1));
DROP INDEX post_images_order;
CREATE INDEX post_images_selected ON post_images(post_id,selected,ordinal);
