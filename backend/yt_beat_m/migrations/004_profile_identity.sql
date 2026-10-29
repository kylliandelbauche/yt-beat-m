CREATE TABLE profile_sources (
    source_key TEXT PRIMARY KEY,
    profile_id TEXT REFERENCES beatmaker_profiles(id) ON DELETE SET NULL
);
CREATE INDEX profile_source_identity ON profile_sources(profile_id);
CREATE TABLE profile_redirects (
    old_id TEXT PRIMARY KEY,
    profile_id TEXT REFERENCES beatmaker_profiles(id) ON DELETE SET NULL
);
ALTER TABLE beatmaker_profiles ADD COLUMN aliases TEXT NOT NULL DEFAULT '[]';
ALTER TABLE beatmaker_profiles ADD COLUMN attribution TEXT NOT NULL DEFAULT 'confirmed';
ALTER TABLE beatmaker_profiles ADD COLUMN photo_origin TEXT;
ALTER TABLE beatmaker_profiles ADD COLUMN photo_checked_at TEXT;
UPDATE beatmaker_profiles SET photo_origin='manual' WHERE photo IS NOT NULL;
