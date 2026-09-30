#!/usr/bin/env bash
# Install alongside the server's Compose file and .env.production.
# Usage: bash deploy-production.sh docker.io/owner/repository:<commit-sha> /absolute/deploy/dir
# The server pulls a published image; this script never builds or fetches source.
set -euo pipefail

image_ref=${1:?image reference required}
deploy_dir=${2:?deployment directory required}
[[ "$image_ref" =~ ^[A-Za-z0-9._/-]+:[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$ ]] || { echo 'Invalid image reference' >&2; exit 1; }
[[ "$deploy_dir" =~ ^/[A-Za-z0-9/_-]+$ ]] || { echo 'Invalid deployment directory' >&2; exit 1; }

cd "$deploy_dir"
test -f .env.production
test -f docker-compose.prod.yml
grep -q '^API_IMAGE=' .env.production

API_IMAGE="$image_ref" docker compose --env-file .env.production -f docker-compose.prod.yml pull

temp_env=$(mktemp .env.production.XXXXXX)
trap 'rm -f "$temp_env"' EXIT
chmod 600 "$temp_env"
sed "s|^API_IMAGE=.*$|API_IMAGE=$image_ref|" .env.production > "$temp_env"
mv "$temp_env" .env.production
trap - EXIT

docker compose --env-file .env.production -f docker-compose.prod.yml up -d --wait
