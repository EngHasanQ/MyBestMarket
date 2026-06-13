// تقارير الأسعار المنفردة + فواتير OCR (القسمان 2.3 و14.3) + التنبيهات والإشعارات

import { Router } from 'express';
import multer from 'multer';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '../db/index.js';
import { authRequired } from '../middleware/auth.js';
import { submitPrice } from '../services/priceResolver.js';
import { parseReceiptText, decodeZatcaQr } from '../services/ocr/receiptParser.js';
import { matchProduct, saveAlias } from '../services/productMatcher.js';
import { similarity } from '../services/normalize.js';

export const pricesRouter = Router();
pricesRouter.use(authRequired);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const reportSchema = z.object({
  productId: z.number().int(),
  branchId: z.number().int(),
  price: z.number().positive(),
});

pricesRouter.post('/report', async (req, res, next) => {
  try {
    const body = reportSchema.parse(req.body);
    const result = await submitPrice({
      ...body,
      source: 'user_report',
      basis: 'shelf',
      reportedBy: req.user!.id,
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

const receiptSchema = z.object({
  branchId: z.number().int(),
  // نص OCR مباشرة (من العميل) أو صورة مرفوعة تُمرَّر لمحرك OCR
  ocrText: z.string().max(20_000).optional(),
  zatcaQr: z.string().max(5_000).optional(),
});

/**
 * رفع فاتورة: OCR → تحليل بنود → مطابقة → أسعار رف موثّقة بثقة 99 (قسم 14.3).
 * البنود غير المطابقة تُعاد للمستخدم لشاشة التأكيد السريع.
 */
pricesRouter.post('/receipt', upload.single('image'), async (req, res, next) => {
  try {
    const body = receiptSchema.parse({
      branchId: Number(req.body.branchId),
      ocrText: req.body.ocrText,
      zatcaQr: req.body.zatcaQr,
    });

    let text = body.ocrText ?? null;
    let proofImageUrl: string | null = null;
    let receiptBuffer: Buffer | null = null;
    // أسطر OCR بصناديقها — لتظليل (قصّ) سطر البند المطابق دليلاً
    let ocrLines: Array<{ text: string; box: [number, number, number, number] }> = [];
    if (req.file) {
      // صورة الفاتورة تُحفظ كدليل يُعرض بجانب كل سعر موثق منها
      const { saveUpload } = await import('../uploads.js');
      proofImageUrl = saveUpload(req.file.buffer, req.file.originalname);
      receiptBuffer = req.file.buffer;
      if (!text) {
        // OCR على مستوى الأسطر: نشتق النص للتحليل ونحتفظ بالصناديق للقصّ
        const { ocrImageLines } = await import('../services/ocr/imageLines.js');
        ocrLines = await ocrImageLines(req.file.buffer);
        text = ocrLines.map((l) => l.text).join('\n');
      }
    }
    if (!text) return res.status(400).json({ error: 'أرفق صورة الفاتورة أو نصها' });

    const branch = await db.query.storeBranches.findFirst({
      where: eq(schema.storeBranches.id, body.branchId),
    });
    if (!branch) return res.status(404).json({ error: 'الفرع غير موجود' });

    const parsed = parseReceiptText(text);

    // تحقق هوية المتجر من ZATCA QR إن وُجد (مضاد للتلاعب — قسم 14.3)
    let qrVerified: boolean | null = null;
    if (body.zatcaQr) {
      const qr = decodeZatcaQr(body.zatcaQr);
      if (!qr) {
        qrVerified = false;
      } else {
        const store = await db.query.stores.findFirst({
          where: eq(schema.stores.id, branch.storeId),
        });
        qrVerified = store ? similarity(qr.sellerName, store.nameAr) >= 0.4 : false;
      }
    }

    const matched: Array<{ line: string; productId: number; productName: string; price: number; result: unknown }> = [];
    const unmatched: Array<{ line: string; productName: string; price: number }> = [];

    for (const line of parsed.lines) {
      const match = await matchProduct(line.productName, branch.storeId);
      if (match) {
        const result = await submitPrice({
          productId: match.productId,
          branchId: body.branchId,
          price: line.unitPrice,
          source: 'receipt_ocr',
          basis: 'shelf',
          reportedBy: req.user!.id,
          proofImageUrl,
        });
        if (result.status === 'published' && proofImageUrl) {
          const { addEvidence } = await import('../services/evidence.js');
          // تظليل سطر البند: اقصص منطقة السطر المطابق من صورة الفاتورة
          let lineCrop: string | null = null;
          if (receiptBuffer && ocrLines.length) {
            const best = ocrLines
              .map((l) => ({ l, s: similarity(l.text, line.rawText) }))
              .sort((a, b) => b.s - a.s)[0];
            if (best && best.s >= 0.3) {
              const { cropImageRegion } = await import('../services/ocr/imageLines.js');
              lineCrop = await cropImageRegion(receiptBuffer, best.l.box, 8);
            }
          }
          // دليلان: السطر المظلَّل (إن وُجد) + صورة الفاتورة الكاملة
          if (lineCrop) {
            await addEvidence({ priceId: result.priceId, evidenceType: 'receipt', imagePath: lineCrop });
          }
          await addEvidence({
            priceId: result.priceId,
            evidenceType: 'receipt',
            imagePath: proofImageUrl,
          });
        }
        if (match.via === 'fuzzy') await saveAlias(match.productId, branch.storeId, line.productName);
        matched.push({
          line: line.rawText,
          productId: match.productId,
          productName: match.nameAr,
          price: line.unitPrice,
          result,
        });
      } else {
        unmatched.push({ line: line.rawText, productName: line.productName, price: line.unitPrice });
      }
    }
    res.json({ storeName: parsed.storeName, total: parsed.total, qrVerified, matched, unmatched });
  } catch (err) {
    next(err);
  }
});

const confirmLineSchema = z.object({
  branchId: z.number().int(),
  productId: z.number().int(),
  rawName: z.string().min(1).max(300),
  price: z.number().positive(),
});

/** تأكيد المستخدم لبند غامض ("هل هذا المنتج هو…؟") → سعر موثّق + alias دائم */
pricesRouter.post('/receipt/confirm-line', async (req, res, next) => {
  try {
    const body = confirmLineSchema.parse(req.body);
    const branch = await db.query.storeBranches.findFirst({
      where: eq(schema.storeBranches.id, body.branchId),
    });
    if (!branch) return res.status(404).json({ error: 'الفرع غير موجود' });
    const result = await submitPrice({
      productId: body.productId,
      branchId: body.branchId,
      price: body.price,
      source: 'receipt_ocr',
      basis: 'shelf',
      reportedBy: req.user!.id,
    });
    await saveAlias(body.productId, branch.storeId, body.rawName);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// ---------- إثبات السعر (سبرنت v2 — جزء 2.2) ----------
pricesRouter.get('/prices/:priceId/evidence', async (req, res, next) => {
  try {
    const { listEvidence } = await import('../services/evidence.js');
    res.json(await listEvidence(Number(req.params.priceId)));
  } catch (err) {
    next(err);
  }
});

/** صور الأدلة: نقطة مخولة مع كاش ومصغرات 200px */
pricesRouter.get('/evidence/img/:name', async (req, res, next) => {
  try {
    const { thumbnailPath, originalPath } = await import('../services/evidence.js');
    const file =
      req.query.thumb === '1' ? await thumbnailPath(req.params.name) : originalPath(req.params.name);
    res.setHeader('Cache-Control', 'private, max-age=2592000, immutable');
    res.sendFile(file);
  } catch (err) {
    next(err);
  }
});

/** طلب إضافة منتج مفقود (الحالة الفارغة في البحث) */
pricesRouter.post('/product-requests', async (req, res, next) => {
  try {
    const body = z.object({ query: z.string().min(2).max(200) }).parse(req.body);
    const me = await db.query.users.findFirst({ where: eq(schema.users.id, req.user!.id) });
    const [row] = await db
      .insert(schema.productRequests)
      .values({ userId: req.user!.id, query: body.query, cityId: me?.cityId ?? null })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
});

// ---------- الإشعارات ----------
pricesRouter.get('/notifications', async (req, res, next) => {
  try {
    const rows = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.userId, req.user!.id))
      .orderBy(desc(schema.notifications.createdAt))
      .limit(100);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

pricesRouter.post('/notifications/:id/read', async (req, res, next) => {
  try {
    await db
      .update(schema.notifications)
      .set({ isRead: true })
      .where(
        and(
          eq(schema.notifications.id, Number(req.params.id)),
          eq(schema.notifications.userId, req.user!.id),
        ),
      );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---------- تنبيهات الأسعار ----------
const alertSchema = z.object({
  productId: z.number().int(),
  targetPrice: z.number().positive().nullable().optional(),
});

pricesRouter.get('/alerts', async (req, res, next) => {
  try {
    const rows = await db
      .select({
        id: schema.priceAlerts.id,
        productId: schema.priceAlerts.productId,
        targetPrice: schema.priceAlerts.targetPrice,
        productName: schema.products.nameAr,
      })
      .from(schema.priceAlerts)
      .innerJoin(schema.products, eq(schema.priceAlerts.productId, schema.products.id))
      .where(eq(schema.priceAlerts.userId, req.user!.id));
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

pricesRouter.post('/alerts', async (req, res, next) => {
  try {
    const body = alertSchema.parse(req.body);
    const [row] = await db
      .insert(schema.priceAlerts)
      .values({
        userId: req.user!.id,
        productId: body.productId,
        targetPrice: body.targetPrice != null ? String(body.targetPrice) : null,
      })
      .onConflictDoUpdate({
        target: [schema.priceAlerts.userId, schema.priceAlerts.productId],
        set: { targetPrice: body.targetPrice != null ? String(body.targetPrice) : null },
      })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
});

pricesRouter.delete('/alerts/:id', async (req, res, next) => {
  try {
    await db
      .delete(schema.priceAlerts)
      .where(
        and(
          eq(schema.priceAlerts.id, Number(req.params.id)),
          eq(schema.priceAlerts.userId, req.user!.id),
        ),
      );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
