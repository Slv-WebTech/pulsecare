import { pool } from "../config/db.js";
import cloudinary from "../config/cloudinary.js";

function uploadBuffer(buffer, resourceType) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { resource_type: resourceType, folder: "healthcare-documents" },
      (error, result) => (error ? reject(error) : resolve(result))
    );
    stream.end(buffer);
  });
}

export async function uploadDocument(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const resourceType = req.file.mimetype === "application/pdf" ? "raw" : "image";
  const uploaded = await uploadBuffer(req.file.buffer, resourceType);

  const result = await pool.query(
    `INSERT INTO documents (patient_id, appointment_id, file_url, file_type, original_name)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      req.user.id,
      req.body.appointmentId || null,
      uploaded.secure_url,
      req.file.mimetype,
      req.file.originalname,
    ]
  );

  res.status(201).json({ document: result.rows[0] });
}

export async function listMyDocuments(req, res) {
  const result = await pool.query(
    `SELECT * FROM documents WHERE patient_id = $1 ORDER BY uploaded_at DESC`,
    [req.user.id]
  );
  res.json({ documents: result.rows });
}

export async function summarizeDocument(req, res) {
  const { id } = req.params;
  const doc = await pool.query("SELECT * FROM documents WHERE id = $1 AND patient_id = $2", [
    id,
    req.user.id,
  ]);

  if (doc.rowCount === 0) {
    return res.status(404).json({ error: "Document not found" });
  }

  let aiResponse;
  try {
    aiResponse = await fetch(`${process.env.AI_SERVICE_URL}/summarize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.AI_SERVICE_TOKEN}`,
      },
      body: JSON.stringify({ fileUrl: doc.rows[0].file_url, fileType: doc.rows[0].file_type }),
      signal: AbortSignal.timeout(30000),
    });
  } catch (err) {
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      return res.status(504).json({ error: "AI service timed out" });
    }
    throw err;
  }

  if (!aiResponse.ok) {
    return res.status(502).json({ error: "AI service failed to summarize document" });
  }

  const summary = await aiResponse.json();

  const updated = await pool.query(
    "UPDATE documents SET ai_summary = $1 WHERE id = $2 RETURNING *",
    [summary, id]
  );

  res.json({ document: updated.rows[0] });
}
