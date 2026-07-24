-- Watch-area configuration + alert severity scoring.
-- max_cloud: skip scenes cloudier than this when evaluating (0 = ignore).
-- alert_classes: only raise an alert when a change of one of these classes is
--   present (empty = any class).
-- cadence: informational check cadence (daily|weekly|on-ingest); scheduling is
--   handled by the detect-on-ingest trigger today.
ALTER TABLE varasi.watch_areas
    ADD COLUMN IF NOT EXISTS max_cloud     int      NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS alert_classes text[]   NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS cadence       text     NOT NULL DEFAULT 'on-ingest';

-- Severity score: Σ(area_m2 × classWeight × confidence). Ranks hottest areas.
ALTER TABLE varasi.alerts
    ADD COLUMN IF NOT EXISTS score double precision NOT NULL DEFAULT 0;
