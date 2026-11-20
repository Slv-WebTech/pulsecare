import { useState } from "react";
import { api } from "../../services/api.js";
import { Alert } from "../ui/Alert.jsx";
import { Spinner } from "../ui/Spinner.jsx";
import { useToast } from "../ui/ToastContext.jsx";
import { UploadCloudIcon } from "../ui/icons.jsx";

export default function DocumentUpload({ onUploaded, appointments = [] }) {
  const [appointmentId, setAppointmentId] = useState("");
  const attachable = appointments.filter((a) => a.status === "scheduled" || a.status === "confirmed");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const toast = useToast();

  async function uploadFile(file) {
    if (!file) return;

    setError("");
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    if (appointmentId) formData.append("appointmentId", appointmentId);

    try {
      const { data } = await api.post("/documents", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success("Document uploaded");
      onUploaded(data.document);
    } catch (err) {
      setError(err.response?.data?.error || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleChange(e) {
    const file = e.target.files[0];
    try {
      await uploadFile(file);
    } finally {
      e.target.value = "";
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  }

  return (
    <div className="document-upload">
      {attachable.length > 0 && (
        <div className="field">
          <label className="field-label" htmlFor="doc-appt">
            Share with a doctor <span className="optional">(optional)</span>
          </label>
          <select id="doc-appt" className="select" value={appointmentId} onChange={(e) => setAppointmentId(e.target.value)}>
            <option value="">Keep private (only me)</option>
            {attachable.map((a) => (
              <option key={a.id} value={a.id}>
                {a.doctor_name} · {new Date(a.starts_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
              </option>
            ))}
          </select>
          <span className="field-hint">The doctor you pick can view this document for that appointment.</span>
        </div>
      )}
      <div
        className={`document-upload-zone ${dragging ? "is-dragging" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <span className="document-upload-icon">{uploading ? <Spinner /> : <UploadCloudIcon />}</span>
        <div className="document-upload-text">
          <p className="document-upload-title">{uploading ? "Uploading…" : "Upload a medical document"}</p>
          <p className="document-upload-hint">PDF, JPG or PNG</p>
        </div>
        <div className="document-upload-input">
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={handleChange}
            disabled={uploading}
            aria-label="Upload medical document"
          />
        </div>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
    </div>
  );
}
