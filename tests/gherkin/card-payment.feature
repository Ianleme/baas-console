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

  Cenario: Resumo apresenta taxa e valor líquido antes da confirmação
    Dado um checkout cartão com taxa confirmada
    Quando consultar o resumo parcelado
    Entao o resumo deve mostrar bruto taxa e líquido exatos

  Cenario: Cinco negativas bloqueiam nova confirmação
    Dado um checkout cartão em cooldown
    Quando tentar confirmar outro cartão
    Entao deve orientar aguardar quinze minutos sem chamar o gateway
