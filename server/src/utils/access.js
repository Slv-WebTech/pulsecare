import { pool } from "../config/db.js";

// True if `userId` and `otherId` are the patient/doctor pair of at least one
// non-cancelled appointment, or either is an admin. Gates chat and doctor access to
// patient data (least privilege: no relationship, no access).
export async function haveCareRelationship(userId, otherId) {
  const result = await pool.query(
    `SELECT 1
     FROM appointments a
     JOIN doctor_profiles dp ON dp.id = a.doctor_id
     WHERE a.status <> 'cancelled'
       AND ((a.patient_id = $1 AND dp.user_id = $2) OR (a.patient_id = $2 AND dp.user_id = $1))
     UNION ALL
     SELECT 1 FROM users WHERE id IN ($1, $2) AND role = 'admin'
     LIMIT 1`,
    [userId, otherId]
  );
  return result.rowCount > 0;
}
