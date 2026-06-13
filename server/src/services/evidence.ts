// إثبات السعر (سبرنت v2 — جزء 2): كل سعر مستورد يحمل دليل أصله —
// صورة المنتج من نفس المصدر، أو صفحة المجلة، أو الفاتورة

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { desc, eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { logger } from '../logger.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const EVIDENCE_DIR = path.resolve(here, '../../storage/evidence');

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
};

/** حفظ صورة دليل بإزالة التكرار عبر هاش المحتوى؛ يعيد اسم الملف */
export function saveEvidenceImage(buffer: Buffer, ext: string): string {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 24);
  const name = `${hash}${ext}`;
  const full = path.join(EVIDENCE_DIR, name);
  if (!fs.existsSync(full)) fs.writeFileSync(full, buffer);
  return name;
}

// كاش لكل عملية تشغيل: لا نعيد تنزيل نفس الرابط في نفس الجولة
const downloadCache = new Map<string, string | null>();

/** تنزيل صورة منتج من مصدر المتجر إلى المخزن المحلي؛ فشل هادئ → null */
export async function downloadEvidenceImage(url: string): Promise<string | null> {
  if (downloadCache.has(url)) return downloadCache.get(url)!;
  let result: string | null = null;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: { 'User-Agent': 'WaffirBot/1.0 (+https://waffir.app/bot)' },
    });
    if (res.ok) {
      const mime = (res.headers.get('content-type') ?? '').split(';')[0]!.trim();
      const ext = EXT_BY_MIME[mime];
      if (ext) {
        const buffer = Buffer.from(await res.arrayBuffer());
        if (buffer.length > 0 && buffer.length < 8 * 1024 * 1024) {
          result = saveEvidenceImage(buffer, ext);
        }
      }
    }
  } catch (err) {
    logger.debug({ url, err: String(err) }, 'evidence image download failed');
  }
  downloadCache.set(url, result);
  return result;
}

export type EvidenceType = 'product_image' | 'page_screenshot' | 'flyer_crop' | 'receipt';

/**
 * تسجيل دليل لسعر. imagePath إما اسم ملف في مخزن الأدلة (يُخدم عبر
 * /api/evidence/img/:name) أو مسار عام جاهز يبدأ بـ "/" (مرفوعات المجلات/الفواتير).
 */
export async function addEvidence(input: {
  priceId: number;
  evidenceType: EvidenceType;
  imagePath?: string | null;
  sourceUrl?: string | null;
}) {
  await db.insert(schema.priceEvidence).values({
    priceId: input.priceId,
    evidenceType: input.evidenceType,
    imagePath: input.imagePath ?? null,
    sourceUrl: input.sourceUrl ?? null,
  });
}

/** عنوان عام لصورة دليل. روابط http(s) البعيدة (CDN المتجر) تُمرَّر كما هي —
 * فتظهر الصور دون تخزين محلي (مهم على استضافة بقرص مؤقت كـ Railway). */
export function publicEvidenceUrl(imagePath: string | null, thumb = false): string | null {
  if (!imagePath) return null;
  if (/^https?:\/\//i.test(imagePath)) return imagePath; // صورة المصدر البعيدة
  if (imagePath.startsWith('/')) return imagePath;
  return `/api/evidence/img/${imagePath}${thumb ? '?thumb=1' : ''}`;
}

export async function listEvidence(priceId: number) {
  const rows = await db
    .select()
    .from(schema.priceEvidence)
    .where(eq(schema.priceEvidence.priceId, priceId))
    .orderBy(desc(schema.priceEvidence.capturedAt));
  return rows.map((r) => ({
    id: r.id,
    evidenceType: r.evidenceType,
    imageUrl: publicEvidenceUrl(r.imagePath),
    thumbUrl: publicEvidenceUrl(r.imagePath, true),
    sourceUrl: r.sourceUrl,
    capturedAt: r.capturedAt,
  }));
}

/** مصغّر 200px (webp) يُولَّد عند أول طلب ويُخزَّن بجانب الأصل */
export async function thumbnailPath(name: string): Promise<string> {
  const safe = path.basename(name);
  const full = path.join(EVIDENCE_DIR, safe);
  if (!fs.existsSync(full)) throw Object.assign(new Error('not found'), { status: 404 });
  const thumb = path.join(EVIDENCE_DIR, `${safe}.thumb.webp`);
  if (!fs.existsSync(thumb)) {
    const { default: sharp } = await import('sharp');
    await sharp(full).resize(200, 200, { fit: 'inside' }).webp({ quality: 80 }).toFile(thumb);
  }
  return thumb;
}

export function originalPath(name: string): string {
  const safe = path.basename(name);
  const full = path.join(EVIDENCE_DIR, safe);
  if (!fs.existsSync(full)) throw Object.assign(new Error('not found'), { status: 404 });
  return full;
}
