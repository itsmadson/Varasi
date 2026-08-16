-- Which model backend produced each detection (provenance per polygon).
ALTER TABLE varasi.detections
    ADD COLUMN IF NOT EXISTS model text;
