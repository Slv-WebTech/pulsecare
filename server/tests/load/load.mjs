// Minimal concurrent load test (no dependencies):
//   node tests/load/load.mjs http://localhost:5081 <accessToken> [concurrency=50] [seconds=10]
// Prints throughput and latency percentiles per endpoint. Run it against a throwaway database.
const [base, token, concArg, secArg] = process.argv.slice(2);
if (!base || !token) {
  console.error("usage: node tests/load/load.mjs <baseUrl> <accessToken> [concurrency] [seconds]");
  process.exit(1);
}
const concurrency = Number(concArg || 50);
const seconds = Number(secArg || 10);

const endpoints = [
  ["GET /api/doctors", "/api/doctors?limit=100", false],
  ["GET /api/doctors (filtered)", "/api/doctors?specialization=cardio&location=pune", false],
  ["GET /api/appointments", "/api/appointments?limit=200", true],
  ["GET /api/auth/me", "/api/auth/me", true],
];

const pct = (arr, p) => arr[Math.min(arr.length - 1, Math.floor((p / 100) * arr.length))];

for (const [label, path, auth] of endpoints) {
  const times = [];
  let errors = 0;
  const end = Date.now() + seconds * 1000;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (Date.now() < end) {
        const t = performance.now();
        try {
          const res = await fetch(base + path, { headers: auth ? { Authorization: `Bearer ${token}` } : {} });
          await res.arrayBuffer();
          if (res.status >= 400) errors++;
        } catch {
          errors++;
        }
        times.push(performance.now() - t);
      }
    })
  );
  times.sort((a, b) => a - b);
  console.log(
    `${label.padEnd(30)} ${String(Math.round(times.length / seconds)).padStart(5)} req/s  ` +
      `p50 ${pct(times, 50).toFixed(0)}ms  p95 ${pct(times, 95).toFixed(0)}ms  p99 ${pct(times, 99).toFixed(0)}ms  errors ${errors}`
  );
}
