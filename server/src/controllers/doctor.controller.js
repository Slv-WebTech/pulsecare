import { pool } from "../config/db.js";

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

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await pool.query(
    `SELECT dp.id, dp.specialization, dp.location, dp.fee, dp.experience_years,
            dp.languages, dp.bio, u.name, u.email
     FROM doctor_profiles dp
     JOIN users u ON u.id = dp.user_id
     ${where}
     ORDER BY dp.experience_years DESC`,
    values
  );

  res.json({ doctors: result.rows });
}

export async function getDoctorAvailability(req, res) {
  const { id } = req.params;
  const result = await pool.query(
    `SELECT id, day_of_week, start_time, end_time, slot_minutes
     FROM doctor_availability
     WHERE doctor_id = $1
     ORDER BY day_of_week, start_time`,
    [id]
  );
  res.json({ availability: result.rows });
}

export async function upsertDoctorProfile(req, res) {
  const { specialization, location, fee, experienceYears, languages, bio } = req.body;

  const result = await pool.query(
    `INSERT INTO doctor_profiles (user_id, specialization, location, fee, experience_years, languages, bio)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id) DO UPDATE SET
       specialization = EXCLUDED.specialization,
       location = EXCLUDED.location,
       fee = EXCLUDED.fee,
       experience_years = EXCLUDED.experience_years,
       languages = EXCLUDED.languages,
       bio = EXCLUDED.bio
     RETURNING *`,
    [req.user.id, specialization, location, fee, experienceYears, languages || [], bio]
  );

  res.status(201).json({ profile: result.rows[0] });
}
