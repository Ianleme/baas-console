Feature: Reconciliação financeira segura
  Scenario: Resultado remoto final resolve uma operação desconhecida
    Given uma tentativa local aguardando reconciliação
    When a consulta remota confirmar aprovação com os mesmos dados
    Then a operação será classificada como conciliada

  Scenario: Operação remota sem correspondente local exige análise
    Given um item remoto sem referência local
    When o extrato remoto for comparado com as operações do lojista
    Then o item será classificado como existente apenas no gateway
