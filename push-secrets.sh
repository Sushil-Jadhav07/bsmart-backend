#!/usr/bin/env bash
# Usage: ./push-secrets.sh [envFile] [wranglerConfig]
#   ./push-secrets.sh .env.dev                       # dev (default config)
#   ./push-secrets.sh .env.production wrangler.production.jsonc
set -euo pipefail

ENV_FILE="${1:-.env}"
CONFIG="${2:-wrangler.jsonc}"

if [ ! -f "$ENV_FILE" ]; then
  echo "No such file: $ENV_FILE" >&2
  exit 1
fi

while IFS='=' read -r key value; do
  [ -z "$key" ] && continue
  case "$key" in \#*) continue ;; esac

  value="${value%\"}"
  value="${value#\"}"

  echo "Setting $key ..."
  printf '%s' "$value" | npx wrangler secret put "$key" --config "$CONFIG"
done < "$ENV_FILE"

echo "Done. Run 'npx wrangler secret list' to confirm."
