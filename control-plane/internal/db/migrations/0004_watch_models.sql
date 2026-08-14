-- Per-tag model overrides for a watch area's automatic evaluation.
-- Shape: {"new_construction":"samgeo_building","vegetation_loss":"veg_index"}.
ALTER TABLE varasi.watch_areas
    ADD COLUMN IF NOT EXISTS models jsonb NOT NULL DEFAULT '{}';
