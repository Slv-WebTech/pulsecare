import { pool } from "../config/db.js";
import { canSetStatus, canTransition, canReschedule, toId, parsePaging } from "../utils/validation.js";
import { fitsAvailability, DEFAULT_TIMEZONE } from "../utils/time.js";

// Max upcoming (scheduled/confirmed) appointments one patient may hold; stops slot-hoarding.
const MAX_ACTIVE_APPOINTMENTS = Number(process.env.MAX_ACTIVE_APPOINTMENTS || 10);

// Reminder is due 24h before the visit (or immediately if the visit is sooner than that).
async function upsertReminder(appointmentId, startsAt) {
  const sendAt = new Date(Math.max(Date.now(), new Date(startsAt).getTime() - 24 * 3600 * 1000));
  await pool.query(
    `INSERT INTO reminders (appointment_id, send_at, sent) VALUES ($1, $2, false)
     ON CONFLICT (appointment_id) DO UPDATE SET send_at = EXCLUDED.send_at, sent = false`,
    [appointmentId, sendAt]
  );
}

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
    `SELECT a.patient_id, a.status, dp.user_id AS doctor_user_id
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
  return { exists: true, isOwner, status: row.status };
}

// The doctor must exist, and — if they have published availability — the requested
// window must fall inside it. Also rejects any overlap with the doctor's other
// non-cancelled appointments (the UNIQUE constraint only catches identical start times).
async function checkDoctorAvailability(doctorId, startsAt, endsAt, ignoreAppointmentId = null) {
  const doctor = await pool.query("SELECT id, timezone FROM doctor_profiles WHERE id = $1", [doctorId]);
  if (doctor.rowCount === 0) return { status: 404, message: "Doctor not found" };

  const windows = (
    await pool.query(
      "SELECT day_of_week, start_time, end_time, slot_minutes FROM doctor_availability WHERE doctor_id = $1",
      [doctorId]
    )
  ).rows;
  if (
    windows.length > 0 &&
    !fitsAvailability(new Date(startsAt), new Date(endsAt), windows, doctor.rows[0].timezone || DEFAULT_TIMEZONE)
  ) {
    return { status: 400, message: "Requested time is not an available slot for this doctor" };
  }

  const overlap = await pool.query(
    `SELECT 1 FROM appointments
     WHERE doctor_id = $1 AND status <> 'cancelled' AND id IS DISTINCT FROM $4
       AND starts_at < $3 AND ends_at > $2
     LIMIT 1`,
    [doctorId, startsAt, endsAt, ignoreAppointmentId]
  );
  if (overlap.rowCount > 0) return { status: 409, message: "This slot is already booked" };
  return null;
}

export async function bookAppointment(req, res) {
  const { doctorId, startsAt, endsAt, notes } = req.body;
  if (!doctorId || !startsAt || !endsAt) {
    return res.status(400).json({ error: "doctorId, startsAt, and endsAt are required" });
  }

  if (!toId(doctorId)) {
    return res.status(400).json({ error: "doctorId must be a positive integer" });
  }

  const windowError = validateAppointmentWindow(startsAt, endsAt);
  if (windowError) {
    return res.status(400).json({ error: windowError });
  }

  const active = await pool.query(
    `SELECT count(*)::int AS n FROM appointments
     WHERE patient_id = $1 AND status IN ('scheduled','confirmed') AND starts_at > now()`,
    [req.user.id]
  );
  if (active.rows[0].n >= MAX_ACTIVE_APPOINTMENTS) {
    return res.status(409).json({ error: `You can hold at most ${MAX_ACTIVE_APPOINTMENTS} upcoming appointments` });
  }

  const availabilityError = await checkDoctorAvailability(doctorId, startsAt, endsAt);
  if (availabilityError) {
    return res.status(availabilityError.status).json({ error: availabilityError.message });
  }

  try {
    const result = await pool.query(
      `INSERT INTO appointments (patient_id, doctor_id, starts_at, ends_at, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [req.user.id, doctorId, startsAt, endsAt, notes || null]
    );
    await upsertReminder(result.rows[0].id, startsAt);
    res.status(201).json({ appointment: result.rows[0] });
  } catch (err) {
    if (err.code === "23505" || err.code === "23P01") {
      // unique/exclusion violation: the slot was taken concurrently
      return res.status(409).json({ error: "This slot is already booked" });
    }
    throw err;
  }
}

export async function listMyAppointments(req, res) {
  const { limit, offset } = parsePaging(req.query, { defaultLimit: 200, maxLimit: 500 });
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
     ORDER BY a.starts_at DESC
     LIMIT $2 OFFSET $3`,
    [idValue, limit, offset]
  );

  res.json({ appointments: result.rows });
}

export async function updateAppointmentStatus(req, res) {
  const id = toId(req.params.id);
  if (!id) return res.status(404).json({ error: "Appointment not found" });
  const { status } = req.body;

  const allowed = new Set(["scheduled", "confirmed", "completed", "cancelled"]);
  if (!allowed.has(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }
  if (!canSetStatus(req.user.role, status)) {
    return res.status(403).json({ error: "Your role cannot set this status" });
  }

  const { exists, isOwner, status: current } = await getAppointmentAccess(id, req.user);
  if (!exists) {
    return res.status(404).json({ error: "Appointment not found" });
  }
  if (!isOwner) {
    return res.status(403).json({ error: "You do not have access to this appointment" });
  }
  if (!canTransition(current, status)) {
    return res.status(409).json({ error: `Cannot change a ${current} appointment to ${status}` });
  }

  const result = await pool.query(
    `UPDATE appointments SET status = $1 WHERE id = $2 RETURNING *`,
    [status, id]
  );

  res.json({ appointment: result.rows[0] });
}

export async function rescheduleAppointment(req, res) {
  const id = toId(req.params.id);
  if (!id) return res.status(404).json({ error: "Appointment not found" });
  const { startsAt, endsAt } = req.body;

  if (!startsAt || !endsAt) {
    return res.status(400).json({ error: "startsAt and endsAt are required" });
  }

  const windowError = validateAppointmentWindow(startsAt, endsAt);
  if (windowError) {
    return res.status(400).json({ error: windowError });
  }

  const { exists, isOwner, status: current } = await getAppointmentAccess(id, req.user);
  if (!exists) {
    return res.status(404).json({ error: "Appointment not found" });
  }
  if (!isOwner) {
    return res.status(403).json({ error: "You do not have access to this appointment" });
  }
  if (!canReschedule(current)) {
    return res.status(409).json({ error: `A ${current} appointment cannot be rescheduled` });
  }

  const doctorRow = await pool.query("SELECT doctor_id FROM appointments WHERE id = $1", [id]);
  const availabilityError = await checkDoctorAvailability(
    doctorRow.rows[0].doctor_id, startsAt, endsAt, id
  );
  if (availabilityError) {
    return res.status(availabilityError.status).json({ error: availabilityError.message });
  }

  try {
    const result = await pool.query(
      `UPDATE appointments SET starts_at = $1, ends_at = $2, status = 'scheduled'
       WHERE id = $3 RETURNING *`,
      [startsAt, endsAt, id]
    );
    await upsertReminder(id, startsAt);
    res.json({ appointment: result.rows[0] });
  } catch (err) {
    if (err.code === "23505" || err.code === "23P01") {
      return res.status(409).json({ error: "This slot is already booked" });
    }
    throw err;
  }
}
