# ClawdBridge

Mobile bridge for Claude Code — control your desktop AI agent from anywhere.

## Quick Start

1. **Start Cloud Agent**
   ```bash
   cd cloud-agent
   npm install
   cp .env.example .env
   # Edit .env with your credentials
   npm run dev
   ```

2. **Pair Mobile Device**
   - Open the mobile app
   - Scan the QR code displayed in terminal
   - Login with GitHub

3. **Start Coding**
   - Create a task
   - Chat with Claude
   - Approve tool executions

## Architecture

- **Cloud Agent**: Node.js + Express + WebSocket + SQLite
- **Mobile**: React Native + Expo + Zustand + DeepSeek fallback

## Scripts

```bash
npm run dev      # Start development
npm run test     # Run tests
npm run build    # Build for production
```

## License

MIT
