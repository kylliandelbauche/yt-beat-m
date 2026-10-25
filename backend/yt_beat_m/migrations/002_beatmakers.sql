ALTER TABLE beats ADD COLUMN channel_id TEXT;
CREATE TABLE channel_aliases (
    channel_key TEXT PRIMARY KEY,
    beatmaker TEXT NOT NULL CHECK (length(beatmaker) BETWEEN 1 AND 200),
    credit_name TEXT
);
