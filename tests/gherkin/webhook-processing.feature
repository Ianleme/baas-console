Feature: Processamento idempotente de webhooks
  Scenario: Entrega duplicada mantém uma única transição financeira
    Given um pagamento já aprovado por webhook
    When o mesmo resultado aprovado for entregue novamente
    Then o evento duplicado será concluído sem nova transição

  Scenario: Evento fora de ordem não regride estado terminal
    Given um pagamento já negado por webhook
    When um resultado aprovado conflitante chegar fora de ordem
    Then o evento será marcado para revisão sem alterar o pagamento
