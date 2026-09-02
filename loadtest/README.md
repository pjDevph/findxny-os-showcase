# Load tests

Lightweight [k6](https://k6.io/) scripts for the public-facing endpoints — the
ones that take the brunt of traffic during a peak hour (lunch rush, promo
launch). They are intentionally not wired into CI: run on demand against a
staging project, or against prod during a planned soak.

## Install k6

- Windows: `winget install k6 --source winget` (or `choco install k6`)
- macOS:   `brew install k6`
- Docker:  `docker run --rm -i grafana/k6 run - <script.js`

## Run

```bash
k6 run \
  -e SUPABASE_URL=https://YOUR-PROJECT.supabase.co \
  -e SUPABASE_ANON_KEY=eyJ... \
  -e WORKSPACE_SLUG=demo \
  loadtest/public-endpoints.js
```

The default profile ramps to 50 concurrent users for 1 minute. Bump `target` in
the `stages` array for stress tests; thresholds will fail the run if p95 > 800ms
or errors > 1%.

## What to watch

- **`http_req_duration p(95)`** — your user-facing latency budget.
- **`errors`** — anything non-2xx; usually rate-limited or DB-backed off.
- **Supabase dashboard** during the run: function invocation count, DB CPU,
  connection pool saturation. The fixed-window rate limit in
  `supabase/functions/_shared/rateLimit.ts` will start returning 429 well
  before the DB is overwhelmed — that's intentional.
