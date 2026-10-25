import { mkdir, readFile, writeFile } from "node:fs/promises";

const baseUrl = process.env.KNOWYU_BASE_URL ?? "http://localhost:3000";
const cookie = process.env.KNOWYU_AUTH_COOKIE;

if (!cookie) {
  throw new Error("Set KNOWYU_AUTH_COOKIE to an authenticated Supabase cookie.");
}

const questions = JSON.parse(await readFile(
  new URL("../tests/eval/questions.json", import.meta.url),
  "utf8",
)).slice(0, 10);
const measurements = [];

for (const item of questions) {
  const startedAt = performance.now();
  const response = await fetch(`${baseUrl}/api/v1/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: JSON.stringify({ question: item.question }),
  });
  await response.text();
  measurements.push({
    id: item.id,
    status: response.status,
    durationMs: Math.round(performance.now() - startedAt),
  });
}

const outputUrl = new URL("../tests/eval/results/latency.json", import.meta.url);
await mkdir(new URL(".", outputUrl), { recursive: true });
await writeFile(outputUrl, `${JSON.stringify(measurements, null, 2)}\n`);
console.log(`Wrote ${measurements.length} measurements to ${outputUrl.pathname}`);

