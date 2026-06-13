import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pinoHttp } from 'pino-http';
import { config } from './config.js';
import { logger } from './logger.js';
import { errorHandler } from './middleware/error.js';
import { UPLOADS_DIR } from './uploads.js';
import { authRouter } from './routes/auth.js';
import { catalogRouter } from './routes/catalog.js';
import { listsRouter } from './routes/lists.js';
import { pricesRouter } from './routes/prices.js';
import { adminRouter } from './routes/admin.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);

  app.use(
    helmet({
      // CSP إنتاجي يسمح بخطوط جوجل وصور المتاجر البعيدة (CDN) — وإلا تُحجب
      // الصور والخطوط على النشر. التطوير بلا CSP.
      contentSecurityPolicy: config.isProd
        ? {
            useDefaults: true,
            directives: {
              'default-src': ["'self'"],
              'img-src': ["'self'", 'data:', 'blob:', 'https:'],
              'script-src': ["'self'"],
              'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
              'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
              'connect-src': ["'self'", 'https:'],
              'worker-src': ["'self'", 'blob:'],
              'upgrade-insecure-requests': [],
            },
          }
        : false,
    }),
  );
  app.use(cors({ origin: config.appOrigin, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  if (process.env.NODE_ENV !== 'test') {
    app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/api/health' } }));
  }

  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 600,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'test' || process.env.DISABLE_RATE_LIMIT === '1',
  });
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'test' || process.env.DISABLE_RATE_LIMIT === '1',
  });

  app.get('/api/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

  // صور الأدلة المرفوعة (مجلات/فواتير) — تُعرض بجانب الأسعار الموثقة
  app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '30d', immutable: true }));
  app.use('/api/auth', authLimiter, authRouter);
  app.use('/api', apiLimiter, catalogRouter);
  app.use('/api/lists', apiLimiter, listsRouter);
  app.use('/api', apiLimiter, pricesRouter);
  app.use('/api/admin', apiLimiter, adminRouter);

  // الإنتاج: Express يخدم build العميل (PWA) — خدمة Railway واحدة (القسم 10)
  const here = path.dirname(fileURLToPath(import.meta.url));
  const clientDist = path.resolve(here, '../../client/dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
