import { useState } from "react";
import { api } from "../../services/api.js";
import { Modal } from "../ui/Modal.jsx";
import { Field } from "../ui/Field.jsx";
import { Alert } from "../ui/Alert.jsx";
import Button from "../ui/Button.jsx";
import { useToast } from "../ui/ToastContext.jsx";

export default function BookingModal({ doctor, onClose, onBooked }) {
  const [startsAt, setStartsAt] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const start = new Date(startsAt);
      const end = new Date(start.getTime() + 30 * 60 * 1000);
      const { data } = await api.post("/appointments", {
        doctorId: doctor.id,
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
      });
      toast.success(`Appointment booked with ${doctor.name}`);
      onBooked(data.appointment);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to book appointment");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      title={`Book with ${doctor.name}`}
      subtitle={`${doctor.specialization} · $${doctor.fee} per visit`}
      onClose={onClose}
    >
      <form className="auth-form" onSubmit={handleSubmit}>
        <Field label="Date & time">
          {(id) => (
            <input
              id={id}
              type="datetime-local"
              className="input"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              required
              min={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
            />
          )}
        </Field>
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="modal-actions">
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" loading={submitting}>
            Confirm booking
          </Button>
        </div>
      </form>
    </Modal>
  );
}
