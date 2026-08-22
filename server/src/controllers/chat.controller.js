import { pool } from "../config/db.js";

export async function getConversation(req, res) {
  const { userId } = req.params;

  const result = await pool.query(
    `SELECT * FROM messages
     WHERE (sender_id = $1 AND recipient_id = $2)
        OR (sender_id = $2 AND recipient_id = $1)
     ORDER BY created_at ASC`,
    [req.user.id, userId]
  );

  res.json({ messages: result.rows });
}

export async function markRead(req, res) {
  const { id } = req.params;
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
