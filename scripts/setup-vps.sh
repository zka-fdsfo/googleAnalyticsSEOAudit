#!/bin/bash
# VPS First-Time Setup Script
# Run once on your Contabo VPS as root (or with sudo):
#   curl -o setup-vps.sh https://raw.githubusercontent.com/YOURUSER/YOURREPO/main/scripts/setup-vps.sh
#   chmod +x setup-vps.sh && sudo bash setup-vps.sh
#
# What this script does:
#   1. Installs Docker + Docker Compose
#   2. Enables Apache2 proxy modules
#   3. Sets up the app directory
#   4. Installs Certbot for HTTPS
#   5. Configures firewall

set -euo pipefail

DOMAIN="${1:-yourdomain.com}"
APP_DIR="/root/seo-audit"
APACHE_CONF="/etc/apache2/sites-available/seo-audit.conf"

echo "════════════════════════════════════════════════"
echo " SEO Audit Tool — VPS Setup"
echo " Domain: $DOMAIN"
echo "════════════════════════════════════════════════"

# ── 1. System update ─────────────────────────────────────────────────────────
echo "→ Updating system packages..."
apt-get update -qq && apt-get upgrade -y -qq

# ── 2. Install Docker ────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  echo "→ Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
  echo "✅ Docker installed: $(docker --version)"
else
  echo "✅ Docker already installed: $(docker --version)"
fi

# ── 3. Install Docker Compose v2 ─────────────────────────────────────────────
if ! docker compose version &>/dev/null 2>&1; then
  echo "→ Installing Docker Compose v2..."
  COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep '"tag_name"' | cut -d'"' -f4)
  curl -SL "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-x86_64" \
    -o /usr/local/bin/docker-compose
  chmod +x /usr/local/bin/docker-compose
  ln -sf /usr/local/bin/docker-compose /usr/bin/docker-compose
  echo "✅ Docker Compose installed: $(docker-compose --version)"
else
  echo "✅ Docker Compose already installed"
fi

# ── 4. Enable Apache2 modules ────────────────────────────────────────────────
echo "→ Enabling Apache2 modules..."
a2enmod proxy proxy_http proxy_wstunnel headers rewrite ssl
systemctl restart apache2
echo "✅ Apache2 modules enabled"

# ── 5. Install Certbot ───────────────────────────────────────────────────────
if ! command -v certbot &>/dev/null; then
  echo "→ Installing Certbot..."
  apt-get install -y -qq certbot python3-certbot-apache
  echo "✅ Certbot installed"
else
  echo "✅ Certbot already installed"
fi

# ── 6. Configure UFW Firewall ────────────────────────────────────────────────
echo "→ Configuring firewall..."
if command -v ufw &>/dev/null; then
  ufw allow 22/tcp   comment 'SSH'
  ufw allow 80/tcp   comment 'HTTP'
  ufw allow 443/tcp  comment 'HTTPS'
  # Block direct access to container ports from outside
  ufw deny 5000/tcp  comment 'Block direct backend access'
  ufw deny 3000/tcp  comment 'Block direct frontend access'
  ufw deny 27017/tcp comment 'Block direct MongoDB access'
  ufw --force enable
  echo "✅ Firewall configured"
fi

# ── 7. Create app directory ──────────────────────────────────────────────────
echo "→ Creating app directory: $APP_DIR"
mkdir -p "$APP_DIR"

# ── 8. Create .env from example ──────────────────────────────────────────────
if [ ! -f "$APP_DIR/.env" ]; then
  echo "→ Creating .env template..."
  cat > "$APP_DIR/.env" << 'ENVEOF'
# Fill in all values before starting containers
DOCKER_USERNAME=yourdockerhubusername
IMAGE_TAG=latest
MONGO_ROOT_USER=admin
MONGO_ROOT_PASSWORD=CHANGE_THIS_STRONG_PASSWORD_32_CHARS
FRONTEND_URL=https://YOURDOMAIN.COM
JWT_SECRET=CHANGE_THIS_64_CHAR_HEX
JWT_EXPIRES_IN=7d
SESSION_SECRET=CHANGE_THIS_32_CHAR_HEX
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=https://YOURDOMAIN.COM/api/auth/google/callback
GOOGLE_PAGESPEED_API_KEY=
ENVEOF
  echo "✅ Created $APP_DIR/.env — EDIT THIS FILE before starting containers"
fi

# ── 9. Apache2 virtual host ──────────────────────────────────────────────────
echo "→ Configure Apache2 virtual host now?"
echo "   1. Edit $APACHE_CONF and replace 'yourdomain.com' with $DOMAIN"
echo "   2. Run: sudo a2ensite seo-audit"
echo "   3. Run: sudo systemctl reload apache2"
echo "   4. Get SSL cert: sudo certbot --apache -d $DOMAIN"

# ── 10. Generate secure secrets ──────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════"
echo " Generated Secrets (copy to $APP_DIR/.env)"
echo "════════════════════════════════════════════════"
echo "JWT_SECRET=$(openssl rand -hex 64)"
echo "SESSION_SECRET=$(openssl rand -hex 32)"
echo "MONGO_ROOT_PASSWORD=$(openssl rand -hex 24)"
echo "════════════════════════════════════════════════"
echo ""
echo "✅ Setup complete! Next steps:"
echo "   1. Fill in $APP_DIR/.env with the secrets above"
echo "   2. Copy apache/seo-audit.conf to /etc/apache2/sites-available/"
echo "      and replace yourdomain.com with $DOMAIN"
echo "   3. Run: sudo a2ensite seo-audit && sudo certbot --apache -d $DOMAIN"
echo "   4. Push your code to GitHub to trigger the first deployment"
