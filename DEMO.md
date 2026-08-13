# Demonstração do avaliador

1. Copie `.env.example` para `.env` e execute `docker compose up --build -d`.
2. Abra `http://localhost:4173/demo.html`.
3. Explore o tenant somente leitura fixo e imposto pelo servidor. Nenhuma senha pública é documentada ou necessária.

O tour de três minutos cobre dashboard, links, transações e carteira. O tour de 10–15 minutos acrescenta a API local `/docs`, Mailpit e verificações smoke estáticas. Os fluxos reais de checkout Pix/cartão, taxas, saque, webhook e conciliação exigem credenciais/configuração do gateway. Sandbox do gateway, domínio de produção, deploy em VPS e UAT continuam pré-requisitos externos e não são apresentados como evidência concluída.
