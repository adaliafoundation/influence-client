#!/usr/bin/env bash
set -euo pipefail

sha=${1:?Pass a full commit SHA}
channel=${2:-production}
case "$channel:${GITHUB_REF:-}" in
  production:refs/heads/main) branch=main ;;
  prerelease:refs/heads/prerelease) branch=prerelease ;;
  *) echo 'Production requires main; prerelease requires prerelease.' >&2; exit 1 ;;
esac
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { echo 'A full lowercase commit SHA is required.' >&2; exit 1; }
[[ "$(git rev-parse --is-shallow-repository)" = false ]] || { echo 'Full history is required.' >&2; exit 1; }
[[ "$(git cat-file -t "$sha")" = commit ]] || { echo 'Release target must be a commit.' >&2; exit 1; }
git merge-base --is-ancestor "$sha" "refs/remotes/origin/$branch" || {
  echo "Release commit must belong to origin/$branch." >&2
  exit 1
}
