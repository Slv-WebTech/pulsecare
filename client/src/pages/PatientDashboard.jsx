import { useEffect, useState } from "react";
import { api } from "../services/api.js";
import DoctorCard from "../components/Doctor/DoctorCard.jsx";
import DoctorSearchFilters from "../components/Doctor/DoctorSearchFilters.jsx";
import BookingModal from "../components/Appointment/BookingModal.jsx";
import AppointmentCard from "../components/Appointment/AppointmentCard.jsx";
import DocumentUpload from "../components/Document/DocumentUpload.jsx";
import DocumentCard from "../components/Document/DocumentCard.jsx";
import ChatWindow from "../components/Chat/ChatWindow.jsx";
import AssistantSearch from "../components/Doctor/AssistantSearch.jsx";
import { firstName } from "../utils.js";
import { useToast } from "../components/ui/ToastContext.jsx";
import { PageHeader } from "../components/ui/PageHeader.jsx";
import { Tabs, TabPanel } from "../components/ui/Tabs.jsx";
import { EmptyState } from "../components/ui/EmptyState.jsx";
import { SkeletonCard } from "../components/ui/Skeleton.jsx";
import { Modal } from "../components/ui/Modal.jsx";
import { Alert } from "../components/ui/Alert.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { SearchIcon, CalendarIcon, FileTextIcon } from "../components/ui/icons.jsx";

const PAGE = 24;

export default function PatientDashboard() {
  const { user } = useAuth();
  const toast = useToast();
  const [doctors, setDoctors] = useState([]);
  const [doctorFilters, setDoctorFilters] = useState({});
  const [moreDoctors, setMoreDoctors] = useState(false);
  const [moreAppointments, setMoreAppointments] = useState(false);
  const [reschedulingAppt, setReschedulingAppt] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [bookingDoctor, setBookingDoctor] = useState(null);
  const [chatPeer, setChatPeer] = useState(null);
  const [activeTab, setActiveTab] = useState("doctors");
  const [loading, setLoading] = useState({ doctors: true, appointments: true, documents: true });
  const [errors, setErrors] = useState({ doctors: "", appointments: "", documents: "" });

  useEffect(() => {
    searchDoctors({});

    api
      .get("/appointments", { params: { limit: PAGE } })
      .then(({ data }) => {
        setAppointments(data.appointments);
        setMoreAppointments(data.appointments.length === PAGE);
      })
      .catch(() => setErrors((prev) => ({ ...prev, appointments: "Couldn't load your appointments." })))
      .finally(() => setLoading((prev) => ({ ...prev, appointments: false })));

    api
      .get("/documents")
      .then(({ data }) => setDocuments(data.documents))
      .catch(() => setErrors((prev) => ({ ...prev, documents: "Couldn't load your documents." })))
      .finally(() => setLoading((prev) => ({ ...prev, documents: false })));
  }, []);

  async function searchDoctors(filters, append = false) {
    if (!append) {
      setLoading((prev) => ({ ...prev, doctors: true }));
      setDoctorFilters(filters);
    }
    setErrors((prev) => ({ ...prev, doctors: "" }));
    try {
      const { data } = await api.get("/doctors", {
        params: { ...filters, limit: PAGE, offset: append ? doctors.length : 0 },
      });
      setDoctors((prev) => (append ? [...prev, ...data.doctors] : data.doctors));
      setMoreDoctors(data.doctors.length === PAGE);
    } catch (err) {
      setErrors((prev) => ({ ...prev, doctors: "Couldn't load doctors. Please try again." }));
    } finally {
      setLoading((prev) => ({ ...prev, doctors: false }));
    }
  }

  // The POST/PATCH response is the bare appointment row (no doctor name/specialization), so
  // reload the joined list instead of splicing the partial row into state.
  async function handleBooked() {
    try {
      const { data } = await api.get("/appointments", { params: { limit: PAGE } });
      setAppointments(data.appointments);
      setMoreAppointments(data.appointments.length === PAGE);
    } catch {
      toast.error("Booked, but couldn't refresh your appointments. Reload the page.");
    }
  }

  async function handleCancel(appointment) {
    try {
      const { data } = await api.patch(`/appointments/${appointment.id}/status`, { status: "cancelled" });
      setAppointments((prev) => prev.map((a) => (a.id === appointment.id ? { ...a, ...data.appointment } : a)));
      toast.success("Appointment cancelled");
    } catch (err) {
      toast.error(err.response?.data?.error || "Couldn't cancel the appointment.");
    }
  }

  async function loadMoreAppointments() {
    try {
      const { data } = await api.get("/appointments", { params: { limit: PAGE, offset: appointments.length } });
      setAppointments((prev) => [...prev, ...data.appointments]);
      setMoreAppointments(data.appointments.length === PAGE);
    } catch {
      toast.error("Couldn't load more appointments.");
    }
  }

  function handleDocumentUploaded(document) {
    setDocuments((prev) => [document, ...prev]);
  }

  function handleDocumentSummarized(updated) {
    setDocuments((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
  }

  function handleMessage(appointment) {
    if (!appointment.doctor_user_id) return;
    setChatPeer({ id: appointment.doctor_user_id, name: appointment.doctor_name });
  }

  const tabs = [
    { key: "doctors", label: "Find a doctor" },
    { key: "appointments", label: "My appointments", count: appointments.length },
    { key: "documents", label: "Documents", count: documents.length },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Patient"
        title={`Welcome back, ${firstName(user?.name)}`}
        subtitle="Find care, manage appointments, and keep your records in one place."
      />

      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

      <div style={{ marginTop: "var(--space-6)" }}>
        <TabPanel tabKey="doctors" active={activeTab}>
          <div className="section">
            <AssistantSearch onSearch={searchDoctors} />
            <DoctorSearchFilters onSearch={searchDoctors} />
            {errors.doctors ? (
              <Alert tone="danger">{errors.doctors}</Alert>
            ) : loading.doctors ? (
              <div className="grid">
                {Array.from({ length: 3 }).map((_, i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
            ) : doctors.length === 0 ? (
              <EmptyState
                icon={SearchIcon}
                title="No doctors match those filters"
                description="Try widening your search — a different specialization, location, or fee range."
              />
            ) : (
              <div className="grid">
                {doctors.map((doctor) => (
                  <DoctorCard key={doctor.id} doctor={doctor} onBook={setBookingDoctor} />
                ))}
              </div>
            )}
            {moreDoctors && !loading.doctors && (
              <div className="load-more">
                <button type="button" className="btn btn-secondary" onClick={() => searchDoctors(doctorFilters, true)}>
                  Show more doctors
                </button>
              </div>
            )}
          </div>
        </TabPanel>

        <TabPanel tabKey="appointments" active={activeTab}>
          <div className="section">
            {errors.appointments ? (
              <Alert tone="danger">{errors.appointments}</Alert>
            ) : loading.appointments ? (
              <div className="grid">
                {Array.from({ length: 2 }).map((_, i) => (
                  <SkeletonCard key={i} lines={2} />
                ))}
              </div>
            ) : appointments.length === 0 ? (
              <EmptyState
                icon={CalendarIcon}
                title="No appointments yet"
                description="Book a doctor from the Find a doctor tab to get started."
              />
            ) : (
              <div className="grid">
                {appointments.map((a) => (
                  <AppointmentCard
                    key={a.id}
                    appointment={a}
                    onMessage={handleMessage}
                    onCancel={handleCancel}
                    onReschedule={setReschedulingAppt}
                  />
                ))}
              </div>
            )}
            {moreAppointments && !loading.appointments && (
              <div className="load-more">
                <button type="button" className="btn btn-secondary" onClick={loadMoreAppointments}>
                  Show more appointments
                </button>
              </div>
            )}
          </div>
        </TabPanel>

        <TabPanel tabKey="documents" active={activeTab}>
          <div className="section">
            <DocumentUpload onUploaded={handleDocumentUploaded} appointments={appointments} />
            {errors.documents ? (
              <Alert tone="danger">{errors.documents}</Alert>
            ) : loading.documents ? (
              <div className="grid">
                {Array.from({ length: 2 }).map((_, i) => (
                  <SkeletonCard key={i} lines={2} />
                ))}
              </div>
            ) : documents.length === 0 ? (
              <EmptyState
                icon={FileTextIcon}
                title="No documents uploaded"
                description="Upload labs, prescriptions, or reports to get an AI-generated summary."
              />
            ) : (
              <div className="grid">
                {documents.map((d) => (
                  <DocumentCard key={d.id} document={d} onSummarized={handleDocumentSummarized} />
                ))}
              </div>
            )}
          </div>
        </TabPanel>
      </div>

      {bookingDoctor && (
        <BookingModal doctor={bookingDoctor} onClose={() => setBookingDoctor(null)} onBooked={handleBooked} />
      )}

      {reschedulingAppt && (
        <BookingModal
          appointment={reschedulingAppt}
          onClose={() => setReschedulingAppt(null)}
          onBooked={handleBooked}
        />
      )}

      {chatPeer && (
        <Modal title={`Message ${chatPeer.name}`} onClose={() => setChatPeer(null)} className="modal-chat">
          <ChatWindow peerId={chatPeer.id} peerName={chatPeer.name} hideHeader />
        </Modal>
      )}
    </>
  );
}
