import { Task, Session, UploadRecord } from '../types/entities';
import { TaskResponse, SessionResponse, FileUploadResponse } from '../types/api';

export function serializeTask(task: Task, sessions?: { id: string; status: string; lastMessageAt: number }[]): TaskResponse {
  return {
    id: task.id,
    title: task.title,
    repo: task.repo,
    status: task.status,
    tags: JSON.parse(task.tags || '[]'),
    category: task.category,
    createdAt: task.created_at,
    updatedAt: task.updated_at,
    sessionsCount: sessions?.length,
    sessions: sessions || [],
  };
}

export function serializeSession(s: Session): SessionResponse {
  return {
    id: s.id,
    task_id: s.task_id,
    title: s.title,
    device_id: s.device_id,
    status: s.status,
    work_dir: s.work_dir,
    created_at: s.created_at,
    last_message_at: s.last_message_at,
  };
}

export function serializeUpload(r: UploadRecord): FileUploadResponse {
  return {
    fileId: r.id,
    fileName: r.file_name,
    fileSize: r.file_size,
    mimeType: r.mime_type,
    url: `/api/v1/files/${r.id}`,
  };
}
