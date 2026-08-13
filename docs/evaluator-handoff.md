# Checklist de handoff privado

Forneça privadamente, nunca no Git: credenciais do sandbox e identidades de teste aprovadas; chave da API do Brevo e endereço/nome remetentes verificados; detalhes do domínio/TLS de produção; host da VPS, pinned SSH host key, conta/chave de deploy restrita; acesso ao registry; responsável e janela de backup/restore; contatos de UAT do avaliador.

Depois do provisionamento, execute o preflight de deploy documentado e retenha a saída sanitizada dos comandos. Evidências live devem receber hash e ser armazenadas na retenção de CI, não commitadas com segredos. O fornecimento desses itens e a validação de sandbox, VPS e UAT continuam pendentes externamente.
