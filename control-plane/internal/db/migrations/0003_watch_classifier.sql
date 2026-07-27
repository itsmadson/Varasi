-- Let a watch area opt into the urban construction-lifecycle classifier so
-- municipal areas get excavation/fill/construction/paving/soil-sealing labels.
ALTER TABLE varasi.watch_areas
    ADD COLUMN IF NOT EXISTS classifier text NOT NULL DEFAULT 'standard';
