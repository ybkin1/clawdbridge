import { Router, Request, Response } from 'express';
import multer from 'multer';
import { FileManager } from '../file-manager';
import { serializeUpload } from './serializers';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });

export function createFileRouter(fileManager: FileManager): Router {
  const r = Router();
  r.post('/upload', upload.single('file'), (req: Request, res: Response) => {
    if (!req.file) { res.status(400).json({ error: 'no_file', code: 'FILE_004', reqId: req.reqId }); return; }
    const record = fileManager.upload(req.file, (req.body.taskId as string) || 'unknown', req.userId!);
    res.status(201).json(serializeUpload(record));
  });
  r.get('/:fileId', (req: Request, res: Response) => {
    const result = fileManager.download(req.params.fileId);
    if (!result) { res.status(404).json({ error: 'not_found', code: 'FILE_003', reqId: req.reqId }); return; }
    res.download(result.path, result.fileName);
  });
  return r;
}
