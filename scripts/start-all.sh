#!/bin/bash
set -e

echo "[1/4] Running database migrations..."
cd cloud-agent && npx ts-node src/db/migrate.ts

echo "[2/4] Starting Cloud Agent with PM2..."
pm2 start ecosystem.config.js

echo "[3/4] Waiting for health check..."
for i in {1..30}; do
  if curl -sf http://localhost:4338/health > /dev/null; then
    echo "Cloud Agent is up!"
    break
  fi
  sleep 1
done

echo "[4/4] Generating QR code for mobile pairing..."
node -e "const qrcode=require('qrcode-terminal'); qrcode.generate('http://localhost:4338', {small:true});"

echo "All services started. Scan the QR code above to pair your device."
