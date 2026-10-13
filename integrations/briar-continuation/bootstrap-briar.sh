#!/usr/bin/env bash
# STATIC × Briar — local source bootstrap, no network publication or remote push.
set -euo pipefail
UPSTREAM='https://code.briarproject.org/briar/briar.git'
TAG='release-1.5.21'
EXPECTED='aea0e4a6' # upstream short commit as listed on 2026-10-13
if [[ $# != 1 || -e "$1" ]]; then
  echo 'Usage: bootstrap-briar.sh NEW_EMPTY_PATH (must not exist)' >&2
  exit 2
fi
DEST="$1"
command -v git >/dev/null || { echo 'git is required' >&2; exit 2; }
git clone --origin upstream --recurse-submodules "$UPSTREAM" "$DEST"
cd "$DEST"
git fetch upstream "refs/tags/$TAG:refs/tags/$TAG"
SHA="$(git rev-parse "refs/tags/$TAG^{commit}")"
case "$SHA" in "$EXPECTED"*) ;; *) echo "STOP: tag revision changed: $SHA" >&2; exit 1;; esac
git checkout --detach "$SHA"
git submodule sync --recursive
git submodule update --init --recursive
git switch -c static/continuation-001
[[ -f LICENSE.txt ]] || { echo 'STOP: license absent' >&2; exit 1; }
SUBMODULES="$(git submodule status --recursive)"
{
  printf '# Briar source provenance — Static local continuation\n\n'
  printf 'Original upstream: %s\n\n' "$UPSTREAM"
  printf 'Baseline tag: %s\n\n' "$TAG"
  printf 'Verified baseline commit: \`%s\`\n\n' "$SHA"
  printf 'Derivative branch: \`static/continuation-001\`\n\n'
  printf 'Original LICENSE.txt retained; no rebranding of the Briar upstream project.\n\n'
  printf 'Submodule revisions:\n\n\`\`\`\n%s\n\`\`\`\n\n' "$SUBMODULES"
  printf 'Local checkout only: not an online GitHub fork, executable proof or APK.\n'
} > STATIC_SOURCE_PROVENANCE.md
git add STATIC_SOURCE_PROVENANCE.md
git -c user.name='Static Collective Bootstrap' -c user.email='bootstrap@localhost.invalid' \
  commit -m 'docs: record Briar upstream revision and derivative provenance'
printf 'READY: %s — %s\n' "$DEST" "$SHA"
echo 'No network push performed. Preserve GPL and audit submodule licensing.'
