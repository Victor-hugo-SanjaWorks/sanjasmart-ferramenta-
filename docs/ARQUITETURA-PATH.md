# Arquitetura path vs subdomínio (SanjaWorks IA)

## Objetivo

Um domínio (`ia.sanjaworks.com`) com apps isolados por **path**, sem misturar código/DB:

- `https://ia.sanjaworks.com/admin` → Master T.I.
- `https://ia.sanjaworks.com/adao` → container `adao_app`
- `https://ia.sanjaworks.com/sanjafree` → container `sanjafree_app`

Cada path = **1 pasta + 1 compose + 1 Postgres DB** (como hoje). Só muda o roteamento.

## Env do app

```bash
PUBLIC_URL=https://ia.sanjaworks.com/adao
PUBLIC_BASE_PATH=/adao
```

Com `PUBLIC_BASE_PATH` vazio, o app continua na raiz do host (subdomínio atual).

## Traefik (sem StripPrefix)

O app faz strip interno do prefixo (igual ideia do Master em `/admin`).

```yaml
labels:
  - traefik.http.routers.adao.rule=Host(`ia.sanjaworks.com`) && PathPrefix(`/adao`)
  - traefik.http.routers.adao.priority=50
```

Opcional: manter também `Host(adao.ia.sanjaworks.com)` como alias no mesmo serviço.

## Login hub

`ia.sanjaworks.com/` (ou Master) autentica e redireciona para `/{slug}/`. Não colocar vários clientes no mesmo processo Node.

## Webhooks

Sempre absolutos via `PUBLIC_URL`:

- `{PUBLIC_URL}/webhook/evolution`
- `{PUBLIC_URL}/webhook/chatwoot`
- `{PUBLIC_URL}/webhook/uazapi`

## Multi WhatsApp

Linhas Evolution extras: painel do app → WhatsApp → **+ Nova / Renomear / Excluir** (`wa_instancias` + Evolution API + inbox Chatwoot se `CHATWOOT_*` preenchido).

## Migração

1. Preencher `PUBLIC_BASE_PATH` + `PUBLIC_URL`
2. Ajustar labels Traefik
3. Atualizar webhooks Evolution/Chatwoot
4. DNS Cloudflare (API) para o host único — subdomínios passam a ser opcionais
