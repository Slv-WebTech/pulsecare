import { useEffect, useMemo, useState } from "react";
import { api } from "../services/api.js";
import AppointmentCard from "../components/Appointment/AppointmentCard.jsx";
import ChatWindow from "../components/Chat/ChatWindow.jsx";
import { PageHeader } from "../components/ui/PageHeader.jsx";
import { EmptyState } from "../components/ui/EmptyState.jsx";
import { SkeletonCard } from "../components/ui/Skeleton.jsx";
import { Modal } from "../components/ui/Modal.jsx";
import { Alert } from "../components/ui/Alert.jsx";
import { useToast } from "../components/ui/ToastContext.jsx";
import { CalendarIcon } from "../components/ui/icons.jsx";
import { useAuth } from "../context/AuthContext.jsx";

const FILTERS = [
  { key: "today", label: "Today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
  { key: "all", label: "All" },
];

export default function DoctorDashboard() {
  const { user } = useAuth();
  const toast = useToast();
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("today");
  const [chatPeer, setChatPeer] = useState(null);

  useEffect(() => {
    api
      .get("/appointments")
      .then(({ data }) => setAppointments(data.appointments))
      .catch(() => setError("Couldn't load your appointments."))
      .finally(() => setLoading(false));
  }, []);

  async function handleStatusChange(id, status) {
    try {
      const { data } = await api.patch(`/appointments/${id}/status`, { status });
      setAppointments((prev) => prev.map((a) => (a.id === id ? data.appointment : a)));
    } catch (err) {
      toast.error(err.response?.data?.error || "Couldn't update the appointment status.");
    }
  }

  function handleMessage(appointment) {
    setChatPeer({ id: appointment.patient_id, name: appointment.patient_name });
  }

  const today = new Date().toDateString();

  const filtered = useMemo(() => {
    switch (filter) {
      case "today":
        return appointments.filter((a) => new Date(a.starts_at).toDateString() === today);
      case "upcoming":
        return appointments.filter(
          (a) => new Date(a.starts_at) > new Date() && ["scheduled", "confirmed"].includes(a.status)
        );
      case "completed":
        return appointments.filter((a) => a.status === "completed");
      case "cancelled":
        return appointments.filter((a) => a.status === "cancelled");
      default:
        return appointments;
    }
  }, [appointments, filter, today]);

  const todaysCount = appointments.filter((a) => new Date(a.starts_at).toDateString() === today).length;

  return (
    <>
      <PageHeader
        eyebrow="Doctor"
        title={`Good to see you, Dr. ${user?.name?.split(" ").slice(-1)[0] || ""}`}
        subtitle={
          todaysCount > 0
            ? `You have ${todaysCount} appointment${todaysCount === 1 ? "" : "s"} today.`
            : "No appointments scheduled for today."
        }
      />

      <div className="segmented" role="group" aria-label="Filter appointments">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
            {f.label}
          </button>
        ))}
      </div>

      <div style={{ marginTop: "var(--space-6)" }}>
        {error ? (
          <Alert tone="danger">{error}</Alert>
        ) : loading ? (
          <div className="grid">
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonCard key={i} lines={2} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={CalendarIcon} title="Nothing here" description="There are no appointments in this view." />
        ) : (
          <div className="grid">
            {filtered.map((a) => (
              <AppointmentCard key={a.id} appointment={a} onStatusChange={handleStatusChange} onMessage={handleMessage} />
            ))}
          </div>
        )}
      </div>

      {chatPeer && (
        <Modal title={`Message ${chatPeer.name}`} onClose={() => setChatPeer(null)} className="modal-chat">
          <ChatWindow peerId={chatPeer.id} peerName={chatPeer.name} hideHeader />
        </Modal>
      )}
    </>
  );
}
