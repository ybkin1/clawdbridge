#!/bin/bash
set -e
echo "[1] clean old sources"
rm -f /etc/apt/sources.list.d/docker.list
rm -f /etc/apt/sources.list.d/archive_uri-*.list
echo "[2] install deps"
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg lsb-release
echo "[3] add docker gpg"
curl -fsSL https://mirrors.aliyun.com/docker-ce/linux/ubuntu/gpg | gpg --batch --yes --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
echo "[4] add docker repo"
CODENAME=$(lsb_release -cs)
ARCH=$(dpkg --print-architecture)
echo "deb [arch=$ARCH signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://mirrors.aliyun.com/docker-ce/linux/ubuntu $CODENAME stable" > /etc/apt/sources.list.d/docker.list
echo "[5] install docker"
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
echo "[6] start docker"
systemctl start docker
systemctl enable docker
docker --version
echo "DONE"
