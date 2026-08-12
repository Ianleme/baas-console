# Lera Box live contract spike — 2026-08-12

## Verdict

The authorized sandbox run closed the response-shape and webhook-signature gates required before implementing the HTTP adapter. Raw evidence remains under ignored `artifacts/live`; only allowlisted, synthetic fixtures are committed.

## Provenance

- Base URL: `https://api.branchpay.com.br`.
- OpenAPI version: `1.0`.
- OpenAPI SHA-256: `f1a72c0493f90d73d0827e78d3071b77446c8c71c342ddca926b8d58b52b22db`.
- Raw response evidence SHA-256: `312adc17ea016609080db935fa5a60f5fd2e81a712c850a3840a0febc2e11648`.
- Raw callback evidence SHA-256: `749175d519e46be297c59692f602a8523f5cdea15fd0142490d15f33f5994bb3`.
- Naturally observed outcomes were preserved; no request was repeated to obtain a preferred random result.

## Confirmed contract

- Login returns HTTP `201` with `access_token`, `token_type`, `codigoCliente`, `chaveLoja` and a user object.
- `/users/me`, wallet, statement, fees, payment lookup, withdrawal lookup and webhook listing return HTTP `200` in the observed paths.
- Pix, card and withdrawal creation return HTTP `201`; observed business outcomes included both `APPROVED` and `DENIED`.
- Validation errors use HTTP `400` with `message`, `error` and `statusCode`; missing Bearer authentication returns `401`.
- The fee collection contains 63 rows: `VISA`, `MASTERCARD` and `ELO`, installments 1 through 21.
- Webhook create returns `id`, `event`, `url`, `hasSecret`, `active`, `createdAt` and `updatedAt`; delete returned HTTP `200` with `deleted=true` for all three temporary registrations.

## Webhook signature

- Event header: `x-lera-box-event`.
- Signature header: `x-lera-box-signature`.
- Algorithm: HMAC-SHA256 using the configured webhook secret.
- Input: the exact raw HTTP body bytes, before JSON parsing.
- Encoding: lowercase hexadecimal, exactly 64 ASCII characters.
- Comparison: validate equal lengths and use constant-time byte comparison.

Three real deliveries — `PAYMENT_PIX`, `PAYMENT_CARD` and `WITHDRAWAL` — matched that calculation. Temporary callbacks were deleted and the approved Cloudflare tunnel/local receiver were terminated after capture.

## Security finding relevant to the adapter

The gateway response and webhook metadata may include `ChaveLoja`, documents/Pix destinations, cardholder/expiry fields and QR/EMV data. The adapter must parse with an explicit allowlist and must never log or persist the raw dependency object. Sanitized fixtures deliberately omit or replace those values.

## Remaining non-blocking unknowns

The run does not establish token lifetime, remote webhook retry schedule, delivery ordering guarantee or maximum pagination limits. The BaaS design already treats delivery as at-least-once, uses an inbox/dedupe boundary and never relies on those unknowns for financial correctness.
