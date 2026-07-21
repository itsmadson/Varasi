-- Varasi control-plane schema. Lives alongside pgSTAC in the same Postgres,
-- in its own `varasi` schema so it never collides with pgstac.*.
CREATE SCHEMA IF NOT EXISTS varasi;
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS postgis;

-- Organizations (top-level tenant boundary).
CREATE TABLE IF NOT EXISTS varasi.organizations (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL,
    slug        text NOT NULL UNIQUE,
    storage_quota_bytes bigint NOT NULL DEFAULT 0,   -- 0 = unlimited
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS varasi.users (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email         text NOT NULL UNIQUE,
    password_hash text NOT NULL,
    full_name     text,
    is_active     boolean NOT NULL DEFAULT true,
    created_at    timestamptz NOT NULL DEFAULT now()
);

-- Membership binds a user to an org with a role (RBAC).
-- Roles: owner > admin > editor > viewer.
CREATE TABLE IF NOT EXISTS varasi.memberships (
    id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id   uuid NOT NULL REFERENCES varasi.organizations(id) ON DELETE CASCADE,
    user_id  uuid NOT NULL REFERENCES varasi.users(id) ON DELETE CASCADE,
    role     text NOT NULL DEFAULT 'viewer'
             CHECK (role IN ('owner','admin','editor','viewer')),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (org_id, user_id)
);

-- Projects scope work (and catalog collections) within an org.
CREATE TABLE IF NOT EXISTS varasi.projects (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      uuid NOT NULL REFERENCES varasi.organizations(id) ON DELETE CASCADE,
    name        text NOT NULL,
    slug        text NOT NULL,
    description text,
    -- STAC collections owned by this project (Virtual Datasets).
    collections text[] NOT NULL DEFAULT '{}',
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (org_id, slug)
);

-- API keys (hashed) for programmatic access, scoped to an org.
CREATE TABLE IF NOT EXISTS varasi.api_keys (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id     uuid NOT NULL REFERENCES varasi.organizations(id) ON DELETE CASCADE,
    user_id    uuid REFERENCES varasi.users(id) ON DELETE SET NULL,
    name       text NOT NULL,
    prefix     text NOT NULL,               -- shown to user, for lookup
    key_hash   text NOT NULL,               -- bcrypt of the secret half
    scopes     text[] NOT NULL DEFAULT '{}',
    last_used_at timestamptz,
    revoked    boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (prefix)
);

-- Watch Areas: AOIs that trigger change detection on new imagery.
CREATE TABLE IF NOT EXISTS varasi.watch_areas (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id     uuid NOT NULL REFERENCES varasi.organizations(id) ON DELETE CASCADE,
    project_id uuid REFERENCES varasi.projects(id) ON DELETE SET NULL,
    name       text NOT NULL,
    geom       geometry(MultiPolygon, 4326) NOT NULL,
    tags       text[] NOT NULL DEFAULT '{}',
    priority   int NOT NULL DEFAULT 3,       -- 1 high .. 5 low
    threshold  double precision NOT NULL DEFAULT 0.1,  -- min change fraction to alert
    notify     jsonb NOT NULL DEFAULT '{}',  -- channels + settings
    enabled    boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS watch_areas_geom_idx ON varasi.watch_areas USING gist (geom);
CREATE INDEX IF NOT EXISTS watch_areas_org_idx  ON varasi.watch_areas (org_id);

-- Jobs: async work (ingest, change-detection, notify).
CREATE TABLE IF NOT EXISTS varasi.jobs (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      uuid NOT NULL REFERENCES varasi.organizations(id) ON DELETE CASCADE,
    project_id  uuid REFERENCES varasi.projects(id) ON DELETE SET NULL,
    kind        text NOT NULL,              -- ingest|change_detection|notify
    status      text NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued','running','succeeded','failed','cancelled')),
    progress    double precision NOT NULL DEFAULT 0,
    params      jsonb NOT NULL DEFAULT '{}',
    result      jsonb,
    error       text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jobs_org_idx ON varasi.jobs (org_id, status);

-- Detections: change-detection outputs (polygons + classification).
CREATE TABLE IF NOT EXISTS varasi.detections (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id       uuid NOT NULL REFERENCES varasi.organizations(id) ON DELETE CASCADE,
    job_id       uuid REFERENCES varasi.jobs(id) ON DELETE CASCADE,
    watch_area_id uuid REFERENCES varasi.watch_areas(id) ON DELETE SET NULL,
    geom         geometry(MultiPolygon, 4326) NOT NULL,
    change_class text,
    confidence   double precision,
    area_m2      double precision,
    before_item  text,
    after_item   text,
    before_date  timestamptz,
    after_date   timestamptz,
    props        jsonb NOT NULL DEFAULT '{}',
    created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS detections_geom_idx ON varasi.detections USING gist (geom);
CREATE INDEX IF NOT EXISTS detections_org_idx  ON varasi.detections (org_id);

-- Alerts: raised when a detection crosses a watch-area threshold.
CREATE TABLE IF NOT EXISTS varasi.alerts (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id        uuid NOT NULL REFERENCES varasi.organizations(id) ON DELETE CASCADE,
    watch_area_id uuid REFERENCES varasi.watch_areas(id) ON DELETE CASCADE,
    detection_id  uuid REFERENCES varasi.detections(id) ON DELETE SET NULL,
    severity      text NOT NULL DEFAULT 'info',
    title         text NOT NULL,
    body          text,
    acknowledged  boolean NOT NULL DEFAULT false,
    created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS alerts_org_idx ON varasi.alerts (org_id, acknowledged);

-- Audit log.
CREATE TABLE IF NOT EXISTS varasi.audit_log (
    id         bigserial PRIMARY KEY,
    org_id     uuid,
    user_id    uuid,
    action     text NOT NULL,
    target     text,
    meta       jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now()
);
