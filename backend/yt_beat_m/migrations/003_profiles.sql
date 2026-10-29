CREATE TABLE beatmaker_profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 200),
    auto_key TEXT UNIQUE,
    socials TEXT NOT NULL DEFAULT '[]',
    stores TEXT NOT NULL DEFAULT '[]',
    photo BLOB,
    photo_type TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE beat_profile_links (
    beat_id TEXT NOT NULL REFERENCES beats(id) ON DELETE CASCADE,
    profile_id TEXT NOT NULL REFERENCES beatmaker_profiles(id) ON DELETE RESTRICT,
    position INTEGER NOT NULL,
    PRIMARY KEY(beat_id, profile_id)
);
CREATE INDEX profile_beats ON beat_profile_links(profile_id, beat_id);
ALTER TABLE beats ADD COLUMN profile_assignment TEXT NOT NULL DEFAULT 'auto'
    CHECK(profile_assignment IN ('auto', 'manual'));
