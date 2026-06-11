import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { logger } from '../logger.js';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'بيانات غير صالحة', details: err.flatten() });
  }
  const status = (err as { status?: number }).status ?? 500;
  const message =
    status < 500 ? (err as Error).message : 'حدث خطأ غير متوقع، حاول مرة أخرى';
  if (status >= 500) logger.error({ err }, 'unhandled error');
  res.status(status).json({ error: message });
}
