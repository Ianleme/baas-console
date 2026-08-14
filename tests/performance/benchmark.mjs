#!/usr/bin/env node
import { performance } from 'node:perf_hooks';
import fs from 'node:fs';

const baseUrl = process.env.BENCHMARK_URL ?? 'http://127.0.0.1:3000/health/live';
const iterations = Number(process.env.BENCHMARK_ITERATIONS ?? 20);
const started = performance.now();
const statuses = [];
for (let i = 0; i < iterations; i += 1) statuses.push((await fetch(baseUrl)).status);
const elapsedMs = performance.now() - started;
const result = {
  schemaVersion: 1,
  measured: true,
  url: baseUrl,
  iterations,
  elapsedMs: Number(elapsedMs.toFixed(2)),
  statuses,
  capturedAt: new Date().toISOString(),
  hardware: process.env.BENCHMARK_HARDWARE ?? 'record externally',
  imageDigests: process.env.BENCHMARK_IMAGE_DIGESTS ?? 'record externally'
};
const output = process.env.BENCHMARK_OUTPUT ?? 'benchmark-result.json';
fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(`Wrote ${output}; repeat runs and record raw results before sizing.`);
