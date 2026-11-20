-- Existing databases: replace the old UNIQUE(doctor_id, starts_at) with an exclusion constraint
-- so cancelled appointments release their slot and overlapping bookings are rejected atomically.
-- (Fails if existing rows already overlap; resolve those first.)
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS no_double_booking;
DROP INDEX IF EXISTS no_double_booking;
ALTER TABLE appointments ADD CONSTRAINT no_double_booking
  EXCLUDE USING gist (doctor_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
  WHERE (status <> 'cancelled');
