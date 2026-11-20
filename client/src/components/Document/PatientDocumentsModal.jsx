import { useEffect, useState } from "react";
import { api } from "../../services/api.js";
import { openDocument } from "../../services/documents.js";
import { Modal } from "../ui/Modal.jsx";
import { Alert } from "../ui/Alert.jsx";
import { Spinner } from "../ui/Spinner.jsx";
import { FileTextIcon } from "../ui/icons.jsx";

// Doctor-side view of the documents a patient has shared with them (attached to one of their
// appointments). Access is enforced and audited by the server; the file opens via a signed URL.
export default function PatientDocumentsModal({ patientId, patientName, onClose }) {
  const [documents, setDocuments] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/documents/patient/${patientId}`)
      .then(({ data }) => !cancelled && setDocuments(data.documents))
      .catch(() => !cancelled && setError("Couldn't load documents."));
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  return (
    <Modal title={`${patientName}'s documents`} subtitle="Shared with you for this care relationship" onClose={onClose}>
      {error ? (
        <Alert tone="danger">{error}</Alert>
      ) : documents === null ? (
        <p className="text-meta" role="status"><Spinner /> Loading…</p>
      ) : documents.length === 0 ? (
        <p className="text-meta">This patient hasn't shared any documents with you.</p>
      ) : (
        <ul className="doc-list">
          {documents.map((d) => (
            <li key={d.id} className="doc-list-item">
              <FileTextIcon size={16} />
              <button
                type="button"
                className="link-button"
                onClick={() => openDocument(d.id).catch(() => setError("Couldn't open that document."))}
              >
                {d.original_name}
              </button>
              <span className="text-meta">{new Date(d.uploaded_at).toLocaleDateString()}</span>
              {d.ai_summary?.keyInfo && <p className="text-meta">{d.ai_summary.keyInfo}</p>}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
