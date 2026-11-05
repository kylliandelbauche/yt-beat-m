CREATE TABLE song_catalog_tags (
    song_id TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES catalog_tags(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    PRIMARY KEY(song_id, tag_id)
);
CREATE INDEX song_catalog_tags_tag ON song_catalog_tags(tag_id, song_id);
