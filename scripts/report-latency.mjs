import { readFile } from "node:fs/promises";

const measurements = JSON.parse(await readFile(
  new URL("../tests/eval/results/latency.json", import.meta.url),
  "utf8",
));
const values = measurements
  .filter((measurement) => measurement.status === 200)
  .map((measurement) => measurement.durationMs)
  .sort((left, right) => left - right);

if (values.length === 0) {
  throw new Error("No successful latency measurements were found.");
}

function percentile(percent) {
  const index = Math.ceil((percent / 100) * values.length) - 1;
  return values[Math.max(0, index)];
}

console.log(`Samples: ${values.length}`);
console.log(`p50: ${percentile(50)} ms`);
console.log(`p95: ${percentile(95)} ms`);
console.log(`max: ${values.at(-1)} ms`);
