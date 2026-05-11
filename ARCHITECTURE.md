# ClawdBridge Architecture

## Overview

ClawdBridge is a mobile bridge for Claude Code, enabling users to control their desktop AI agent from anywhere. It consists of two main components:

- **Cloud Agent**: Node.js backend providing API, WebSocket, and task management
- **Mobile App**: React Native app for iOS/Android with offline DeepSeek fallback

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Mobile App                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   Screens   │  │ Components  │  │        Stores           │  │
│  │  (React)    │  │  (React)    │  │      (Zustand)          │  │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘  │
│         │                │                     │                │
│  ┌──────▼────────────────▼─────────────────────▼─────────────┐  │
│  │                      Services                              │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │  │
│  │  │HttpClient│  │WsConnection│  │MsgRouter │  │DeepSeek  │  │  │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘  │  │
│  └────────────────────────┬──────────────────────────────────┘  │
│                           │                                      │
│                    ┌──────▼──────┐                               │
│                    │  SQLite DB  │                               │
│                    └─────────────┘                               │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTPS / WebSocket
┌───────────────────────────▼─────────────────────────────────────┐
│                       Cloud Agent                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   Express   │  │  WebSocket  │  │    Task/Session Mgr     │  │
│  │    API      │  │   Server    │  │                         │  │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘  │
│         │                │                     │                │
│  ┌──────▼────────────────▼─────────────────────▼─────────────┐  │
│  │                      Middleware                            │  │
│  │  JWT │ Rate Limit │ Sanitize │ Helmet │ Error Handler     │  │
│  └────────────────────────┬──────────────────────────────────┘  │
│                           │                                      │
│  ┌────────────────────────▼──────────────────────────────────┐  │
│  │                      Data Layer                            │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │  │
│  │  │TaskDAO   │  │SessionDAO│  │MessageDAO│  │  SQLite  │  │  │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Mobile Framework | React Native + Expo |
| Mobile State | Zustand |
| Mobile Storage | expo-secure-store + expo-sqlite |
| Backend Framework | Node.js + Express |
| Backend DB | Better-SQLite3 |
| Cache | Redis (optional) |
| Auth | JWT (HS256) + GitHub OAuth |
| Real-time | WebSocket (ws) |
| Fallback AI | DeepSeek API |

## Data Flow

### 1. Authentication Flow
```
Mobile → GitHub OAuth → Cloud Agent → JWT Token Pair → Secure Store
```

### 2. Task Creation Flow
```
Mobile HTTP POST /tasks → JWT Verify → TaskDAO.create → SQLite → Response
```

### 3. Real-time Messaging Flow
```
Mobile WS connect → JWT Verify (query param) → Session sync → Bidirectional messages
```

### 4. Claude Execution Flow
```
Task → Spawn Claude process → Stdin/Stdout bridge → Permission intercept → Mobile approval
```

### 5. Offline Fallback Flow
```
Cloud Agent offline → DeepSeekChat → Circuit breaker → Local response
```

## Security Model

| Layer | Mechanism |
|-------|-----------|
| Transport | HTTPS + WSS |
| Authentication | JWT (access 15min / refresh 7d) |
| Authorization | user_id scoped queries |
| Input Validation | Zod schemas |
| XSS Prevention | sanitizeMiddleware (strip HTML) |
| Rate Limiting | Token bucket (100 req/s per user) |
| Secret Storage | expo-secure-store (mobile) |

## Performance Characteristics

| Metric | Target | Implementation |
|--------|--------|----------------|
| Task insert | <1ms | SQLite prepared statements |
| Message query | <50ms | Composite index (session_id, timestamp) |
| WS connection | <100ms | JWT verification + memory lookup |
| Reconnect | 2s-60s | Exponential backoff |
| Memory limit | 1MB | maxPayload on WebSocket |
| Context limit | 20 turns | Conversation truncation |

## Module Dependencies

```
app.ts
├── middleware/
│   ├── auth.ts → jwt-issuer.ts
│   ├── rate-limit.ts
│   ├── sanitize.ts
│   └── error-handler.ts → routes/errors.ts
├── routes/
│   ├── auth.ts → jwt-issuer.ts
│   ├── tasks.ts → task-manager.ts
│   └── schemas.ts
├── ws-server.ts → jwt-issuer.ts + session-manager.ts
├── session-manager.ts → process-pool.ts + bridge.ts
├── task-manager.ts → task-dao.ts
└── db/
    ├── schema.ts
    └── dao/*.ts
```

## Deployment

```bash
# Docker Compose
docker-compose up -d

# Manual
npm run migrate
npm run start
```

## Monitoring

- Health endpoint: `GET /health`
- Metrics endpoint: `GET /metrics` (Prometheus)
- PM2 process management
