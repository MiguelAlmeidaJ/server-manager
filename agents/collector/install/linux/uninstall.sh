#!/usr/bin/env bash
set -euo pipefail
if [[ $(id -u) -ne 0 ]];then echo 'Run with sudo/root' >&2;exit 1;fi
systemctl disable --now devops_manager || true
rm -f /etc/systemd/system/devops_manager.service
systemctl daemon-reload
printf '%s\n' 'Service removed. Configuration and binary preserved for manual cleanup.'
