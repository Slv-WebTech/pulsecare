import { pool } from "../config/db.js";

// Delivers due appointment reminders in-app (Socket.IO `reminder:due` to the patient and doctor
// rooms). There is no email/SMS provider configured; deliver() is the single seam to add one.
export async function deliverDueReminders(io, deliver = defaultDeliver) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // SKIP LOCKED makes this safe if several server instances run the worker.
    const due = await client.query(
      `SELECT r.id, a.id AS appointment_id, a.starts_at, a.patient_id, dp.user_id AS doctor_user_id,
              pu.name AS patient_name, du.name AS doctor_name
       FROM reminders r
       JOIN appointments a ON a.id = r.appointment_id
       JOIN doctor_profiles dp ON dp.id = a.doctor_id
       JOIN users pu ON pu.id = a.patient_id
       JOIN users du ON du.id = dp.user_id
       WHERE r.sent = false AND r.send_at <= now()
         AND a.status IN ('scheduled','confirmed') AND a.starts_at > now()
       ORDER BY r.send_at LIMIT 100
       FOR UPDATE OF r SKIP LOCKED`
    );
    for (const row of due.rows) await deliver(io, row);
    if (due.rows.length) {
      await client.query("UPDATE reminders SET sent = true WHERE id = ANY($1)", [due.rows.map((r) => r.id)]);
    }
    // Reminders for appointments that were cancelled/finished are closed out, not re-evaluated forever.
    await client.query(
      `UPDATE reminders r SET sent = true FROM appointments a
       WHERE a.id = r.appointment_id AND r.sent = false AND (a.status NOT IN ('scheduled','confirmed') OR a.starts_at <= now())`
    );
    await client.query("COMMIT");
    return due.rows.length;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

function defaultDeliver(io, row) {
  const payload = { appointmentId: row.appointment_id, startsAt: row.starts_at };
  io?.to(`user:${row.patient_id}`).emit("reminder:due", { ...payload, with: row.doctor_name });
  io?.to(`user:${row.doctor_user_id}`).emit("reminder:due", { ...payload, with: row.patient_name });
}

export function startReminderWorker(io, intervalMs = 60_000) {
  const tick = () => deliverDueReminders(io).catch((err) => console.error("reminder worker failed:", err.message));
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  tick();
  return () => clearInterval(timer);
}
