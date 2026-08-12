# Lera Box API Reference Snapshot

## Provenance and trust level

- **Received**: 2026-08-11 (`America/Sao_Paulo`)
- **Source**: user-provided UTF-8 document derived from a Lera Box API collection
- **Source SHA-256**: `48E8368DA8B17690C4590C8382994CE92D026411B4A722D0E68A0847EE552A7C`
- **Public base URL**: `https://api.branchpay.com.br`
- **Known Swagger UI**: `https://api.branchpay.com.br/docs`
- **Known OpenAPI document**: `https://api.branchpay.com.br/docs-json`
- **Classification**: working integration reference, not an executable contract

The supplied document is useful for request fields, endpoint inventory and expected business behavior. Its saved response examples have empty bodies, and some response fields are explicitly inferred from endpoint descriptions. Therefore, implementation must still complete the sandbox contract spike described in the TLC design before response DTOs, webhook schemas or HMAC encoding are considered verified.

The raw attachment is intentionally not copied into the public repository. It contains illustrative e-mail addresses, documents, card data and a webhook secret placeholder. This file preserves the technical information in sanitized form.

## Access flow

1. Call public `POST /api/users` to create the gateway account and wallet.
2. Receive password, `CodigoCliente` and `ChaveLoja` by e-mail.
3. Call public `POST /api/auth/login` with CPF/CNPJ and password.
4. Use the returned Bearer token on authenticated routes.

Payments and withdrawals are simulated. `APPROVED` and `DENIED` may be random; approved operations change the simulated wallet.

## Authentication

Authenticated requests use:

```http
Authorization: Bearer <token>
```

Public routes:

- `GET /api`
- `POST /api/users`
- `POST /api/auth/login`
- `POST /api/auth/reset-password`
- `GET /api/fees`

## Endpoint inventory

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/api` | Public | Health check |
| POST | `/api/users` | Public | Create PF/PJ user, store and wallet |
| POST | `/api/auth/login` | Public | Exchange document/password for Bearer token and gateway identifiers |
| POST | `/api/auth/reset-password` | Public | Send a new password by e-mail |
| GET | `/api/users/me` | Bearer | Read authenticated gateway user |
| GET | `/api/wallet` | Bearer | Read wallet balance |
| GET | `/api/wallet/transactions` | Bearer | Read wallet statement with filters |
| POST | `/api/withdrawals` | Bearer | Create simulated withdrawal |
| GET | `/api/withdrawals/:id` | Bearer | Read withdrawal by ID |
| GET | `/api/fees` | Public | Read card fee table |
| POST | `/api/payments/card` | Bearer | Create simulated card payment |
| POST | `/api/payments/pix` | Bearer | Create simulated Pix payment and QR/EMV |
| GET | `/api/payments/:id` | Bearer | Read payment by ID |
| POST | `/api/webhooks` | Bearer | Create or update webhook configuration |
| GET | `/api/webhooks` | Bearer | List configured webhooks |
| DELETE | `/api/webhooks/:id` | Bearer | Remove webhook |

## Request contracts described by the snapshot

### `POST /api/users`

Body fields:

| Field | Notes |
| --- | --- |
| `personType` | `PF` or `PJ` |
| `name` | Legal/person name |
| `email` | Real reachable e-mail is required by the challenge flow |
| `phone` | Real reachable phone is required by the challenge flow |
| `document` | CPF or CNPJ |
| `zipCode` | Postal code |
| `address` | Street |
| `number` | Address number |
| `neighborhood` | Neighborhood |
| `city` | City |
| `state` | State abbreviation |
| `tradingName` | Store/trading name |
| `complement` | Address complement |

Documented result: `201 Created`; credentials are delivered by e-mail. The saved response body is empty.

### `POST /api/auth/login`

Body fields:

- `document`
- `password`

Documented result: Bearer token, `CodigoCliente` and `ChaveLoja`. The saved example body is empty, so field names and shapes remain a contract-spike item.

### `POST /api/auth/reset-password`

Body fields:

- `document`
- `email`

Documented result: `201 Created` and a new password sent by e-mail; saved response body is empty.

### `GET /api/wallet/transactions`

Optional query parameters:

| Parameter | Values described |
| --- | --- |
| `limit` | Maximum result count, for example `50` |
| `status` | `APPROVED`, `DENIED`, `PENDING`, `EXPIRED`, `CANCELLED` |
| `type` | `PIX`, `CREDIT_CARD`, `WITHDRAWAL` |

Pagination shape, maximum limit and response schema are not present in the snapshot.

### `POST /api/withdrawals`

Body fields:

- `amount` in cents
- `pixKey`
- `document`
- `description`
- `externalReference`

Behavior described:

- insufficient actual balance yields `INSUFFICIENT_BALANCE`;
- otherwise approval or denial may be simulated;
- approval debits the wallet;
- response body is not captured.

### `GET /api/fees`

- Optional `brand` query filter.
- Brands described: Visa, Mastercard and Elo.
- Installments described: 1 through 21.
- The matching fee must be sent as `feePercent` on card payment.

Exact fee response shape remains fixture-driven.

### `POST /api/payments/card`

Body fields:

| Field | Notes |
| --- | --- |
| `amount` | Cents |
| `cardNumber` | Must never persist or enter logs |
| `cardHolder` | Must never persist or enter logs |
| `expiryMonth` | Must never persist or enter logs |
| `expiryYear` | Must never persist or enter logs |
| `cvv` | Must never persist or enter logs |
| `installments` | 1 through 21 |
| `feePercent` | Decimal percentage matching the fee table |
| `description` | Payment description |
| `externalReference` | BaaS reconciliation reference |

Behavior described:

- net value (`gross - fee`) credits the wallet when approved;
- the operation triggers `PAYMENT_CARD` webhook;
- response body is not captured.

Internally the BaaS uses basis points and converts explicitly to the gateway's documented decimal `feePercent` at the adapter boundary.

### `POST /api/payments/pix`

Body fields:

- `amount` in cents
- `payerDocument`
- `description`
- `externalReference`

Behavior described:

- returns EMV and `qrCodeBase64` according to the endpoint description;
- triggers `PAYMENT_PIX` webhook when configured;
- approval or denial may be random;
- saved response body is empty, so exact field shape remains unverified.

### `POST /api/webhooks`

Body fields:

| Field | Values/notes |
| --- | --- |
| `event` | `PAYMENT_PIX`, `PAYMENT_CARD`, `WITHDRAWAL` |
| `url` | Public callback URL |
| `secret` | Optional according to the gateway snapshot; mandatory in the BaaS design |

The document says Lera Box sends JSON with final `APPROVED` or `DENIED` status. It does not define:

- event ID;
- exact payload schema;
- raw-body canonicalization;
- HMAC header encoding;
- retry schedule;
- timeout;
- success acknowledgement rules;
- ordering guarantees.

All items above remain mandatory live contract-spike questions.

## Confirmed integration rules carried into the spec

- All money sent to the gateway uses cents.
- Card flow is `GET /api/fees` -> choose installments -> send matching `feePercent`.
- Pix requires `payerDocument` according to this snapshot.
- `externalReference` is available for Pix, card and withdrawal reconciliation.
- One webhook URL is configured per event.
- A webhook secret should always be supplied by the BaaS even though the gateway marks it optional.
- Sandbox randomness must not participate in deterministic CI gates.

## Evidence gaps

The adapter implementation is blocked until fixtures establish:

1. Actual success and error response schemas for every endpoint.
2. Token expiry and authentication error format.
3. IDs returned by payments, withdrawals and webhooks.
4. Fee response types, precision and brand spelling/case.
5. HMAC algorithm details beyond the high-level statement, especially output encoding.
6. Webhook payloads, event identity, retry and acknowledgement behavior.
7. Meaning of `pixKey` in withdrawal examples versus an actual destination Pix key.
8. Validation bounds, error codes and pagination limits.

## Update policy

- Preserve this snapshot as historical evidence.
- When the sandbox spike produces sanitized fixtures, link each fixture and record the observation date.
- If live behavior contradicts this document, do not silently edit history: document the deviation and superseding evidence in the design/decision log.
- Never commit Bearer tokens, passwords, CodigoCliente, ChaveLoja, real e-mail, phone, document, Pix key or webhook secret.
