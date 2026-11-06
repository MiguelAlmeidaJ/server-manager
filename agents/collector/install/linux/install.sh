#!/usr/bin/env bash
set -euo pipefail
if [[ $(id -u) -ne 0 ]];then echo 'Run with sudo/root' >&2;exit 1;fi
AGENT_BIN="${1:-./devops_manager}"
CONFIG_SOURCE="${2:-./config.json}"
if [[ ! -f "$AGENT_BIN" || ! -f "$CONFIG_SOURCE" ]];then echo 'Usage: sudo ./install.sh /path/to/devops_manager /path/to/config.json' >&2;exit 1;fi
id -u devops_manager &>/dev/null || useradd --system --no-create-home --shell /usr/sbin/nologin devops_manager
install -d -m 0750 -o root -g devops_manager /etc/devops_manager
install -m 0640 -o root -g devops_manager "$CONFIG_SOURCE" /etc/devops_manager/config.json
install -m 0755 -o root -g root "$AGENT_BIN" /usr/local/bin/devops_manager
cat > /etc/systemd/system/devops_manager.service <<'UNIT'
[Unit]
Description=DevOps Manager - ServerMap inventory agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=devops_manager
Group=devops_manager
ExecStart=/usr/local/bin/devops_manager --config /etc/devops_manager/config.json
Restart=on-failure
RestartSec=10
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
PrivateTmp=true
CapabilityBoundingSet=
AmbientCapabilities=

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now devops_manager
systemctl status devops_manager --no-pager
