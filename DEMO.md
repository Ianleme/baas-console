# Demonstração do avaliador

1. Copie `.env.example` para `.env` e execute `docker compose up --build -d`.
2. Abra `http://localhost:4173/demo.html`.
3. Explore o tenant somente leitura fixo e imposto pelo servidor. Nenhuma senha pública é documentada ou necessária.

O tour de três minutos cobre dashboard, links, transações e carteira. O tour de 10–15 minutos acrescenta a API local `/docs` e verificações smoke estáticas. Os fluxos reais de checkout Pix/cartão, taxas, saque, webhook, conciliação e envio de e-mail exigem credenciais/configuração correspondentes. Para e-mail, o remetente deve estar verificado no Brevo e a chave deve ser fornecida fora do repositório; sem isso, nenhum envio é alegado. Sandbox do gateway, Brevo configurado, domínio de produção, deploy em VPS e UAT continuam pré-requisitos externos e não são apresentados como evidência concluída.
