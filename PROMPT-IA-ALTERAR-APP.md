# Prompt para IA — alterar um app da frota SanjaWorks

Cole o bloco abaixo numa IA (Cursor, Antigravity, ChatGPT, etc.) substituindo
`{SLUG}` e `{REPO_URL}` pelos valores do cliente. Ou use o botão
**Copiar prompt para IA** no painel Master (https://ia.sanjaworks.com/admin).

---

```text
Você vai alterar o app do cliente SanjaWorks.

## Identidade do app
- Slug: {SLUG}
- Repositório GitHub: {REPO_URL}
- Branch de produção: main
- Painel Master (publicar): https://ia.sanjaworks.com/admin
- Você NÃO precisa de acesso ao servidor. Trabalhe só com GitHub + o painel Master.

## Fluxo obrigatório (não pule etapas)

1. Clone o repo (ou abra se já tiver):
   git clone {REPO_URL}
   cd ferramenta-{SLUG}

2. Atualize main antes de qualquer coisa:
   git fetch origin
   git checkout main
   git pull origin main

3. Crie uma branch de trabalho (nunca commit direto em main):
   git checkout -b feat/descricao-curta

4. Faça as alterações pedidas. Se houver conflito com main, mergeie e CORRIJA:
   git fetch origin
   git merge origin/main
   # resolva conflitos, compile, teste o que puder localmente

5. Commit claro (por quê, não só o quê) e push da branch:
   git push -u origin HEAD

6. Abra um Pull Request no GitHub: branch → main.
   Título e descrição objetivos.

7. Avise o humano: a publicação é no Master.
   - Abrir https://ia.sanjaworks.com/admin
   - Abrir o cliente {SLUG} → bloco "Como alterar / publicar"
   - Clicar "Aprovar e publicar" no PR (ou pedir para alguém com acesso ao Master)
   - Isso mescla o PR e sobe o app automaticamente

Se o Master mostrar checks vermelhos, CORRIJA na branch e faça push de novo.
Não peça para alguém mergear no servidor “na mão”.

## O que você PODE alterar
- Código em app/src/**
- Front em app/public/** (UI do painel do cliente)
- prompt-cliente.txt (tom/regras do atendimento, se for o pedido)
- Testes e docs do repo
- .github/workflows só se o pedido for sobre CI (com cuidado)

## O que você NÃO PODE alterar (proibido)
- .env (segredos, tokens, senhas, IDs de Chatwoot/OpenRouter/Meta) — isso vive no servidor / Master
- Credenciais hardcoded (tokens, senhas, API keys)
- Apagar ou reescrever docker-compose.yml sem pedido explícito
- Mudar pasta/caminho de deploy no workflow sem pedido explícito
- Commitar node_modules/, dist/, dumps, arquivos enormes (ex.: TechFala*.html)
- Mexer em outros tenants / outros repos
- Forçar push em main (--force)
- Inventar preço, frete, cadastro ou fato de negócio no prompt sem o humano pedir

## Regras de merge / qualidade
- Sempre parta de main atualizado.
- Se main andou enquanto você trabalhava: merge origin/main na sua branch e resolva conflitos.
- O app precisa continuar compilando (TypeScript / docker build do ./app).
- Não deixe a branch quebrada: se quebrou, conserte antes do PR.
- Prefira mudanças pequenas e focadas no pedido.

## Como saber se deu certo
- PR aberto no GitHub
- Checks do PR verdes (ou ainda rodando)
- No Master, o PR aparece em "PRs aguardando"
- Depois de "Aprovar e publicar", o app {SLUG} sobe sozinho em alguns minutos

## Lembrete
Trabalho = GitHub (código) + Master (aprovar/publicar).
Não dependa de terminal no servidor de produção.
```
