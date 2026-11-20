// Live API integration tests. They need a running server + Postgres, so they are skipped
// unless E2E_API is set. Start the server for the run with the stub endpoints below:
//
//   PORT=5081 CLIENT_ORIGIN=http://localhost:5183 DATABASE_URL=postgres://... JWT_SECRET=x \
//   AI_SERVICE_TOKEN=qa-ai-token AUTH_RATE_LIMIT=60 NODE_ENV=test \
//   CLOUDINARY_CLOUD_NAME=demo CLOUDINARY_API_KEY=k CLOUDINARY_API_SECRET=s \
//   (first: node tests/integration/make-cert.mjs)
//   NODE_EXTRA_CA_CERTS=tests/integration/certs/stub-cert.pem CLOUDINARY_UPLOAD_PREFIX=https://127.0.0.1:5098 AI_SERVICE_URL=http://127.0.0.1:5097 node index.js
//
//   E2E_API=http://localhost:5081 DATABASE_URL=postgres://... E2E_STUBS=1 \
//   node --test tests/integration/api.live.test.js
//
// With E2E_STUBS=1 the test process itself serves fake Cloudinary (:5098) and ai-service (:5097)
// endpoints, so document upload, signed delivery, the summarizer and the assistant are covered
// without Cloudinary credentials or Ollama. Users created here are prefixed qa_.
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import pg from "pg";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { startStubs } from "./stubs.js";

// Fresh random password per run: no fixed credentials live in the repo.
const PW = `Aa1!${crypto.randomBytes(12).toString("base64url")}`;

const BASE = process.env.E2E_API;
const skip = !BASE;
const stubsOn = !!process.env.E2E_STUBS;
const skipStubs = skip || !stubsOn;
const API = `${BASE}/api`;
const ORIGIN = process.env.E2E_ORIGIN || "http://localhost:5183";
const stamp = Date.now();

const call = async (method, path, { token, body, headers = {}, raw, cookie } = {}) => {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(raw === undefined && !(body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    body: raw !== undefined ? raw : body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, json, headers: res.headers };
};

// A local-clock time `days` ahead -> {startsAt, endsAt}. The server and this test share a machine
// and therefore a default timezone, so local wall-clock hours line up with the doctors' windows.
const slot = (days, hour, minute = 0, minutes = 30) => {
  const s = new Date();
  s.setDate(s.getDate() + days);
  s.setHours(hour, minute, 0, 0);
  return { startsAt: s.toISOString(), endsAt: new Date(s.getTime() + minutes * 60000).toISOString() };
};
const localYmd = (days) => {
  const s = new Date();
  s.setDate(s.getDate() + days);
  return `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, "0")}-${String(s.getDate()).padStart(2, "0")}`;
};

let pool, stubs, patientA, patientB, patientC, doctor1, doctor2, admin;
const cookieOf = (headers) => (headers.get("set-cookie") || "").split(";")[0];

async function register(name, role) {
  const email = `qa_${role}_${name}_${stamp}@test.com`;
  const r = await call("POST", "/auth/register", { body: { name, email, password: PW, role } });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return { ...r.json.user, token: r.json.token, email, cookie: cookieOf(r.headers) };
}

test("setup", { skip }, async () => {
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  if (stubsOn) stubs = await startStubs();
  patientA = await register("A", "patient");
  patientB = await register("B", "patient");
  patientC = await register("C", "patient");
  doctor1 = await register("D1", "doctor");
  doctor2 = await register("D2", "doctor");
  for (const d of [doctor1, doctor2]) {
    const r = await call("PUT", "/doctors/profile", {
      token: d.token,
      body: { specialization: "Cardiologist", location: "Pune", fee: 300, experienceYears: 5, languages: ["English"], bio: "b" },
    });
    assert.equal(r.status, 201);
    d.profileId = r.json.profile.id;
    await pool.query(
      `INSERT INTO doctor_availability(doctor_id,day_of_week,start_time,end_time,slot_minutes)
       SELECT $1, g, '09:00', '17:00', 30 FROM generate_series(0,6) g`,
      [d.profileId]
    );
  }
  const email = `qa_admin_${stamp}@test.com`;
  await pool.query("INSERT INTO users(name,email,password_hash,role) VALUES ('QA Admin',$1,$2,'admin')", [email, await bcrypt.hash(PW, 4)]);
  const l = await call("POST", "/auth/login", { body: { email, password: PW } });
  assert.equal(l.status, 200);
  admin = { ...l.json.user, token: l.json.token };
});

test("every protected endpoint rejects anonymous callers (401)", { skip }, async () => {
  const eps = [
    ["GET", "/auth/me"], ["PUT", "/doctors/profile"], ["POST", "/appointments"], ["GET", "/appointments"],
    ["PATCH", "/appointments/1/status"], ["PATCH", "/appointments/1/reschedule"],
    ["POST", "/documents"], ["GET", "/documents"], ["POST", "/documents/1/summarize"], ["GET", "/documents/1/file"],
    ["GET", "/documents/patient/1"], ["GET", "/chat/1"], ["PATCH", "/chat/1/read"],
    ["GET", "/admin/stats"], ["GET", "/admin/audit"], ["POST", "/assistant/query"],
  ];
  for (const [m, p] of eps) {
    const r = await call(m, p);
    assert.equal(r.status, 401, `${m} ${p} should be 401, got ${r.status}`);
  }
});

test("role gates: admin/doctor/patient-only routes", { skip }, async () => {
  assert.equal((await call("GET", "/admin/stats", { token: patientA.token })).status, 403);
  assert.equal((await call("GET", "/admin/audit", { token: doctor1.token })).status, 403);
  assert.equal((await call("PUT", "/doctors/profile", { token: patientA.token, body: {} })).status, 403);
  assert.equal((await call("GET", `/documents/patient/${patientA.id}`, { token: patientB.token })).status, 403);
  const { startsAt, endsAt } = slot(20, 10);
  assert.equal((await call("POST", "/appointments", { token: doctor1.token, body: { doctorId: doctor1.profileId, startsAt, endsAt } })).status, 403);
});

test("token tampering is rejected", { skip }, async () => {
  const [h, , s] = patientA.token.split(".");
  const forgedPayload = Buffer.from(JSON.stringify({ id: patientA.id, role: "admin" })).toString("base64url");
  assert.equal((await call("GET", "/admin/stats", { token: `${h}.${forgedPayload}.${s}` })).status, 401);
  const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString("base64url")}.${forgedPayload}.`;
  assert.equal((await call("GET", "/admin/stats", { token: none })).status, 401);
  assert.equal((await call("GET", "/auth/me", { token: "garbage" })).status, 401);
});

test("session: httpOnly refresh cookie, rotation, reuse detection, logout, origin check", { skip }, async () => {
  const l = await call("POST", "/auth/login", { body: { email: patientC.email, password: PW } });
  const setCookie = l.headers.get("set-cookie");
  assert.match(setCookie, /rt=/);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Lax/i);
  assert.match(setCookie, /Path=\/api\/auth/);
  const c1 = cookieOf(l.headers);
  // access token is short-lived (default 15m)
  const payload = JSON.parse(Buffer.from(l.json.token.split(".")[1], "base64url"));
  assert.ok(payload.exp - payload.iat <= 3600, "access token should be short-lived");

  const r1 = await call("POST", "/auth/refresh", { cookie: c1, headers: { Origin: ORIGIN } });
  assert.equal(r1.status, 200);
  assert.ok(r1.json.token && r1.json.user.id === patientC.id);
  const c2 = cookieOf(r1.headers);
  assert.notEqual(c1, c2, "refresh token must rotate");
  assert.equal((await call("GET", "/auth/me", { token: r1.json.token })).status, 200);

  // wrong origin cannot use the cookie
  assert.equal((await call("POST", "/auth/refresh", { cookie: c2, headers: { Origin: "http://evil.example" } })).status, 403);
  // no cookie
  assert.equal((await call("POST", "/auth/refresh", { headers: { Origin: ORIGIN } })).status, 401);
  // a replay right after rotation is a benign race (two tabs): soft 409, session stays alive
  const race = await call("POST", "/auth/refresh", { cookie: c1, headers: { Origin: ORIGIN } });
  assert.equal(race.status, 409);
  assert.equal(race.json.code, "rotated");
  const c2b = await call("POST", "/auth/refresh", { cookie: c2, headers: { Origin: ORIGIN } });
  assert.equal(c2b.status, 200, "a benign race must not kill the session");
  const c2next = cookieOf(c2b.headers);
  // replaying a token that was rotated long ago is treated as theft: it fails AND revokes the live one
  await pool.query("UPDATE refresh_tokens SET revoked_at = now() - interval '1 minute' WHERE token_hash = encode(sha256($1::bytea), 'hex')", [c1.split("=")[1]]);
  assert.equal((await call("POST", "/auth/refresh", { cookie: c1, headers: { Origin: ORIGIN } })).status, 401);
  assert.equal((await call("POST", "/auth/refresh", { cookie: c2next, headers: { Origin: ORIGIN } })).status, 401, "reuse must revoke the family");

  // logout revokes
  const l2 = await call("POST", "/auth/login", { body: { email: patientC.email, password: PW } });
  const c3 = cookieOf(l2.headers);
  assert.equal((await call("POST", "/auth/logout", { cookie: c3, headers: { Origin: ORIGIN } })).status, 204);
  assert.equal((await call("POST", "/auth/refresh", { cookie: c3, headers: { Origin: ORIGIN } })).status, 401);
  // refresh tokens are stored hashed, never raw
  const raw = c3.split("=")[1];
  const leak = await pool.query("SELECT 1 FROM refresh_tokens WHERE token_hash = $1", [raw]);
  assert.equal(leak.rowCount, 0);
});

test("registration validation and privilege escalation", { skip }, async () => {
  const bad = (body) => call("POST", "/auth/register", { body });
  assert.equal((await bad({ name: "x", email: "nope", password: PW })).status, 400);
  assert.equal((await bad({ name: "x", email: `qa_s_${stamp}@t.com`, password: "short" })).status, 400);
  assert.equal((await bad({ name: "x", email: `qa_r_${stamp}@t.com`, password: PW, role: "admin" })).status, 400);
  assert.equal((await bad({ email: `qa_n_${stamp}@t.com`, password: PW })).status, 400);
  const dup = await bad({ name: "x", email: patientA.email.toUpperCase(), password: PW });
  assert.equal(dup.status, 409, "case-variant email must collide");
  const me = await call("GET", "/auth/me", { token: patientA.token });
  assert.ok(!JSON.stringify(me.json).includes("password"));
});

test("malformed / oversized bodies fail safely", { skip }, async () => {
  const bad = await call("POST", "/auth/login", { raw: "{not json" });
  assert.equal(bad.status, 400);
  assert.ok(!JSON.stringify(bad.json ?? {}).includes("at "), "no stack trace in error body");
  const big = await call("POST", "/auth/login", { raw: JSON.stringify({ email: "a@b.co", password: "x".repeat(200_000) }), headers: { "Content-Type": "application/json" } });
  assert.equal(big.status, 413);
});

test("SQL injection attempts do not break or leak", { skip }, async () => {
  const inj = encodeURIComponent("' OR 1=1; DROP TABLE users;--");
  const r = await call("GET", `/doctors?specialization=${inj}&location=${inj}&language=${inj}`);
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.doctors, []);
  const login = await call("POST", "/auth/login", { body: { email: "' OR '1'='1", password: "x" } });
  assert.equal(login.status, 401);
  const stillThere = await pool.query("SELECT count(*) FROM users");
  assert.ok(Number(stillThere.rows[0].count) >= 4);
  assert.equal((await call("GET", "/doctors?maxFee=abc")).status, 200, "non-numeric maxFee must not 500");
});

test("security headers (incl. CSP) and no fingerprinting", { skip }, async () => {
  const r = await call("GET", "/doctors");
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  assert.equal(r.headers.get("x-frame-options"), "DENY");
  assert.match(r.headers.get("content-security-policy"), /default-src 'none'/);
  assert.equal(r.headers.get("x-powered-by"), null);
  const cors = await fetch(`${API}/doctors`, { headers: { Origin: "http://evil.example" } });
  assert.notEqual(cors.headers.get("access-control-allow-origin"), "http://evil.example");
});

test("slots endpoint: free slots only, excludes booked, validates input, honours doctor timezone", { skip }, async () => {
  const day = localYmd(15);
  const before = await call("GET", `/doctors/${doctor1.profileId}/slots?date=${day}`);
  assert.equal(before.status, 200);
  assert.equal(before.json.slots.length, 16); // 09:00-17:00 / 30 min
  const target = slot(15, 11);
  assert.equal((await call("POST", "/appointments", { token: patientA.token, body: { doctorId: doctor1.profileId, ...target } })).status, 201);
  const after = await call("GET", `/doctors/${doctor1.profileId}/slots?date=${day}`);
  assert.equal(after.json.slots.length, 15);
  assert.ok(!after.json.slots.some((s) => new Date(s.startsAt).getTime() === new Date(target.startsAt).getTime()));
  assert.equal((await call("GET", `/doctors/${doctor1.profileId}/slots?date=nope`)).status, 400);
  assert.equal((await call("GET", `/doctors/999999/slots?date=${day}`)).status, 404);
  assert.equal((await call("GET", `/doctors/abc/slots?date=${day}`)).status, 404);

  // a doctor in another timezone gets their own wall-clock windows
  const bad = await call("PUT", "/doctors/profile", { token: doctor2.token, body: { specialization: "x", location: "y", fee: 1, experienceYears: 1, timezone: "Mars/Base" } });
  assert.equal(bad.status, 400);
  const ok = await call("PUT", "/doctors/profile", { token: doctor2.token, body: { specialization: "Cardiologist", location: "Pune", fee: 300, experienceYears: 5, timezone: "Pacific/Auckland" } });
  assert.equal(ok.status, 201);
  const nz = await call("GET", `/doctors/${doctor2.profileId}/slots?date=${day}`);
  assert.equal(nz.json.timezone, "Pacific/Auckland");
  const first = new Date(nz.json.slots[0].startsAt);
  const nzHour = new Intl.DateTimeFormat("en-GB", { timeZone: "Pacific/Auckland", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(first);
  assert.equal(nzHour, "09:00");
  // restore so later tests keep using the default timezone
  await call("PUT", "/doctors/profile", { token: doctor2.token, body: { specialization: "Cardiologist", location: "Pune", fee: 300, experienceYears: 5, timezone: null } });
  await pool.query("UPDATE doctor_profiles SET timezone = NULL WHERE id = $1", [doctor2.profileId]);
});

test("booking: happy path, double booking, availability, slot alignment", { skip }, async () => {
  const a = slot(20, 10);
  const ok = await call("POST", "/appointments", { token: patientA.token, body: { doctorId: doctor1.profileId, ...a } });
  assert.equal(ok.status, 201, JSON.stringify(ok.json));
  const apptId = ok.json.appointment.id;

  assert.equal((await call("POST", "/appointments", { token: patientB.token, body: { doctorId: doctor1.profileId, ...a } })).status, 409);
  // misaligned (10:15) and wrong-length (60 min) requests are not offered slots -> 400
  assert.equal((await call("POST", "/appointments", { token: patientB.token, body: { doctorId: doctor1.profileId, ...slot(20, 10, 15) } })).status, 400);
  assert.equal((await call("POST", "/appointments", { token: patientB.token, body: { doctorId: doctor1.profileId, ...slot(20, 10, 0, 60) } })).status, 400);
  // the DB itself still refuses overlapping rows (defence in depth behind the controller check)
  await assert.rejects(
    pool.query("INSERT INTO appointments(patient_id,doctor_id,starts_at,ends_at) VALUES ($1,$2,$3,$4)", [patientB.id, doctor1.profileId, slot(20, 10, 15).startsAt, slot(20, 10, 45).endsAt]),
    /no_double_booking/
  );
  assert.equal((await call("POST", "/appointments", { token: patientB.token, body: { doctorId: doctor2.profileId, ...a } })).status, 201);
  assert.equal((await call("POST", "/appointments", { token: patientA.token, body: { doctorId: doctor1.profileId, ...slot(20, 22) } })).status, 400);
  assert.equal((await call("POST", "/appointments", { token: patientA.token, body: { doctorId: doctor1.profileId, ...slot(-2, 10) } })).status, 400);
  assert.equal((await call("POST", "/appointments", { token: patientA.token, body: { doctorId: doctor1.profileId, startsAt: a.endsAt, endsAt: a.startsAt } })).status, 400);
  assert.equal((await call("POST", "/appointments", { token: patientA.token, body: { doctorId: doctor1.profileId, startsAt: "x", endsAt: "y" } })).status, 400);
  assert.equal((await call("POST", "/appointments", { token: patientA.token, body: { doctorId: 999999, ...slot(21, 10) } })).status, 404);
  const weird = await call("POST", "/appointments", { token: patientA.token, body: { doctorId: "abc", ...slot(21, 10) } });
  assert.ok(weird.status >= 400 && weird.status < 500, `doctorId "abc" -> ${weird.status}`);

  assert.equal((await call("PATCH", `/appointments/${apptId}/status`, { token: patientA.token, body: { status: "cancelled" } })).status, 200);
  assert.equal((await call("POST", "/appointments", { token: patientB.token, body: { doctorId: doctor1.profileId, ...a } })).status, 201, "cancelled slot must be bookable again");
});

test("appointment status/reschedule: roles, IDOR, terminal states", { skip }, async () => {
  const s = slot(22, 11);
  const appt = (await call("POST", "/appointments", { token: patientA.token, body: { doctorId: doctor1.profileId, ...s } })).json.appointment;
  const id = appt.id;
  for (const who of [patientB, doctor2]) {
    assert.equal((await call("PATCH", `/appointments/${id}/status`, { token: who.token, body: { status: "cancelled" } })).status, 403);
    assert.equal((await call("PATCH", `/appointments/${id}/reschedule`, { token: who.token, body: slot(23, 11) })).status, 403);
  }
  assert.equal((await call("PATCH", "/appointments/999999/status", { token: patientA.token, body: { status: "cancelled" } })).status, 404);
  assert.equal((await call("PATCH", `/appointments/${id}/status`, { token: patientA.token, body: { status: "confirmed" } })).status, 403);
  assert.equal((await call("PATCH", `/appointments/${id}/status`, { token: doctor1.token, body: { status: "bogus" } })).status, 400);
  assert.equal((await call("PATCH", "/appointments/abc/status", { token: doctor1.token, body: { status: "cancelled" } })).status, 404);
  assert.equal((await call("PATCH", `/appointments/${id}/status`, { token: doctor1.token, body: { status: "completed" } })).status, 409);
  assert.equal((await call("PATCH", `/appointments/${id}/status`, { token: doctor1.token, body: { status: "confirmed" } })).status, 200);
  assert.equal((await call("PATCH", `/appointments/${id}/status`, { token: doctor1.token, body: { status: "completed" } })).status, 200);
  assert.ok((await call("PATCH", `/appointments/${id}/reschedule`, { token: patientA.token, body: slot(23, 11) })).status >= 400);
  assert.ok((await call("PATCH", `/appointments/${id}/status`, { token: doctor1.token, body: { status: "scheduled" } })).status >= 400);
});

test("concurrent bookings of the same slot: exactly one wins", { skip }, async () => {
  const same = slot(30, 14);
  const results = await Promise.all(
    [patientA, patientB, patientA, patientB, patientA, patientB].map((p) =>
      call("POST", "/appointments", { token: p.token, body: { doctorId: doctor1.profileId, ...same } })
    )
  );
  assert.equal(results.filter((r) => r.status === 201).length, 1, `got ${results.map((r) => r.status)}`);
  assert.ok(results.every((r) => r.status === 201 || r.status === 409), `no 500s: ${results.map((r) => r.status)}`);
});

test("reschedule cannot collide with another booking", { skip }, async () => {
  const a = (await call("POST", "/appointments", { token: patientA.token, body: { doctorId: doctor1.profileId, ...slot(24, 9) } })).json.appointment;
  await call("POST", "/appointments", { token: patientB.token, body: { doctorId: doctor1.profileId, ...slot(24, 10) } });
  assert.equal((await call("PATCH", `/appointments/${a.id}/reschedule`, { token: patientA.token, body: slot(24, 10) })).status, 409);
  assert.equal((await call("PATCH", `/appointments/${a.id}/reschedule`, { token: patientA.token, body: slot(24, 12) })).status, 200);
});

test("booking limit per patient", { skip }, async () => {
  let last;
  for (let i = 0; i < 12; i++) {
    last = await call("POST", "/appointments", { token: patientC.token || (await call("POST", "/auth/login", { body: { email: patientC.email, password: PW } })).json.token, body: { doctorId: doctor2.profileId, ...slot(40 + i, 9) } });
    if (last.status === 409) break;
  }
  assert.equal(last.status, 409);
  assert.match(last.json.error, /at most \d+ upcoming/);
});

test("reminders: created on booking, delivered once, skipped when cancelled", { skip }, async () => {
  const { deliverDueReminders } = await import("../../src/jobs/reminders.js");
  const mine = (await call("POST", "/appointments", { token: patientB.token, body: { doctorId: doctor1.profileId, ...slot(50, 9) } })).json.appointment;
  const cancelled = (await call("POST", "/appointments", { token: patientB.token, body: { doctorId: doctor1.profileId, ...slot(50, 10) } })).json.appointment;
  await call("PATCH", `/appointments/${cancelled.id}/status`, { token: patientB.token, body: { status: "cancelled" } });
  assert.equal((await pool.query("SELECT count(*)::int n FROM reminders WHERE appointment_id = $1", [mine.id])).rows[0].n, 1);
  assert.equal((await pool.query("SELECT sent FROM reminders WHERE appointment_id = $1", [mine.id])).rows[0].sent, false);
  await pool.query("UPDATE reminders SET send_at = now() - interval '1 minute' WHERE appointment_id = ANY($1)", [[mine.id, cancelled.id]]);

  const emitted = [];
  const fakeIo = { to: (room) => ({ emit: (ev, p) => emitted.push({ room, ev, p }) }) };
  const n = await deliverDueReminders(fakeIo);
  assert.ok(n >= 1);
  assert.ok(emitted.some((e) => e.room === `user:${patientB.id}` && e.ev === "reminder:due" && e.p.appointmentId === mine.id));
  assert.ok(emitted.some((e) => e.room === `user:${doctor1.id}` && e.p.appointmentId === mine.id));
  assert.ok(!emitted.some((e) => e.p.appointmentId === cancelled.id), "cancelled appointment must not be reminded");
  assert.equal((await pool.query("SELECT sent FROM reminders WHERE appointment_id = $1", [mine.id])).rows[0].sent, true);
  const again = [];
  await deliverDueReminders({ to: () => ({ emit: (...a) => again.push(a) }) });
  assert.equal(again.length, 0, "a reminder is delivered only once");
});

test("appointment lists are isolated per user", { skip }, async () => {
  const mine = await call("GET", "/appointments", { token: patientB.token });
  assert.ok(mine.json.appointments.every((x) => x.patient_id === patientB.id));
  const docList = await call("GET", "/appointments", { token: doctor2.token });
  assert.ok(docList.json.appointments.every((x) => x.doctor_user_id === doctor2.id));
});

test("chat: only care-relationship pairs; participants only see their thread", { skip }, async () => {
  assert.equal((await call("GET", `/chat/${doctor1.id}`, { token: patientA.token })).status, 200);
  assert.equal((await call("GET", `/chat/${patientB.id}`, { token: patientA.token })).status, 403);
  assert.equal((await call("GET", "/chat/abc", { token: patientA.token })).status, 400);
  const m = await pool.query("INSERT INTO messages(sender_id,recipient_id,body) VALUES ($1,$2,'hi') RETURNING id", [doctor1.id, patientA.id]);
  assert.equal((await call("PATCH", `/chat/${m.rows[0].id}/read`, { token: patientB.token })).status, 404);
  assert.equal((await call("PATCH", `/chat/${m.rows[0].id}/read`, { token: patientA.token })).status, 200);
});

test("documents: stubbed Cloudinary upload, signed delivery, isolation, doctor access", { skip: skipStubs }, async () => {
  const appt = (await pool.query("SELECT id FROM appointments WHERE patient_id=$1 AND doctor_id=$2 AND status <> 'cancelled' LIMIT 1", [patientA.id, doctor1.profileId])).rows[0];
  const upload = async (token, name, extra = {}) => {
    const fd = new FormData();
    fd.set("file", new Blob(["%PDF-1.4 test"], { type: "application/pdf" }), name);
    for (const [k, v] of Object.entries(extra)) fd.set(k, v);
    return call("POST", "/documents", { token, body: fd });
  };
  const up = await upload(patientA.token, "shared.pdf", { appointmentId: appt.id });
  assert.equal(up.status, 201, JSON.stringify(up.json));
  assert.ok(!("file_url" in up.json.document) && !("public_id" in up.json.document), "storage details must not leak");
  assert.equal(stubs.uploads.at(-1).type, "authenticated", "must upload as an authenticated asset");
  const priv = await upload(patientA.token, "private.pdf");
  assert.equal(priv.status, 201);

  // validation: bad type, oversize, attach to someone else's appointment, no file
  const fdBad = new FormData();
  fdBad.set("file", new Blob(["x"], { type: "text/plain" }), "x.txt");
  assert.equal((await call("POST", "/documents", { token: patientA.token, body: fdBad })).status, 400);
  const big = new FormData();
  big.set("file", new Blob([new Uint8Array(11 * 1024 * 1024)], { type: "application/pdf" }), "big.pdf");
  assert.equal((await call("POST", "/documents", { token: patientA.token, body: big })).status, 400);
  assert.equal((await upload(patientB.token, "steal.pdf", { appointmentId: appt.id })).status, 403);
  assert.equal((await call("POST", "/documents", { token: patientA.token, body: new FormData() })).status, 400);

  const own = await call("GET", "/documents", { token: patientA.token });
  assert.ok(own.json.documents.length >= 2);
  assert.ok(own.json.documents.every((d) => !("file_url" in d)));
  assert.equal((await call("GET", "/documents", { token: patientB.token })).json.documents.length, 0);
  const docId = up.json.document.id;
  const sharedId = docId, privateId = priv.json.document.id;

  // signed file URLs: owner yes; attached-to-appointment doctor yes; others get 404
  const f = await call("GET", `/documents/${sharedId}/file`, { token: patientA.token });
  assert.equal(f.status, 200);
  assert.match(f.json.url, /^https:\/\/res\.cloudinary\.com\/demo\/raw\/authenticated\/s--[\w-]+--\//, "must be a signed authenticated URL");
  assert.equal((await call("GET", `/documents/${sharedId}/file`, { token: doctor1.token })).status, 200);
  assert.equal((await call("GET", `/documents/${privateId}/file`, { token: doctor1.token })).status, 404, "unattached doc is not visible to the doctor");
  assert.equal((await call("GET", `/documents/${sharedId}/file`, { token: doctor2.token })).status, 404);
  assert.equal((await call("GET", `/documents/${sharedId}/file`, { token: patientB.token })).status, 404);
  assert.equal((await call("GET", "/documents/abc/file", { token: patientA.token })).status, 404);

  const docView = await call("GET", `/documents/patient/${patientA.id}`, { token: doctor1.token });
  assert.deepEqual(docView.json.documents.map((d) => d.original_name), ["shared.pdf"]);
  assert.equal((await call("GET", `/documents/patient/${patientA.id}`, { token: doctor2.token })).status, 403);

  // summarizer (stubbed ai-service): other patient 404, owner gets stored summary, token + signed URL are sent
  assert.equal((await call("POST", `/documents/${sharedId}/summarize`, { token: patientB.token })).status, 404);
  const sum = await call("POST", `/documents/${sharedId}/summarize`, { token: patientA.token });
  assert.equal(sum.status, 200, JSON.stringify(sum.json));
  assert.equal(sum.json.document.ai_summary.documentType, "Lab Report");
  const seen = stubs.aiCalls.at(-1);
  assert.equal(seen.auth, `Bearer ${process.env.AI_SERVICE_TOKEN || "qa-ai-token"}`);
  assert.match(seen.body.fileUrl, /\/authenticated\/s--/);
  assert.equal(seen.body.fileType, "application/pdf");
  // ai-service failure / garbage -> 502 not 500
  stubs.aiMode = "fail";
  assert.equal((await call("POST", `/documents/${sharedId}/summarize`, { token: patientA.token })).status, 502);
  stubs.aiMode = "ok";

  // audit trail captured the PHI accesses
  const log = await pool.query("SELECT action, user_id FROM audit_log WHERE resource_id = $1 AND resource_type = 'document'", [String(sharedId)]);
  const actions = log.rows.map((r) => `${r.action}:${r.user_id}`);
  assert.ok(actions.includes(`document.upload:${patientA.id}`));
  assert.ok(actions.includes(`document.file_access:${doctor1.id}`));
  assert.ok(actions.includes(`document.summarize:${patientA.id}`));
});

test("legacy documents (no public_id) still resolve; scoping holds", { skip }, async () => {
  const appt = (await pool.query("SELECT id FROM appointments WHERE patient_id=$1 AND doctor_id=$2 AND status <> 'cancelled' LIMIT 1", [patientA.id, doctor1.profileId])).rows[0];
  const ins = await pool.query(
    `INSERT INTO documents(patient_id,appointment_id,file_url,file_type,original_name)
     VALUES ($1,$2,'https://res.cloudinary.com/demo/raw/upload/legacy.pdf','application/pdf','legacy.pdf') RETURNING id`,
    [patientA.id, appt.id]
  );
  const r = await call("GET", `/documents/${ins.rows[0].id}/file`, { token: patientA.token });
  assert.equal(r.status, 200);
  assert.equal(r.json.url, "https://res.cloudinary.com/demo/raw/upload/legacy.pdf");
  assert.equal((await call("POST", "/documents/abc/summarize", { token: patientA.token })).status, 404);
});

test("audit log: admin can read it, others cannot; chat reads and logins are recorded", { skip }, async () => {
  await call("GET", `/chat/${doctor1.id}`, { token: patientA.token });
  const r = await call("GET", "/admin/audit?limit=500", { token: admin.token });
  assert.equal(r.status, 200);
  const actions = new Set(r.json.entries.map((e) => e.action));
  for (const a of ["auth.register", "auth.login", "auth.login_failed", "chat.read"]) assert.ok(actions.has(a), `missing ${a}`);
  assert.ok(r.json.entries.every((e) => !JSON.stringify(e).includes("password")));
  assert.equal((await call("GET", "/admin/audit", { token: patientA.token })).status, 403);
  assert.equal((await call("GET", "/admin/stats", { token: admin.token })).status, 200);
});

test("doctor profile validation", { skip }, async () => {
  const bad = (body) => call("PUT", "/doctors/profile", { token: doctor1.token, body });
  assert.equal((await bad({})).status, 400);
  assert.equal((await bad({ specialization: "x", location: "y", fee: -5, experienceYears: 1 })).status, 400);
  assert.equal((await bad({ specialization: "x", location: "y", fee: 1, experienceYears: 1, languages: "en" })).status, 400);
  assert.equal((await call("GET", "/doctors/abc/availability")).status, 404);
});

test("list endpoints are paginated and do not leak doctor emails", { skip }, async () => {
  const r = await call("GET", "/doctors?limit=1");
  assert.equal(r.json.doctors.length, 1);
  assert.ok(!("email" in r.json.doctors[0]), "doctor email must not be public");
  assert.ok((await call("GET", "/appointments?limit=1", { token: patientA.token })).json.appointments.length <= 1);
});

test("assistant proxy (stubbed ai-service): validation, contract, failure handling", { skip: skipStubs }, async () => {
  assert.equal((await call("POST", "/assistant/query", { token: patientA.token, body: {} })).status, 400);
  assert.equal((await call("POST", "/assistant/query", { token: patientA.token, body: { message: "x".repeat(501) } })).status, 400);
  const r = await call("POST", "/assistant/query", { token: patientA.token, body: { message: "cardiologist in Pune under 500" } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.filters, { specialization: "Cardiologist", location: "Pune", maxFee: 500 });
  assert.equal(stubs.aiCalls.at(-1).body.message, "cardiologist in Pune under 500");
  stubs.aiMode = "fail";
  assert.equal((await call("POST", "/assistant/query", { token: patientA.token, body: { message: "heart doctor" } })).status, 502);
  stubs.aiMode = "ok";
});

test("rate limiting on auth endpoints (run last)", { skip }, async () => {
  let limited = false;
  for (let i = 0; i < 120 && !limited; i++) {
    const r = await call("POST", "/auth/login", { body: { email: "x@y.zz", password: "wrong-password" } });
    if (r.status === 429) limited = true;
  }
  assert.ok(limited, "login was never rate limited");
});

test("teardown", { skip }, async () => {
  await stubs?.close();
  await pool.end();
  const { pool: appPool } = await import("../../src/config/db.js");
  await appPool.end();
});
