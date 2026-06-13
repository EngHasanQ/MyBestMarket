// معالجة مجلة عروض PDF متعددة الصفحات من طرف لطرف (A2):
//  1) تحويل كل صفحة إلى صورة (pdftoppm)
//  2) OCR لكل صفحة مع صناديق إحاطة الكلمات وتجميعها أسطراً (imageLines)
//  3) استخراج مرشّحي (منتج، سعر) لكل سطر
//  4) قصّ منطقة كل عنصر من صورة الصفحة وحفظها دليلاً (flyer_crop)

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseFlyerLine, type FlyerCandidate } from './flyerParser.js';
import { ocrImageLines, cropImageRegion } from './imageLines.js';

const execFileAsync = promisify(execFile);

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

async function pdfPageCount(pdfPath: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync('pdfinfo', [pdfPath]);
    const m = stdout.match(/Pages:\s+(\d+)/);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

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
      const lines = await ocrImageLines(pageImage);
      if (i === 0) coverText = lines.map((l) => l.text).join('\n');
      for (const line of lines) {
        const parsed = parseFlyerLine(line.text);
        if (!parsed) continue;
        const cropImageName = await cropImageRegion(pageImage, line.box, 12);
        candidates.push({ ...parsed, pageIndex: i + 1, cropImageName });
      }
      if (onProgress) await onProgress(i + 1, total, candidates.length);
    }
    return { pageCount: total, candidates, coverText };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

export { shutdownImageOcr as shutdownFlyerOcr } from './imageLines.js';
