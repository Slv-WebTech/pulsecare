import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import AuthLayout from "../components/Layout/AuthLayout.jsx";
import { Field } from "../components/ui/Field.jsx";
import Button from "../components/ui/Button.jsx";
import { Alert } from "../components/ui/Alert.jsx";
import { UserIcon, MailIcon, LockIcon, EyeIcon, EyeOffIcon } from "../components/ui/icons.jsx";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "patient" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const user = await register(form);
      navigate(`/${user.role}`);
    } catch (err) {
      setError(err.response?.data?.error || "Registration failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      headline="Healthcare that moves at your pace."
      subtitle="Create an account to book appointments, track records, and message your care team."
    >
      <div className="auth-heading">
        <h1>Create your account</h1>
        <p>Get started in under a minute.</p>
      </div>
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <Field label="Full name">
          {(id) => (
            <div className="input-shell">
              <span className="icon-leading">
                <UserIcon size={17} />
              </span>
              <input
                id={id}
                type="text"
                className="input"
                name="name"
                placeholder="Jordan Smith"
                autoComplete="name"
                value={form.name}
                onChange={handleChange}
                required
              />
            </div>
          )}
        </Field>
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
                name="email"
                placeholder="you@example.com"
                autoComplete="email"
                value={form.email}
                onChange={handleChange}
                required
              />
            </div>
          )}
        </Field>
        <Field label="Password" hint="Use at least 8 characters.">
          {(id) => (
            <div className="input-shell">
              <span className="icon-leading">
                <LockIcon size={17} />
              </span>
              <input
                id={id}
                type={showPassword ? "text" : "password"}
                className="input"
                name="password"
                placeholder="••••••••"
                autoComplete="new-password"
                minLength={8}
                value={form.password}
                onChange={handleChange}
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
        <Field label="I am a...">
          {() => (
            <div className="segmented" role="group" aria-label="Account type">
              <button
                type="button"
                aria-pressed={form.role === "patient"}
                onClick={() => setForm({ ...form, role: "patient" })}
              >
                Patient
              </button>
              <button
                type="button"
                aria-pressed={form.role === "doctor"}
                onClick={() => setForm({ ...form, role: "doctor" })}
              >
                Doctor
              </button>
            </div>
          )}
        </Field>
        {error && <Alert tone="danger">{error}</Alert>}
        <Button type="submit" variant="primary" size="lg" className="btn-block" loading={submitting}>
          Create account
        </Button>
      </form>
      <p className="auth-switch">
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </AuthLayout>
  );
}
