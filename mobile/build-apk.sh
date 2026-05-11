#!/bin/bash
set -e
LOG=/root/clawdbridge-build/build.log
exec > >(tee -a $LOG) 2>&1

echo "=== Build started $(date) ==="

cd /root/clawdbridge-build

echo "[1] Pull node image via mirror"
docker pull docker.1ms.run/library/node:18-slim
docker tag docker.1ms.run/library/node:18-slim node:18-slim

echo "[2] Build Docker image"
docker build -f Dockerfile.build -t clawdbridge-builder:latest .

echo "[3] Run container to build APK"
docker run --rm \
    -v /root/clawdbridge-build/output:/output \
    -e JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 \
    clawdbridge-builder:latest

echo "[4] Done"
ls -lh /root/clawdbridge-build/output/
echo "=== Build completed $(date) ==="
