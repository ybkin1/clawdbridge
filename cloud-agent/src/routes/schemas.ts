import { z } from 'zod';

export const oauthReqSchema = z.object({
  provider: z.literal('github'),
  code: z.string().min(1, 'code is required'),
});

export const createTaskReqSchema = z.object({
  title: z.string().min(1).max(200),
  repo: z.string().min(1).max(100),
});

export const uploadReqSchema = z.object({
  file: z.object({
    fieldname: z.string(),
    originalname: z.string(),
    encoding: z.string(),
    mimetype: z.string(),
    buffer: z.instanceof(Buffer),
    size: z.number().max(500 * 1024 * 1024), // 500MB
  }),
});

export const createRepoReqSchema = z.object({
  name: z.string().min(1).max(100),
  gitRemote: z.string().url(),
  branches: z.array(z.string()).min(1),
});
