# Arquitetura e setup

A API é um serviço NestJS respaldado por MySQL; a aplicação web Vite chama a API; Mailpit é somente local. O Compose de produção coloca MySQL em uma rede interna e expõe HTTP somente por meio da borda HTTPS. As migrations são explícitas e executadas antes de a API ficar pronta.

Use `docker compose up --build -d` para setup local, `npm run build` para compilação e `npm run test:smoke` para verificações focadas da stack. O cliente de API gerado está em `packages/api-client`.

## Componentes e limites

O fluxo é `[ React / Vite ] -> [ NestJS BaaS API ] -> [ Gateway Lera Box ]`, com `[ Webhooks do Gateway ]` retornando à API. O BaaS mantém banco próprio e integra o gateway somente por APIs HTTP; não acessa diretamente o banco do gateway.

A API publica o Swagger local em `http://localhost:3000/docs`. Os recursos do produto incluem `/api/v1/checkout-links`, `/api/v1/public/checkout-sessions`, `/api/v1/public/payments/pix`, `/api/v1/public/payments/card/quote`, `/api/v1/public/payments/card/confirm`, `/api/v1/wallet`, `/api/v1/transactions`, `/api/v1/withdrawals`, `/api/v1/webhooks` e `/api/v1/reconciliation`. Os identificadores e paths permanecem conforme o contrato da aplicação.

## Contrato operacional do gateway

Use `Authorization: Bearer <access_token>`. O checkout Pix usa `qrCodeBase64` e/ou `EMV`; cartão consulta `GET /api/fees`, envia `installments` e `feePercent` corretos; ambos usam `externalReference`. A carteira usa `GET /api/wallet` e `GET /api/wallet/transactions?status=&type=&limit=`. Saques usam `POST /api/withdrawals` e `GET /api/withdrawals/:id`; webhooks devem ser cadastrados para `PAYMENT_PIX`, `PAYMENT_CARD` e `WITHDRAWAL`.
