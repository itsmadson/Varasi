-- Per-key permission: a shared API key acts with its own role, so you can hand
-- out a read-only (viewer) key or a write (editor) key independently of the user.
ALTER TABLE varasi.api_keys
    ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'viewer'
        CHECK (role IN ('viewer','editor','admin'));
