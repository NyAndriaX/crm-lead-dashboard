#!/usr/bin/env bash
# Préparation d'un VPS Ubuntu 22.04/24.04 neuf — à lancer une fois, en root ou sudo.
#   curl -fsSL … | sudo bash   (ou)   sudo bash deploy/scripts/bootstrap-server.sh
#
# Installe Docker Engine + plugin compose, ouvre uniquement SSH/HTTP/HTTPS, crée /opt/crm-lead.
set -euo pipefail

apt-get update -y
apt-get install -y ca-certificates curl ufw rsync
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Pare-feu : MySQL et le scraper ne sont jamais exposés (réseau Docker interne).
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

mkdir -p /opt/crm-lead
if [[ -n "${SUDO_USER:-}" ]]; then
  usermod -aG docker "${SUDO_USER}"
  chown "${SUDO_USER}:${SUDO_USER}" /opt/crm-lead
fi
echo "✔ Serveur prêt. Déconnectez-vous / reconnectez-vous pour utiliser docker sans sudo."
