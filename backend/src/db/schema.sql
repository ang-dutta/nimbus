-- Nimbus Database Schema
-- Compatible with Supabase, Railway, and self-hosted PostgreSQL.
-- Run via: node src/db/migrate.js

-- ─────────────────────────────────────────────
-- Extensions
-- ─────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────
-- Users
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                    TEXT PRIMARY KEY,
  email                 TEXT NOT NULL UNIQUE,
  display_name          TEXT,
  avatar_url            TEXT,
  storage_used_bytes    BIGINT NOT NULL DEFAULT 0,
  storage_quota_bytes   BIGINT NOT NULL DEFAULT 5368709120,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- Files
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS files (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_name         TEXT NOT NULL,
  current_s3_key    TEXT NOT NULL,
  size_bytes        BIGINT NOT NULL DEFAULT 0,
  mime_type         TEXT,
  uploaded_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_accessed_at  TIMESTAMPTZ,
  is_deleted        BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at        TIMESTAMPTZ,
  is_shared         BOOLEAN NOT NULL DEFAULT FALSE,
  search_vector     TSVECTOR
);

CREATE INDEX IF NOT EXISTS idx_files_owner_id      ON files(owner_id);

CREATE INDEX IF NOT EXISTS idx_files_owner_deleted ON files(owner_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_files_search_vector ON files USING gin(search_vector);

CREATE INDEX IF NOT EXISTS idx_files_deleted_at    ON files(deleted_at) WHERE is_deleted = TRUE;

-- ─────────────────────────────────────────────
-- Full-text search trigger function
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION files_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    COALESCE(NEW.file_name, '') || ' ' || COALESCE(NEW.mime_type, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS files_search_vector_trigger ON files;

CREATE TRIGGER files_search_vector_trigger
  BEFORE INSERT OR UPDATE ON files
  FOR EACH ROW EXECUTE FUNCTION files_search_vector_update();

-- ─────────────────────────────────────────────
-- File versions
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS file_versions (
  id             TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id        TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  s3_key         TEXT NOT NULL,
  size_bytes     BIGINT NOT NULL DEFAULT 0,
  uploaded_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_by    TEXT NOT NULL REFERENCES users(id),
  UNIQUE(file_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_file_versions_file_id ON file_versions(file_id);

-- ─────────────────────────────────────────────
-- Share links
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS share_links (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id          TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  token            TEXT NOT NULL UNIQUE,
  created_by       TEXT NOT NULL REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at       TIMESTAMPTZ,
  password_hash    TEXT,
  permission       TEXT NOT NULL DEFAULT 'view' CHECK (permission IN ('view', 'download')),
  is_one_time      BOOLEAN NOT NULL DEFAULT FALSE,
  max_access_count INTEGER,
  access_count     INTEGER NOT NULL DEFAULT 0,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_share_links_token   ON share_links(token);

CREATE INDEX IF NOT EXISTS idx_share_links_file_id ON share_links(file_id);

-- ─────────────────────────────────────────────
-- Share accesses
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS share_accesses (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  share_link_id TEXT NOT NULL REFERENCES share_links(id) ON DELETE CASCADE,
  accessed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address    TEXT,
  user_agent    TEXT,
  country_code  TEXT
);

CREATE INDEX IF NOT EXISTS idx_share_accesses_link_id ON share_accesses(share_link_id);

-- ─────────────────────────────────────────────
-- Audit logs
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
  action_type  TEXT NOT NULL,
  file_id      TEXT REFERENCES files(id) ON DELETE SET NULL,
  file_name    TEXT,
  ip_address   TEXT,
  user_agent   TEXT,
  metadata     JSONB,
  is_anomalous BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created ON audit_logs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_file_id      ON audit_logs(file_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action_type  ON audit_logs(action_type);

-- ─────────────────────────────────────────────
-- Notifications
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type            TEXT NOT NULL,
  title           TEXT NOT NULL,
  body            TEXT NOT NULL,
  is_read         BOOLEAN NOT NULL DEFAULT FALSE,
  related_file_id TEXT REFERENCES files(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_unread  ON notifications(user_id, is_read) WHERE is_read = FALSE;

-- ─────────────────────────────────────────────
-- Security scan results
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scan_results (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id    TEXT REFERENCES files(id) ON DELETE SET NULL,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scan_type  TEXT NOT NULL CHECK (scan_type IN ('credential', 'infrastructure')),
  findings   JSONB NOT NULL DEFAULT '[]',
  risk_score INTEGER NOT NULL DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100),
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scan_results_file_id ON scan_results(file_id);

CREATE INDEX IF NOT EXISTS idx_scan_results_user_id ON scan_results(user_id);

-- ─────────────────────────────────────────────
-- Access baselines (anomaly detection)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS access_baselines (
  id                      TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  mean_access_frequency   FLOAT NOT NULL DEFAULT 0,
  stddev_access_frequency FLOAT NOT NULL DEFAULT 0,
  typical_hours_start     INTEGER,
  typical_hours_end       INTEGER,
  typical_countries       JSONB NOT NULL DEFAULT '[]',
  computed_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- Anomaly events
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS anomaly_events (
  id                    TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  anomaly_type          TEXT NOT NULL,
  severity              TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  related_file_id       TEXT REFERENCES files(id) ON DELETE SET NULL,
  related_share_link_id TEXT REFERENCES share_links(id) ON DELETE SET NULL,
  statistical_basis     TEXT,
  is_acknowledged       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_anomaly_events_user_id ON anomaly_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_anomaly_events_unacked ON anomaly_events(user_id, is_acknowledged) WHERE is_acknowledged = FALSE;