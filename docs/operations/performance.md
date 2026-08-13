# Evidência de dimensionamento da VPS

Nenhuma capacidade, latência, memória, concorrência de PDF ou recomendação de VPS é declarada neste momento. Execute a imagem de produção com carga fixa e registre a saída bruta:

```sh
BENCHMARK_URL=https://example.invalid/health/live \
BENCHMARK_ITERATIONS=100 \
BENCHMARK_HARDWARE='CPU/RAM/storage/kernel' \
BENCHMARK_IMAGE_DIGESTS='api@sha256:...,web@sha256:...' \
BENCHMARK_OUTPUT=artifacts/performance/run-01.json \
node tests/performance/benchmark.mjs
```

Repita pelo menos três vezes e meça separadamente memória de API/MySQL, HTTP p50/p95/p99, throughput, concorrência de PDF e comportamento de falha. O JSON schema registra somente valores observados; `hardware` e `imageDigests` devem ser preenchidos a partir da execução. T053 permanece bloqueado externamente até existirem medições reais da imagem de produção/VPS.
