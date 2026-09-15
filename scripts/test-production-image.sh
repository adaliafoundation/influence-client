#!/usr/bin/env bash
set -euo pipefail

image=${1:?Pass the production image reference}
prefix="influence-client-smoke-$$"

cleanup() {
  docker rm -f "$prefix-prerelease" "$prefix-production" >/dev/null 2>&1 || true
}
trap cleanup EXIT

test "$(docker image inspect "$image" --format '{{.Config.User}}' 2>/dev/null || true)" = '1000:1000' || {
  docker pull "$image"
  test "$(docker image inspect "$image" --format '{{.Config.User}}')" = '1000:1000'
}

if docker run --rm "$image" >/dev/null 2>&1; then
  echo 'Production image started without REACT_APP_CONFIG_ENV' >&2
  exit 1
fi

if docker run --rm -e REACT_APP_CONFIG_ENV=production "$image" >/dev/null 2>&1; then
  echo 'Production image started without required service endpoints' >&2
  exit 1
fi

for environment in prerelease production; do
  container="$prefix-$environment"
  api_url="https://$environment.example.invalid"
  docker run -d --name "$container" --read-only --cap-drop ALL \
    --security-opt no-new-privileges \
    -e REACT_APP_CONFIG_ENV="$environment" \
    -e REACT_APP_API_INFLUENCE="$api_url" \
    -e REACT_APP_API_IPFS="https://ipfs.$environment.example.invalid" \
    -e REACT_APP_API_AVNU="https://avnu.$environment.example.invalid" \
    -e REACT_APP_STARKNET_PROVIDER="https://rpc.$environment.example.invalid" \
    -e REACT_APP_ETHEREUM_PROVIDER="https://ethereum.$environment.example.invalid" \
    -e REACT_APP_APP_DISABLELAUNCHTRAILER=true \
    -e REACT_APP_APP_DISABLEINTROANIMATION=true \
    -e REACT_APP_APP_DISABLESCREENSIZEWARNING=true \
    -e STARKNET_STARTER_PACK_PRIVATE_KEY=must-not-be-exposed \
    "$image" >/dev/null

  for _ in $(seq 1 30); do
    status=$(docker inspect "$container" --format '{{if .State.Health}}{{.State.Health.Status}}{{end}}')
    [ "$status" = healthy ] && break
    [ "$status" = unhealthy ] && docker logs "$container" && exit 1
    sleep 1
  done
  test "$(docker inspect "$container" --format '{{.State.Health.Status}}')" = healthy

  docker exec "$container" node -e "
    fetch('http://127.0.0.1:3000/runtime-config.js').then(async response => {
      const body = await response.text();
      if (!response.headers.get('cache-control')?.includes('no-store')) process.exit(1);
      if (!body.includes('$api_url')) process.exit(1);
      if (body.includes('must-not-be-exposed')) process.exit(1);
    }).catch(() => process.exit(1));
  "
  docker exec "$container" node -e "
    fetch('http://127.0.0.1:3000/', { headers: { 'x-forwarded-proto': 'https' } }).then(async response => {
      if (!response.ok || !(await response.text()).includes('/runtime-config.js')) process.exit(1);
    }).catch(() => process.exit(1));
  "
  if [ -n "${CLIENT_BROWSER_TEST_IMAGE:-}" ]; then
    docker run --rm --network "container:$container" \
      -e CLIENT_BASE_URL=http://127.0.0.1:3000 \
      -e EXPECTED_CONFIG_ENV="$environment" \
      "$CLIENT_BROWSER_TEST_IMAGE" npm run test:browser
  fi
done

docker run --rm --entrypoint sh "$image" -c '! command -v npm && ! command -v yarn'
