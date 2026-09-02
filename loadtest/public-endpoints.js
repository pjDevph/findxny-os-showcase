// k6 load test for public (no-auth) endpoints.
//
// Run:
//   k6 run -e SUPABASE_URL=https://xxx.supabase.co \
//          -e SUPABASE_ANON_KEY=eyJ... \
//          -e WORKSPACE_SLUG=demo \
//          loadtest/public-endpoints.js
//
// Profiles (override with --stage or pick a scenario):
//   default: ramp 0→50 VUs over 30s, hold 1m, ramp down 30s
//
// Thresholds fail the run if p95 latency or error rate exceed budget — these
// are the numbers I'd watch for a POS landing/menu page in real traffic.
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate } from "k6/metrics";

const SUPABASE_URL = __ENV.SUPABASE_URL;
const ANON_KEY     = __ENV.SUPABASE_ANON_KEY;
const SLUG         = __ENV.WORKSPACE_SLUG || "demo";

if (!SUPABASE_URL || !ANON_KEY) {
  throw new Error("Set SUPABASE_URL and SUPABASE_ANON_KEY env vars (k6 -e ...)");
}

const errorRate = new Rate("errors");

export const options = {
  stages: [
    { duration: "30s", target: 50  },
    { duration: "1m",  target: 50  },
    { duration: "30s", target: 0   },
  ],
  thresholds: {
    http_req_duration: ["p(95)<800", "p(99)<1500"],
    errors:            ["rate<0.01"],
    http_req_failed:   ["rate<0.01"],
  },
};

const headers = {
  apikey: ANON_KEY,
  Authorization: `Bearer ${ANON_KEY}`,
  "content-type": "application/json",
};

function call(path, body) {
  const res = http.post(`${SUPABASE_URL}/functions/v1/${path}`, JSON.stringify(body), { headers });
  const ok = check(res, {
    "status is 2xx":  (r) => r.status >= 200 && r.status < 300,
    "has body":       (r) => r.body && r.body.length > 0,
    "under 1500ms":   (r) => r.timings.duration < 1500,
  });
  errorRate.add(!ok);
  return res;
}

export default function () {
  // Customer landing → menu. Single most-hit endpoint at peak.
  call("public-menu", { slug: SLUG });

  // Browse-rooms variant (skip if you're food-only).
  call("public-rooms", { slug: SLUG, type: "room" });

  // Tracking lookup with a likely-miss key — exercises the not-found path
  // without polluting real order data.
  http.post(
    `${SUPABASE_URL}/functions/v1/public-track-order`,
    JSON.stringify({ order_no: "LOAD-TEST-NONE" }),
    { headers },
  );

  sleep(Math.random() * 2 + 0.5);
}
