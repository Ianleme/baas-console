# BaaS Console

Reproducible local evaluator handoff for the BaaS Console. The application is a sandbox integration and does not contain production credentials.

## Quick start

```sh
cp .env.example .env
npm ci
docker compose up --build -d
npm run test:smoke
```

Open `http://localhost:4173`, API Swagger at `http://localhost:3000/docs`, and Mailpit at `http://localhost:8025`. For the read-only tour see [DEMO.md](DEMO.md). Full verification is `npm run verify:full`; external gateway/VPS checks are `npm run verify:live` and require owner-provided access.

Architecture, security, limitations, and delivery procedures are in `docs/`. Production deployment is digest-only and approval-gated; see [docs/operations/deploy.md](docs/operations/deploy.md).

## External prerequisites

The Lera Box sandbox, public domain/TLS, SMTP provider, VPS, SSH key and evaluator UAT are not included. Do not add their secrets to this repository; use the private handoff channel.
