# language: pt
Funcionalidade: Cartão com taxa segura e tentativa única
  Cenario: Cartão aprovado conclui o link
    Dado um checkout cartão com taxa confirmada
    Quando o gateway aprovar o cartão
    Entao a tentativa cartão e o link devem ficar aprovados

  Cenario: Taxa alterada exige nova confirmação
    Dado um checkout cartão com taxa confirmada
    Quando a taxa do cartão mudar antes da confirmação
    Entao nenhum pagamento cartão deve ser enviado

  Cenario: Timeout do cartão aguarda conciliação
    Dado um checkout cartão com taxa confirmada
    Quando o gateway cartão terminar sem resposta conclusiva
    Entao o cartão deve aguardar conciliação após uma única chamada
