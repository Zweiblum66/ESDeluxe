#!/usr/bin/env bash
set -euo pipefail

# ===========================================
# EditShare Manager - Deploy to ES Server
# ===========================================
# Builds locally on Mac, deploys to the EditShare server via SSH/SCP.
# The Express server serves both the API and frontend static files
# on a single port (15700) — no nginx required.
#
# Usage:
#   ./deploy.sh              # Full build + deploy
#   ./deploy.sh --skip-build # Deploy without rebuilding
#   ./deploy.sh --setup      # First-time server setup (install PM2)
#   ./deploy.sh --logs       # Tail PM2 logs on the server
#   ./deploy.sh --status     # Check PM2 status on the server

# --- Configuration ---
REMOTE_USER="editshare"
REMOTE_HOST="192.168.178.191"
REMOTE_DIR="/home/editshare/es-manager"
REMOTE_SSH="${REMOTE_USER}@${REMOTE_HOST}"

# SSH options (accept unknown hosts on local network)
SSH_OPTS="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR"

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()     { echo -e "${BLUE}[deploy]${NC} $*"; }
success() { echo -e "${GREEN}[deploy]${NC} $*"; }
warn()    { echo -e "${YELLOW}[deploy]${NC} $*"; }
error()   { echo -e "${RED}[deploy]${NC} $*" >&2; }

remote_exec() {
  sshpass -p 'changeme0479' ssh ${SSH_OPTS} "${REMOTE_SSH}" "export PATH=/home/editshare/.npm-global/bin:\$PATH; $*"
}

remote_copy() {
  sshpass -p 'changeme0479' scp ${SSH_OPTS} "$@"
}

# --- Parse Arguments ---
SKIP_BUILD=false
SETUP_ONLY=false
SHOW_LOGS=false
SHOW_STATUS=false
for arg in "$@"; do
  case $arg in
    --skip-build) SKIP_BUILD=true ;;
    --setup)      SETUP_ONLY=true ;;
    --logs)       SHOW_LOGS=true ;;
    --status)     SHOW_STATUS=true ;;
    --help|-h)
      echo "Usage: $0 [--skip-build] [--setup] [--logs] [--status]"
      echo "  --skip-build  Deploy without rebuilding"
      echo "  --setup       First-time server setup (install PM2)"
      echo "  --logs        Tail PM2 logs on the server"
      echo "  --status      Check PM2 status on the server"
      exit 0
      ;;
  esac
done

# --- Quick commands ---
if [[ "$SHOW_LOGS" == true ]]; then
  remote_exec "pm2 logs es-manager --lines 50"
  exit 0
fi

if [[ "$SHOW_STATUS" == true ]]; then
  remote_exec "pm2 status"
  exit 0
fi

# ===========================================
# First-time server setup
# ===========================================
if [[ "$SETUP_ONLY" == true ]]; then
  log "Setting up ES server for first deployment..."

  # Create application directory
  remote_exec "mkdir -p ${REMOTE_DIR}/{data,logs}"
  success "Created ${REMOTE_DIR}"

  # Setup user-local npm prefix and install PM2
  remote_exec "
    mkdir -p /home/editshare/.npm-global/bin
    npm config set prefix '/home/editshare/.npm-global'
    if ! grep -q '.npm-global/bin' /home/editshare/.bashrc 2>/dev/null; then
      echo 'export PATH=/home/editshare/.npm-global/bin:\$PATH' >> /home/editshare/.bashrc
    fi
    command -v pm2 || npm install -g pm2
    pm2 --version
  "
  success "PM2 installed"

  success "Server setup complete!"
  exit 0
fi

# ===========================================
# Build Phase (runs locally on Mac)
# ===========================================
if [[ "$SKIP_BUILD" == false ]]; then
  log "Building project locally..."
  cd "${PROJECT_ROOT}"

  # Install dependencies
  log "Installing dependencies..."
  npm ci --ignore-scripts 2>/dev/null || npm install

  # Build backend (TypeScript → JavaScript)
  log "Building backend..."
  npm run build -w server
  success "Backend built → server/dist/"

  # Build frontend (Vite → static files)
  log "Building frontend..."
  npm run build -w client
  success "Frontend built → client/dist/"
else
  warn "Skipping build (--skip-build)"
fi

# ===========================================
# Package Phase
# ===========================================
log "Packaging deployment artifacts..."
DEPLOY_TMP="${PROJECT_ROOT}/.deploy-tmp"
rm -rf "${DEPLOY_TMP}"
mkdir -p "${DEPLOY_TMP}/server" "${DEPLOY_TMP}/client" "${DEPLOY_TMP}/shared"

# Backend: compiled JS + package.json + migrations
cp -r "${PROJECT_ROOT}/server/dist" "${DEPLOY_TMP}/server/"
cp "${PROJECT_ROOT}/server/package.json" "${DEPLOY_TMP}/server/"

# Copy SQL migration files (not compiled by TypeScript)
# Note: Due to rootDir config, compiled files are in dist/server/src/
if [[ -d "${PROJECT_ROOT}/server/src/db/migrations" ]]; then
  mkdir -p "${DEPLOY_TMP}/server/dist/server/src/db/migrations"
  cp "${PROJECT_ROOT}/server/src/db/migrations"/*.sql "${DEPLOY_TMP}/server/dist/server/src/db/migrations/" 2>/dev/null || true
  log "Copied SQL migrations to deployment package"
fi

# Frontend: Vite build output (static files)
cp -r "${PROJECT_ROOT}/client/dist" "${DEPLOY_TMP}/client/"

# Shared types (compiled)
if [[ -d "${PROJECT_ROOT}/shared/dist" ]]; then
  cp -r "${PROJECT_ROOT}/shared/dist" "${DEPLOY_TMP}/shared/"
fi
cp "${PROJECT_ROOT}/shared/package.json" "${DEPLOY_TMP}/shared/" 2>/dev/null || true

# Root package.json (for workspaces)
cp "${PROJECT_ROOT}/package.json" "${DEPLOY_TMP}/"

# PM2 ecosystem config
cp "${PROJECT_ROOT}/ecosystem.config.cjs" "${DEPLOY_TMP}/"

# Env file for server
cp "${PROJECT_ROOT}/.env" "${DEPLOY_TMP}/"

# Create tarball
cd "${DEPLOY_TMP}"
tar czf "${PROJECT_ROOT}/es-manager-deploy.tar.gz" .
rm -rf "${DEPLOY_TMP}"

TARBALL_SIZE=$(du -sh "${PROJECT_ROOT}/es-manager-deploy.tar.gz" | cut -f1)
success "Packaged: es-manager-deploy.tar.gz (${TARBALL_SIZE})"

# ===========================================
# Deploy Phase (upload + extract on server)
# ===========================================
log "Deploying to ${REMOTE_SSH}:${REMOTE_DIR}..."

# Ensure directory exists
remote_exec "mkdir -p ${REMOTE_DIR}/{data,logs}"

# Upload tarball
remote_copy "${PROJECT_ROOT}/es-manager-deploy.tar.gz" "${REMOTE_SSH}:/tmp/es-manager-deploy.tar.gz"
success "Uploaded to server"

# Extract and install on server
remote_exec "
  cd ${REMOTE_DIR} && \
  tar xzf /tmp/es-manager-deploy.tar.gz && \
  rm /tmp/es-manager-deploy.tar.gz && \
  cd ${REMOTE_DIR}/server && \
  npm install --omit=dev 2>&1 | tail -5
"
success "Extracted and dependencies installed on server"

# Clean up local tarball
rm -f "${PROJECT_ROOT}/es-manager-deploy.tar.gz"

# ===========================================
# Restart Application via PM2
# ===========================================
log "Restarting application via PM2..."
remote_exec "
  cd ${REMOTE_DIR} && \
  pm2 startOrRestart ecosystem.config.cjs --env production && \
  pm2 save
"

# Wait a moment then check status
sleep 3
remote_exec "pm2 status"

# Quick health check
log "Checking health endpoint..."
sleep 2
remote_exec "curl -sf http://localhost:15700/api/v1/system/health 2>/dev/null || echo 'Health check pending - server may still be starting'"

echo ""
success "========================================="
success " Deployment complete!"
success " Application: http://${REMOTE_HOST}:15700"
success " Health:      http://${REMOTE_HOST}:15700/api/v1/system/health"
success ""
success " PM2 commands (via SSH):"
success "   ./deploy.sh --status   # Check status"
success "   ./deploy.sh --logs     # Tail logs"
success "========================================="
