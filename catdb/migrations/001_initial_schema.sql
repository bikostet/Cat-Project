CREATE EXTENSION IF NOT EXISTS postgis;
-- CREATE EXTENSION IF NOT EXISTS vector;

CREATE TYPE cat_sex AS ENUM ('male', 'female', 'unknown');
CREATE TYPE cat_status AS ENUM ('stray', 'lost', 'in_care', 'reunited', 'adopted');
CREATE TYPE post_type AS ENUM ('stray_sighting', 'lost_report', 'found_report', 'status_update');

CREATE TABLE cats (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                    TEXT,
    sex                     cat_sex NOT NULL DEFAULT 'unknown',
    coat_colors             TEXT[],
    coat_description        TEXT,
    eye_color               TEXT,
    approximate_age         TEXT,
    is_microchipped         BOOLEAN,
    chip_registered         BOOLEAN,
    is_neutered             BOOLEAN,
    is_neighborhood_roamer  BOOLEAN,
    current_status          cat_status NOT NULL DEFAULT 'stray',
    last_known_location     GEOMETRY(Point, 4326),
    first_seen_at           TIMESTAMPTZ,
    last_seen_at            TIMESTAMPTZ,
--    description_embedding   VECTOR(1536),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sightings (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cat_id                  UUID NOT NULL REFERENCES cats(id) ON DELETE CASCADE,
    post_type               post_type NOT NULL DEFAULT 'stray_sighting',
    fb_post_id              TEXT UNIQUE,
    fb_post_url             TEXT,
    fb_post_text            TEXT,
    location_raw            TEXT,
    location                GEOMETRY(Point, 4326),
    location_confidence     FLOAT CHECK (location_confidence BETWEEN 0 AND 1),
    reporter_contact        TEXT,
    seen_at                 TIMESTAMPTZ,
    notes                   TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE cat_photos (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cat_id                  UUID NOT NULL REFERENCES cats(id) ON DELETE CASCADE,
    sighting_id             UUID REFERENCES sightings(id) ON DELETE SET NULL,
    storage_path            TEXT NOT NULL,
    is_primary              BOOLEAN NOT NULL DEFAULT false,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX cats_location_idx ON cats USING GIST (last_known_location);
CREATE INDEX sightings_location_idx ON sightings USING GIST (location);
CREATE INDEX sightings_cat_id_idx ON sightings (cat_id);
CREATE INDEX cats_status_idx ON cats (current_status);
-- CREATE INDEX cats_embedding_idx ON cats USING ivfflat (description_embedding vector_cosine_ops);