#!/usr/bin/env bash
set -euo pipefail

# ===========================================
# EditShare Manager - Server Setup
# ===========================================
# Run this ONCE on the ES server (192.168.178.191) to prepare
# the environment for deployments.
#
# Usage (on the server):
#   sudo bash server-setup.sh

APP_DIR="/opt/es-manager"
APP_USER="editshare"

echo "=== EditShare Manager - Server Setup ==="

# 1. Create application directory
echo "[1/5] Creating application directory..."
mkdir -p "${APP_DIR}"/{data,logs}
chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"

# 2. Install PM2 globally
echo "[2/5] Installing PM2..."
if ! command -v pm2 &>/dev/null; then
  npm install -g pm2
  echo "PM2 installed"
else
  echo "PM2 already installed: $(pm2 --version)"
fi

# 3. Setup PM2 startup service
echo "[3/5] Configuring PM2 startup..."
env PATH=$PATH:/usr/bin pm2 startup systemd -u "${APP_USER}" --hp "/home/${APP_USER}"

# 4. Install/configure nginx
echo "[4/5] Configuring Nginx..."
if ! command -v nginx &>/dev/null; then
  apt-get update
  apt-get install -y nginx
fi

# Copy nginx config
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [[ -f "${SCRIPT_DIR}/nginx-esm.conf" ]]; then
  cp "${SCRIPT_DIR}/nginx-esm.conf" /etc/nginx/sites-available/es-manager
  ln -sf /etc/nginx/sites-available/es-manager /etc/nginx/sites-enabled/es-manager
  # Remove default site if it exists
  rm -f /etc/nginx/sites-enabled/default
  nginx -t
  systemctl enable nginx
  systemctl restart nginx
  echo "Nginx configured on port 15710"
else
  echo "WARNING: nginx-esm.conf not found. Copy it manually to /etc/nginx/sites-available/es-manager"
fi

# 5. Verify prerequisites
echo "[5/5] Verifying prerequisites..."
echo "  Node.js: $(node --version)"
echo "  npm:     $(npm --version)"
echo "  PM2:     $(pm2 --version)"
echo "  Nginx:   $(nginx -v 2>&1)"
echo "  EFS mount: $(ls /efs/efs_1 2>/dev/null && echo 'OK' || echo 'NOT MOUNTED')"
echo "  efs-admin: $(which efs-admin 2>/dev/null || echo 'NOT FOUND')"

echo ""
echo "=== Server setup complete! ==="
echo "Deploy with: ./deploy.sh (from your Mac)"
echo "Access at:   http://192.168.178.191:15710"
