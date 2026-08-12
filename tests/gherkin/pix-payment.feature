# language: pt
Funcionalidade: Tentativa Pix sem duplicação
  Cenario: Pix aprovado conclui o link
    Dado um checkout Pix válido
    Quando o gateway aprovar o Pix
    Entao a tentativa Pix e o link devem ficar aprovados

  Cenario: Timeout Pix aguarda conciliação sem repetição
    Dado um checkout Pix válido
    Quando o gateway Pix terminar sem resposta conclusiva
    Entao o Pix deve aguardar conciliação após uma única chamada

  Cenario: Aprovação Pix tardia prevalece
    Dado um Pix aguardando conciliação
    Quando chegar uma aprovação Pix tardia
    Entao a aprovação Pix deve prevalecer sem outra transação
