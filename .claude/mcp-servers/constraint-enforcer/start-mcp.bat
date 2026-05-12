@echo off
REM Start constraint-enforcer MCP Server (JSON-RPC 2.0 over stdio)

cd /d "%~dp0"
if not defined PROJECT_ROOT set "PROJECT_ROOT=%CD%"

REM Ensure dependencies are installed
if not exist "node_modules" (
    echo [constraint-enforcer] Installing dependencies...
    npm install
)

node index.js
