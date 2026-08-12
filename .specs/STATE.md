# STATE

## Decisions

### AD-001
- **Decision**: Organizar o produto como monorepo npm com `apps/api`, `apps/web`, `packages/api-client` e `packages/test-support`.
- **Reason**: Backend, frontend, cliente gerado e utilitarios de teste evoluem juntos e precisam compartilhar contratos sem publicacao externa.
- **Trade-off**: O repositorio raiz concentra mais scripts e configuracoes.
- **Scope**: Todo o repositorio.
- **Date**: 2026-08-11
- **Status**: active

### AD-002
- **Decision**: Implementar o backend como monolito modular NestJS, usando TypeORM diretamente nos modulos simples e interfaces apenas nos limites externos ou dificeis de testar.
- **Reason**: Preserva separacao de responsabilidades sem a cerimonia de microservicos, Clean Architecture integral ou repositorios genericos.
- **Trade-off**: Modulos compartilham processo e ciclo de deploy.
- **Scope**: `apps/api`.
- **Date**: 2026-08-11
- **Status**: active

### AD-003
- **Decision**: Usar Node.js 24 LTS, NestJS 11, React 19, TypeScript estrito, npm workspaces e MySQL 8.4 LTS; fixar patches no lockfile e imagens por digest.
- **Reason**: Combina suporte vigente, reproducibilidade e aderencia ao desafio.
- **Trade-off**: Atualizacoes exigem PRs deliberados e validacao completa.
- **Scope**: Runtime, build, CI e containers.
- **Date**: 2026-08-11
- **Status**: active

### AD-004
- **Decision**: Modelar um proprietario por lojista e isolar todos os dados por `merchantId`, incluindo chaves estrangeiras compostas nas relacoes tenant-scoped.
- **Reason**: Evita acesso cruzado mesmo quando houver erro de filtro na aplicacao.
- **Trade-off**: Chaves e migracoes ficam mais verbosas.
- **Scope**: Autenticacao, persistencia, consultas e APIs autenticadas.
- **Date**: 2026-08-11
- **Status**: active

### AD-005
- **Decision**: Tratar a Lera Box exclusivamente como dependencia HTTP por meio de `LeraBoxGateway`; nunca acessar seu banco nem expor sua senha ao frontend.
- **Reason**: Mantem o limite de integracao exigido e permite testes deterministas por fake e stub HTTP.
- **Trade-off**: O adapter precisa mapear contratos e falhas explicitamente.
- **Scope**: Cadastro, autenticacao do gateway, pagamentos, carteira, saques, taxas e webhooks.
- **Date**: 2026-08-11
- **Status**: active

### AD-006
- **Decision**: Autenticar localmente com Argon2id, access token de 15 minutos e refresh token rotativo em cookie `HttpOnly`, `Secure`, host-only e com deteccao de reutilizacao.
- **Reason**: Separa a sessao BaaS da credencial do gateway e reduz impacto de roubo de token.
- **Trade-off**: Exige tabela de sessoes, rotacao e revogacao explicitas.
- **Scope**: Autenticacao local e sessao web.
- **Date**: 2026-08-11
- **Status**: active

### AD-007
- **Decision**: Criptografar segredos recuperaveis com AES-256-GCM e usar HMAC com chave para indices cegos de PII de baixa entropia; nunca usar hash simples para CPF, telefone ou chave Pix.
- **Reason**: Permite uso operacional dos segredos sem tornar dados enumeraveis por dicionario.
- **Trade-off**: Requer gestao e rotacao de chaves fora do banco.
- **Scope**: Credenciais do gateway, webhook secrets, tokens recuperaveis e PII pesquisavel.
- **Date**: 2026-08-11
- **Status**: active

### AD-008
- **Decision**: Representar dinheiro como inteiros em centavos e taxas como basis points, usando `bigint`/strings nos limites em que `number` nao seja seguro.
- **Reason**: Elimina arredondamento binario e mantem fidelidade com o gateway.
- **Trade-off**: Serializacao e calculos exigem conversoes explicitas.
- **Scope**: Todo valor monetario, taxa, API, banco e interface.
- **Date**: 2026-08-11
- **Status**: active

### AD-009
- **Decision**: Nao repetir automaticamente POST financeiro apos timeout; registrar `RECONCILIATION_PENDING`, bloquear nova tentativa e reconciliar antes de liberar o link.
- **Reason**: Evita pagamentos ou saques duplicados quando o resultado remoto e desconhecido.
- **Trade-off**: O usuario pode aguardar conciliacao e a operacao exige estado adicional.
- **Scope**: Pix, cartao e saques.
- **Date**: 2026-08-11
- **Status**: active

### AD-010
- **Decision**: Persistir webhooks em inbox duravel depois de validar HMAC sobre os bytes brutos, responder antes do processamento de negocio e aplicar handlers idempotentes com lease.
- **Reason**: Suporta entrega pelo menos uma vez, repeticao, reordenacao e recuperacao de falhas.
- **Trade-off**: Adiciona estados de processamento, deduplicacao e dead letter.
- **Scope**: Todos os webhooks Lera Box.
- **Date**: 2026-08-11
- **Status**: active

### AD-011
- **Decision**: Permitir no maximo uma tentativa financeira nao resolvida por link e separar o ciclo de vida do link do ciclo de vida das tentativas.
- **Reason**: Uma tentativa negada nao deve encerrar o link, enquanto uma tentativa pendente deve impedir cobranca concorrente.
- **Trade-off**: Requer constraint/transacao de banco e matriz de transicoes explicita.
- **Scope**: Links de checkout e pagamentos.
- **Date**: 2026-08-11
- **Status**: active

### AD-012
- **Decision**: Tratar carteira e transacoes locais como projecoes conciliaveis; o saldo do gateway permanece a fonte autoritativa.
- **Reason**: O BaaS nao possui informacao suficiente para operar um ledger proprio correto.
- **Trade-off**: A interface precisa comunicar staleness e divergencias.
- **Scope**: Carteira, transacoes, dashboard e conciliacao.
- **Date**: 2026-08-11
- **Status**: active

### AD-013
- **Decision**: Entregar e-mails por outbox persistente e worker interno NestJS, com adapter SMTP, Mailpit local, idempotencia e dead letter; nao adotar broker externo.
- **Reason**: SMTP pode falhar depois da transacao principal, mas o volume do desafio nao justifica RabbitMQ ou Kafka.
- **Trade-off**: O banco tambem coordena agendamento e lease do worker.
- **Scope**: Link de pagamento e confirmacao/comprovante.
- **Date**: 2026-08-11
- **Status**: active

### AD-014
- **Decision**: Gerar o comprovante PDF P1 com Playwright/Chromium a partir do mesmo template HTML imprimivel, sob demanda e sem persistir o arquivo.
- **Reason**: Garante fidelidade visual entre pagina e PDF e atende o diferencial do desafio.
- **Trade-off**: A imagem da API fica maior e o Chromium exige sandbox, limites de memoria, concorrencia e timeout.
- **Scope**: Comprovantes e container da API.
- **Date**: 2026-08-11
- **Status**: active

### AD-015
- **Decision**: Produzir logs JSON Pino por allowlist, erros RFC 9457, metricas `prom-client` sem labels de alta cardinalidade e health checks separados.
- **Reason**: Observabilidade nao pode vazar PAN, CVV, tokens, PII ou payloads financeiros.
- **Trade-off**: Serializers e metricas precisam ser definidos manualmente.
- **Scope**: API, gateway adapter, workers e operacao.
- **Date**: 2026-08-11
- **Status**: active

### AD-016
- **Decision**: Usar Jest/Supertest no backend, Vitest/Testing Library no frontend, Cucumber.js para Gherkin, Playwright para E2E e StrykerJS para mutation testing.
- **Reason**: Cobre unidades, contratos, comportamento, navegacao real e capacidade dos testes de detectar defeitos.
- **Trade-off**: O pipeline completo e mais caro e precisa separar gates rapidos dos profundos.
- **Scope**: Todo o projeto e CI.
- **Date**: 2026-08-11
- **Status**: active

### AD-017
- **Decision**: Impor `verify:quick`, `verify`, `verify:full` e `verify:live` por um validador Node multiplataforma que tambem e testado.
- **Reason**: Um unico comando auditavel deve comprovar cobertura, qualidade, mutacao, skips e evidencias.
- **Trade-off**: O script passa a ser codigo critico e precisa de fixtures positivas e negativas.
- **Scope**: Scripts locais, hooks e GitHub Actions.
- **Date**: 2026-08-11
- **Status**: active

### AD-018
- **Decision**: Executar API, frontend Nginx, MySQL e Mailpit em Docker; usar Caddy em producao e Prometheus/Grafana apenas em perfil opcional.
- **Reason**: Entrega reproducivel sem transformar observabilidade opcional em requisito de infraestrutura basica.
- **Trade-off**: Existem composicoes e imagens distintas para desenvolvimento e producao.
- **Scope**: Desenvolvimento, CI, deploy e documentacao operacional.
- **Date**: 2026-08-11
- **Status**: active

### AD-019
- **Decision**: Usar trunk-based development, commits convencionais e atomicos, main protegida, GitHub Actions com menor privilegio e imagens GHCR imutaveis por digest.
- **Reason**: Torna historico, revisao, supply chain e rollback auditaveis.
- **Trade-off**: Cada tarefa exige gate e commit proprio.
- **Scope**: Git, CI/CD, release e deploy.
- **Date**: 2026-08-11
- **Status**: active

### AD-020
- **Decision**: Adotar interface financeira clara nas cores branco, verde e laranja sandbox, com checkout isolado, acessibilidade WCAG 2.2 AA e nenhuma atualizacao otimista financeira.
- **Reason**: As referencias visuais aprovadas equilibram densidade operacional, clareza de status e confianca.
- **Trade-off**: Graficos e estados exigem alternativas textuais, contraste e testes visuais.
- **Scope**: `apps/web`, e-mails e comprovantes.
- **Date**: 2026-08-11
- **Status**: active

### AD-021
- **Decision**: Disponibilizar demo publica de um clique somente leitura e fornecer conta funcional do avaliador por canal privado; cadastro publico de producao exige convite.
- **Reason**: Demonstra o produto sem expor gateway, SMTP ou operacoes mutaveis a abuso publico.
- **Trade-off**: Adiciona sessao demo feature-flagged e um guard global de somente leitura.
- **Scope**: Autenticacao, demo, deploy e documentacao.
- **Date**: 2026-08-11
- **Status**: active

### AD-022
- **Decision**: Separar producao em `app`, `pay` e `api` no mesmo dominio registravel, com cookies host-only, CORS explicito e CSP por superficie.
- **Reason**: Isola painel, checkout/comprovante e API sem exigir clusters ou redes externas adicionais.
- **Trade-off**: A configuracao de CORS, CSRF e certificados e mais detalhada.
- **Scope**: Frontend, API, Caddy e seguranca web.
- **Date**: 2026-08-11
- **Status**: active

## Handoff

- **Feature**: BaaS Console / `.specs/features/baas-console/`
- **Phase / Task**: Design / gate de aprovacao do usuario
- **Completed**: `STATE.md`, `spec.md`, `context.md`, `design.md` e referencia sanitizada Lera Box; 124 requisitos e 22 decisoes validados
- **In-progress** (file:line): none
- **Next step**: obter aprovacao explicita do design antes de criar `tasks.md`
- **Blockers**: nenhum para documentacao; responses, webhooks e HMAC reais da Lera Box continuam como gate antes do adapter financeiro
- **Uncommitted files**: none after documentation commit
- **Branch**: main
