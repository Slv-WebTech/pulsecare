import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
process.env.JWT_SECRET = "test-secret";
const { requireAuth, requireRole } = await import("../src/middleware/auth.middleware.js");

function run(mw, req) {
  return new Promise((resolve) => {
    const res = { status(c) { this.code = c; return this; }, json(b) { resolve({ code: this.code, body: b }); } };
    mw(req, res, () => resolve({ next: true, req }));
  });
}

test("rejects missing and bad tokens", async () => {
  assert.equal((await run(requireAuth, { headers: {} })).code, 401);
  assert.equal((await run(requireAuth, { headers: { authorization: "Bearer x" } })).code, 401);
});

test("accepts valid token and enforces roles", async () => {
  const token = jwt.sign({ id: 1, role: "patient" }, "test-secret");
  const ok = await run(requireAuth, { headers: { authorization: `Bearer ${token}` } });
  assert.ok(ok.next);
  assert.equal(ok.req.user.id, 1);
  assert.equal((await run(requireRole("doctor"), { user: { role: "patient" } })).code, 403);
  assert.ok((await run(requireRole("patient"), { user: { role: "patient" } })).next);
});
