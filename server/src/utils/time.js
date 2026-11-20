// Timezone helpers built on Intl (no dependency). Handles DST, unlike a fixed UTC offset.

export const DEFAULT_TIMEZONE =
  process.env.DEFAULT_TIMEZONE || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

export function isValidTimezone(tz) {
  if (typeof tz !== "string" || !tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Offset (minutes) of `tz` from UTC at the instant `date`: local = utc + offset.
export function tzOffsetMinutes(date, tz) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p = Object.fromEntries(dtf.formatToParts(date).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

// Wall-clock parts of an instant in `tz`.
export function localParts(date, tz) {
  const l = new Date(date.getTime() + tzOffsetMinutes(date, tz) * 60000);
  return { ymd: l.toISOString().slice(0, 10), dow: l.getUTCDay(), minutes: l.getUTCHours() * 60 + l.getUTCMinutes() };
}

// The instant at which the wall clock in `tz` reads `ymd` + `minutes` after midnight.
export function zonedToUtc(ymd, minutes, tz) {
  const [y, m, d] = ymd.split("-").map(Number);
  const naive = Date.UTC(y, m - 1, d, 0, minutes);
  const off1 = tzOffsetMinutes(new Date(naive), tz);
  let utc = naive - off1 * 60000;
  const off2 = tzOffsetMinutes(new Date(utc), tz);
  if (off2 !== off1) utc = naive - off2 * 60000;
  return new Date(utc);
}

const toMin = (t) => {
  const [h, m] = String(t).split(":").map(Number);
  return h * 60 + m;
};

// Is [start, end) exactly one slot, aligned to a slot boundary, inside one of the doctor's
// availability windows for that weekday (evaluated in the doctor's timezone)?
// `windows` rows: {day_of_week, start_time:"HH:MM:SS", end_time, slot_minutes}.
export function fitsAvailability(start, end, windows, tz = DEFAULT_TIMEZONE) {
  const a = localParts(start, tz);
  const b = localParts(end, tz);
  if (a.ymd !== b.ymd) return false;
  return windows.some((w) => {
    const ws = toMin(w.start_time);
    return (
      w.day_of_week === a.dow &&
      a.minutes >= ws &&
      b.minutes <= toMin(w.end_time) &&
      (a.minutes - ws) % w.slot_minutes === 0 &&
      b.minutes - a.minutes === w.slot_minutes
    );
  });
}

// Free slots for local date `ymd`: every slot in the day's windows that is in the future
// and does not overlap any (non-cancelled) booking. `booked` = [{starts_at, ends_at}].
export function freeSlots(ymd, windows, tz, booked, now = new Date()) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const out = [];
  for (const w of windows.filter((x) => x.day_of_week === dow)) {
    for (let t = toMin(w.start_time); t + w.slot_minutes <= toMin(w.end_time); t += w.slot_minutes) {
      const start = zonedToUtc(ymd, t, tz);
      const end = new Date(start.getTime() + w.slot_minutes * 60000);
      if (start <= now) continue;
      if (booked.some((b) => new Date(b.starts_at) < end && new Date(b.ends_at) > start)) continue;
      out.push({ startsAt: start.toISOString(), endsAt: end.toISOString() });
    }
  }
  return out.sort((p, q) => p.startsAt.localeCompare(q.startsAt));
}

export function isValidYmd(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}
