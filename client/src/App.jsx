import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import Navbar from "./components/Layout/Navbar.jsx";
import ProtectedRoute from "./components/Layout/ProtectedRoute.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import PatientDashboard from "./pages/PatientDashboard.jsx";
import DoctorDashboard from "./pages/DoctorDashboard.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";
import NotFound from "./pages/NotFound.jsx";
import { useAuth } from "./context/AuthContext.jsx";
import { useEffect } from "react";
import { onSocketEvent } from "./services/socket.js";
import { useToast } from "./components/ui/ToastContext.jsx";

function Landing() {
  const { user } = useAuth();
  return <Navigate to={user ? `/${user.role}` : "/login"} replace />;
}

const BARE_ROUTES = ["/login", "/register"];

export default function App() {
  const { pathname } = useLocation();
  const isBare = BARE_ROUTES.includes(pathname);
  const { user } = useAuth();
  const toast = useToast();

  // In-app appointment reminders pushed by the server (24h before the visit).
  useEffect(() => {
    if (!user) return undefined;
    return onSocketEvent("reminder:due", ({ startsAt, with: other }) => {
      const when = new Date(startsAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
      toast.info(`Reminder: appointment with ${other} on ${when}`, 10000);
    });
  }, [user, toast]);

  const routes = (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="/patient"
        element={
          <ProtectedRoute roles={["patient"]}>
            <PatientDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/doctor"
        element={
          <ProtectedRoute roles={["doctor"]}>
            <DoctorDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute roles={["admin"]}>
            <AdminDashboard />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );

  if (isBare) {
    return <div className="app-shell"><a href="#main" className="skip-link">Skip to content</a><div id="main" tabIndex={-1}>{routes}</div></div>;
  }

  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Navbar />
      <main id="main" tabIndex={-1} className="app-main full-bleed-page">
        {routes}
      </main>
    </div>
  );
}
