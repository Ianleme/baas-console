# Architecture and setup

The API is a NestJS service backed by MySQL; the Vite web application calls the API; Mailpit is local-only. Production Compose places MySQL on an internal network and exposes HTTP only through the HTTPS edge. Migrations are explicit and run before API readiness.

Use `docker compose up --build -d` for local setup, `npm run build` for compilation, and `npm run test:smoke` for focused stack checks. The generated API client is under `packages/api-client`.
