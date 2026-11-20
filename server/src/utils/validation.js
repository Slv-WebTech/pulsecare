// Pure helpers (no DB / network) so they can be unit-tested directly.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

export function isValidEmail(email) {
  return EMAIL_RE.test(email) && email.length <= 255;
}

// Minimum bar; bcrypt only uses the first 72 bytes, so cap there.
export function passwordError(password) {
  if (typeof password !== "string" || password.length < 8) {
    return "Password must be at least 8 characters";
  }
  if (Buffer.byteLength(password) > 72) {
    return "Password must be at most 72 bytes";
  }
  return null;
}

// Files are only ever stored on Cloudinary, so any shared file URL must point there.
// Prevents using chat as a vector for arbitrary/tracking/malicious links.
export function isAllowedFileUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === "res.cloudinary.com";
  } catch {
    return false;
  }
}

// Who may move an appointment to which status. Patients can only cancel;
// the doctor (or an admin) drives confirm/complete/cancel.
export function canSetStatus(role, status) {
  if (role === "admin" || role === "doctor") {
    return ["scheduled", "confirmed", "completed", "cancelled"].includes(status);
  }
  if (role === "patient") return status === "cancelled";
  return false;
}

// Appointment lifecycle. completed/cancelled are terminal.
const TRANSITIONS = {
  scheduled: ["confirmed", "cancelled"],
  confirmed: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};
export function canTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}
export function canReschedule(status) {
  return status === "scheduled" || status === "confirmed";
}

// Positive integer id from a path/body value, or null. Stops "abc" reaching Postgres (-> 500).
export function toId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n < 2 ** 31 ? n : null;
}

// limit/offset from a query string with a hard cap, so list endpoints can't be asked for everything.
export function parsePaging(query, { defaultLimit = 100, maxLimit = 500 } = {}) {
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || defaultLimit, 1), maxLimit);
  const offset = Math.max(parseInt(query.offset, 10) || 0, 0);
  return { limit, offset };
}
