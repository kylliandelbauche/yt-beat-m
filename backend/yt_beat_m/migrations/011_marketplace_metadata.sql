CREATE TABLE marketplace_enrichments (
    beat_id TEXT PRIMARY KEY REFERENCES beats(id) ON DELETE CASCADE,
    state TEXT NOT NULL CHECK(state IN ('queued','running','ready','failed')),
    request_key TEXT NOT NULL,
    result TEXT NOT NULL DEFAULT '{}',
    error_message TEXT,
    requested_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
