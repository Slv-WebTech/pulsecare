import { pool } from "../config/db.js";

export async function getDashboardStats(req, res) {
  const [{ rows: patientRows }, { rows: doctorRows }, { rows: apptRows }, { rows: specRows }] =
    await Promise.all([
      pool.query("SELECT COUNT(*)::int AS count FROM users WHERE role = 'patient'"),
      pool.query("SELECT COUNT(*)::int AS count FROM users WHERE role = 'doctor'"),
      pool.query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE status = 'completed')::int AS completed
         FROM appointments`
      ),
      pool.query(
        `SELECT specialization, COUNT(*)::int AS count
         FROM doctor_profiles
         GROUP BY specialization
         ORDER BY count DESC
         LIMIT 5`
      ),
    ]);

  const totalAppointments = apptRows[0].total;
  const completedAppointments = apptRows[0].completed;
  const completionRate = totalAppointments > 0 ? (completedAppointments / totalAppointments) * 100 : 0;

  res.json({
    totalPatients: patientRows[0].count,
    totalDoctors: doctorRows[0].count,
    totalAppointments,
    completedAppointments,
    completionRate: Number(completionRate.toFixed(2)),
    popularSpecializations: specRows,
  });
}
