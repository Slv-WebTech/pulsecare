-- Healthcare Appointment & Patient Portal schema

CREATE TYPE user_role AS ENUM ('patient', 'doctor', 'admin');
CREATE TYPE appointment_status AS ENUM ('scheduled', 'confirmed', 'completed', 'cancelled');

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'patient',
  phone VARCHAR(30),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE doctor_profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  specialization VARCHAR(120) NOT NULL,
  location VARCHAR(150) NOT NULL,
  fee NUMERIC(10, 2) NOT NULL DEFAULT 0,
  experience_years INTEGER NOT NULL DEFAULT 0,
  languages TEXT[] NOT NULL DEFAULT '{}',
  bio TEXT,
  -- IANA timezone the availability windows are expressed in (e.g. 'Asia/Kolkata').
  -- NULL = DEFAULT_TIMEZONE from the server environment.
  timezone VARCHAR(64)
);

CREATE TABLE doctor_availability (
  id SERIAL PRIMARY KEY,
  doctor_id INTEGER NOT NULL REFERENCES doctor_profiles(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL, -- 0 (Sun) - 6 (Sat)
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  slot_minutes SMALLINT NOT NULL DEFAULT 30
);

CREATE TABLE appointments (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  doctor_id INTEGER NOT NULL REFERENCES doctor_profiles(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status appointment_status NOT NULL DEFAULT 'scheduled',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Race-safe double-booking guard: no two non-cancelled appointments for the same doctor may
-- overlap in time (also covers identical start times). A cancelled appointment releases its slot.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE appointments ADD CONSTRAINT no_double_booking
  EXCLUDE USING gist (doctor_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
  WHERE (status <> 'cancelled');

CREATE TABLE documents (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  appointment_id INTEGER REFERENCES appointments(id) ON DELETE SET NULL,
  file_url TEXT NOT NULL,
  -- Cloudinary 'authenticated' asset: never served directly, only via a signed URL issued
  -- by GET /api/documents/:id/file after an access check. NULL for legacy public uploads.
  public_id TEXT,
  resource_type VARCHAR(10),
  file_type VARCHAR(20) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  ai_summary JSONB,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE messages (
  id SERIAL PRIMARY KEY,
  appointment_id INTEGER REFERENCES appointments(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT,
  file_url TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE reminders (
  id SERIAL PRIMARY KEY,
  appointment_id INTEGER NOT NULL UNIQUE REFERENCES appointments(id) ON DELETE CASCADE,
  send_at TIMESTAMPTZ NOT NULL,
  sent BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX idx_appointments_patient ON appointments(patient_id);
CREATE INDEX idx_appointments_doctor ON appointments(doctor_id);
CREATE INDEX idx_messages_appointment ON messages(appointment_id);
CREATE INDEX idx_doctor_profiles_specialization ON doctor_profiles(specialization);
CREATE INDEX idx_doctor_profiles_location ON doctor_profiles(location);

-- Hashed refresh tokens (rotating, revocable). The raw token only ever lives in an httpOnly cookie.
CREATE TABLE refresh_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);

-- Who accessed what (PHI access trail). Append-only by convention.
CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(60) NOT NULL,
  resource_type VARCHAR(30),
  resource_id TEXT,
  ip VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_log_user ON audit_log(user_id, created_at DESC);
CREATE INDEX idx_audit_log_created ON audit_log(created_at DESC);

-- Fast ILIKE '%x%' doctor search.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_doctor_profiles_spec_trgm ON doctor_profiles USING gin (specialization gin_trgm_ops);
CREATE INDEX idx_doctor_profiles_loc_trgm ON doctor_profiles USING gin (location gin_trgm_ops);
