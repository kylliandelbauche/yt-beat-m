-- Keep legacy categories/identifiers and links intact. Only exact labels share an entity.
CREATE TABLE catalog_tags (
    id INTEGER PRIMARY KEY,
    label TEXT NOT NULL UNIQUE COLLATE BINARY,
    normalized_label TEXT NOT NULL
);
CREATE TABLE beat_catalog_tags (
    beat_id TEXT NOT NULL REFERENCES beats(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES catalog_tags(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (beat_id, tag_id)
);
CREATE INDEX beat_catalog_tags_tag ON beat_catalog_tags(tag_id, beat_id);
INSERT INTO catalog_tags(label, normalized_label)
SELECT label, MIN(normalized_label) FROM tags GROUP BY label COLLATE BINARY;
INSERT INTO beat_catalog_tags(beat_id, tag_id, position)
SELECT beat_id, tag_id, ROW_NUMBER() OVER (PARTITION BY beat_id ORDER BY label) - 1
FROM (SELECT DISTINCT bt.beat_id, c.id AS tag_id, c.label FROM beat_tags bt
JOIN tags t ON t.id = bt.tag_id JOIN catalog_tags c ON c.label = t.label COLLATE BINARY);
