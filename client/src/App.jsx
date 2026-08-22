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

function Landing() {
  const { user } = useAuth();
  return <Navigate to={user ? `/${user.role}` : "/login"} replace />;
}

const BARE_ROUTES = ["/login", "/register"];

export default function App() {
  const { pathname } = useLocation();
  const isBare = BARE_ROUTES.includes(pathname);

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
    return <div className="app-shell">{routes}</div>;
  }

  return (
    <div className="app-shell">
      <Navbar />
      <main className="app-main full-bleed-page">{routes}</main>
    </div>
  );
}
