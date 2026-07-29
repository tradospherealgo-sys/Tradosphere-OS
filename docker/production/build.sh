#!/usr/bin/env bash
set -euo pipefail

# ─── Tradosphere OS — Production Build Script ───────────────────────────
# Builds all services as slim, pruned Docker images using turbo prune +
# the unified docker/production/Dockerfile.
#
# Each service image is built by selecting the appropriate --target:
#   api-runtime  → all backend services (auth, market-data, etc.)
#   web-runtime  → Next.js frontend
#
# Prerequisites: pnpm, docker
# Usage: ./docker/production/build.sh [--push]
#   --push   Also push images to the configured registry

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
REGISTRY="${REGISTRY:-ghcr.io}"
NAMESPACE="${IMAGE_NAMESPACE:-tradosphere}"
TAG="${IMAGE_TAG:-latest}"
PUSH="${1:-}"
OUT_DIR="/tmp/tradosphere-build"

# service_name:port:pnpm_package:cmd_path:docker_target
SERVICES=(
  "auth:4001:@tradosphere/service-auth:services/auth/dist/index.js:api-runtime"
  "market-data:4002:@tradosphere/service-market-data:services/market-data/dist/index.js:api-runtime"
  "education:4003:@tradosphere/service-education:services/education/dist/index.js:api-runtime"
  "portfolio:4004:@tradosphere/service-portfolio:services/portfolio/dist/index.js:api-runtime"
  "analytics:4005:@tradosphere/service-analytics:services/analytics/dist/index.js:api-runtime"
  "api:4000:@tradosphere/api:apps/api/dist/index.js:api-runtime"
  "web:3000:@tradosphere/web:-:web-runtime"
)

echo "=== Tradosphere OS — Production Build ==="
echo "Registry: $REGISTRY/$NAMESPACE"
echo "Tag:      $TAG"
echo ""

cd "$REPO_ROOT"

# ─── Step 1: Prune each service and build its image ─────────────────────
for SERVICE_SPEC in "${SERVICES[@]}"; do
  IFS=':' read -r NAME PORT PKG CMD_PATH TARGET <<< "$SERVICE_SPEC"

  echo "── Building $NAME ($PKG → $TARGET) ──"

  # Clean previous output
  rm -rf "$OUT_DIR"

  # Turbo prune this service
  echo "  ⏳ Pruning $PKG..."
  pnpm exec turbo prune "$PKG" --docker --out-dir="$OUT_DIR" 2>&1 | sed 's/^/    /'

  # Copy required config files into the build context (turbo prune doesn't
  # always put pnpm-workspace.yaml/turbo.json at the root of out/)
  echo "  ⏳ Copying workspace configs into build context..."
  cp "$REPO_ROOT/pnpm-workspace.yaml" "$OUT_DIR/" 2>/dev/null || true
  cp "$REPO_ROOT/turbo.json" "$OUT_DIR/" 2>/dev/null || true

  # Build the Docker image
  echo "  ⏳ Building Docker image..."
  docker build \
    -f "$SCRIPT_DIR/Dockerfile" \
    --target "$TARGET" \
    --build-arg "PKG_FILTER=$PKG" \
    --build-arg "SERVICE_PORT=$PORT" \
    --build-arg "CMD_PATH=$CMD_PATH" \
    -t "$REGISTRY/$NAMESPACE/$NAME:$TAG" \
    "$OUT_DIR" 2>&1 | sed 's/^/    /'

  echo "  ✅ $REGISTRY/$NAMESPACE/$NAME:$TAG built successfully"

  # Push if requested
  if [ "$PUSH" = "--push" ]; then
    echo "  ⏳ Pushing to $REGISTRY..."
    docker push "$REGISTRY/$NAMESPACE/$NAME:$TAG" 2>&1 | sed 's/^/    /'
    echo "  ✅ Pushed $REGISTRY/$NAMESPACE/$NAME:$TAG"
  fi

  # Clean up
  rm -rf "$OUT_DIR"
done

echo ""
echo "=== All images built successfully ==="
echo ""
echo "To deploy, run on your server:"
echo "  cd docker/production"
echo "  export IMAGE_TAG=$TAG"
echo "  docker compose up -d"
