-- Remember renamed/deleted labels and the greatest allocated identity.
CREATE TABLE catalog_tag_names (
    label TEXT PRIMARY KEY COLLATE BINARY,
    tag_id INTEGER REFERENCES catalog_tags(id) ON DELETE SET NULL,
    identity INTEGER NOT NULL
);
INSERT INTO catalog_tag_names(label,tag_id,identity) SELECT label,id,id FROM catalog_tags;
