import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { registerAllJobs } from '../../src/jobs/index.js';
import { resetDb, seedBasics, registerUser, makeAdmin } from './helpers.js';

const app = createApp();

beforeAll(async () => {
  registerAllJobs();
  await resetDb();
  await seedBasics();
});

describe('مسار المصادقة', () => {
  it('تسجيل → جلسة → /me', async () => {
    const { cookie, user } = await registerUser(app, { email: 'a1@test.sa' });
    expect(user.id).toBeGreaterThan(0);
    const me = await request(app).get('/api/auth/me').set('Cookie', cookie).expect(200);
    expect(me.body.email).toBe('a1@test.sa');
    expect(me.body.role).toBe('user');
  });

  it('بريد مكرر → 409', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'a1@test.sa', password: 'Password1!', name: 'مكرر' })
      .expect(409);
  });

  it('كلمة مرور قصيرة → 400', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'short@test.sa', password: '123', name: 'قصير' })
      .expect(400);
  });

  it('دخول خاطئ → 401، صحيح → 200', async () => {
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'a1@test.sa', password: 'wrong-password' })
      .expect(401);
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'a1@test.sa', password: 'Password1!' })
      .expect(200);
  });

  it('بلا جلسة → 401 على المسارات المحمية', async () => {
    await request(app).get('/api/auth/me').expect(401);
    await request(app).get('/api/lists').expect(401);
  });

  it('تحديث المدينة ويوم التسوق', async () => {
    const { cookie } = await registerUser(app, { email: 'a2@test.sa' });
    const res = await request(app)
      .patch('/api/auth/me')
      .set('Cookie', cookie)
      .send({ shoppingDay: 10 })
      .expect(200);
    expect(res.body.shoppingDay).toBe(10);
  });
});

describe('فرض الأدوار', () => {
  it('مستخدم عادي لا يصل لمسارات الأدمن → 403', async () => {
    const { cookie } = await registerUser(app, { email: 'a3@test.sa' });
    await request(app).get('/api/admin/dashboard').set('Cookie', cookie).expect(403);
    await request(app).get('/api/admin/review-queue').set('Cookie', cookie).expect(403);
    await request(app).post('/api/admin/jobs/offer-expiry/run').set('Cookie', cookie).expect(403);
  });

  it('أدمن يصل', async () => {
    await registerUser(app, { email: 'adm@test.sa' });
    const adminCookie = await makeAdmin(app, 'adm@test.sa');
    await request(app).get('/api/admin/dashboard').set('Cookie', adminCookie).expect(200);
  });
});
