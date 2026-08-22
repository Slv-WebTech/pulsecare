import { pool } from "../config/db.js";

// Shared by bookAppointment and rescheduleAppointment: both accept a raw
// startsAt/endsAt pair from the client and need the same sanity checks
// before it ever reaches the database.
function validateAppointmentWindow(startsAt, endsAt) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "startsAt and endsAt must be valid dates";
  }
  if (start >= end) {
    return "startsAt must be before endsAt";
  }
  if (start < new Date()) {
    return "startsAt must be in the future";
  }
  return null;
}

// Resolves whether `user` (the requester) is allowed to modify appointment `appointmentId`:
// its patient, its doctor, or an admin. Prevents any authenticated user from mutating
// another user's appointment by guessing/incrementing an id (IDOR).
async function getAppointmentAccess(appointmentId, user) {
  const result = await pool.query(
    `SELECT a.patient_id, dp.user_id AS doctor_user_id
     FROM appointments a
     JOIN doctor_profiles dp ON dp.id = a.doctor_id
     WHERE a.id = $1`,
    [appointmentId]
  );
  const row = result.rows[0];
  if (!row) return { exists: false, isOwner: false };

  const isOwner =
    user.role === "admin" ||
    row.patient_id === user.id ||
    row.doctor_user_id === user.id;
  return { exists: true, isOwner };
}

export async function bookAppointment(req, res) {
  const { doctorId, startsAt, endsAt, notes } = req.body;
  if (!doctorId || !startsAt || !endsAt) {
    return res.status(400).json({ error: "doctorId, startsAt, and endsAt are required" });
  }

  const windowError = validateAppointmentWindow(startsAt, endsAt);
  if (windowError) {
    return res.status(400).json({ error: windowError });
  }

  try {
    const result = await pool.query(
      `INSERT INTO appointments (patient_id, doctor_id, starts_at, ends_at, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [req.user.id, doctorId, startsAt, endsAt, notes || null]
    );
    res.status(201).json({ appointment: result.rows[0] });
  } catch (err) {
    if (err.code === "23505") {
      // unique_violation on (doctor_id, starts_at)
      return res.status(409).json({ error: "This slot is already booked" });
    }
    throw err;
  }
}

export async function listMyAppointments(req, res) {
  const isDoctor = req.user.role === "doctor";
  const column = isDoctor ? "a.doctor_id" : "a.patient_id";
  const idValue = isDoctor
    ? (await pool.query("SELECT id FROM doctor_profiles WHERE user_id = $1", [req.user.id])).rows[0]?.id
    : req.user.id;

  if (isDoctor && !idValue) {
    return res.json({ appointments: [] });
  }

  const result = await pool.query(
    `SELECT a.*, u.name AS patient_name, dp.specialization, dp.user_id AS doctor_user_id, du.name AS doctor_name
     FROM appointments a
     JOIN users u ON u.id = a.patient_id
     JOIN doctor_profiles dp ON dp.id = a.doctor_id
     JOIN users du ON du.id = dp.user_id
     WHERE ${column} = $1
     ORDER BY a.starts_at DESC`,
    [idValue]
  );

  res.json({ appointments: result.rows });
}

export async function updateAppointmentStatus(req, res) {
  const { id } = req.params;
  const { status } = req.body;

  const allowed = new Set(["scheduled", "confirmed", "completed", "cancelled"]);
  if (!allowed.has(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  const { exists, isOwner } = await getAppointmentAccess(id, req.user);
  if (!exists) {
    return res.status(404).json({ error: "Appointment not found" });
  }
  if (!isOwner) {
    return res.status(403).json({ error: "You do not have access to this appointment" });
  }

  const result = await pool.query(
    `UPDATE appointments SET status = $1 WHERE id = $2 RETURNING *`,
    [status, id]
  );

  res.json({ appointment: result.rows[0] });
}

export async function rescheduleAppointment(req, res) {
  const { id } = req.params;
  const { startsAt, endsAt } = req.body;

  if (!startsAt || !endsAt) {
    return res.status(400).json({ error: "startsAt and endsAt are required" });
  }

  const windowError = validateAppointmentWindow(startsAt, endsAt);
  if (windowError) {
    return res.status(400).json({ error: windowError });
  }

  const { exists, isOwner } = await getAppointmentAccess(id, req.user);
  if (!exists) {
    return res.status(404).json({ error: "Appointment not found" });
  }
  if (!isOwner) {
    return res.status(403).json({ error: "You do not have access to this appointment" });
  }

  try {
    const result = await pool.query(
      `UPDATE appointments SET starts_at = $1, ends_at = $2, status = 'scheduled'
       WHERE id = $3 RETURNING *`,
      [startsAt, endsAt, id]
    );
    res.json({ appointment: result.rows[0] });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "This slot is already booked" });
    }
    throw err;
  }
}
