@echo off
:: Agent Orchestrator MCP Server 启动脚本
:: 用法: start-mcp.bat
cd /d "%~dp0"
"C:\Program Files\nodejs\node.exe" index.js
