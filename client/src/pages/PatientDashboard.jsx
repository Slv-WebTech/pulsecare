import { useEffect, useState } from "react";
import { api } from "../services/api.js";
import DoctorCard from "../components/Doctor/DoctorCard.jsx";
import DoctorSearchFilters from "../components/Doctor/DoctorSearchFilters.jsx";
import BookingModal from "../components/Appointment/BookingModal.jsx";
import AppointmentCard from "../components/Appointment/AppointmentCard.jsx";
import DocumentUpload from "../components/Document/DocumentUpload.jsx";
import DocumentCard from "../components/Document/DocumentCard.jsx";
import ChatWindow from "../components/Chat/ChatWindow.jsx";
import { PageHeader } from "../components/ui/PageHeader.jsx";
import { Tabs, TabPanel } from "../components/ui/Tabs.jsx";
import { EmptyState } from "../components/ui/EmptyState.jsx";
import { SkeletonCard } from "../components/ui/Skeleton.jsx";
import { Modal } from "../components/ui/Modal.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { SearchIcon, CalendarIcon, FileTextIcon } from "../components/ui/icons.jsx";

export default function PatientDashboard() {
  const { user } = useAuth();
  const [doctors, setDoctors] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [bookingDoctor, setBookingDoctor] = useState(null);
  const [chatPeer, setChatPeer] = useState(null);
  const [activeTab, setActiveTab] = useState("doctors");
  const [loading, setLoading] = useState({ doctors: true, appointments: true, documents: true });

  useEffect(() => {
    searchDoctors({});
    api.get("/appointments").then(({ data }) => {
      setAppointments(data.appointments);
      setLoading((prev) => ({ ...prev, appointments: false }));
    });
    api.get("/documents").then(({ data }) => {
      setDocuments(data.documents);
      setLoading((prev) => ({ ...prev, documents: false }));
    });
  }, []);

  async function searchDoctors(filters) {
    setLoading((prev) => ({ ...prev, doctors: true }));
    const { data } = await api.get("/doctors", { params: filters });
    setDoctors(data.doctors);
    setLoading((prev) => ({ ...prev, doctors: false }));
  }

  function handleBooked(appointment) {
    setAppointments((prev) => [appointment, ...prev]);
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
        title={`Welcome back, ${user?.name?.split(" ")[0] || "there"}`}
        subtitle="Find care, manage appointments, and keep your records in one place."
      />

      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

      <div style={{ marginTop: "var(--space-6)" }}>
        <TabPanel tabKey="doctors" active={activeTab}>
          <div className="section">
            <DoctorSearchFilters onSearch={searchDoctors} />
            {loading.doctors ? (
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
          </div>
        </TabPanel>

        <TabPanel tabKey="appointments" active={activeTab}>
          <div className="section">
            {loading.appointments ? (
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
                  <AppointmentCard key={a.id} appointment={a} onMessage={handleMessage} />
                ))}
              </div>
            )}
          </div>
        </TabPanel>

        <TabPanel tabKey="documents" active={activeTab}>
          <div className="section">
            <DocumentUpload onUploaded={handleDocumentUploaded} />
            {loading.documents ? (
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

      {chatPeer && (
        <Modal title={`Message ${chatPeer.name}`} onClose={() => setChatPeer(null)} className="modal-chat">
          <ChatWindow peerId={chatPeer.id} peerName={chatPeer.name} hideHeader />
        </Modal>
      )}
    </>
  );
}
