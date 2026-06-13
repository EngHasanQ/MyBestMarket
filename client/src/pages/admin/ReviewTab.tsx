// قائمة المراجعة: اعتماد/تعديل/رفض مستخرجات OCR — ضمان دقة الـ99% (القسم 2.2)

import { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { api } from '../../api';
import type { ReviewItem } from '../../types';
import { priceLabel } from '../../lib/format';
import { EmptyState, Spinner, inputClass } from '../../components/ui';

export function ReviewTab() {
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [edits, setEdits] = useState<Record<number, { price?: string }>>({});

  const load = () => api.admin.reviewQueue().then(setItems).catch(() => setItems([]));
  useEffect(() => {
    void load();
  }, []);

  const act = async (item: ReviewItem, action: 'approve' | 'reject') => {
    if (action === 'approve') {
      const priceEdit = edits[item.id]?.price;
      await api.admin.approveReview(item.id, {
        ...(priceEdit ? { price: Number(priceEdit) } : {}),
      });
    } else {
      await api.admin.rejectReview(item.id);
    }
    setItems((prev) => prev?.filter((x) => x.id !== item.id) ?? null);
  };

  if (!items) return <Spinner />;
  if (items.length === 0) return <EmptyState icon={CheckCircle2} text="قائمة المراجعة فارغة — أحسنت" />;

  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => (
        <div key={item.id} data-testid="review-row" className="rounded-2xl bg-card p-4 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  item.kind === 'anomaly' ? 'bg-red-50 text-red-600' : 'bg-amber-light text-amber'
                }`}
              >
                {item.kind === 'anomaly' ? 'سعر شاذ' : 'مجلة عروض'}
              </span>
              <p className="mt-1.5 text-sm text-gray-900">{item.rawText}</p>
              <p className="mt-0.5 text-[11px] text-gray-400">
                {item.branchName}
                {item.matchedProductName ? ` ← ${item.matchedProductName}` : ' — لا مطابقة'}
              </p>
            </div>
            <span className="price-mono shrink-0 font-bold text-gray-900">
              {priceLabel(item.parsedPrice)}
            </span>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <input
              type="number"
              step="0.05"
              placeholder="تصحيح السعر"
              className={`${inputClass} price-mono w-32`}
              value={edits[item.id]?.price ?? ''}
              onChange={(e) => setEdits((d) => ({ ...d, [item.id]: { price: e.target.value } }))}
            />
            <button
              data-testid="approve-review"
              onClick={() => void act(item, 'approve')}
              disabled={!item.matchedProductId}
              className="btn-primary rounded-xl px-4 py-2 text-sm font-bold"
            >
              اعتماد
            </button>
            <button
              data-testid="reject-review"
              onClick={() => void act(item, 'reject')}
              className="rounded-xl border border-red-200 px-4 py-2 text-sm font-bold text-red-600"
            >
              رفض
            </button>
          </div>
          {!item.matchedProductId && (
            <p className="mt-2 text-[11px] text-amber">لا منتج مطابق — أضف المنتج أولاً من تبويب الإدارة ثم سيُطابق تلقائياً</p>
          )}
        </div>
      ))}
    </div>
  );
}
