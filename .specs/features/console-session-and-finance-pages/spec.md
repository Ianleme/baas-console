# Console Session and Finance Pages Specification

**Status:** Proposed

**Scope tier:** Large

## Problem Statement

O console autenticado exibe identidade fictícia na sidebar, possui links para telas inexistentes e não recupera uma sessão quando o access token expira durante uma requisição. Além disso, o comando de sair não revoga a sessão. Isso impede que o lojista identifique corretamente a própria conta e conclua operações rotineiras de carteira, configurações e sessão.

## Goals

- [ ] Exibir na sidebar os nomes reais do negócio e do titular, obtidos de uma API autenticada.
- [ ] Persistir o nome informado no cadastro como dado do titular local.
- [ ] Entregar as rotas funcionais de Carteira e Configurações (perfil somente leitura).
- [ ] Recuperar automaticamente uma sessão expirada uma única vez por requisição e encerrar a sessão quando a recuperação falhar.
- [ ] Fazer o botão Sair revogar a sessão no backend e retornar o usuário à autenticação.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Edição de perfil e dados do negócio | O escopo aprovado para Configurações é somente leitura. |
| Alteração retroativa de nomes de contas existentes | Contas já criadas sem nome serão identificadas pelo e-mail até uma futura edição de perfil. |
| Alterar credenciais, senha, MFA ou recuperação de senha | São capacidades separadas de autenticação. |
| Novo ledger ou nova fonte de saldo | A Lera Box continua sendo a autoridade de saldo conforme AD-012. |
| Alterar as mudanças locais existentes em API e testes | Devem ser preservadas integralmente e ficam fora desta feature. |

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Fonte da identidade exibida | Endpoint BaaS autenticado de perfil atual | Evita identidade obsoleta/manipulável no `localStorage`. | Yes |
| Nome do titular | Persistir `fullName` no usuário a partir do campo `name` do cadastro | O formulário já exige o nome, mas ele hoje é descartado como identidade do usuário. | Yes |
| Configurações | Perfil do negócio e titular somente leitura | Escopo confirmado para esta entrega. | Yes |
| Recuperação de 401 | Renovar uma vez e repetir a requisição original uma vez | Preserva sessão válida sem loops de retry. | Yes |
| Falha de refresh ou segundo 401 | Limpar sessão local e mostrar autenticação | Uma sessão que não pode ser renovada não pode continuar ativa. | Yes |
| Logout | Chamar logout autenticado e limpar sessão local mesmo se a resposta remota falhar | Impede que a interface permaneça autenticada após a intenção explícita de sair. | Yes |

**Open questions:** none — all decisions are confirmed or recorded above.

---

## User Stories

### P1: Identidade autenticada na navegação

**User Story:** Como lojista autenticado, quero ver o nome do meu negócio e meu nome na sidebar para confirmar qual conta estou operando.

**Why P1:** A sidebar é exibida em todas as telas autenticadas e não pode representar o tenant por dados locais fictícios.

**Acceptance Criteria:**

1. **CONSOLE-01** — WHEN uma sessão autenticada abre o console THEN o sistema SHALL obter o perfil atual por endpoint autenticado e exibir na sidebar o nome de exibição do negócio e o nome do titular retornados pela API.
2. **CONSOLE-02** — WHEN o perfil atual não puder ser carregado por erro que não seja 401 THEN o console SHALL manter a navegação disponível, exibir um estado de identidade indisponível e não substituir dados ausentes por uma identidade fictícia persistida em `localStorage`.
3. **CONSOLE-03** — WHEN a API recebe a consulta de perfil atual THEN ela SHALL derivar merchant e usuário exclusivamente da sessão autenticada, sem aceitar um identificador de tenant fornecido pelo cliente.
4. **CONSOLE-19** — WHEN o cadastro local é criado com um nome válido THEN o sistema SHALL persistir esse valor como nome do titular local e retorná-lo no perfil atual; contas legadas sem esse valor SHALL retornar o e-mail como identificação segura de compatibilidade.

**Independent Test:** Autenticar dois tenants distintos e provar que cada sidebar recebe apenas o negócio e titular de sua própria sessão.

---

### P1: Carteira acessível pelo console

**User Story:** Como lojista, quero abrir Carteira pela sidebar e consultar meu saldo e a condição da última sincronização para entender minha posição financeira.

**Why P1:** A rota já é apresentada na navegação, mas atualmente não possui página funcional.

**Acceptance Criteria:**

1. **CONSOLE-04** — WHEN o lojista abre `#/carteira` THEN o sistema SHALL renderizar uma página de carteira com saldo, disponibilidade quando existente, horário UTC da última atualização e origem/estado da sincronização retornados pelo contrato de carteira.
2. **CONSOLE-05** — WHEN a carteira retornada estiver stale THEN a página SHALL manter os últimos valores retornados, identificá-los explicitamente como desatualizados e não exibir saldo zero inventado.
3. **CONSOLE-06** — WHEN a carteira não possuir snapshot disponível THEN a página SHALL apresentar um estado vazio que explique que ainda não há saldo sincronizado, sem representar esse estado como saldo zero confirmado.
4. **CONSOLE-07** — WHEN a abertura ou atualização da carteira falhar THEN a página SHALL exibir uma mensagem em português baseada no código/estado estável, sem expor erro bruto, stack ou payload da dependência.

**Independent Test:** Abrir a rota de carteira com snapshot atual, stale, vazio e falha controlada e verificar os resultados exibidos.

---

### P1: Configurações de perfil somente leitura

**User Story:** Como lojista, quero abrir Configurações e consultar os dados da minha conta sem poder alterá-los nesta entrega.

**Why P1:** A rota já é apresentada na navegação, mas não possui conteúdo nem contrato de perfil atual.

**Acceptance Criteria:**

1. **CONSOLE-08** — WHEN o lojista abre `#/configuracoes` THEN o sistema SHALL renderizar uma página de configurações que mostra em modo somente leitura os dados permitidos do negócio e do titular fornecidos pelo perfil atual.
2. **CONSOLE-09** — WHEN a página de configurações é exibida THEN ela SHALL não oferecer controles que persistam alterações de perfil, negócio ou credenciais.
3. **CONSOLE-10** — WHEN o perfil atual não puder ser carregado por erro não autenticado THEN a página SHALL comunicar indisponibilidade em português sem exibir dados fictícios ou detalhes internos.

**Independent Test:** Abrir Configurações com um perfil autenticado e confirmar os dados somente leitura, a ausência de ação de edição e o estado de erro controlado.

---

### P1: Renovação de sessão durante chamadas autenticadas

**User Story:** Como usuário com refresh token válido, quero que o console renove minha sessão expirada e conclua a ação solicitada sem ficar logado com todas as requisições falhando em 401.

**Why P1:** O console hoje tenta refresh apenas na carga inicial e deixa a interface em estado inconsistente após o access token expirar.

**Acceptance Criteria:**

1. **CONSOLE-11** — WHEN qualquer chamada autenticada recebe seu primeiro 401 THEN o cliente SHALL executar no máximo uma renovação de sessão e repetir exatamente uma vez a chamada original somente após a renovação ser bem-sucedida.
2. **CONSOLE-12** — WHEN a renovação for bem-sucedida e a repetição retornar resposta bem-sucedida THEN a feature chamadora SHALL receber o resultado normal da chamada original, sem erro 401 intermediário exposto ao usuário.
3. **CONSOLE-13** — WHEN a renovação falhar, ou quando a chamada repetida receber 401 THEN o console SHALL limpar credenciais e estado autenticado locais e apresentar a jornada de autenticação; ele SHALL não iniciar nova tentativa de refresh para a mesma chamada.
4. **CONSOLE-14** — WHEN uma chamada autenticada falha com status diferente de 401 THEN o cliente SHALL não tentar renovar a sessão e SHALL preservar o comportamento de erro aplicável àquela chamada.
5. **CONSOLE-15** — WHEN chamadas autenticadas concorrentes recebem 401 enquanto uma renovação está em andamento THEN o cliente SHALL compartilhar a mesma renovação em curso e cada chamada SHALL ser repetida no máximo uma vez após seu sucesso.

**Independent Test:** Simular uma, várias e nenhuma resposta 401 e comprovar quantidade de refresh/retry, resultado entregue e transição para login nos casos irrecuperáveis.

---

### P1: Encerramento explícito de sessão

**User Story:** Como lojista, quero usar Sair na sidebar para encerrar minha sessão de verdade e impedir que o console continue exibindo dados autenticados.

**Why P1:** O link atual apenas altera o hash e não chama o endpoint de logout.

**Acceptance Criteria:**

1. **CONSOLE-16** — WHEN o lojista aciona Sair na sidebar THEN o console SHALL chamar o endpoint de logout da sessão atual, limpar access token, perfil e estado autenticado locais e apresentar a jornada de autenticação.
2. **CONSOLE-17** — WHEN o endpoint de logout falhar por indisponibilidade de rede ou erro do servidor THEN o console SHALL ainda limpar o estado local e apresentar a jornada de autenticação, sem manter uma sessão visível.
3. **CONSOLE-18** — WHEN o logout terminar THEN uma chamada autenticada subsequente SHALL não reutilizar o access token ou perfil previamente removidos.

**Independent Test:** Acionar Sair, verificar a chamada remota e a volta ao login; repetir com falha remota e confirmar que a sessão local também é encerrada.

---

## Edge Cases and Dimension Sweep

| Dimension | Resolution |
| --- | --- |
| Failure / partial failure | Perfil/carteira possuem estado explícito; logout local prevalece mesmo se o endpoint remoto falhar. |
| Idempotency / retry / duplicate | Cada requisição recebe no máximo um refresh e uma repetição; refresh concorrente é compartilhado. |
| Auth boundaries | Perfil é sempre derivado da sessão; 401 terminal limpa a sessão e não retenta. |
| Concurrency / ordering | Uma renovação em voo coordena chamadas concorrentes sem loops ou múltiplos refreshes. |
| State-transition integrity | Sessão passa de autenticada a anônima ao falhar refresh/logout; não há estado autenticado parcial. |
| Observability | Não expor access/refresh token, perfil bruto, stack ou payload de dependência em mensagens de UI. |
| Remaining dimensions | N/A para este escopo: pagamentos, expiração de dados, persistência financeira e novas dependências externas. |

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| CONSOLE-01..03, CONSOLE-19 | Identidade autenticada | Design | Complete |
| CONSOLE-04..07 | Carteira | Design | Complete |
| CONSOLE-08..10 | Configurações | Design | Complete |
| CONSOLE-11..15 | Renovação de sessão | Design | Pending |
| CONSOLE-16..18 | Logout | Design | Complete |

**Coverage:** 19 total, 0 mapped to tasks, 19 pending design.

## Success Criteria

- [ ] Nenhuma tela autenticada usa `baas_user_profile` como fonte de identidade.
- [ ] `#/carteira` e `#/configuracoes` são rotas funcionais e testadas.
- [ ] O primeiro 401 autenticado é recuperado por uma renovação; 401 irrecuperável leva ao login sem loop.
- [ ] Sair encerra o estado local mesmo diante de falha remota.
