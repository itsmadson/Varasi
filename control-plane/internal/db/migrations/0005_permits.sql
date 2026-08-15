-- Building permits / land-use approvals uploaded by a municipality. Detected
-- construction is cross-checked against these parcels to flag:
--   permitted   : change falls inside an issued permit
--   unpermitted : construction change outside every permit (ساخت غیرمجاز)
--   no-start    : a permit with no detected change yet (شروع‌نشده)
CREATE TABLE IF NOT EXISTS varasi.permits (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id     uuid NOT NULL REFERENCES varasi.organizations(id) ON DELETE CASCADE,
    project_id uuid REFERENCES varasi.projects(id) ON DELETE SET NULL,
    permit_no  text,
    status     text NOT NULL DEFAULT 'issued',   -- issued | expired | revoked
    geom       geometry(MultiPolygon, 4326) NOT NULL,
    valid_from date,
    valid_to   date,
    props      jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS permits_geom_idx ON varasi.permits USING gist (geom);
CREATE INDEX IF NOT EXISTS permits_org_idx  ON varasi.permits (org_id);

-- Per-detection compliance verdict (set for construction-class detections).
ALTER TABLE varasi.detections
    ADD COLUMN IF NOT EXISTS permit_status text;
