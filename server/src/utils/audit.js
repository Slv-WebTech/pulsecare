import { pool } from "../config/db.js";

// Append an entry to the PHI access trail. Never throws: auditing must not break the request.
export async function audit(req, action, resourceType = null, resourceId = null, userId = null) {
  try {
    await pool.query(
      `INSERT INTO audit_log (user_id, action, resource_type, resource_id, ip) VALUES ($1,$2,$3,$4,$5)`,
      [userId ?? req.user?.id ?? null, action, resourceType, resourceId == null ? null : String(resourceId), req.ip || null]
    );
  } catch (err) {
    console.error("audit log write failed:", err.message);
  }
}
