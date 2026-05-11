// Cloud Agent SQLite DDL (Design v3 §6.0) — TypeScript Interfaces
// strict mode 兼容

export interface Task {
  id: string;
  title: string;
  repo: string;
  status: 'pending' | 'in_progress' | 'paused' | 'completed' | 'failed';
  tags: string[];
  category: string;
  user_id: string;
  created_at: number;
  updated_at: number;
}

export interface Session {
  id: string;
  task_id: string;
  title: string;
  device_id: string;
  status: string;
  work_dir: string;
  created_at: number;
  last_message_at: number;
}

export interface Message {
  id: string;
  session_id: string;
  type: string;
  content: string;
  seq: number;
  timestamp: number;
  status: string;
  metadata: Record<string, unknown>;
  deleted: number;
}

export interface RepoEntry {
  name: string;
  work_dir: string;
  git_remote: string;
  branches: string[];
  user_id: string;
  registered_at: number;
}

export interface Device {
  id: string;
  name: string;
  platform: 'ios' | 'android' | 'windows' | 'linux';
  user_id: string;
  github_login: string;
  status: 'online' | 'offline';
  last_heartbeat: number | null;
  last_ip: string | null;
  push_token: string | null;
  paired_at: number;
}

export interface Subtask {
  id: string;
  task_id: string;
  title: string;
  description: string;
  sort_order: number;
  status: string;
  session_id: string | null;
}

export interface UploadRecord {
  id: string;
  task_id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  path: string;
  user_id: string;
  uploaded_at: number;
}

export interface ApprovalRecord {
  id: string;
  session_id: string;
  request_id: string;
  operation: string;
  target: string;
  risk: string;
  decision: string;
  timestamp: number;
}
