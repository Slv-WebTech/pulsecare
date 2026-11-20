import test from "node:test";
import assert from "node:assert/strict";
import { tzOffsetMinutes, localParts, zonedToUtc, fitsAvailability, freeSlots, isValidTimezone, isValidYmd } from "../src/utils/time.js";

const d = (s) => new Date(s);
const MON = { day_of_week: 1, start_time: "09:00:00", end_time: "12:00:00", slot_minutes: 30 };

test("timezone offsets, including DST", () => {
  assert.equal(tzOffsetMinutes(d("2030-01-15T12:00:00Z"), "Asia/Kolkata"), 330);
  assert.equal(tzOffsetMinutes(d("2030-01-15T12:00:00Z"), "America/New_York"), -300);
  assert.equal(tzOffsetMinutes(d("2030-07-15T12:00:00Z"), "America/New_York"), -240);
  assert.equal(tzOffsetMinutes(d("2030-07-15T12:00:00Z"), "UTC"), 0);
});

test("zonedToUtc round-trips and handles DST", () => {
  assert.equal(zonedToUtc("2030-01-07", 9 * 60, "Asia/Kolkata").toISOString(), "2030-01-07T03:30:00.000Z");
  assert.equal(zonedToUtc("2030-01-07", 9 * 60, "America/New_York").toISOString(), "2030-01-07T14:00:00.000Z");
  assert.equal(zonedToUtc("2030-07-08", 9 * 60, "America/New_York").toISOString(), "2030-07-08T13:00:00.000Z");
  const p = localParts(zonedToUtc("2030-03-10", 600, "Europe/London"), "Europe/London");
  assert.deepEqual(p, { ymd: "2030-03-10", dow: 0, minutes: 600 });
});

test("availability: window, alignment, exact slot length, timezone", () => {
  const w = [MON]; // 2030-01-07 is a Monday
  assert.ok(fitsAvailability(d("2030-01-07T09:00:00Z"), d("2030-01-07T09:30:00Z"), w, "UTC"));
  assert.ok(!fitsAvailability(d("2030-01-07T09:15:00Z"), d("2030-01-07T09:45:00Z"), w, "UTC"), "misaligned");
  assert.ok(!fitsAvailability(d("2030-01-07T09:00:00Z"), d("2030-01-07T10:00:00Z"), w, "UTC"), "wrong length");
  assert.ok(!fitsAvailability(d("2030-01-07T11:45:00Z"), d("2030-01-07T12:15:00Z"), w, "UTC"), "past window end");
  assert.ok(!fitsAvailability(d("2030-01-08T09:00:00Z"), d("2030-01-08T09:30:00Z"), w, "UTC"), "wrong weekday");
  assert.ok(fitsAvailability(d("2030-01-07T03:30:00Z"), d("2030-01-07T04:00:00Z"), w, "Asia/Kolkata"));
  assert.ok(!fitsAvailability(d("2030-01-07T09:00:00Z"), d("2030-01-07T09:30:00Z"), w, "Asia/Kolkata"));
});

test("freeSlots lists future slots and excludes booked ones", () => {
  const slots = freeSlots("2030-01-07", [MON], "UTC", [{ starts_at: "2030-01-07T09:30:00Z", ends_at: "2030-01-07T10:00:00Z" }], d("2030-01-01T00:00:00Z"));
  assert.equal(slots.length, 5); // 6 slots minus the booked one
  assert.ok(!slots.some((s) => s.startsAt === "2030-01-07T09:30:00.000Z"));
  assert.equal(slots[0].startsAt, "2030-01-07T09:00:00.000Z");
  assert.equal(freeSlots("2030-01-08", [MON], "UTC", []).length, 0, "no windows on Tuesday");
  assert.equal(freeSlots("2030-01-07", [MON], "UTC", [], d("2030-01-07T10:10:00Z")).length, 3, "past slots dropped");
});

test("timezone / date validators", () => {
  assert.ok(isValidTimezone("Asia/Kolkata"));
  assert.ok(!isValidTimezone("Mars/Base"));
  assert.ok(!isValidTimezone(""));
  assert.ok(isValidYmd("2030-02-03"));
  assert.ok(!isValidYmd("2030-13-45"));
  assert.ok(!isValidYmd("tomorrow"));
});
