# BaaS Console Context

**Gathered:** 2026-08-11

**Spec:** `.specs/features/baas-console/spec.md`

**Status:** Ready for design review

## Feature Boundary

Entregar uma plataforma BaaS web para um proprietario por lojista, integrada exclusivamente por HTTP ao sandbox Lera Box, cobrindo onboarding, links, Pix, cartao, taxas, webhooks, conciliacao, carteira, extrato, saques, e-mail, comprovante PDF, qualidade, operacao, demo e deploy. A entrega nao cria ledger proprio, times, microservicos ou integracoes fora do escopo aprovado.

## Implementation Decisions

### Users, tenancy and gateway connection

- A identidade local do BaaS e distinta da identidade Lera Box.
- Cada `merchant` possui exatamente um usuario proprietario neste escopo.
- O tenant e derivado exclusivamente da sessao; o frontend nunca envia ou escolhe `merchantId` confiavel.
- Cadastro local cria o tenant e chama o cadastro publico do gateway, aceitando PF ou PJ e validando todos os campos de identidade, contato e endereco documentados.
- O roteiro `verify:live` usa e-mail e telefone reais aprovados pelo proprietario e guarda apenas evidencia mascarada de recebimento das credenciais.
- A chamada de cadastro remoto e registrada antes do envio; falha conclusiva e timeout desconhecido possuem estados distintos e nao provocam retry automatico.
- Como a Lera Box envia credenciais por e-mail, o onboarding entra em `AWAITING_CREDENTIALS`.
- Documento e senha do gateway sao informados uma unica vez ao backend por HTTPS; a senha nunca e persistida.
- Depois do login remoto, `GET /api/users/me` confirma que o perfil pertence ao lojista antes de ativar a conexao.
- Bearer token, CodigoCliente e ChaveLoja necessarios sao criptografados.
- Access token local dura 15 minutos; refresh token e rotativo, host-only e detecta reutilizacao.
- Recuperacao de senha local e P2; `POST /api/auth/reset-password` do gateway nao integra o escopo funcional obrigatorio e fica explicitamente fora do primeiro release.

### Checkout links

- Um link representa uma cobranca imutavel e single-use depois de aprovada.
- Metodos permitidos: Pix, cartao ou ambos.
- Expiracoes: 1 hora, 24 horas (default), 3 dias ou 7 dias.
- Correcao exige cancelar e criar outro link.
- Uma negacao definitiva encerra apenas a tentativa; o link pode receber outra tentativa enquanto valido.
- Nunca pode existir mais de uma tentativa nao resolvida por link.
- O token publico possui 256 bits, chega no fragmento da URL, e trocado por sessao curta e removido da barra.
- Pagador nao precisa criar conta.
- E-mail e opcional e usado somente para entrega/comprovante.
- Pix coleta `payerDocument` porque a referencia recebida o descreve como campo do request; nenhum nome, telefone ou campo adicional do comprador sera coletado sem evidencia.

### Pix and card

- Pix apresenta QR quando disponivel, EMV copiavel, estado acessivel e tempo restante.
- Enquanto um Pix estiver pendente, cartao ou outro Pix para o link permanecem bloqueados.
- Cartao coleta somente os campos requeridos, permite colar/autofill e detecta bandeira sem depender disso como verdade absoluta.
- Numero, CVV, validade e nome impresso existem apenas em memoria durante a chamada e sao proibidos em persistencia, log, metrica ou erro; persistem somente bandeira, ultimos quatro digitos e parcelas.
- Taxas sao consultadas por `GET /api/fees` e `?brand=` quando aplicavel, guardadas como snapshot e exibidas no resumo/detalhe do link; antes do POST sao revalidadas.
- A tentativa persiste parcelas, taxa efetivamente enviada e valores bruto/taxa/liquido normalizados para auditoria do lojista.
- Mudanca de taxa interrompe a submissao e exige nova confirmacao do pagador.
- A taxa e absorvida pelo lojista ate que evidencia do gateway prove outra semantica; nao ha surcharge inventado.
- Cinco negacoes consecutivas de cartao causam cooldown de 15 minutos, alem dos limites por IP/link.
- Timeout financeiro nunca e convertido em negacao nem repetido automaticamente.

### Webhooks and reconciliation

- Cada lojista/evento possui endpoint publico opaco e secret proprio.
- A tela Webhooks cadastra, lista, mostra status, reconfigura e remove `PAYMENT_PIX`, `PAYMENT_CARD` e `WITHDRAWAL`, sem reexibir secrets.
- HMAC e calculado sobre raw body e so sera fechado depois do contract spike confirmar encoding.
- Fluxo: validar assinatura e tamanho, persistir criptografado, responder, processar assincronamente.
- Payload autenticado mas semanticamente invalido e preservado como `UNPROCESSABLE` e recebe `200`.
- Falha de persistencia recebe `503`; assinatura invalida `401`; payload grande `413`.
- Dedupe usa o identificador mais forte comprovadamente disponivel e hash bruto apenas como fallback.
- Processadores usam lease, tentativas agendadas e dead letter no MySQL.
- Aprovacao tardia autenticada prevalece sobre estado local provisorio.
- Lojista pode solicitar nova conciliacao, mas nunca forcar um status.

### Wallet, transactions and withdrawals

- O gateway e autoritativo para saldo; o BaaS mantem snapshot com timestamp e staleness.
- Falha de leitura preserva o ultimo saldo e nunca mostra zero inventado.
- `transactions` e projecao reconstruivel, nao ledger nem fonte de saldo.
- O extrato consolidado usa tambem `GET /api/wallet/transactions?status=&type=&limit=`, informa horario/origem da sincronizacao e evidencia divergencias.
- Os filtros minimos sao literais: Sucesso=`APPROVED`, Falha=`DENIED`, Expirado=`EXPIRED` e Cancelado=`CANCELLED`.
- Saque exige resumo e confirmacao de irreversibilidade.
- Timeout de saque resulta em conciliacao pendente e bloqueia reenvio.
- Dados de destino sao minimizados apos o POST: tipo, mascara e indice cego somente quando necessario.
- Divergencias usam classificacoes explicitas: `MATCHED`, `MISMATCH`, `LOCAL_ONLY`, `GATEWAY_ONLY` e `MANUAL_REVIEW`.

### E-mail and receipts

- P1 envia link manualmente e confirmacao automatica depois de `APPROVED` quando ha e-mail.
- Nao enviar notificacao de negacao, pendencia ou erro tecnico ao pagador neste escopo.
- Mailpit atende desenvolvimento; SMTP real e configuravel por adapter.
- Entrega usa outbox, idempotencia, cinco tentativas e dead letter.
- O comprovante HTML/PDF existe somente para pagamento aprovado.
- Token de comprovante e separado, read-only, revogavel, regeneravel e expira em 30 dias.
- PDF e P1 e usa Playwright/Chromium sobre o mesmo template HTML imprimivel.
- Chromium roda non-root, sandboxed, sem rede/JavaScript para o documento, com contexto isolado, timeout e concorrencia inicialmente 1.
- PDFs sao transmitidos e descartados; nao ficam no filesystem ou banco.

### Public demo

- Nao publicar senha no README.
- A demo publica usa um endpoint feature-flagged que emite sessao curta para tenant ficticio fixo.
- O guard do backend permite leituras e apenas operacoes de sessao explicitamente allowlisted.
- Qualquer outra mutacao recebe `403 DEMO_READ_ONLY`.
- Avaliador recebe credenciais funcionais por canal privado.
- Em producao, cadastro completo exige convite descartavel; localmente ele permanece aberto.
- Existem roteiro rapido de cerca de 3 minutos e fluxo completo de 10 a 15 minutos.

### Quality and verification

- Testes derivam dos acceptance criteria e verificam outcomes, nao detalhes internos.
- Backend: Jest e Supertest; frontend: Vitest e Testing Library; Gherkin: Cucumber.js; E2E/PDF: Playwright; mutacao: StrykerJS.
- Regras que dependem de constraints/locking usam MySQL real.
- Regras de negocio usam fake do gateway; adapter HTTP usa stub deterministico com fixtures sanitizadas; sandbox real e manual.
- Cobertura backend global 90/85 branches; critica 95/90; frontend 85/80.
- Mutation score critico >= 80% e `NoCoverage = 0`.
- Zero skips, `.only`, warning lint/TS e flaky tolerado.
- O validador de qualidade e testado com artefatos que devem passar e falhar.
- O verificador final deve ser diferente do autor e aplicar discrimination sensor.
- A matriz de conformidade liga cada obrigacao do desafio a requisito TLC, componente, futura tarefa, teste/procedimento e evidencia.
- O plano formal de QA define entry/exit criteria, charters exploratorios, UAT, navegadores, sandbox real, severidade, evidencias e decisao de release.

### Git, CI/CD and deployment

- Trunk-based, branches curtas, Conventional Commits e um commit atomico por tarefa TLC.
- Main protegida, rebase merge preservando commits, sem force push.
- Actions por SHA, `GITHUB_TOKEN` com menor privilegio, sem `pull_request_target` e sem secrets em forks.
- Dependabot cobre npm, Docker e Actions; CodeQL, Gitleaks, secret scanning e push protection fazem parte da seguranca.
- Imagens GHCR nao usam `latest`; deploy usa digest.
- VPS recebe deploy por usuario/chave dedicados, `known_hosts` fixo e script root-owned allowlisted.
- Migracao e one-shot com lock; `synchronize=false`; expand/contract; sem down migration automatica.
- Caddy fornece HTTPS; MySQL nao publica porta; aplicacoes rodam non-root e com recursos limitados.
- README, `DEMO.md` e `.env.example` documentam setup, variaveis, fluxos, Swagger BaaS, URL publica/Docker e entrega privada das credenciais de avaliacao.

### Visual language

- As tres referencias aprovadas definem uma interface fintech operacional clara, nao uma estetica editorial experimental.
- Fundo branco/cinza muito claro, verde floresta como cor primaria, lima apenas em destaques e laranja para sandbox.
- Aplicacao autenticada usa banner sandbox em largura total; autenticacao usa badge compacto.
- Sidebar: Visao geral, Links de pagamento, Transacoes, Carteira, Saques, Webhooks e Configuracoes.
- Cards com bordas leves, sombras discretas, raio entre 8 e 12 px, icones lineares e tabelas densas.
- Dashboard pode usar composicao de recebimentos e movimentacao se os dados forem reais e houver alternativa tabular/textual.
- Status usam texto/icone alem de cor; contrastes devem passar WCAG 2.2 AA.
- Logo final sera um SVG original inspirado na geometria aprovada, nao copia literal de um asset de terceiros.

### Agent's Discretion

- Microcopy em portugues, desde que codigos de erro permaneçam estaveis em ingles.
- Escolha de biblioteca de icones lineares com licenca compativel.
- Tokens exatos de espacamento, tipografia e tons dentro da direcao aprovada.
- Limites numericos de descricao, filtros e paginacao, desde que documentados e testados.
- Layout mobile derivado das referencias desktop, com QA visual posterior.
- Patch versions de dependencias dentro dos majors aprovados.

### Declined / Undiscussed Gray Areas -> Assumptions

- Dominio, fornecedor SMTP e VPS ainda nao existem; o design usa configuracao por ambiente e gates antes do deploy.
- A licenca nao e criada ate confirmar as regras do desafio.
- Nao ha imagem especifica do checkout; a implementacao deriva o mesmo sistema visual e sera validada por screenshot/UAT.
- Nao existe SLO de latencia aprovado antes de benchmark; nenhum numero sera apresentado como medido.

## Specific References

- Referencia sanitizada da API: `docs/integrations/lera-box-api-reference.md`, derivada do documento fornecido pelo usuario e identificada por SHA-256.
- Matriz fonte-a-evidencia: `docs/traceability/challenge-compliance-matrix.md`.
- Procedimentos de QA: `docs/qa/quality-assurance-plan.md`.
- Dashboard aprovado: sidebar clara, barra sandbox, KPIs, composicao, movimentacao, operacao e transacoes recentes.
- Login aprovado: card central, marca no topo, badge sandbox e foco verde acessivel.
- Lista de links aprovada: KPIs, busca, filtros, tabs, tabela densa e acoes contextuais.
- O resumo visual acima e a fonte persistente; os arquivos temporarios originais devem ser incorporados como assets somente quando a implementacao visual for autorizada.

## Deferred Ideas

- WhatsApp.
- MFA, RBAC e equipes.
- Rotacao avancada de webhook secrets.
- Prometheus/Grafana e benchmark como P2.
- Dark mode.
- Aplicativo mobile.
