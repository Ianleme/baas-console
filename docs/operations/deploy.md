# Entrega e rollback aprovados

`.github/workflows/deploy.yml` é um workflow manual, aprovado pelo `production-Environment`. Os deploys são serializados e aceitam somente full image digests. A VPS alvo deve expor um comando `baas-deploy` restrito e pertencente ao root; a conta SSH não pode executar comandos arbitrários nem tornar-se root.

A sequência de comandos é **preflight → migrate → health-and-smoke**. Uma verificação health ou smoke malsucedida invoca `rollback`, restaurando o digest registrado pelo host. Rollback nunca executa uma down migration. Backup/restore do banco é um procedimento aprovado separadamente e intencionalmente não é automatizado aqui.

Configuração privada obrigatória: `PRODUCTION_HOST`, `PRODUCTION_USER`, `PRODUCTION_KNOWN_HOSTS`, `PRODUCTION_SSH_KEY`. Nenhuma credencial, host key, domínio ou VPS está presente neste repositório. VPS/domínio/SSH reais, TLS, backup/restore e validação de rollback são bloqueadores externos de T049; não há evidência concluída localmente.

A allowlist do lado do host deve validar os digests novamente, persistir atomicamente o arquivo de imagem compose anterior, executar `docker compose -f docker-compose.prod.yml up -d migrate` e então as verificações health e smoke. Nunca use mutable tags ou `docker compose down` como rollback.

O fluxo de entrega deve ser usado somente após receber os pré-requisitos privados (registry, VPS, SSH, domínio/TLS e backup/restore) e aprovação do ambiente `production-Environment`.
