CREATE TABLE schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
);
CREATE TABLE beats (
    id TEXT PRIMARY KEY,
    youtube_id TEXT UNIQUE,
    source_url TEXT,
    title TEXT NOT NULL,
    channel TEXT,
    beatmaker TEXT,
    duration_seconds REAL CHECK (duration_seconds >= 0),
    published_on TEXT,
    added_at TEXT NOT NULL,
    bpm REAL CHECK (bpm > 0),
    musical_key TEXT,
    favorite INTEGER NOT NULL DEFAULT 0 CHECK (favorite IN (0, 1)),
    audio_path TEXT NOT NULL UNIQUE,
    artwork_path TEXT,
    description TEXT,
    field_provenance TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX beats_added_at ON beats(added_at);
CREATE INDEX beats_published_on ON beats(published_on);
CREATE TABLE tags (
    id INTEGER PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('style', 'mood')),
    label TEXT NOT NULL,
    normalized_label TEXT NOT NULL,
    UNIQUE (kind, normalized_label)
);
CREATE TABLE beat_tags (
    beat_id TEXT NOT NULL REFERENCES beats(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (beat_id, tag_id)
);
CREATE TABLE source_links (
    id INTEGER PRIMARY KEY,
    beat_id TEXT NOT NULL REFERENCES beats(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    label TEXT,
    provenance TEXT NOT NULL,
    manually_edited INTEGER NOT NULL DEFAULT 0 CHECK (manually_edited IN (0, 1))
);
CREATE TABLE import_jobs (
    id TEXT PRIMARY KEY,
    youtube_id TEXT NOT NULL,
    source_url TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('queued', 'running', 'completed', 'failed', 'interrupted')),
    stage TEXT,
    progress REAL CHECK (progress BETWEEN 0 AND 100),
    error_message TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    beat_id TEXT REFERENCES beats(id)
);
CREATE UNIQUE INDEX import_jobs_active_source ON import_jobs(youtube_id)
    WHERE state IN ('queued', 'running');
