# sanjasmart — instancia IA (clone do Tilit)

Instancia isolada por cliente: codigo proprio nesta pasta, banco `sanjasmart`
no tilit_postgres, Redis DB 3, collection Qdrant `sanjasmart_conhecimento`.
Infra (postgres/redis/qdrant/directus) compartilhada com o Tilit.

- URL: https://sanjasmart.ia.sanjaworks.com (local: http://IP:8111)
- Subir: `docker compose up -d --build`
- Licenca de IA: painel-master-ti, instance_name `sanjasmart-principal`
- Master (licenca IA): https://ia.sanjaworks.com/admin
- Prompt do cliente: edite `prompt-cliente.txt` e reinicie o app
- Pendencias ao ativar: DNS do dominio, instancia Evolution real, conta Chatwoot no .env
