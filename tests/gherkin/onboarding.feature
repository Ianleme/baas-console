# language: pt
Funcionalidade: Conexao segura do lojista ao gateway
  Cenario: Cadastro remoto aceito aguarda credenciais
    Dado um lojista sem tentativa de cadastro
    Quando o cadastro remoto for aceito
    Entao a conexao deve aguardar as credenciais recebidas por email

  Cenario: Resultado remoto desconhecido nao e repetido
    Dado um cadastro remoto que termina em timeout
    Quando o cadastro for solicitado
    Entao a tentativa deve ficar com resultado desconhecido sem retry

  Cenario: Perfil remoto divergente nao ativa a conexao
    Dado um lojista aguardando credenciais
    Quando as credenciais pertencerem a outro documento
    Entao a conexao deve ser recusada por divergencia de perfil

  Cenario: Credenciais corretas ativam a conexao criptografada
    Dado um lojista aguardando credenciais
    Quando as credenciais confirmarem o perfil esperado
    Entao a conexao deve ficar ativa sem persistir a senha
