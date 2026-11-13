#!/usr/bin/env bash
set -euo pipefail

sha=${1:?Pass a full commit SHA}
channel=${2:-production}
ref=${GITHUB_REF:-}
case "$channel:$ref" in
  production:refs/heads/main|prerelease:refs/heads/main) ;;
  prerelease:refs/heads/*)
    [[ "${GITHUB_EVENT_NAME:-}" = workflow_dispatch ]] || {
      echo 'Branch prereleases must be started manually.' >&2
      exit 1
    }
    ;;
  *) echo 'Production requires main; prerelease requires a branch.' >&2; exit 1 ;;
esac
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { echo 'A full lowercase commit SHA is required.' >&2; exit 1; }
[[ "$(git rev-parse --is-shallow-repository)" = false ]] || { echo 'Full history is required.' >&2; exit 1; }
[[ "$(git cat-file -t "$sha")" = commit ]] || { echo 'Release target must be a commit.' >&2; exit 1; }
branch=${ref#refs/heads/}
git check-ref-format "$ref" >/dev/null
git merge-base --is-ancestor "$sha" "refs/remotes/origin/$branch" || {
  echo 'Release commit must belong to the selected remote branch.' >&2
  exit 1
}
