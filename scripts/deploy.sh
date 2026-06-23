#!/bin/bash
# Deployment script — runs on VPS via GitHub Actions SSH
# Called by CI/CD: bash ~/seo-audit/scripts/deploy.sh <IMAGE_TAG>

set -euo pipefail

APP_DIR="/root/seo-audit"
IMAGE_TAG="${1:-latest}"
MAX_WAIT=120  # seconds to wait for health checks

cd "$APP_DIR"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] ── Starting deployment (tag: $IMAGE_TAG) ──"

# Update IMAGE_TAG in .env
sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=$IMAGE_TAG/" .env

# Pull latest images
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Pulling images..."
docker-compose pull

# Bring up services (recreates containers with new images)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting containers..."
docker-compose up -d --remove-orphans

# Wait for backend health check
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Waiting for backend to be healthy..."
ELAPSED=0
until docker inspect --format='{{.State.Health.Status}}' seo_backend 2>/dev/null | grep -q "healthy"; do
  if [ $ELAPSED -ge $MAX_WAIT ]; then
    echo "❌ Backend health check timed out after ${MAX_WAIT}s"
    docker-compose logs --tail=50 backend
    exit 1
  fi
  sleep 5
  ELAPSED=$((ELAPSED + 5))
done
echo "✅ Backend is healthy"

# Clean up old images to save disk space
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Cleaning up old images..."
docker image prune -f

echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✅ Deployment complete"
