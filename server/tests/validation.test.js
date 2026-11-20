import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeEmail, isValidEmail, passwordError, isAllowedFileUrl, canSetStatus,
} from "../src/utils/validation.js";

test("email normalization and validation", () => {
  assert.equal(normalizeEmail("  A@B.Com "), "a@b.com");
  assert.equal(normalizeEmail(undefined), "");
  assert.ok(isValidEmail("a@b.com"));
  assert.ok(!isValidEmail("nope"));
  assert.ok(!isValidEmail("a b@c.com"));
});

test("password policy", () => {
  assert.ok(passwordError("short"));
  assert.ok(passwordError(12345678));
  assert.ok(passwordError("x".repeat(73)));
  assert.equal(passwordError("longenough"), null);
});

test("file URL allowlist", () => {
  assert.ok(isAllowedFileUrl("https://res.cloudinary.com/demo/image/upload/a.png"));
  assert.ok(!isAllowedFileUrl("http://res.cloudinary.com/a.png"));
  assert.ok(!isAllowedFileUrl("https://evil.com/a.png"));
  assert.ok(!isAllowedFileUrl("https://res.cloudinary.com.evil.com/a.png"));
  assert.ok(!isAllowedFileUrl("javascript:alert(1)"));
  assert.ok(!isAllowedFileUrl("not a url"));
});

test("status permissions by role", () => {
  assert.ok(canSetStatus("patient", "cancelled"));
  assert.ok(!canSetStatus("patient", "confirmed"));
  assert.ok(!canSetStatus("patient", "completed"));
  assert.ok(canSetStatus("doctor", "confirmed"));
  assert.ok(canSetStatus("admin", "completed"));
  assert.ok(!canSetStatus("doctor", "bogus"));
});


import { canTransition, canReschedule, toId } from "../src/utils/validation.js";

test("appointment lifecycle", () => {
  assert.ok(canTransition("scheduled", "confirmed"));
  assert.ok(canTransition("confirmed", "completed"));
  assert.ok(canTransition("scheduled", "cancelled"));
  assert.ok(!canTransition("scheduled", "completed"));
  assert.ok(!canTransition("completed", "scheduled"));
  assert.ok(!canTransition("cancelled", "confirmed"));
  assert.ok(canReschedule("scheduled") && canReschedule("confirmed"));
  assert.ok(!canReschedule("completed") && !canReschedule("cancelled"));
});

test("toId only accepts positive 32-bit integers", () => {
  assert.equal(toId("12"), 12);
  assert.equal(toId(7), 7);
  for (const bad of ["abc", "1.5", "-1", 0, null, undefined, "", 2 ** 40, "1e3x"]) assert.equal(toId(bad), null, String(bad));
});

import { parsePaging } from "../src/utils/validation.js";

test("paging is clamped", () => {
  assert.deepEqual(parsePaging({}), { limit: 100, offset: 0 });
  assert.deepEqual(parsePaging({ limit: "9999", offset: "-5" }), { limit: 500, offset: 0 });
  assert.deepEqual(parsePaging({ limit: "abc", offset: "x" }), { limit: 100, offset: 0 });
  assert.deepEqual(parsePaging({ limit: "10", offset: "20" }), { limit: 10, offset: 20 });
});
