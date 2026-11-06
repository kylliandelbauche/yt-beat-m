CREATE TABLE song_artwork (
    song_id TEXT PRIMARY KEY REFERENCES songs(id) ON DELETE CASCADE,
    data BLOB NOT NULL CHECK(length(data) > 0 AND length(data) <= 2097152)
);
