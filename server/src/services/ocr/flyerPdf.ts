// معالجة مجلة عروض PDF متعددة الصفحات من طرف لطرف (A2):
//  1) تحويل كل صفحة إلى صورة (pdftoppm)
//  2) OCR لكل صفحة مع صناديق إحاطة الكلمات (tesseract ara+eng)
//  3) تجميع الكلمات في أسطر (RTL) واستخراج مرشّحي (منتج، سعر)
//  4) قصّ منطقة كل عنصر من صورة الصفحة (sharp) وحفظها دليلاً (flyer_crop)
//
// المسار الحقيقي للمجلات المصوّرة التي يرفعها الأدمن. المجلات ذات الطبقة
// النصية تعمل أيضاً (OCR على الصورة المُصيَّرة موثوق للعربية بترتيبها المنطقي).

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseFlyerLine, type FlyerCandidate } from './flyerParser.js';
import { saveEvidenceImage } from '../evidence.js';
import { logger } from '../../logger.js';

const execFileAsync = promisify(execFile);

interface Word {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface FlyerPdfCandidate extends FlyerCandidate {
  pageIndex: number; // 1-based
  cropImageName: string | null; // اسم ملف القصاصة في مخزن الأدلة
}

export interface FlyerPdfResult {
  pageCount: number;
  candidates: FlyerPdfCandidate[];
  coverText: string; // نص الصفحة الأولى — لاستخراج صلاحية العروض
}

const DPI = 200;

/** عدد صفحات الـPDF عبر pdfinfo (إن توفّر) — وإلا نعدّ صور pdftoppm */
async function pdfPageCount(pdfPath: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync('pdfinfo', [pdfPath]);
    const m = stdout.match(/Pages:\s+(\d+)/);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

/** يحوّل كل صفحات الـPDF إلى PNG في مجلد مؤقت ويعيد مساراتها بالترتيب */
async function rasterize(pdfPath: string, outDir: string): Promise<string[]> {
  await execFileAsync('pdftoppm', ['-png', '-r', String(DPI), pdfPath, path.join(outDir, 'page')], {
    maxBuffer: 64 * 1024 * 1024,
  });
  return fs
    .readdirSync(outDir)
    .filter((f) => f.startsWith('page') && f.endsWith('.png'))
    .sort()
    .map((f) => path.join(outDir, f));
}

/** OCR صفحة واحدة → كلمات بصناديق إحاطة بالبكسل */
async function ocrWords(imagePath: string): Promise<Word[]> {
  const { createWorker } = await import('tesseract.js');
  const worker = await getWorker(createWorker);
  const { data } = await worker.recognize(imagePath);
  const words = (data.words ?? []) as Array<{ text?: string; bbox?: { x0: number; y0: number; x1: number; y1: number } }>;
  return words
    .filter((w) => w.text && w.text.trim() && w.bbox)
    .map((w) => ({ text: w.text!.trim(), x0: w.bbox!.x0, y0: w.bbox!.y0, x1: w.bbox!.x1, y1: w.bbox!.y1 }));
}

// عامل OCR مُعاد الاستخدام عبر الصفحات (تهيئته مكلفة)
let sharedWorker: Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>> | null = null;
async function getWorker(createWorker: (typeof import('tesseract.js'))['createWorker']) {
  if (!sharedWorker) sharedWorker = await createWorker(['ara', 'eng']);
  return sharedWorker;
}

/** يجمع الكلمات في أسطر حسب المركز الرأسي، ويرتّب كل سطر من اليمين لليسار */
function groupLines(words: Word[]): Array<{ text: string; box: [number, number, number, number] }> {
  const sorted = [...words].sort((a, b) => (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2);
  const lines: Array<{ cy: number; h: number; words: Word[] }> = [];
  for (const w of sorted) {
    const cy = (w.y0 + w.y1) / 2;
    const h = w.y1 - w.y0;
    let line = lines.find((l) => Math.abs(l.cy - cy) < Math.max(h, l.h) * 0.6);
    if (!line) {
      line = { cy, h, words: [] };
      lines.push(line);
    }
    line.words.push(w);
    line.cy = (line.cy * (line.words.length - 1) + cy) / line.words.length;
  }
  return lines.map((l) => {
    l.words.sort((a, b) => b.x0 - a.x0); // RTL: الأيمن أولاً → الاسم ثم السعر (الأيسر)
    const xs = l.words.flatMap((w) => [w.x0, w.x1]);
    const ys = l.words.flatMap((w) => [w.y0, w.y1]);
    return {
      text: l.words.map((w) => w.text).join(' '),
      box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] as [number, number, number, number],
    };
  });
}

/** قصّ منطقة سطر العنصر من صورة الصفحة وحفظها دليلاً؛ يعيد اسم الملف */
async function cropLine(
  pageImage: string,
  box: [number, number, number, number],
): Promise<string | null> {
  try {
    const { default: sharp } = await import('sharp');
    const meta = await sharp(pageImage).metadata();
    const pad = 12;
    const left = Math.max(0, Math.round(box[0]) - pad);
    const top = Math.max(0, Math.round(box[1]) - pad);
    const width = Math.min((meta.width ?? 0) - left, Math.round(box[2] - box[0]) + pad * 2);
    const height = Math.min((meta.height ?? 0) - top, Math.round(box[3] - box[1]) + pad * 2);
    if (width < 8 || height < 8) return null;
    const buf = await sharp(pageImage)
      .extract({ left, top, width, height })
      .png()
      .toBuffer();
    return saveEvidenceImage(buf, '.png');
  } catch (err) {
    logger.debug({ err: String(err) }, 'flyer crop failed');
    return null;
  }
}

/**
 * يعالج مجلة PDF كاملة. onProgress يُستدعى بعد كل صفحة لتحديث مؤشر التقدّم.
 */
export async function processFlyerPdf(
  pdfBuffer: Buffer,
  onProgress?: (processed: number, total: number, candidates: number) => void | Promise<void>,
): Promise<FlyerPdfResult> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'flyer-'));
  const pdfPath = path.join(tmp, `${crypto.randomBytes(6).toString('hex')}.pdf`);
  fs.writeFileSync(pdfPath, pdfBuffer);
  try {
    const declared = await pdfPageCount(pdfPath);
    const pages = await rasterize(pdfPath, tmp);
    const total = declared ?? pages.length;
    const candidates: FlyerPdfCandidate[] = [];
    let coverText = '';

    for (let i = 0; i < pages.length; i++) {
      const pageImage = pages[i]!;
      const words = await ocrWords(pageImage);
      const lines = groupLines(words);
      if (i === 0) coverText = lines.map((l) => l.text).join('\n');
      for (const line of lines) {
        const parsed = parseFlyerLine(line.text);
        if (!parsed) continue;
        const cropImageName = await cropLine(pageImage, line.box);
        candidates.push({ ...parsed, pageIndex: i + 1, cropImageName });
      }
      if (onProgress) await onProgress(i + 1, total, candidates.length);
    }
    return { pageCount: total, candidates, coverText };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

export async function shutdownFlyerOcr() {
  if (sharedWorker) {
    await sharedWorker.terminate();
    sharedWorker = null;
  }
}
