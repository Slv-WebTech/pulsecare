import { Card } from "../ui/Card.jsx";
import { Badge } from "../ui/Badge.jsx";
import { CheckIcon, XIcon, MessageIcon } from "../ui/icons.jsx";
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

export default function AppointmentCard({ appointment, onStatusChange, onMessage }) {
  const { user } = useAuth();
  const title = user?.role === "doctor" ? appointment.patient_name : appointment.specialization;

  const nextStatuses = STATUS_ACTIONS[appointment.status] || [];
  const hasActions = (onStatusChange && nextStatuses.length > 0) || onMessage;

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
