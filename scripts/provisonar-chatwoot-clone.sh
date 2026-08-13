#!/usr/bin/env bash
# Por que existe: todo clone da frota precisa de 1 account Chatwoot + user SSO
# no .env (Conversas embed). Sem isto o /api/chatwoot/sso volta 503.
# Uso: ./provisonar-chatwoot-clone.sh <slug> <caminho.env>
# Idempotente: se ACCOUNT_ID e SSO_USER_ID ja existem, so garante o PLATFORM_TOKEN.

set -euo pipefail

SLUG="${1:?informe o slug}"
ENV_FILE="${2:?informe o caminho do .env}"
HOST_ROOT="${HOST_ROOT:-/root}"
CW_URL="${CHATWOOT_URL:-https://chat.sanjaworks.com}"

pegar_env() {
  local f="$1" k="$2"
  [[ -f "$f" ]] || return 0
  grep -m1 "^${k}=" "$f" 2>/dev/null | cut -d'=' -f2- || true
}

# Token: env explicito > Master > Tilit (frota padrao)
TOKEN="${CHATWOOT_PLATFORM_TOKEN:-}"
if [[ -z "$TOKEN" ]]; then
  TOKEN="$(pegar_env "${HOST_ROOT}/painel-master-ti/.env" CHATWOOT_MGMT_PLATFORM_TOKEN)"
fi
if [[ -z "$TOKEN" ]]; then
  TOKEN="$(pegar_env "${HOST_ROOT}/tilit-rag/ferramenta-tilit/.env" CHATWOOT_PLATFORM_TOKEN)"
fi
if [[ -z "$TOKEN" || ${#TOKEN} -lt 8 ]]; then
  echo "ERRO: CHATWOOT_PLATFORM_TOKEN ausente (Master/Tilit)." >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERRO: .env nao encontrado: $ENV_FILE" >&2
  exit 1
fi

upsert_env() {
  local chave="$1" valor="$2"
  if grep -q "^${chave}=" "$ENV_FILE"; then
    # sed portavel: troca a linha inteira
    sed -i "s|^${chave}=.*|${chave}=${valor}|" "$ENV_FILE"
  else
    printf '%s=%s\n' "$chave" "$valor" >> "$ENV_FILE"
  fi
}

ACC_ID="$(pegar_env "$ENV_FILE" CHATWOOT_ACCOUNT_ID)"
SSO_ID="$(pegar_env "$ENV_FILE" CHATWOOT_SSO_USER_ID)"

cw_api() {
  local method="$1" path="$2" body="${3:-}"
  if [[ -n "$body" ]]; then
    curl -sS -X "$method" "${CW_URL}${path}" \
      -H "api_access_token: ${TOKEN}" \
      -H "Content-Type: application/json" \
      -d "$body"
  else
    curl -sS -X "$method" "${CW_URL}${path}" \
      -H "api_access_token: ${TOKEN}"
  fi
}

if [[ -n "$ACC_ID" && -n "$SSO_ID" ]]; then
  echo "==> Chatwoot ja provisionado (account=${ACC_ID} sso=${SSO_ID}); garantindo token"
  upsert_env CHATWOOT_URL "$CW_URL"
  upsert_env CHATWOOT_PLATFORM_TOKEN "$TOKEN"
  upsert_env CHATWOOT_ACCOUNT_NAME "$(pegar_env "$ENV_FILE" CHATWOOT_ACCOUNT_NAME | sed "s/^$/${SLUG}/")"
  echo "OK chatwoot (reuse)"
  exit 0
fi

NOME="$(echo "$SLUG" | awk '{print toupper(substr($0,1,1)) substr($0,2)}')"
EMAIL="painel-${SLUG}@sanjaworks.com"
# Senha: maiuscula+minuscula+numero+especial (exigencia Chatwoot)
SENHA="Cw$(openssl rand -base64 9 | tr -d '/+=' | head -c 10)!9aA"

echo "==> Chatwoot: criando account '${NOME}'"
ACC_JSON="$(cw_api POST /platform/api/v1/accounts "{\"name\":\"${NOME}\",\"locale\":\"pt_BR\"}")"
ACC_ID="$(python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("id") or "")' <<<"$ACC_JSON")"
if [[ -z "$ACC_ID" ]]; then
  echo "ERRO criar account: $ACC_JSON" >&2
  exit 1
fi

echo "==> Chatwoot: criando user SSO ${EMAIL}"
USER_JSON="$(cw_api POST /platform/api/v1/users "{\"name\":\"Painel ${NOME}\",\"email\":\"${EMAIL}\",\"password\":\"${SENHA}\"}")"
SSO_ID="$(python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("id") or "")' <<<"$USER_JSON")"
if [[ -z "$SSO_ID" ]]; then
  EMAIL="painel-${SLUG}.$(date +%s | tail -c 6)@sanjaworks.com"
  SENHA="Cw$(openssl rand -base64 9 | tr -d '/+=' | head -c 10)!9aA"
  echo "==> retry user com ${EMAIL}"
  USER_JSON="$(cw_api POST /platform/api/v1/users "{\"name\":\"Painel ${NOME}\",\"email\":\"${EMAIL}\",\"password\":\"${SENHA}\"}")"
  SSO_ID="$(python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("id") or "")' <<<"$USER_JSON")"
fi
if [[ -z "$SSO_ID" ]]; then
  echo "ERRO criar user: $USER_JSON" >&2
  exit 1
fi

echo "==> Chatwoot: vinculando user ${SSO_ID} na account ${ACC_ID}"
cw_api POST "/platform/api/v1/accounts/${ACC_ID}/account_users" \
  "{\"user_id\":${SSO_ID},\"role\":\"administrator\"}" >/dev/null || true

LOGIN_JSON="$(cw_api GET "/platform/api/v1/users/${SSO_ID}/login")"
SSO_OK="$(python3 -c 'import json,sys; d=json.load(sys.stdin); print("1" if isinstance(d.get("url"),str) and len(d["url"])>10 else "0")' <<<"$LOGIN_JSON")"
if [[ "$SSO_OK" != "1" ]]; then
  echo "ERRO SSO login falhou: $LOGIN_JSON" >&2
  exit 1
fi

upsert_env CHATWOOT_URL "$CW_URL"
upsert_env CHATWOOT_ACCOUNT_ID "$ACC_ID"
upsert_env CHATWOOT_ACCOUNT_NAME "$NOME"
upsert_env CHATWOOT_SSO_USER_ID "$SSO_ID"
upsert_env CHATWOOT_PLATFORM_TOKEN "$TOKEN"

# Guarda senha SSO fora do .env publico do app (opcional, auditavel)
SECRETS_DIR="$(dirname "$ENV_FILE")/data"
mkdir -p "$SECRETS_DIR"
printf 'email=%s\nsenha=%s\naccount_id=%s\nsso_user_id=%s\n' \
  "$EMAIL" "$SENHA" "$ACC_ID" "$SSO_ID" > "${SECRETS_DIR}/chatwoot-sso.txt"
chmod 600 "${SECRETS_DIR}/chatwoot-sso.txt" 2>/dev/null || true

echo "OK chatwoot account=${ACC_ID} sso_user=${SSO_ID} email=${EMAIL}"
