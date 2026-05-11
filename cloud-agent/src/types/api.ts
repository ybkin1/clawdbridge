// ============================================================
// ClawdBridge Cloud Agent REST API — DTO Types (Design v3 §7.1-§7.7)
// ============================================================

// ── Auth (§7.1) ─────────────────────────────────────────────

export interface OAuthRequest {
  provider: string;
  code: string;
}

export interface AuthResult {
  token: string;
  refreshToken: string;
  user: {
    id: number;
    login: string;
    avatar_url: string;
  };
  deviceId: string;
}

export interface TokenPair {
  token: string;
  refreshToken: string;
}

// ── Task (§7.2) ─────────────────────────────────────────────

export interface CreateTaskRequest {
  title: string;
  repo: string;
}

export interface TaskResponse {
  id: string;
  title: string;
  repo: string;
  status: string;
  tags: string[];
  category: string;
  createdAt: number;
  updatedAt: number;
  sessionsCount?: number;
  sessions?: SessionSummary[];
}

export interface SessionSummary {
  id: string;
  status: string;
  lastMessageAt: number;
}

export interface TaskListResponse {
  tasks: TaskResponse[];
}

// ── Session (§7.3) ──────────────────────────────────────────

export interface SessionResponse {
  id: string;
  task_id: string;
  title: string;
  device_id: string;
  status: string;
  work_dir: string;
  created_at: number;
  last_message_at: number;
}

export interface MessageResponse {
  id: string;
  type: string;
  content: string;
  seq: number;
  timestamp: number;
  status: string;
  metadata: Record<string, unknown>;
}

export interface MessagesResponse {
  messages: MessageResponse[];
  hasMore: boolean;
}

// ── Repo (§7.4) ─────────────────────────────────────────────

export interface RepoResponse {
  name: string;
  workDir: string;
  gitRemote: string;
  branches: string[];
}

export interface RepoListResponse {
  repos: RepoResponse[];
}

export interface CreateRepoRequest {
  name: string;
  gitRemote: string;
  branches: string[];
}

export interface FileTreeNode {
  name: string;
  type: "file" | "dir";
  size?: number;
  children?: FileTreeNode[];
}

export interface PullRequestItem {
  number: number;
  title: string;
  state: string;
  user: string;
  createdAt: number;
}

export interface IssueItem {
  number: number;
  title: string;
  state: string;
  labels: string[];
  createdAt: number;
}

// ── File (§7.5) ─────────────────────────────────────────────

export interface FileUploadResponse {
  fileId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  url: string;
}

// ── Device (§7.6) ───────────────────────────────────────────

export interface DeviceResponse {
  id: string;
  name: string;
  platform: string;
  status: string;
  lastHeartbeat: number;
  authorizedDirs: string[];
}

export interface DeviceListResponse {
  devices: DeviceResponse[];
}

// ── Health / Usage / Search (§7.7) ──────────────────────────

export interface HealthResponse {
  status: string;
  uptime: number;
  pm2: { status: string };
  claudeProcesses: {
    total: number;
    running: number;
    crashed: number;
  };
  sqlite: { status: string };
  memory: { rssMB: number };
  disk: { freeGB: number };
  agent_engine: { status: string };
}

export interface UsageResponse {
  month: string;
  kimi_tokens: number;
  kimi_cost_rmb: number;
  sessions: number;
}

export interface SearchResponse {
  results: {
    sessionId: string;
    taskId: string;
    messageId: string;
    content: string;
    timestamp: number;
  }[];
}

// ── Error (§7.7) ────────────────────────────────────────────

export interface ApiErrorResponse {
  error: string;
  code: string;
  reqId: string;
  details?: Record<string, unknown>;
}
