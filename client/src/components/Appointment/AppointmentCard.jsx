import { useState } from "react";
import { Card } from "../ui/Card.jsx";
import { Badge } from "../ui/Badge.jsx";
import { CheckIcon, XIcon, MessageIcon, CalendarIcon, FileTextIcon } from "../ui/icons.jsx";
import { useAuth } from "../../context/AuthContext.jsx";

const STATUS_ACTIONS = {
  scheduled: ["confirmed", "cancelled"],
  confirmed: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

const STATUS_TONE = {
  scheduled: "info",
  confirmed: "brand",
  completed: "success",
  cancelled: "danger",
};

export default function AppointmentCard({
  appointment,
  onStatusChange, // doctor: move through the lifecycle
  onMessage,
  onCancel, // patient: cancel (two-step confirm, no browser dialog)
  onReschedule, // patient: pick a new slot
  onDocuments, // doctor: view documents the patient attached to this appointment
}) {
  const { user } = useAuth();
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const open = appointment.status === "scheduled" || appointment.status === "confirmed";
  const title = user?.role === "doctor" ? appointment.patient_name : appointment.specialization;

  const nextStatuses = STATUS_ACTIONS[appointment.status] || [];
  const hasActions =
    (onStatusChange && nextStatuses.length > 0) || onMessage || onDocuments || (open && (onCancel || onReschedule));

  const starts = new Date(appointment.starts_at);
  const ends = new Date(appointment.ends_at);
  const month = starts.toLocaleDateString(undefined, { month: "short" }).toUpperCase();
  const day = starts.getDate();
  const timeRange = `${starts.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} – ${ends.toLocaleTimeString(
    [],
    { hour: "numeric", minute: "2-digit" }
  )}`;

  return (
    <Card className="appointment-card">
      <div className="appointment-card-top">
        <div className="appointment-card-when">
          <div className="appointment-date-block">
            <span className="month">{month}</span>
            <span className="day">{day}</span>
          </div>
          <div>
            <div className="appointment-card-title">{title}</div>
            <div className="appointment-card-time">{timeRange}</div>
          </div>
        </div>
        <Badge tone={STATUS_TONE[appointment.status]} dot>
          {appointment.status}
        </Badge>
      </div>

      {appointment.notes && <p className="text-meta">{appointment.notes}</p>}

      {hasActions && (
        <div className="appointment-card-actions">
          {onMessage && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onMessage(appointment)}>
              <MessageIcon size={14} /> Message
            </button>
          )}
          {onDocuments && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onDocuments(appointment)}>
              <FileTextIcon size={14} /> Documents
            </button>
          )}
          {open && onReschedule && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onReschedule(appointment)}>
              <CalendarIcon size={14} /> Reschedule
            </button>
          )}
          {open && onCancel &&
            (confirmingCancel ? (
              <>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => {
                    setConfirmingCancel(false);
                    onCancel(appointment);
                  }}
                >
                  <XIcon size={14} /> Yes, cancel it
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmingCancel(false)}>
                  Keep appointment
                </button>
              </>
            ) : (
              <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirmingCancel(true)}>
                <XIcon size={14} /> Cancel
              </button>
            ))}
          {onStatusChange &&
            nextStatuses.map((status) => (
              <button
                key={status}
                className={`btn btn-${status === "cancelled" ? "danger" : "secondary"} btn-sm`}
                onClick={() => onStatusChange(appointment.id, status)}
              >
                {status === "cancelled" ? <XIcon size={14} /> : <CheckIcon size={14} />}
                Mark {status}
              </button>
            ))}
        </div>
      )}
    </Card>
  );
}
