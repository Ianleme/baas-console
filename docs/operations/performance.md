# VPS sizing evidence

No capacity, latency, memory, PDF concurrency, or VPS recommendation is claimed yet. Run the production image with a fixed load and record the raw output:

```sh
BENCHMARK_URL=https://example.invalid/health/live \
BENCHMARK_ITERATIONS=100 \
BENCHMARK_HARDWARE='CPU/RAM/storage/kernel' \
BENCHMARK_IMAGE_DIGESTS='api@sha256:...,web@sha256:...' \
BENCHMARK_OUTPUT=artifacts/performance/run-01.json \
node tests/performance/benchmark.mjs
```

Repeat at least three times, and separately measure API/MySQL memory, HTTP p50/p95/p99, throughput, PDF concurrency, and failure behavior. The JSON schema records only observed values; `hardware` and `imageDigests` must be completed from the run. T053 remains externally blocked until real production-image/VPS measurements exist.
