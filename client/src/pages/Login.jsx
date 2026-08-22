import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import AuthLayout from "../components/Layout/AuthLayout.jsx";
import { Field } from "../components/ui/Field.jsx";
import Button from "../components/ui/Button.jsx";
import { Alert } from "../components/ui/Alert.jsx";
import { MailIcon, LockIcon, EyeIcon, EyeOffIcon } from "../components/ui/icons.jsx";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const user = await login(form.email, form.password);
      navigate(`/${user.role}`);
    } catch (err) {
      setError(err.response?.data?.error || "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      headline="Welcome back to your care."
      subtitle="Log in to view upcoming appointments, records, and messages in one place."
    >
      <div className="auth-heading">
        <h1>Welcome back</h1>
        <p>Log in to manage your appointments and records.</p>
      </div>
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <Field label="Email">
          {(id) => (
            <div className="input-shell">
              <span className="icon-leading">
                <MailIcon size={17} />
              </span>
              <input
                id={id}
                type="email"
                className="input"
                placeholder="you@example.com"
                autoComplete="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>
          )}
        </Field>
        <Field label="Password">
          {(id) => (
            <div className="input-shell">
              <span className="icon-leading">
                <LockIcon size={17} />
              </span>
              <input
                id={id}
                type={showPassword ? "text" : "password"}
                className="input"
                placeholder="••••••••"
                autoComplete="current-password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
              <button
                type="button"
                className="icon-trailing-btn"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOffIcon size={17} /> : <EyeIcon size={17} />}
              </button>
            </div>
          )}
        </Field>
        {error && <Alert tone="danger">{error}</Alert>}
        <Button type="submit" variant="primary" size="lg" className="btn-block" loading={submitting}>
          Log in
        </Button>
      </form>
      <p className="auth-switch">
        Don&apos;t have an account? <Link to="/register">Create one</Link>
      </p>
    </AuthLayout>
  );
}
