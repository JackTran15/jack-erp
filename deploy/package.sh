#!/usr/bin/env bash
# Packs an already-built workspace (`pnpm install && pnpm -r build`) into
#   release/erp-<version>.tar.gz  (+ .sha256)
#
# Tarball layout (unpacked by deploy/remote.sh into <base>/releases/<version>):
#   VERSION
#   ecosystem.config.cjs          deploy/ecosystem.prod.cjs
#   apps/api/                     `pnpm deploy --prod`: dist, prod node_modules, scripts/*.py
#   apps/backoffice-web/dist/
#   apps/pos-web/dist/
#   packages/shared-interfaces/dist/
set -euo pipefail

VERSION="${1:?usage: deploy/package.sh <version>}"
cd "$(dirname "$0")/.."

STAGE="release/erp-$VERSION"
rm -rf release
mkdir -p "$STAGE/apps"

pnpm --filter @erp/api deploy --prod --legacy "$STAGE/apps/api"
# pnpm deploy copies the whole package dir; keep only what runs on the server.
rm -rf "$STAGE/apps/api"/{.env,.ai,logs,src,test}

# The @nestjs/swagger CLI plugin emits enum metadata as relative requires that
# climb out of apps/api into the monorepo (`require("../../…/packages/
# shared-interfaces/dist/…")`), so the release mirrors that path too.
mkdir -p "$STAGE/packages/shared-interfaces"
cp -R packages/shared-interfaces/{package.json,dist} "$STAGE/packages/shared-interfaces/"

for app in backoffice-web pos-web; do
  mkdir -p "$STAGE/apps/$app"
  cp -R "apps/$app/dist" "$STAGE/apps/$app/dist"
done

cp deploy/ecosystem.prod.cjs "$STAGE/ecosystem.config.cjs"
echo "$VERSION" > "$STAGE/VERSION"

tar -czf "release/erp-$VERSION.tar.gz" -C release "erp-$VERSION"
(cd release && sha256sum "erp-$VERSION.tar.gz" > "erp-$VERSION.tar.gz.sha256")
echo "release/erp-$VERSION.tar.gz"
