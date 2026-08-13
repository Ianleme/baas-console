# language: pt
Funcionalidade: Tour publico somente leitura
  Cenario: Emitir sessao deterministica sem senha
    Dado a demo feature-flagged habilitada
    Quando eu solicitar uma sessao demo
    Entao a sessao deve pertencer ao tenant demo fixo
    E a resposta nao deve conter senha publica

  Cenario: Ler o resumo demo
    Dado uma sessao demo valida
    Quando eu consultar o resumo demo
    Entao o resumo deve estar marcado como somente leitura

  Esquema do Cenario: Bloquear mutacao demo
    Dado uma sessao demo valida
    Quando eu enviar uma mutacao demo para "<rota>"
    Entao a resposta deve ser 403 DEMO_READ_ONLY

    Exemplos:
      | rota |
      | /api/v1/payments |
      | /api/v1/withdrawals |
      | /api/v1/checkout-links |
      | /api/v1/auth/logout |
