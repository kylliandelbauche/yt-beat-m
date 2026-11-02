CREATE TABLE songs (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    state TEXT NOT NULL CHECK(state IN ('Topline','Maquette','Mixage','Master','Out')),
    favorite INTEGER NOT NULL DEFAULT 0 CHECK(favorite IN (0,1)),
    created_on TEXT,
    released_on TEXT,
    added_at TEXT NOT NULL,
    beat_id TEXT REFERENCES beats(id) ON DELETE SET NULL,
    audio_path TEXT,
    external_ref TEXT,
    duration_seconds REAL NOT NULL CHECK(duration_seconds > 0),
    revision INTEGER NOT NULL DEFAULT 1,
    CHECK((audio_path IS NULL) != (external_ref IS NULL))
);
CREATE INDEX songs_beat ON songs(beat_id);
CREATE INDEX songs_added ON songs(added_at,id);
