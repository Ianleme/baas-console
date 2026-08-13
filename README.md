# BaaS Console

Entrega reproduzível local do BaaS Console. A aplicação integra um produto BaaS ao gateway de simulação Lera Box; não contém credenciais de produção.

## Setup local

```sh
cp .env.example .env
npm ci
docker compose up --build -d
npm run test:smoke
```

Abra `http://localhost:4173`, o Swagger da API em `http://localhost:3000/docs` e o Mailpit em `http://localhost:8025`. O tour somente leitura está em [DEMO.md](DEMO.md). A verificação completa é `npm run verify:full`; as verificações externas do gateway/VPS são `npm run verify:live` e exigem acesso fornecido pelo responsável.

O Swagger do gateway é `https://api.branchpay.com.br/doscs` e sua base é `https://api.branchpay.com.br/api`. Em caso de divergência, priorize o Swagger do gateway.

## Variáveis de ambiente

Copie `.env.example` para `.env`. Preserve os nomes abaixo; substitua apenas os valores locais. Não commite segredos.

```dotenv
API_PORT=3000
WEB_PORT=4173
MAILPIT_HTTP_PORT=8025
MAILPIT_SMTP_PORT=1025
BAAS_DB_NAME=baas_console
BAAS_DB_USER=baas
BAAS_DB_PASSWORD=replace-local-only
BAAS_DB_ROOT_PASSWORD=replace-local-only
AUTH_TOKEN_SECRET=replace-with-local-random-value
ENCRYPTION_KEY_BASE64=replace-with-32-byte-base64-value
LERA_BOX_BASE_URL=http://host.docker.internal:9999
LERA_BOX_CLIENT_ID=not-configured
LERA_BOX_CLIENT_SECRET=not-configured
```

Para uma integração sandbox real, configure `LERA_BOX_BASE_URL`, `LERA_BOX_CLIENT_ID` e `LERA_BOX_CLIENT_SECRET` somente no ambiente privado apropriado.

## Fluxos funcionais

O produto cobre sessão do lojista, checkout links para Pix e cartão, consulta de parcelas e tarifas, `externalReference`, carteira, extrato, filtros de transações, saques e webhooks `PAYMENT_PIX`, `PAYMENT_CARD` e `WITHDRAWAL`. Valores monetários são tratados em centavos. O frontend não recebe a senha do gateway; o token é protegido no backend. Os estados finais chegam por webhook, com validação de assinatura quando houver `X-Lera-Box-Signature`, idempotência e isolamento por conta.

Arquitetura, segurança, limitações e procedimentos de entrega estão em `docs/`. O deploy de produção usa somente digests e exige aprovação; veja [docs/operations/deploy.md](docs/operations/deploy.md). Docker Compose fornece API, frontend e MySQL locais, além do Mailpit.

## Pré-requisitos externos

O sandbox Lera Box, domínio público/TLS, provedor SMTP, VPS, chave SSH e UAT do avaliador não estão incluídos. Evidências de VPS/sandbox/UAT/live continuam pendentes externamente. Não adicione segredos a este repositório; use o canal privado de handoff.
