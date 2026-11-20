import { pool } from "../config/db.js";
import { haveCareRelationship } from "../utils/access.js";
import { toId } from "../utils/validation.js";
import { audit } from "../utils/audit.js";

export async function getConversation(req, res) {
  const userId = Number(req.params.userId);
  if (!Number.isInteger(userId)) {
    return res.status(400).json({ error: "Invalid user id" });
  }
  if (!(await haveCareRelationship(req.user.id, userId))) {
    return res.status(403).json({ error: "No care relationship with this user" });
  }

  const result = await pool.query(
    `SELECT * FROM messages
     WHERE (sender_id = $1 AND recipient_id = $2)
        OR (sender_id = $2 AND recipient_id = $1)
     ORDER BY created_at ASC`,
    [req.user.id, userId]
  );

  await audit(req, "chat.read", "user", userId);
  res.json({ messages: result.rows });
}

export async function markRead(req, res) {
  const id = toId(req.params.id);
  if (!id) return res.status(404).json({ error: "Message not found" });
  const result = await pool.query(
    `UPDATE messages SET read_at = now()
     WHERE id = $1 AND recipient_id = $2
     RETURNING *`,
    [id, req.user.id]
  );
  if (result.rowCount === 0) {
    return res.status(404).json({ error: "Message not found" });
  }
  res.json({ message: result.rows[0] });
}
