// Runs sonar-scanner and auto-retries when the analysis report fails to
// process due to a source file changing mid-scan (a live-editor autosave
// racing the scanner's filesystem passes) — a known sonar-scanner limitation,
// not a bug in the project. Requires SONAR_TOKEN in the environment.
import { spawnSync } from "node:child_process";

const HOST = process.env.SONAR_HOST_URL || "http://localhost:9000";
const TOKEN = process.env.SONAR_TOKEN;
const MAX_ATTEMPTS = Number(process.env.SONAR_SCAN_RETRIES ?? 3);
const PROJECT_KEY = "findxny-os";

if (!TOKEN) {
  console.error(`Missing SONAR_TOKEN env var. Generate one at ${HOST}/account/security and export SONAR_TOKEN=<token>.`);
  process.exit(1);
}

const authHeader = "Basic " + Buffer.from(`${TOKEN}:`).toString("base64");

function runScanOnce() {
  // Relies on inherited PATH to find the sonar-scanner binary — this is a
  // local dev tooling script run directly in a developer's own shell (same
  // trust boundary as any other npm script), and install location varies too
  // much across platforms/package managers to safely hardcode.
  const result = spawnSync(
    "sonar-scanner", // NOSONAR
    [`-Dsonar.host.url=${HOST}`, `-Dsonar.token=${TOKEN}`],
    { encoding: "utf8", stdio: ["inherit", "pipe", "pipe"] },
  );
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  console.log(output);
  if (result.status !== 0) return { ok: false, reason: "scanner-exit-nonzero" };
  const match = output.match(/api\/ce\/task\?id=([\w-]+)/);
  if (!match) return { ok: false, reason: "no-task-id-found-in-scanner-output" };
  return { ok: true, taskId: match[1] };
}

async function pollTask(taskId) {
  for (;;) {
    const res = await fetch(`${HOST}/api/ce/task?id=${taskId}`, { headers: { Authorization: authHeader } });
    const data = await res.json();
    const { status } = data.task;
    if (status === "SUCCESS" || status === "FAILED" || status === "CANCELED") return data.task;
    await new Promise((r) => setTimeout(r, 1500));
  }
}

async function printSummary() {
  const metrics = "bugs,vulnerabilities,code_smells,security_hotspots,duplicated_lines_density,ncloc";
  const res = await fetch(
    `${HOST}/api/measures/component?component=${PROJECT_KEY}&metricKeys=${metrics}`,
    { headers: { Authorization: authHeader } },
  );
  const data = await res.json();
  const vals = Object.fromEntries(data.component.measures.map((m) => [m.metric, m.value]));
  console.log(`
  bugs:                     ${vals.bugs}
  vulnerabilities:          ${vals.vulnerabilities}
  code_smells:              ${vals.code_smells}
  security_hotspots:        ${vals.security_hotspots}
  duplicated_lines_density: ${vals.duplicated_lines_density}%
  ncloc:                    ${vals.ncloc}

  Dashboard: ${HOST}/dashboard?id=${PROJECT_KEY}
`);
}

async function main() {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    console.log(`\n=== sonar-scan attempt ${attempt}/${MAX_ATTEMPTS} ===`);
    const scan = runScanOnce();
    if (!scan.ok) {
      console.error(`Scan invocation failed (${scan.reason}) — not retrying, this isn't the known transient race.`);
      process.exit(1);
    }

    const task = await pollTask(scan.taskId);
    if (task.status === "SUCCESS") {
      console.log("\nAnalysis processed successfully.");
      await printSummary();
      return;
    }

    const transient = /has (less|more) lines/.test(task.errorMessage ?? "");
    console.warn(`\nCompute Engine task ${task.status}: ${task.errorMessage ?? "(no message)"}`);
    if (!transient) {
      console.error("Non-transient failure — not retrying automatically. Check the SonarQube server logs (docker logs sonarqube).");
      process.exit(1);
    }
    if (attempt === MAX_ATTEMPTS) {
      console.error(`Hit the known file-changed-mid-scan race ${MAX_ATTEMPTS} times in a row — try again once your editor settles.`);
      process.exit(1);
    }
    console.log("Known transient race (a source file changed mid-scan) — retrying...");
  }
}

main();
