// لوحة سفلية لإثبات السعر (جزء 2.2): صورة الدليل + المتجر + تاريخ الالتقاط
// + رابط المصدر؛ وإن لا دليل → "سعر مُدخل يدوياً"

import { useEffect, useState } from 'react';
import { ExternalLink, FileSearch, X } from 'lucide-react';
import { api } from '../api';
import type { Comparison, PriceEvidence } from '../types';
import { relativeTime } from '../lib/format';
import { FreshnessBadge } from './PriceBadges';
import { Spinner } from './ui';

export function EvidenceSheet({
  comparison,
  onClose,
}: {
  comparison: Comparison;
  onClose: () => void;
}) {
  const [evidence, setEvidence] = useState<PriceEvidence[] | null>(null);
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    api
      .priceEvidence(comparison.priceId)
      .then(setEvidence)
      .catch(() => setEvidence([]));
  }, [comparison.priceId]);

  const first = evidence?.[0] ?? null;
  const imageUrl = first?.imageUrl ?? comparison.proofImageUrl;
  const sourceUrl = first?.sourceUrl ?? comparison.sourceUrl;

  const typeLabel: Record<string, string> = {
    product_image: 'صورة المنتج من موقع المتجر',
    page_screenshot: 'لقطة من صفحة المتجر',
    flyer_crop: 'من مجلة العروض',
    receipt: 'من فاتورة موثقة',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog">
      <button aria-label="إغلاق" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        data-testid="evidence-sheet"
        className="relative z-10 max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-surface p-4 pb-[max(env(safe-area-inset-bottom),16px)]"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="t-section text-ink">إثبات السعر</h2>
          <button
            onClick={onClose}
            aria-label="إغلاق"
            className="flex h-11 w-11 items-center justify-center rounded-full text-ink-2 active:bg-gray-100"
          >
            <X size={22} strokeWidth={1.8} />
          </button>
        </div>

        {evidence === null ? (
          <Spinner />
        ) : (
          <>
            {imageUrl ? (
              <button
                className={`block w-full overflow-hidden rounded-2xl border border-black/5 bg-cream ${
                  zoomed ? '' : 'max-h-72'
                }`}
                onClick={() => setZoomed((z) => !z)}
              >
                <img
                  src={imageUrl}
                  alt="دليل السعر"
                  className={`w-full object-contain ${zoomed ? '' : 'max-h-72'}`}
                />
              </button>
            ) : (
              <div className="flex flex-col items-center gap-2 rounded-2xl bg-cream py-10 text-ink-2">
                <FileSearch size={32} strokeWidth={1.6} />
                <p className="text-sm">لا يوجد إثبات مرفق — سعر مُدخل يدوياً</p>
              </div>
            )}

            <div className="mt-4 flex flex-col gap-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-ink-2">المتجر</span>
                <span className="font-bold text-ink">
                  {comparison.branch?.storeName} — {comparison.branch?.nameAr}
                </span>
              </div>
              {first && (
                <div className="flex items-center justify-between">
                  <span className="text-ink-2">نوع الدليل</span>
                  <span className="text-ink">{typeLabel[first.evidenceType]}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-ink-2">التُقط</span>
                <span className="text-ink">
                  {relativeTime(first?.capturedAt ?? comparison.offerEndsAt ?? '') || '—'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-2">الموثوقية</span>
                <FreshnessBadge
                  label={comparison.freshnessLabel}
                  confidence={comparison.confidence}
                  stale={comparison.stale}
                />
              </div>
            </div>

            {sourceUrl && (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="evidence-source-link"
                className="mt-4 flex min-h-11 items-center justify-center gap-2 rounded-(--radius-btn) border border-primary text-sm font-bold text-primary active:bg-primary-light"
              >
                فتح المصدر
                <ExternalLink size={16} strokeWidth={2} />
              </a>
            )}
          </>
        )}
      </div>
    </div>
  );
}
