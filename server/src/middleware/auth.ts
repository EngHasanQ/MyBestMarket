import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export interface AuthUser {
  id: number;
  role: 'user' | 'admin';
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(user: AuthUser): string {
  return jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, { expiresIn: '30d' });
}

export function setAuthCookie(res: Response, token: string) {
  res.cookie('waffir_token', token, {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'lax',
    maxAge: 30 * 86_400_000,
  });
}

export function clearAuthCookie(res: Response) {
  res.clearCookie('waffir_token');
}

function readToken(req: Request): AuthUser | null {
  const token =
    (req.cookies?.waffir_token as string | undefined) ??
    req.headers.authorization?.replace(/^Bearer /, '');
  if (!token) return null;
  try {
    const payload = jwt.verify(token, config.jwtSecret) as { sub: number | string; role: string };
    return { id: Number(payload.sub), role: payload.role as AuthUser['role'] };
  } catch {
    return null;
  }
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const user = readToken(req);
  if (user) req.user = user;
  next();
}

export function authRequired(req: Request, res: Response, next: NextFunction) {
  const user = readToken(req);
  if (!user) return res.status(401).json({ error: 'يلزم تسجيل الدخول' });
  req.user = user;
  next();
}

export function adminRequired(req: Request, res: Response, next: NextFunction) {
  const user = readToken(req);
  if (!user) return res.status(401).json({ error: 'يلزم تسجيل الدخول' });
  if (user.role !== 'admin') return res.status(403).json({ error: 'صلاحية مدير مطلوبة' });
  req.user = user;
  next();
}
