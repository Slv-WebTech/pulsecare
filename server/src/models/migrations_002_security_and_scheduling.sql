-- Upgrade an existing database (run after migrations_001). Safe to re-run.
ALTER TABLE doctor_profiles ADD COLUMN IF NOT EXISTS timezone VARCHAR(64);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS public_id TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS resource_type VARCHAR(10);
DELETE FROM reminders r USING reminders r2 WHERE r.appointment_id = r2.appointment_id AND r.id > r2.id;
CREATE UNIQUE INDEX IF NOT EXISTS reminders_appointment_unique ON reminders(appointment_id);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(60) NOT NULL,
  resource_type VARCHAR(30),
  resource_id TEXT,
  ip VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_doctor_profiles_spec_trgm ON doctor_profiles USING gin (specialization gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_doctor_profiles_loc_trgm ON doctor_profiles USING gin (location gin_trgm_ops);
