import { pool } from "../config/db.js";
import { haveCareRelationship } from "../utils/access.js";
import { toId, parsePaging } from "../utils/validation.js";
import { audit } from "../utils/audit.js";
import cloudinary from "../config/cloudinary.js";

// Files are stored as Cloudinary `authenticated` assets: the raw URL does not work, and a
// signed URL is only issued by `getDocumentFileUrl` after an access check (and is audited).
// Legacy rows (public_id IS NULL) predate this and fall back to their stored public URL.
function uploadBuffer(buffer, resourceType) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { resource_type: resourceType, type: "authenticated", folder: "healthcare-documents" },
      (error, result) => (error ? reject(error) : resolve(result))
    );
    stream.end(buffer);
  });
}

export function signedUrlFor(doc) {
  if (!doc.public_id) return doc.file_url;
  return cloudinary.url(doc.public_id, {
    resource_type: doc.resource_type || "image",
    type: "authenticated",
    sign_url: true,
    secure: true,
  });
}

// Never expose storage details (public_id / raw URL) to API consumers.
export function toPublicDocument(doc) {
  const { file_url, public_id, resource_type, ...rest } = doc;
  return rest;
}

export async function uploadDocument(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  // A document may only be attached to the uploader's own appointment.
  const appointmentId = req.body.appointmentId ? Number(req.body.appointmentId) : null;
  if (req.body.appointmentId && !Number.isInteger(appointmentId)) {
    return res.status(400).json({ error: "Invalid appointmentId" });
  }
  if (appointmentId) {
    const owned = await pool.query(
      "SELECT 1 FROM appointments WHERE id = $1 AND patient_id = $2",
      [appointmentId, req.user.id]
    );
    if (owned.rowCount === 0) {
      return res.status(403).json({ error: "You do not have access to this appointment" });
    }
  }

  const resourceType = req.file.mimetype === "application/pdf" ? "raw" : "image";
  const uploaded = await uploadBuffer(req.file.buffer, resourceType);

  const result = await pool.query(
    `INSERT INTO documents (patient_id, appointment_id, file_url, public_id, resource_type, file_type, original_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      req.user.id,
      appointmentId,
      uploaded.secure_url,
      uploaded.public_id,
      uploaded.resource_type || resourceType,
      req.file.mimetype,
      req.file.originalname,
    ]
  );

  await audit(req, "document.upload", "document", result.rows[0].id);
  res.status(201).json({ document: toPublicDocument(result.rows[0]) });
}

export async function listMyDocuments(req, res) {
  const { limit, offset } = parsePaging(req.query, { defaultLimit: 200, maxLimit: 500 });
  const result = await pool.query(
    `SELECT * FROM documents WHERE patient_id = $1 ORDER BY uploaded_at DESC LIMIT $2 OFFSET $3`,
    [req.user.id, limit, offset]
  );
  res.json({ documents: result.rows.map(toPublicDocument) });
}

// Short-lived access to the actual file. Allowed for the owning patient, or for a doctor
// (or admin) the document was attached to via a shared appointment.
export async function getDocumentFileUrl(req, res) {
  const id = toId(req.params.id);
  if (!id) return res.status(404).json({ error: "Document not found" });

  const found = await pool.query("SELECT * FROM documents WHERE id = $1", [id]);
  const doc = found.rows[0];
  if (!doc) return res.status(404).json({ error: "Document not found" });

  let allowed = doc.patient_id === req.user.id || req.user.role === "admin";
  if (!allowed && req.user.role === "doctor" && doc.appointment_id) {
    const link = await pool.query(
      `SELECT 1 FROM appointments a JOIN doctor_profiles dp ON dp.id = a.doctor_id
       WHERE a.id = $1 AND dp.user_id = $2`,
      [doc.appointment_id, req.user.id]
    );
    allowed = link.rowCount > 0;
  }
  if (!allowed) return res.status(404).json({ error: "Document not found" });

  await audit(req, "document.file_access", "document", id);
  res.json({ url: signedUrlFor(doc) });
}

// Doctors may read documents of patients they have a (non-cancelled) appointment with.
// Only documents explicitly attached to one of that doctor's appointments are returned.
export async function listPatientDocuments(req, res) {
  const patientId = Number(req.params.patientId);
  if (!Number.isInteger(patientId)) {
    return res.status(400).json({ error: "Invalid patient id" });
  }
  if (req.user.role !== "admin" && !(await haveCareRelationship(req.user.id, patientId))) {
    return res.status(403).json({ error: "No care relationship with this patient" });
  }

  const result = await pool.query(
    `SELECT d.*
     FROM documents d
     JOIN appointments a ON a.id = d.appointment_id
     JOIN doctor_profiles dp ON dp.id = a.doctor_id
     WHERE d.patient_id = $1 AND ($2 = 'admin' OR dp.user_id = $3)
     ORDER BY d.uploaded_at DESC`,
    [patientId, req.user.role, req.user.id]
  );
  await audit(req, "document.list_patient", "user", patientId);
  res.json({ documents: result.rows.map(toPublicDocument) });
}

export async function summarizeDocument(req, res) {
  const id = toId(req.params.id);
  if (!id) return res.status(404).json({ error: "Document not found" });
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
      body: JSON.stringify({ fileUrl: signedUrlFor(doc.rows[0]), fileType: doc.rows[0].file_type }),
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

  await audit(req, "document.summarize", "document", id);
  res.json({ document: toPublicDocument(updated.rows[0]) });
}
