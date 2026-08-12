# BaaS Console Specification

**Status**: Approved

**Scope tier**: Complex

**Source**: `desafio-tecnico-baas-integracao-gateway-vba-systems.md`, `docs/traceability/challenge-compliance-matrix.md` and approved discovery decisions

## Problem Statement

Construir uma plataforma BaaS demonstravel em producao que permita a um lojista isolado integrar-se ao gateway sandbox Lera Box, criar cobrancas Pix e cartao, acompanhar eventos assincronos, consultar carteira e solicitar saques. A entrega deve provar nao apenas funcionalidade, mas tambem seguranca financeira, qualidade verificavel, operabilidade, rastreabilidade e disciplina de engenharia.

## Goals

- [ ] Entregar todos os requisitos obrigatorios do desafio por integracao HTTP fiel ao gateway.
- [ ] Disponibilizar um fluxo completo e demonstravel: onboarding, checkout, pagamento, webhook, conciliacao, e-mail e comprovante PDF.
- [ ] Impedir acesso cross-tenant, vazamento de segredos e repeticao insegura de efeitos financeiros.
- [ ] Tornar cada requisito rastreavel a testes automatizados ou procedimento de QA com evidencia.
- [ ] Executar localmente por Docker Compose e publicar em VPS com HTTPS, CI/CD e rollback por imagem imutavel.

## Out of Scope

| Feature | Reason |
| --- | --- |
| WhatsApp | E-mail foi priorizado para limitar integracoes externas. |
| Times, convites internos e RBAC | O modelo aprovado possui um proprietario por lojista. |
| MFA e login social | Nao sao necessarios para demonstrar o fluxo central. |
| Aplicativo mobile nativo | A interface web responsiva cobre o escopo. |
| Dark mode | Nao agrega sinal tecnico proporcional ao custo. |
| Microservicos, Kafka ou RabbitMQ | O volume e a topologia do desafio nao justificam distribuicao. |
| Event sourcing ou CQRS framework | Aumentaria cerimonia sem melhorar a corretude exigida. |
| Ledger financeiro proprio | O gateway e a autoridade do saldo; o BaaS mantem projecoes conciliaveis. |
| Retry automatico de POST financeiro | Pode duplicar pagamento ou saque quando o resultado remoto e desconhecido. |
| Armazenamento permanente de PDF | O documento sera regenerado sob demanda a partir do registro aprovado. |
| Dados reais de cartao | O ambiente e sandbox e deve usar somente dados ficticios. |
| Recuperacao de senha do gateway por `POST /api/auth/reset-password` | A rota aparece apenas no contrato resumido, nao no escopo funcional obrigatorio; recuperacao local e uma capacidade distinta e permanece P2. |

## Assumptions & Open Questions

Toda ambiguidade conhecida possui um default ou um gate verificavel; nenhuma sera resolvida por suposicao silenciosa.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Encoding exato de `X-Lera-Box-Signature` | Bloquear implementacao final do verificador ate o contract spike confirmar bytes, encoding e comparacao | A documentacao conhecida informa HMAC-SHA256, mas nao fecha o encoding | Yes: gate approved |
| Schemas reais de resposta e webhook | Capturar fixtures sanitizadas em sandbox e validar por testes de contrato | O OpenAPI conhecido nao descreve todas as respostas | Yes: gate approved |
| Semantica de `feePercent` | Lojista absorve a taxa; nao adicionar surcharge ao pagador sem evidencia do contrato | Evita cobrar valor nao especificado | Yes |
| Campos do comprador | Pix coleta `payerDocument`; cartao coleta os campos documentados do instrumento; e-mail permanece opcional para comprovante; nenhum outro campo e coletado sem evidencia | A referencia recebida descreve esses campos e a politica mantem minimizacao | Yes |
| Provedor SMTP | Adapter SMTP generico; Mailpit local; provedor real escolhido depois do dominio | Evita acoplamento prematuro | Yes |
| VPS e dominio | Configuracao por variaveis e tres hosts; dimensionamento final depende de benchmark | O fornecedor ainda nao foi comprado | Yes |
| Licenca publica | Nao adicionar licenca ate confirmar as regras do desafio; usar MIT se nao houver restricao | Evita assumir direitos de redistribuicao | Yes |
| Patch versions | Resolver e fixar no bootstrap, mantendo majors aprovados e lockfile versionado | Patches mudam sem alterar o design | Yes |
| Concorrencia do PDF | Iniciar em 1 e aumentar somente com benchmark na imagem de producao | Chromium compete por memoria com a API | Yes |
| Disponibilidade do gateway | Falha do gateway nao zera saldo e nao derruba readiness basica | Dependencia externa nao deve mascarar o estado local | Yes |
| Cadastro no deploy publico | Exigir convite de uso unico; local permanece aberto | Protege o endpoint publico do gateway contra abuso | Yes |
| Status aleatorios do sandbox | Testes automatizados usam fake/stub deterministico; sandbox real apenas em `verify:live` | Testes nao podem depender de aleatoriedade externa | Yes |
| Cadastro PF e PJ | A API e a UI aceitam ambos; o roteiro live executa um tipo por rodada com contato real aprovado pelo proprietario | Prova aderencia sem criar contas reais desnecessarias | Yes |
| Confirmacao da identidade remota | Depois do login, consultar `GET /api/users/me` e conferir o perfil antes de ativar a conexao | Impede associar silenciosamente uma credencial valida ao lojista errado | Yes |

**Open questions:** none — external unknowns are explicit research or deployment gates above.

---

## User Stories

### P1: Onboard and authenticate a merchant

**User Story**: Como proprietario de um lojista, quero criar e acessar minha conta BaaS e conecta-la com seguranca a Lera Box para operar sem expor credenciais do gateway.

**Why P1**: Todas as operacoes financeiras dependem de identidade local, tenant e credencial remota validos.

**Acceptance Criteria**:

1. **AUTH-01** — WHEN um visitante envia dados locais validos de cadastro THEN o sistema SHALL criar exatamente um `merchant` e um `user` proprietario na mesma transacao.
2. **AUTH-02** — WHEN o onboarding solicita cadastro no gateway THEN o backend SHALL registrar o estado da tentativa e chamar `POST /api/users` exatamente uma vez sem expor segredo ao frontend; resposta conclusiva de falha SHALL marcar `GATEWAY_REGISTRATION_FAILED`, enquanto timeout sem resultado SHALL marcar `GATEWAY_REGISTRATION_UNKNOWN` e impedir retry automatico.
3. **AUTH-03** — WHEN o gateway aceita o cadastro e informa que enviara credenciais por e-mail THEN o sistema SHALL marcar a conexao como `AWAITING_CREDENTIALS` sem fabricar CodigoCliente, ChaveLoja ou senha; o procedimento live SHALL registrar evidencia mascarada de recebimento sem armazenar ou publicar a credencial.
4. **AUTH-04** — WHEN o proprietario informa documento e senha recebidos do gateway THEN somente o backend SHALL chamar `POST /api/auth/login` por HTTPS e a senha SHALL existir apenas durante essa requisicao.
5. **AUTH-05** — WHEN o login no gateway retorna token, CodigoCliente e ChaveLoja THEN o sistema SHALL persistir valores necessarios criptografados por AES-256-GCM e nunca persistir a senha do gateway.
6. **AUTH-06** — WHEN credenciais locais validas sao autenticadas THEN o sistema SHALL emitir access token de 15 minutos e refresh token rotativo em cookie `HttpOnly`, `Secure` e host-only.
7. **AUTH-07** — WHEN um refresh token ja rotacionado e reutilizado THEN o sistema SHALL revogar a familia da sessao e exigir novo login.
8. **AUTH-08** — WHEN limites de login, cadastro, convite ou conexao sao excedidos THEN o sistema SHALL responder `429` com codigo estavel e `Retry-After`.
9. **AUTH-09** — WHEN um usuario autenticado solicita recurso pertencente a outro lojista THEN o sistema SHALL responder `404` e nao revelar a existencia do recurso.
10. **AUTH-10** — WHEN o proprietario encerra uma sessao ou todas as sessoes THEN os refresh tokens correspondentes SHALL ser revogados e nao poderao emitir novo access token.
11. **AUTH-11** — WHEN o cadastro no gateway e preparado THEN o sistema SHALL aceitar `personType` PF ou PJ, validar os campos de identidade, endereco, documento, e-mail e telefone exigidos e, no teste live, usar somente e-mail e telefone reais previamente aprovados pelo proprietario.
12. **AUTH-12** — WHEN o login do gateway retorna uma sessao THEN o backend SHALL consultar `GET /api/users/me`, conferir documento/identidade esperados e somente ativar a conexao se o perfil pertencer ao lojista em onboarding.

**Independent Test**: Criar um lojista, conectar um fake HTTP do gateway, autenticar, rotacionar a sessao, tentar reutiliza-la e comprovar isolamento com um segundo tenant.

### P1: Create and manage checkout links

**User Story**: Como lojista, quero criar um link imutavel e conciliavel para receber um valor por Pix, cartao ou ambos.

**Why P1**: O link e a unidade publica que conecta produto, checkout, pagamentos e conciliacao.

**Acceptance Criteria**:

1. **CHK-01** — WHEN o lojista envia descricao, valor positivo dentro dos limites, metodos permitidos, expiracao e parcelas validas THEN o sistema SHALL criar um link `ACTIVE` com referencia externa unica.
2. **CHK-02** — WHEN o valor entra ou sai da API THEN ele SHALL ser validado e transportado em centavos inteiros, sem ponto flutuante.
3. **CHK-03** — WHEN o link permite cartao THEN o backend SHALL consultar `GET /api/fees` e, quando aplicavel, `?brand=`, persistir o snapshot de parcelas/taxas e exibir a taxa selecionada no resumo de criacao e no detalhe do link.
4. **CHK-04** — WHEN o link ja foi criado THEN valor, metodos, expiracao e descricao financeira SHALL ser imutaveis; correcao SHALL exigir cancelamento e novo link.
5. **CHK-05** — WHEN o lojista cancela um link `ACTIVE` sem tentativa nao resolvida THEN o estado SHALL mudar uma unica vez para `CANCELLED`.
6. **CHK-06** — WHEN o relogio ultrapassa a expiracao de um link `ACTIVE` THEN o sistema SHALL trata-lo como `EXPIRED` e impedir novas tentativas.
7. **CHK-07** — WHEN um pagamento e definitivamente aprovado THEN o link SHALL mudar para `PAID` e impedir qualquer nova tentativa.
8. **CHK-08** — WHEN uma tentativa e definitivamente negada e o link continua valido THEN o link SHALL permanecer `ACTIVE` e permitir uma nova tentativa.
9. **CHK-09** — WHEN existe tentativa `PROCESSING`, `PENDING` ou `RECONCILIATION_PENDING` THEN nenhuma segunda tentativa financeira SHALL ser criada para o mesmo link.
10. **CHK-10** — WHEN um link publico e emitido THEN seu token SHALL conter pelo menos 256 bits de entropia, ser pesquisado por hash e nunca aparecer em logs.
11. **CHK-11** — WHEN o token chega no fragmento `#/checkout/TOKEN` THEN o frontend SHALL troca-lo por sessao curta de checkout, remover o token da URL e nao reutiliza-lo em chamadas subsequentes.
12. **CHK-12** — WHEN um link inexistente, expirado, cancelado ou pago e aberto THEN a interface SHALL mostrar o estado correto sem revelar dados internos.

**Independent Test**: Criar links para cada metodo, validar imutabilidade/transicoes, simular concorrencia e abrir a URL publica sem vazar o token.

### P1: Pay with Pix or card

**User Story**: Como pagador, quero concluir um pagamento sandbox com clareza e sem risco de cobranca duplicada.

**Why P1**: Pix e cartao sao o nucleo funcional do desafio.

**Acceptance Criteria**:

1. **PAY-01** — WHEN um checkout Pix valido com `payerDocument` validado e confirmado THEN o backend SHALL criar uma tentativa e executar exatamente um `POST /api/payments/pix` com valor em centavos, descricao e `externalReference` conciliavel.
2. **PAY-02** — WHEN o gateway retorna EMV, QR ou txid THEN o checkout SHALL exibir os campos disponiveis, oferecer copia do EMV e manter a tentativa pendente ate resultado definitivo.
3. **PAY-03** — WHEN o Pix esta pendente THEN o checkout SHALL atualizar o estado por webhook e consultas controladas sem criar outro Pix.
4. **PAY-04** — WHEN o Pix expira ou e definitivamente negado THEN o sistema SHALL encerrar a tentativa e permitir nova tentativa se o link ainda estiver `ACTIVE`.
5. **PAY-05** — WHEN o pagador seleciona cartao THEN a interface SHALL coletar apenas nome impresso, numero, validade, CVV e parcelas comprovadamente exigidos pelo contrato.
6. **PAY-06** — WHEN numero, CVV, validade ou nome impresso atravessam o backend THEN eles SHALL permanecer apenas em memoria durante a requisicao e nunca ser persistidos, registrados ou incluidos em erro; somente bandeira, ultimos quatro digitos e parcelas poderao permanecer.
7. **PAY-07** — WHEN a bandeira e detectada e a parcela escolhida THEN o sistema SHALL selecionar a taxa correspondente no snapshot do link.
8. **PAY-08** — WHEN o pagador confirma o cartao THEN o backend SHALL consultar novamente a taxa vigente antes do POST financeiro.
9. **PAY-09** — WHEN a taxa vigente diverge do snapshot THEN o sistema SHALL cancelar o envio, apresentar o novo resumo e exigir nova confirmacao explicita.
10. **PAY-10** — WHEN taxa e confirmacao sao validas THEN o backend SHALL executar exatamente um `POST /api/payments/card` com `installments`, `feePercent` e `externalReference` corretos.
11. **PAY-11** — WHEN o gateway responde `APPROVED` THEN a tentativa e o link SHALL refletir aprovacao por transicao atomica e idempotente.
12. **PAY-12** — WHEN o gateway responde `DENIED` THEN somente a tentativa SHALL ser negada e uma nova tentativa podera ocorrer enquanto o link for valido.
13. **PAY-13** — WHEN qualquer POST financeiro termina em timeout ou conexao interrompida sem resposta conclusiva THEN o sistema SHALL registrar `RECONCILIATION_PENDING`, responder `202` e nao repetir o POST.
14. **PAY-14** — WHEN cinco tentativas consecutivas de cartao sao negadas no mesmo link THEN o sistema SHALL impor cooldown de 15 minutos, alem dos limites por IP.
15. **PAY-15** — WHEN um resultado tardio `APPROVED` e autenticado e conciliado THEN ele SHALL prevalecer sobre expiracao local ou negacao provisoria, sem criar segunda transacao.
16. **PAY-16** — WHEN qualquer checkout e exibido THEN a interface SHALL informar que e sandbox e proibir o uso de cartoes reais.
17. **PAY-17** — WHEN uma tentativa de cartao e enviada THEN parcelas, taxa normalizada equivalente ao `feePercent` efetivamente enviado e valores bruto/taxa/liquido calculados SHALL ser persistidos e exibidos no detalhe financeiro do lojista; o teste de contrato SHALL provar a serializacao exata enviada ao gateway.

**Independent Test**: Executar Pix e cartao contra stub deterministico, incluindo taxa alterada, negacao, timeout, cooldown, webhook tardio e verificacao de ausencia de PAN/CVV.

### P1: Receive webhooks and reconcile outcomes

**User Story**: Como sistema financeiro, quero receber eventos autenticados e processa-los exatamente uma vez do ponto de vista de negocio, mesmo com repeticoes ou desordem.

**Why P1**: O gateway entrega resultados definitivos de forma assincrona.

**Acceptance Criteria**:

1. **WHK-01** — WHEN o lojista configura integracoes THEN o backend SHALL cadastrar URLs opacas para `PAYMENT_PIX`, `PAYMENT_CARD` e `WITHDRAWAL`, cada uma com secret proprio por lojista e evento.
2. **WHK-02** — WHEN um webhook chega THEN o verificador SHALL calcular HMAC-SHA256 sobre os bytes brutos no encoding comprovado pelo contract spike e comparar em tempo constante.
3. **WHK-03** — WHEN a assinatura e invalida THEN o endpoint SHALL responder `401` sem persistir payload nem revelar detalhes da verificacao.
4. **WHK-04** — WHEN o payload excede o limite configurado THEN o endpoint SHALL responder `413` antes de processamento ou persistencia.
5. **WHK-05** — WHEN assinatura e tamanho sao validos THEN o sistema SHALL criptografar e persistir o evento antes de responder `200`.
6. **WHK-06** — WHEN o banco nao consegue persistir um evento valido THEN o endpoint SHALL responder `503` para permitir nova entrega.
7. **WHK-07** — WHEN um payload autenticado nao pode ser interpretado semanticamente THEN ele SHALL ser marcado `UNPROCESSABLE`, retido para diagnostico e receber `200` para evitar loop infinito.
8. **WHK-08** — WHEN eventos iguais sao reenviados THEN a deduplicacao SHALL usar, em ordem, ID oficial comprovado, chave de transacao/evento/status, referencia externa/evento/status e hash bruto como fallback.
9. **WHK-09** — WHEN o worker adquire um evento THEN um lease atomico SHALL impedir processamento concorrente do mesmo registro.
10. **WHK-10** — WHEN o evento representa transicao valida THEN pagamento, saque, transacao e evento financeiro SHALL ser atualizados atomicamente.
11. **WHK-11** — WHEN o evento tenta uma transicao regressiva ou impossivel THEN o estado financeiro SHALL permanecer inalterado e o evento SHALL ser marcado para revisao.
12. **WHK-12** — WHEN processamento falha de forma transitoria THEN tentativas, proximo horario, lease e erro sanitizado SHALL ser persistidos; apos o limite, o evento SHALL ir para dead letter.
13. **WHK-13** — WHEN a conciliacao automatica roda THEN ela SHALL consultar por ID e extrato/referencia externa sem repetir o efeito financeiro original.
14. **WHK-14** — WHEN dados local e remoto divergem ou existem apenas de um lado THEN o sistema SHALL classificar `MISMATCH`, `LOCAL_ONLY`, `GATEWAY_ONLY` ou `MANUAL_REVIEW` e nunca permitir forcar status pelo frontend.

**Independent Test**: Enviar fixtures assinadas validas, invalidas, duplicadas, fora de ordem e ininterpretaveis; comprovar uma unica transicao e classificacoes de conciliacao.

### P1: Consult wallet, transactions and request withdrawals

**User Story**: Como lojista, quero visualizar a posicao financeira conciliada e solicitar saque sem interpretar falha como saldo zero ou repetir a ordem.

**Why P1**: Carteira, extrato e saque sao requisitos centrais.

**Acceptance Criteria**:

1. **FIN-01** — WHEN a carteira e consultada com sucesso THEN o sistema SHALL persistir snapshot com saldo em centavos e horario UTC da leitura.
2. **FIN-02** — WHEN a leitura da carteira falha THEN o sistema SHALL preservar o ultimo snapshot, marca-lo stale e nunca substituir saldo por zero.
3. **FIN-03** — WHEN o dashboard exibe saldo THEN ele SHALL mostrar horario da ultima atualizacao e estado stale quando aplicavel.
4. **FIN-04** — WHEN transacoes sao listadas THEN o sistema SHALL permitir filtros por status, tipo, periodo e referencia dentro do tenant autenticado.
5. **FIN-05** — WHEN pagamentos, saques, webhooks ou conciliacao mudam estado THEN a projecao local de transacoes SHALL ser atualizada de forma idempotente e reconstruivel.
6. **FIN-06** — WHEN o usuario confirma saque THEN a interface SHALL apresentar valor, destino mascarado e aviso de irreversibilidade antes do envio.
7. **FIN-07** — WHEN o saque e submetido THEN o backend SHALL executar exatamente um `POST /api/withdrawals` e registrar referencia conciliavel.
8. **FIN-08** — WHEN o POST de saque perde o resultado THEN o saque SHALL ficar `RECONCILIATION_PENDING` e nao podera ser reenviado automaticamente.
9. **FIN-09** — WHEN o status do saque e consultado ou recebido por webhook THEN a transicao SHALL obedecer a matriz valida e atualizar a projecao.
10. **FIN-10** — WHEN documento, conta ou chave Pix de destino sao enviados THEN somente tipo, forma mascarada e indice cego necessario SHALL persistir apos o envio.
11. **FIN-11** — WHEN um lojista solicita reconciliacao manual THEN ele SHALL apenas disparar nova verificacao; nao podera escolher o status final.
12. **FIN-12** — WHEN uma consulta financeira externa falha THEN a API SHALL responder problema estavel com `503`, mantendo dados locais e indicando indisponibilidade.
13. **FIN-13** — WHEN o lojista usa os filtros minimos da interface THEN `Sucesso` SHALL mapear para `APPROVED`, `Falha` para `DENIED`, `Expirado` para `EXPIRED` e `Cancelado` para `CANCELLED`, considerando o estado do link e/ou gateway sem conflar pendencias.
14. **FIN-14** — WHEN o extrato consolidado e carregado ou reconciliado THEN o backend SHALL consultar `GET /api/wallet/transactions?status=&type=&limit=`, correlacionar por IDs/referencia externa e apresentar origem, horario da sincronizacao e divergencias entre remoto e projecao local.

**Independent Test**: Simular saldo atual/stale, filtrar projecoes de dois tenants e executar saque aprovado, negado e inconclusivo sem duplicacao.

### P1: Send e-mails and issue receipts

**User Story**: Como lojista e pagador, quero enviar o checkout por e-mail e obter comprovante HTML/PDF de um pagamento aprovado.

**Why P1**: E-mail e comprovante sao diferenciais explicitamente pedidos e aprovados como parte do primeiro release.

**Acceptance Criteria**:

1. **DOC-01** — WHEN o lojista solicita envio de um link para e-mail valido THEN a operacao SHALL gravar uma entrega `QUEUED` na mesma unidade transacional necessaria e retornar sem aguardar SMTP.
2. **DOC-02** — WHEN o worker envia e-mail THEN ele SHALL usar o adapter SMTP e registrar apenas metadados permitidos e destinatario mascarado.
3. **DOC-03** — WHEN SMTP falha de forma transitoria THEN o sistema SHALL tentar no maximo cinco vezes nos marcos imediato, 1, 5, 15 e 60 minutos.
4. **DOC-04** — WHEN todas as tentativas falham THEN a entrega SHALL mudar para `DEAD_LETTER` e ficar visivel para reenvio manual auditavel.
5. **DOC-05** — WHEN a mesma chave idempotente e processada novamente THEN nenhum segundo e-mail SHALL ser enviado; reenvio manual SHALL criar nova chave/versionamento.
6. **DOC-06** — WHEN um pagamento aprovado possui e-mail opcional do pagador THEN o sistema SHALL enfileirar exatamente uma confirmacao com link de comprovante.
7. **DOC-07** — WHEN pagamento nao esta `APPROVED` THEN o sistema SHALL negar emissao de comprovante com erro de dominio estavel.
8. **DOC-08** — WHEN um comprovante e emitido THEN seu token SHALL ser independente do checkout, somente leitura, pesquisado por hash, revogavel e valido por 30 dias.
9. **DOC-09** — WHEN a pagina de comprovante abre THEN ela SHALL mostrar lojista, descricao, valor, metodo, data UTC/local formatada, numero publico, sandbox e dados mascarados aplicaveis.
10. **DOC-10** — WHEN o PDF e solicitado THEN Playwright SHALL renderizar o mesmo template HTML/CSS de impressao em Chromium sandboxed e transmitir um PDF sem persistir o arquivo.
11. **DOC-11** — WHEN o renderer esta saturado ou excede timeout THEN a API SHALL responder `503 PDF_RENDERER_BUSY` com `Retry-After`, fechar pagina/contexto e manter a API funcional.
12. **DOC-12** — WHEN HTML ou PDF sao inspecionados THEN nenhum PAN, CVV, token, payload, segredo, ID interno ou taxa absorvida pelo lojista SHALL estar presente.

**Independent Test**: Enfileirar e-mails com sucesso/falha/idempotencia, abrir token de recibo e validar PDF real, texto, mascaramento, timeout e saturacao.

### P1: Operate through an accessible web interface

**User Story**: Como lojista ou pagador, quero compreender operacoes e estados financeiros em uma interface responsiva e acessivel.

**Why P1**: O desafio exige interface React funcional para todos os fluxos centrais.

**Acceptance Criteria**:

1. **UI-01** — WHEN o usuario autentica THEN o painel SHALL apresentar saldo, recebimentos, transacoes, taxa de aprovacao, integracoes e eventos recentes com estados vazios e stale definidos.
2. **UI-02** — WHEN taxa de aprovacao e exibida THEN ela SHALL ser calculada como aprovadas dividido por aprovadas mais negadas, excluindo pendentes, com formula acessivel ao usuario.
3. **UI-03** — WHEN conversao de links e exibida THEN ela SHALL usar pagos dividido por links finalizados, excluindo ativos, e explicar o denominador.
4. **UI-04** — WHEN graficos aparecem THEN a mesma informacao SHALL existir em resumo textual ou tabela e nao depender somente de cor.
5. **UI-05** — WHEN qualquer operacao financeira e submetida THEN a interface SHALL apresentar `submitting`, `pending`, `reconciliation`, `confirmed` ou erro real e nao aplicar atualizacao otimista.
6. **UI-06** — WHEN componentes interativos recebem teclado ou leitor de tela THEN foco, nome acessivel, ordem, live regions e contraste SHALL atender WCAG 2.2 AA.
7. **UI-07** — WHEN a largura muda de desktop para mobile THEN navegacao, tabelas, formularios, QR e acoes SHALL permanecer utilizaveis sem perda de informacao financeira.
8. **UI-08** — WHEN o checkout publico e carregado THEN ele SHALL usar bundle e CSP separados do painel, sem analytics ou scripts de terceiros.
9. **UI-09** — WHEN uma tela autenticada abre THEN ela SHALL usar o padrao visual aprovado: branco, verde financeiro, realce lima restrito, banner laranja de sandbox, sidebar e tabelas densas.
10. **UI-10** — WHEN erros de API sao apresentados THEN a interface SHALL traduzir codigos estaveis para portugues sem exibir stack, payload ou erro bruto da dependencia.
11. **UI-11** — WHEN o lojista abre Webhooks THEN a interface SHALL permitir cadastrar, listar, inspecionar status, reconfigurar e remover callbacks de `PAYMENT_PIX`, `PAYMENT_CARD` e `WITHDRAWAL`, sem revelar secrets depois da criacao.

**Independent Test**: Navegar pelos fluxos em desktop/mobile, executar axe, teclado, estados financeiros e comparar telas principais com as referencias aprovadas.

### P1: Prove quality, security and operability

**User Story**: Como avaliador, quero evidencias reproduziveis de que requisitos, seguranca e comportamento foram realmente verificados.

**Why P1**: Qualidade e o principal diferencial solicitado pelo usuario e influencia diretamente a avaliacao tecnica.

**Acceptance Criteria**:

1. **QLT-01** — WHEN `npm run verify:quick` executa THEN formatacao, lint, tipos e testes unitarios relacionados SHALL passar sem warning, erro ou skip.
2. **QLT-02** — WHEN `npm run verify` executa em PR THEN unitarios, integracao, contrato, componentes, Gherkin, cobertura e build SHALL passar deterministicamente.
3. **QLT-03** — WHEN `npm run verify:full` executa THEN E2E, mutation testing, Docker smoke e release checks SHALL passar.
4. **QLT-04** — WHEN `npm run verify:live` executa manualmente com segredos locais THEN SHALL validar o sandbox real sem registrar ou persistir credenciais e sem integrar esse resultado aleatorio ao gate de PR.
5. **QLT-05** — WHEN cobertura backend e calculada THEN linhas, statements e functions SHALL ser pelo menos 90% e branches pelo menos 85%.
6. **QLT-06** — WHEN modulos criticos financeiros, tenancy, auth, HMAC, criptografia e redaction sao medidos THEN linhas/statements/functions SHALL ser pelo menos 95% e branches pelo menos 90%.
7. **QLT-07** — WHEN cobertura frontend e calculada THEN linhas/statements/functions SHALL ser pelo menos 85% e branches pelo menos 80%.
8. **QLT-08** — WHEN Stryker executa nos modulos criticos THEN mutation score SHALL ser pelo menos 80% e `NoCoverage` SHALL ser zero.
9. **QLT-09** — WHEN o repositorio e validado THEN testes skipped, only, flaky ou snapshot sem justificativa SHALL totalizar zero.
10. **QLT-10** — WHEN `scripts/validate-quality.mjs` recebe artefatos aprovados ou reprovados THEN testes proprios SHALL provar que ele aceita o conjunto valido e rejeita cada violacao configurada.
11. **QLT-11** — WHEN cenarios Gherkin executam THEN arquivos `.feature` em portugues SHALL cobrir jornadas e regras de negocio sem duplicar testes de implementacao.
12. **QLT-12** — WHEN contratos da Lera Box sao testados THEN um stub HTTP deterministico e fixtures sanitizadas reais SHALL validar requests, responses e erros do adapter.
13. **QLT-13** — WHEN persistencia, constraints ou concorrencia sao testadas THEN os testes SHALL usar MySQL real compativel com producao, nao SQLite.
14. **QLT-14** — WHEN Playwright E2E executa no PR THEN Chromium SHALL cobrir o caminho critico; no gate completo Firefox e WebKit SHALL cobrir fluxos compativeis, com retry de evidencia que ainda marca flakiness como falha.
15. **QLT-15** — WHEN serializers, erros e adapter HTTP sao testados THEN fixtures com PAN, CVV, token, senha, chave Pix e PII SHALL provar ausencia desses valores em logs e respostas.
16. **QLT-16** — WHEN metricas sao inspecionadas THEN labels SHALL usar rota normalizada e nunca conter merchantId, requestId, externalReference, PII ou IDs de transacao.
17. **QLT-17** — WHEN health endpoints sao chamados THEN `/health/live` SHALL provar processo vivo, `/health/ready` banco/schema, e dependencias/metricas SHALL permanecer privadas.
18. **QLT-18** — WHEN erros HTTP sao produzidos THEN eles SHALL usar `application/problem+json`, requestId interno e codigos estaveis conforme a matriz definida no design.
19. **QLT-19** — WHEN as matrizes de conformidade e cobertura sao validadas THEN 100% das obrigacoes do documento-fonte e 100% dos requisitos P1 SHALL apontar para componente, futura tarefa, teste automatizado ou procedimento QA e evidencia esperada, sem linha obrigatoria implicita ou sem destino.
20. **QLT-20** — WHEN a verificacao TLC final executa THEN um verificador diferente do autor SHALL conferir outcomes por requisito e aplicar discrimination sensor sem aceitar autoavaliacao como evidencia.
21. **QLT-21** — WHEN a conformidade de stack e auditada THEN o repositorio SHALL provar TypeScript/NestJS, TypeORM/MySQL, `class-validator`/`class-transformer`, `@nestjs/swagger`, middleware Nest de logging/correlation id/apoio a autenticacao e React/Vite nos pontos definidos pelo design.
22. **QLT-22** — WHEN um release candidate e avaliado THEN o plano formal de QA SHALL executar criterios de entrada/saida, testes exploratorios, UAT, matriz de navegadores, roteiro de sandbox real, triagem de defeitos e indice de evidencias, produzindo relatorio final aprovado ou bloqueado.

**Independent Test**: Executar fixtures positivas e negativas do validador, pipeline completo e auditoria de rastreabilidade; injetar mutacoes de comportamento e comprovar que os testes falham.

### P1: Build, deploy and demonstrate safely

**User Story**: Como avaliador e operador, quero executar, revisar e implantar uma versao imutavel com documentacao suficiente para reproduzir e reverter a entrega.

**Why P1**: Docker, VPS, HTTPS, README e CI/CD sao sinais centrais da entrega final.

**Acceptance Criteria**:

1. **OPS-01** — WHEN um desenvolvedor possui Docker e arquivo env valido THEN um comando documentado SHALL iniciar API, web, MySQL e Mailpit com health checks.
2. **OPS-02** — WHEN producao inicia THEN Caddy SHALL terminar HTTPS e rotear somente hosts/origens aprovados para app, pay e api.
3. **OPS-03** — WHEN containers de aplicacao executam THEN eles SHALL usar usuario nao-root, `no-new-privileges`, capabilities minimas, limites de recurso e rede de banco nao publica.
4. **OPS-04** — WHEN migracoes executam THEN um job one-shot com lock e credencial propria SHALL aplicar somente migracoes explicitas com `synchronize=false`.
5. **OPS-05** — WHEN uma PR abre THEN GitHub Actions SHALL executar com permissoes minimas, actions fixadas por SHA e sem segredos em eventos de fork.
6. **OPS-06** — WHEN main e publicada THEN imagens GHCR SHALL usar tag por commit/semver, digest imutavel, SBOM, provenance e scan; `latest` SHALL nao ser usado.
7. **OPS-07** — WHEN vulnerabilidade fixavel high ou critical existe THEN a publicacao/deploy SHALL falhar salvo excecao documentada, aprovada e com expiracao.
8. **OPS-08** — WHEN deploy de producao e solicitado THEN GitHub Environment SHALL exigir aprovacao manual, serializar deploys e nao cancelar deploy ativo.
9. **OPS-09** — WHEN o host recebe deploy THEN uma chave dedicada e `known_hosts` fixado SHALL invocar somente script root-owned allowlisted, sem acesso geral a root ou Docker group.
10. **OPS-10** — WHEN uma nova imagem e implantada THEN o deploy SHALL executar preflight, migracao, health check e smoke; falha SHALL restaurar o digest anterior sem executar down migration automatica.
11. **OPS-11** — WHEN backup e configurado apos escolha da VPS THEN SHALL existir copia diaria criptografada fora do host e teste documentado de restauracao; dump predeploy SHALL ser chamado snapshot, nao backup.
12. **OPS-12** — WHEN a demo publica e acessada THEN uma sessao feature-flagged SHALL abrir lojista ficticio somente leitura sem senha publicada.
13. **OPS-13** — WHEN a sessao demo tenta metodo mutavel nao allowlisted THEN o backend SHALL responder `403 DEMO_READ_ONLY`, independentemente do que o frontend exibe.
14. **OPS-14** — WHEN o avaliador recebe a entrega THEN README e `DEMO.md` SHALL conter quick tour, fluxo completo, setup, arquitetura, variaveis, testes, limitacoes, seguranca e canal privado para credenciais funcionais.
15. **OPS-15** — WHEN a entrega e preparada THEN SHALL existir `.env.example` sem segredos, URL documentada do Swagger BaaS, URL publica e/ou comando Docker funcional, e credenciais de demonstracao fornecidas sem expor a senha do e-mail usado no gateway.

**Independent Test**: Subir a composicao limpa, executar smoke, simular falha/rollback, comprovar guard demo e seguir a documentacao em ambiente sem estado previo.

### P2: Extended observability and performance evidence

**User Story**: Como operador, quero dashboards e benchmarks reproduziveis para dimensionar a VPS com dados em vez de promessas.

**Why P2**: Agrega sinal operacional, mas nao deve atrasar a corretude financeira P1.

**Acceptance Criteria**:

1. **P2-01** — WHEN o perfil observability e habilitado THEN Prometheus e Grafana SHALL iniciar sem ficarem publicamente expostos.
2. **P2-02** — WHEN dashboards carregam THEN eles SHALL mostrar taxa de erro, latencia, gateway, webhook, reconciliacao, e-mail e PDF sem labels de alta cardinalidade.
3. **P2-03** — WHEN o benchmark roda na imagem de producao THEN ele SHALL registrar versoes, hardware, massa, comando e resultados brutos reproduziveis.
4. **P2-04** — WHEN concorrencia ou tamanho de VPS sao recomendados THEN a recomendacao SHALL citar o benchmark e nao apresentar p95 nao medido.

**Independent Test**: Ativar o perfil, verificar isolamento de rede e reproduzir o benchmark a partir da documentacao.

---

## Edge Cases and Dimension Sweep

| Dimension | Resolution |
| --- | --- |
| Input validation & bounds | DTOs validam formatos, limites, centavos, expiracao, parcelas, payload e tamanho; campos do gateway dependem de fixture comprovada. |
| Failure / partial failure | Timeouts financeiros viram conciliacao; SMTP/PDF possuem falha explicita; erro de gateway nunca vira saldo zero ou negacao inventada. |
| Idempotency / retry / duplicate | Constraints de tentativa, inbox de webhook, outbox de e-mail e chaves de idempotencia cobrem efeitos repetidos; POST financeiro nao tem retry automatico. |
| Auth boundaries & rate limits | Tenant vem da sessao, cross-tenant retorna 404, demo e read-only, endpoints publicos possuem limites especificos. |
| Concurrency / ordering | Banco garante uma tentativa pendente, workers usam lease e transicoes aceitam eventos tardios sem regressao. |
| Data lifecycle / expiry | Sessoes 30 dias, raw webhook criptografado 90 dias, conteudo de e-mail 30 dias, receipt token 30 dias; dados financeiros normalizados permanecem durante o desafio. |
| Observability | Logs por allowlist, metricas sem alta cardinalidade, requestId interno e problemas RFC 9457. |
| External dependency failure | Gateway, SMTP e Chromium possuem timeouts, estados e recuperacao definidos; readiness local nao depende do gateway. |
| State-transition integrity | Matrizes separadas para link, tentativa, saque, webhook e e-mail; transicoes invalidas sao rejeitadas/auditadas. |

## Requirement Traceability

| Requirement IDs | Story | Phase | Status |
| --- | --- | --- | --- |
| AUTH-01..AUTH-12 | Onboarding and authentication | Design | In Design |
| CHK-01..CHK-12 | Checkout links | Design | In Design |
| PAY-01..PAY-17 | Pix and card | Design | In Design |
| WHK-01..WHK-14 | Webhooks and reconciliation | Design | In Design |
| FIN-01..FIN-14 | Wallet, transactions and withdrawals | Design | In Design |
| DOC-01..DOC-12 | E-mail and receipts | Design | In Design |
| UI-01..UI-11 | Web interface | Design | In Design |
| QLT-01..QLT-22 | Quality, security and operability | Design | In Design |
| OPS-01..OPS-15 | Build, deploy and demo | Design | In Design |
| P2-01..P2-04 | Optional observability and benchmark | Design | In Design |

**Coverage**: 133 requirements total; 133 mapped to design; 0 mapped to tasks because `tasks.md` is intentionally deferred until design approval. A cobertura do documento-fonte e controlada separadamente em `docs/traceability/challenge-compliance-matrix.md`.

## Success Criteria

- [ ] Todos os 129 requisitos P1 estao implementados, mapeados e verificados sem skip.
- [ ] Os fluxos Pix, cartao e saque provam sucesso, negacao e resultado desconhecido sem duplicacao.
- [ ] Nenhum teste de redaction encontra PAN, CVV, token, senha, webhook secret ou PII proibida.
- [ ] `npm run verify` e `npm run verify:full` passam nas imagens e banco equivalentes a producao.
- [ ] A demo read-only e a conta privada do avaliador seguem os roteiros documentados.
- [ ] O deploy HTTPS usa imagens imutaveis, migrations explicitas, health checks e rollback comprovado.
