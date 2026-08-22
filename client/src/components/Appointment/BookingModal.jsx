import { useEffect, useState } from "react";
import { api } from "../../services/api.js";
import { Modal } from "../ui/Modal.jsx";
import { Field } from "../ui/Field.jsx";
import { Alert } from "../ui/Alert.jsx";
import Button from "../ui/Button.jsx";
import { useToast } from "../ui/ToastContext.jsx";

const DEFAULT_SLOT_MINUTES = 30;

export default function BookingModal({ doctor, onClose, onBooked }) {
  const [startsAt, setStartsAt] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [availability, setAvailability] = useState([]);
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/doctors/${doctor.id}/availability`)
      .then(({ data }) => {
        if (!cancelled) setAvailability(data.availability);
      })
      .catch(() => {
        // Non-fatal — booking still works with the default slot length below.
      });
    return () => {
      cancelled = true;
    };
  }, [doctor.id]);

  // The doctor's real slot length for the chosen day, per `doctor_availability`
  // (day_of_week uses the same 0=Sun..6=Sat convention as Date#getDay), falling
  // back to a sane default if that day has no configured availability yet.
  function slotMinutesFor(date) {
    const match = availability.find((a) => a.day_of_week === date.getDay());
    return match?.slot_minutes || DEFAULT_SLOT_MINUTES;
  }

  const selectedSlotMinutes = startsAt ? slotMinutesFor(new Date(startsAt)) : null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const start = new Date(startsAt);
      const end = new Date(start.getTime() + slotMinutesFor(start) * 60 * 1000);
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
        <Field
          label="Date & time"
          hint={selectedSlotMinutes ? `This will be a ${selectedSlotMinutes}-minute appointment.` : undefined}
        >
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
