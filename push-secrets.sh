#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-.env}"

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
  printf '%s' "$value" | npx wrangler secret put "$key"
done < "$ENV_FILE"

echo "Done. Run 'npx wrangler secret list' to confirm."
