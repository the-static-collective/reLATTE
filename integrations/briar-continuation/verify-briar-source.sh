#!/usr/bin/env bash
# STATIC × Briar: source audit and optional Android debug compilation.
set -euo pipefail
if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo 'Usage: verify-briar-source.sh WORKTREE [--build-debug]' >&2; exit 2
fi
DIR="$1"
cd "$DIR"
TAG='release-1.5.21'
UPSTREAM='https://code.briarproject.org/briar/briar.git'
[[ "$(git branch --show-current)" == 'static/continuation-001' ]] || { echo 'Unexpected branch' >&2; exit 1; }
[[ "$(git remote get-url upstream)" == "$UPSTREAM" ]] || { echo 'Unexpected upstream URL' >&2; exit 1; }
[[ -f LICENSE.txt && -f STATIC_SOURCE_PROVENANCE.md && -f gradlew ]] || { echo 'Missing original source or provenance' >&2; exit 1; }
SHA="$(git rev-parse "refs/tags/$TAG^{commit}")"
[[ "$SHA" == aea0e4a6* ]] || { echo 'Release tag moved' >&2; exit 1; }
git merge-base --is-ancestor "$SHA" HEAD || { echo 'Source lineage lost' >&2; exit 1; }
if git submodule status --recursive | grep -Eq '^[-+U]'; then
  echo 'Missing/drifted submodule; refusing audit' >&2; exit 1
fi
[[ -z "$(git status --porcelain)" ]] || { echo 'Uncommitted changes; refusing audit' >&2; exit 1; }
echo "SOURCE PROVENANCE OK: $SHA"
if [[ "\${2:-}" == --build-debug ]]; then
  command -v java >/dev/null || { echo 'JDK is required' >&2; exit 2; }
  [[ -n "\${ANDROID_HOME:-}\${ANDROID_SDK_ROOT:-}" ]] || { echo 'Android SDK is required' >&2; exit 2; }
  ./gradlew --no-daemon :briar-android:assembleDebug
  find briar-android/build/outputs/apk/debug -type f -name '*.apk' -exec sha256sum {} \;
  echo 'This is a compile smoke test, not binary reproduction or security certification.'
fi
