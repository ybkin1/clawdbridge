#!/bin/sh
set -e
echo "[clawd] Starting Cloud Agent..."
echo "[clawd] Running database migrations..."
node dist/db/migrate.js
echo "========================================"
echo "  Cloud Agent Started - wss://$DOMAIN/ws"
echo "========================================"
exec pm2-runtime ecosystem.config.js
