#!/usr/bin/env bash
# Server side of .github/workflows/release.yml. The workflow copies this file to
# <base>/deploy.sh on every deploy, so it can also be run by hand:
#   /opt/erp/deploy.sh activate v1.4.2      # roll back to an unpacked release
#
# Layout under <base> (the directory holding this script):
#   releases/<version>/   unpacked tarballs, newest $KEEP_RELEASES kept
#   current -> releases/<version>
#   shared/.env           runtime config, linked into every release
#   shared/logs/          API activity logs, linked into every release
#
# Commands:
#   fetch <version> <owner/repo>   download + verify + unpack (GitHub token on stdin)
#   migrate <version> [script...]  TypeORM migrations, then each "path [args]" Python script
#   stop-api                       stop erp-api (all_at_once rollout, before migrate)
#   activate <version>             switch `current`, reload pm2, health-check the API
set -euo pipefail

BASE="$(cd "$(dirname "$0")" && pwd)"
KEEP_RELEASES="${KEEP_RELEASES:-5}"

die() { echo "error: $*" >&2; exit 1; }

release_dir() {
  local dir="$BASE/releases/$1"
  [[ -d "$dir" ]] || die "release $1 is not unpacked on $(hostname)"
  echo "$dir"
}

cmd_fetch() {
  local version="$1" repo="$2" token dir tmp release_json name url
  read -r token
  [[ -f "$BASE/shared/.env" ]] || die "$BASE/shared/.env is missing"
  dir="$BASE/releases/$version"
  if [[ -d "$dir" ]]; then
    echo "$version already unpacked"
    return
  fi

  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  release_json="$(curl -fsSL -H "Authorization: Bearer $token" \
    "https://api.github.com/repos/$repo/releases/tags/$version")"
  for name in "erp-$version.tar.gz" "erp-$version.tar.gz.sha256"; do
    url="$(python3 -c 'import json,sys
assets = json.loads(sys.argv[1])["assets"]
print(next(a["url"] for a in assets if a["name"] == sys.argv[2]))' "$release_json" "$name")"
    curl -fsSL -H "Authorization: Bearer $token" -H "Accept: application/octet-stream" \
      -o "$tmp/$name" "$url"
  done
  (cd "$tmp" && sha256sum -c "erp-$version.tar.gz.sha256")

  rm -rf "$dir.partial"
  mkdir -p "$dir.partial" "$BASE/shared/logs"
  tar -xzf "$tmp/erp-$version.tar.gz" -C "$dir.partial" --strip-components=1
  ln -sfn "$BASE/shared/.env" "$dir.partial/.env"
  ln -sfn "$BASE/shared/logs" "$dir.partial/apps/api/logs"
  mv "$dir.partial" "$dir"
  echo "unpacked $version"
}

cmd_migrate() {
  local dir entry script
  local -a parts
  dir="$(release_dir "$1")"
  shift

  echo "==> typeorm migration:run"
  (cd "$dir/apps/api" && node node_modules/typeorm/cli.js migration:run -d dist/database/data-source.js)

  for entry in "$@"; do
    read -ra parts <<< "$entry"
    script="${parts[0]}"
    [[ "$script" == *.py && "$script" != /* && "$script" != *..* ]] \
      || die "script must be a .py path inside the release: $script"
    [[ -f "$dir/$script" ]] || die "$script is not in release $(basename "$dir")"
    echo "==> python3 ${parts[*]}"
    (cd "$dir" && set -a && . ./.env && set +a && python3 "${parts[@]}")
  done
}

cmd_stop_api() {
  pm2 stop erp-api || true
}

cmd_activate() {
  local version="$1" port i code
  release_dir "$version" > /dev/null

  ln -sfn "releases/$version" "$BASE/current.next"
  mv -Tf "$BASE/current.next" "$BASE/current"
  pm2 startOrReload "$BASE/current/ecosystem.config.cjs" --update-env
  pm2 save

  port="$(sed -n 's/^PORT=//p' "$BASE/shared/.env" | tail -n1)"
  # /health sits behind the global auth guard (401), so "answers HTTP below 500"
  # is the liveness signal.
  for i in $(seq 1 30); do
    code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${port:-4000}/health" || true)"
    if [[ "$code" != 000 && "$code" -lt 500 ]]; then
      echo "$version is live on $(hostname)"
      prune
      return
    fi
    sleep 2
  done
  pm2 logs erp-api --lines 50 --nostream || true
  die "API health check failed on $(hostname)"
}

prune() {
  local live dir
  live="$(readlink -f "$BASE/current")"
  ls -1dt "$BASE"/releases/*/ | tail -n +"$((KEEP_RELEASES + 1))" | while read -r dir; do
    [[ "$(readlink -f "$dir")" == "$live" ]] || rm -rf "$dir"
  done
}

case "${1:-}" in
  fetch)    cmd_fetch "${2:?version}" "${3:?owner/repo}" ;;
  migrate)  shift; cmd_migrate "${1:?version}" "${@:2}" ;;
  stop-api) cmd_stop_api ;;
  activate) cmd_activate "${2:?version}" ;;
  *)        die "usage: $0 fetch|migrate|stop-api|activate ..." ;;
esac
