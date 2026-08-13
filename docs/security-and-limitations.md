# Segurança e limitações

Segredos devem ficar em arquivos de ambiente ignorados ou no secret store do deploy. Dados de cartão, senhas do gateway e segredos de webhook nunca são fixtures válidos de documentação. As imagens de produção usam immutable digests, os containers não executam como root e os endpoints operacionais são privados.

O Bearer token do gateway é armazenado com segurança no backend; a senha do gateway nunca é exposta no frontend. A chave `BREVO_API_KEY` também deve permanecer somente em ambiente privado ou secret store e nunca no Git. O endereço remetente usado pelo Brevo precisa estar verificado. O isolamento por conta impede que um token veja dados de outra conta. Webhooks autenticáveis validam `X-Lera-Box-Signature` quando houver secret, registram payloads protegidos, aplicam idempotência e não aceitam atualizações de status vindas do frontend. Valores monetários enviados ou recebidos são centavos.

Este repositório não prova comportamento live do gateway, TLS público, identidade do host SSH, restauração de backup, entrega via API do Brevo, capacidade da VPS ou UAT. Esses são gates externos explícitos. Nenhuma aprovação de produção, entrega de e-mail ou capacidade medida é declarada localmente; evidências de sandbox/Brevo/VPS/UAT/live permanecem pendentes.
