import { pool } from "../config/db.js";
import { toId, parsePaging } from "../utils/validation.js";
import { DEFAULT_TIMEZONE, freeSlots, isValidTimezone, isValidYmd } from "../utils/time.js";

export async function searchDoctors(req, res) {
  const { specialization, location, maxFee, minExperience, language } = req.query;

  const conditions = [];
  const values = [];

  if (specialization) {
    values.push(`%${specialization}%`);
    conditions.push(`dp.specialization ILIKE $${values.length}`);
  }
  if (location) {
    values.push(`%${location}%`);
    conditions.push(`dp.location ILIKE $${values.length}`);
  }
  if (maxFee) {
    values.push(Number(maxFee));
    conditions.push(`dp.fee <= $${values.length}`);
  }
  if (minExperience) {
    values.push(Number(minExperience));
    conditions.push(`dp.experience_years >= $${values.length}`);
  }
  if (language) {
    values.push(language);
    conditions.push(`$${values.length} = ANY(dp.languages)`);
  }

  const { limit, offset } = parsePaging(req.query);
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await pool.query(
    `SELECT dp.id, dp.specialization, dp.location, dp.fee, dp.experience_years,
            dp.languages, dp.bio, dp.timezone, u.name
     FROM doctor_profiles dp
     JOIN users u ON u.id = dp.user_id
     ${where}
     ORDER BY dp.experience_years DESC, dp.id
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, limit, offset]
  );

  res.json({ doctors: result.rows });
}

export async function getDoctorAvailability(req, res) {
  const id = toId(req.params.id);
  if (!id) return res.status(404).json({ error: "Doctor not found" });
  const result = await pool.query(
    `SELECT id, day_of_week, start_time, end_time, slot_minutes
     FROM doctor_availability
     WHERE doctor_id = $1
     ORDER BY day_of_week, start_time`,
    [id]
  );
  res.json({ availability: result.rows });
}

// Free, bookable slots for one local date (YYYY-MM-DD) in the doctor's timezone.
export async function getDoctorSlots(req, res) {
  const id = toId(req.params.id);
  if (!id) return res.status(404).json({ error: "Doctor not found" });
  const { date } = req.query;
  if (!isValidYmd(date)) return res.status(400).json({ error: "date must be YYYY-MM-DD" });

  const doctor = await pool.query("SELECT timezone FROM doctor_profiles WHERE id = $1", [id]);
  if (doctor.rowCount === 0) return res.status(404).json({ error: "Doctor not found" });
  const tz = doctor.rows[0].timezone || DEFAULT_TIMEZONE;

  const windows = (
    await pool.query(
      "SELECT day_of_week, start_time, end_time, slot_minutes FROM doctor_availability WHERE doctor_id = $1",
      [id]
    )
  ).rows;
  // Bookings within +/- 1 day of the requested date cover any timezone shift.
  const booked = (
    await pool.query(
      `SELECT starts_at, ends_at FROM appointments
       WHERE doctor_id = $1 AND status <> 'cancelled'
         AND starts_at < ($2::date + 2) AND ends_at > ($2::date - 1)`,
      [id, date]
    )
  ).rows;
  res.json({ timezone: tz, date, slots: freeSlots(date, windows, tz, booked) });
}

export async function upsertDoctorProfile(req, res) {
  const { specialization, location, fee, experienceYears, languages, bio, timezone } = req.body;
  if (timezone !== undefined && timezone !== null && !isValidTimezone(timezone)) {
    return res.status(400).json({ error: "timezone must be a valid IANA timezone, e.g. Asia/Kolkata" });
  }

  if (typeof specialization !== "string" || !specialization.trim() || typeof location !== "string" || !location.trim()) {
    return res.status(400).json({ error: "specialization and location are required" });
  }
  if (!(Number(fee) >= 0) || !(Number(experienceYears) >= 0)) {
    return res.status(400).json({ error: "fee and experienceYears must be non-negative numbers" });
  }
  if (languages !== undefined && !(Array.isArray(languages) && languages.every((l) => typeof l === "string"))) {
    return res.status(400).json({ error: "languages must be an array of strings" });
  }

  const result = await pool.query(
    `INSERT INTO doctor_profiles (user_id, specialization, location, fee, experience_years, languages, bio, timezone)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (user_id) DO UPDATE SET
       specialization = EXCLUDED.specialization,
       location = EXCLUDED.location,
       fee = EXCLUDED.fee,
       experience_years = EXCLUDED.experience_years,
       languages = EXCLUDED.languages,
       bio = EXCLUDED.bio,
       timezone = COALESCE(EXCLUDED.timezone, doctor_profiles.timezone)
     RETURNING *`,
    [req.user.id, specialization, location, fee, experienceYears, languages || [], bio, timezone || null]
  );

  res.status(201).json({ profile: result.rows[0] });
}
