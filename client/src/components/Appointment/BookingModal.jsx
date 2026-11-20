import { useEffect, useState } from "react";
import { api } from "../../services/api.js";
import { Modal } from "../ui/Modal.jsx";
import { Field } from "../ui/Field.jsx";
import { Alert } from "../ui/Alert.jsx";
import Button from "../ui/Button.jsx";
import { useToast } from "../ui/ToastContext.jsx";

export function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function formatSlot(slot) {
  return new Date(slot.startsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/**
 * Book a new appointment with `doctor`, or — when `appointment` is given — reschedule it.
 * The patient picks a date and then one of the doctor's real free slots (from GET /doctors/:id/slots),
 * so they can no longer submit a time that is unavailable.
 */
export default function BookingModal({ doctor, appointment, onClose, onBooked }) {
  const rescheduling = !!appointment;
  const doctorId = rescheduling ? appointment.doctor_id : doctor.id;
  const doctorName = rescheduling ? appointment.doctor_name : doctor.name;

  const [date, setDate] = useState("");
  const [slots, setSlots] = useState([]);
  const [timezone, setTimezone] = useState("");
  const [selected, setSelected] = useState(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!date) return undefined;
    let cancelled = false;
    setLoadingSlots(true);
    setSelected(null);
    setError("");
    api
      .get(`/doctors/${doctorId}/slots`, { params: { date } })
      .then(({ data }) => {
        if (cancelled) return;
        setSlots(data.slots);
        setTimezone(data.timezone);
      })
      .catch((err) => {
        if (cancelled) return;
        setSlots([]);
        setError(err.response?.data?.error || "Couldn't load available times.");
      })
      .finally(() => {
        if (!cancelled) setLoadingSlots(false);
      });
    return () => {
      cancelled = true;
    };
  }, [date, doctorId]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!selected) return;
    setError("");
    setSubmitting(true);
    try {
      const body = { startsAt: selected.startsAt, endsAt: selected.endsAt };
      const { data } = rescheduling
        ? await api.patch(`/appointments/${appointment.id}/reschedule`, body)
        : await api.post("/appointments", { doctorId, ...body });
      toast.success(rescheduling ? "Appointment rescheduled" : `Appointment booked with ${doctorName}`);
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
      title={rescheduling ? `Reschedule with ${doctorName}` : `Book with ${doctorName}`}
      subtitle={rescheduling ? undefined : `${doctor.specialization} · $${doctor.fee} per visit`}
      onClose={onClose}
    >
      <form className="auth-form" onSubmit={handleSubmit}>
        <Field label="Date">
          {(id) => (
            <input
              id={id}
              type="date"
              className="input"
              value={date}
              min={todayYmd()}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          )}
        </Field>

        {date && (
          <fieldset className="slot-picker">
            <legend className="field-label">Available times</legend>
            {loadingSlots ? (
              <p className="text-meta" role="status">Loading times…</p>
            ) : slots.length === 0 ? (
              <p className="text-meta" role="status">No free times on this day. Try another date.</p>
            ) : (
              <div className="slot-grid" role="radiogroup" aria-label="Available times">
                {slots.map((slot) => {
                  const active = selected?.startsAt === slot.startsAt;
                  return (
                    <button
                      key={slot.startsAt}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      className={`slot-btn ${active ? "is-selected" : ""}`}
                      onClick={() => setSelected(slot)}
                    >
                      {formatSlot(slot)}
                    </button>
                  );
                })}
              </div>
            )}
            {timezone && <p className="field-hint">Shown in your local time. The clinic is in {timezone}.</p>}
          </fieldset>
        )}

        {error && <Alert tone="danger">{error}</Alert>}
        <div className="modal-actions">
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" loading={submitting} disabled={!selected}>
            {rescheduling ? "Confirm new time" : "Confirm booking"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
