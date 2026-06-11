import { Router } from 'express';
import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '../db/index.js';
import { config } from '../config.js';
import { authRequired, clearAuthCookie, setAuthCookie, signToken } from '../middleware/auth.js';

export const authRouter = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2).max(100),
  cityId: z.number().int().optional(),
  shoppingDay: z.number().int().min(1).max(28).optional(),
});

authRouter.post('/register', async (req, res, next) => {
  try {
    const body = registerSchema.parse(req.body);
    const existing = await db.query.users.findFirst({
      where: eq(schema.users.email, body.email.toLowerCase()),
    });
    if (existing) return res.status(409).json({ error: 'البريد مسجّل مسبقاً' });
    const passwordHash = await bcrypt.hash(body.password, config.bcryptRounds);
    const [user] = await db
      .insert(schema.users)
      .values({
        email: body.email.toLowerCase(),
        passwordHash,
        name: body.name,
        cityId: body.cityId ?? null,
        shoppingDay: body.shoppingDay ?? 4,
      })
      .returning();
    setAuthCookie(res, signToken({ id: user!.id, role: user!.role }));
    res.status(201).json({ id: user!.id, email: user!.email, name: user!.name, role: user!.role, cityId: user!.cityId, shoppingDay: user!.shoppingDay });
  } catch (err) {
    next(err);
  }
});

const loginSchema = z.object({ email: z.string().email(), password: z.string() });

authRouter.post('/login', async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    const user = await db.query.users.findFirst({
      where: eq(schema.users.email, body.email.toLowerCase()),
    });
    if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
      return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
    }
    setAuthCookie(res, signToken({ id: user.id, role: user.role }));
    res.json({ id: user.id, email: user.email, name: user.name, role: user.role, cityId: user.cityId, shoppingDay: user.shoppingDay });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

authRouter.get('/me', authRequired, async (req, res, next) => {
  try {
    const user = await db.query.users.findFirst({ where: eq(schema.users.id, req.user!.id) });
    if (!user) return res.status(401).json({ error: 'يلزم تسجيل الدخول' });
    res.json({ id: user.id, email: user.email, name: user.name, role: user.role, cityId: user.cityId, shoppingDay: user.shoppingDay });
  } catch (err) {
    next(err);
  }
});

const updateSchema = z.object({
  cityId: z.number().int().optional(),
  shoppingDay: z.number().int().min(1).max(28).optional(),
  name: z.string().min(2).max(100).optional(),
});

authRouter.patch('/me', authRequired, async (req, res, next) => {
  try {
    const body = updateSchema.parse(req.body);
    const [user] = await db
      .update(schema.users)
      .set(body)
      .where(eq(schema.users.id, req.user!.id))
      .returning();
    res.json({ id: user!.id, email: user!.email, name: user!.name, role: user!.role, cityId: user!.cityId, shoppingDay: user!.shoppingDay });
  } catch (err) {
    next(err);
  }
});
