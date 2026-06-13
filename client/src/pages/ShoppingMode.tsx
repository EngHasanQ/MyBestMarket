// وضع التسوق داخل المتجر — يعمل دون اتصال عبر طابور IndexedDB (القسم 5-C)

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Camera, Check, PartyPopper, Store } from 'lucide-react';
import { api } from '../api';
import type { FinishResult, ListDetail, ListItem } from '../types';
import { priceLabel } from '../lib/format';
import { Spinner } from '../components/ui';
import { cacheList, enqueue, getCachedList, setupOnlineFlush } from '../lib/offline';

export default function ShoppingMode() {
  const { id } = useParams();
  const listId = Number(id);
  const navigate = useNavigate();
  const [list, setList] = useState<ListDetail | null>(null);
  const [offline, setOffline] = useState(!navigator.onLine);
  const [priceDrafts, setPriceDrafts] = useState<Record<number, string>>({});
  const [summary, setSummary] = useState<FinishResult | null>(null);

  // تحميل: من الخادم وإلا فمن النسخة المحلية
  useEffect(() => {
    let cancelled = false;
    api
      .list(listId)
      .then((l) => {
        if (cancelled) return;
        setList(l);
        void cacheList(l);
      })
      .catch(async () => {
        const cached = await getCachedList(listId);
        if (!cancelled && cached) setList(cached);
      });
    return () => {
      cancelled = true;
    };
  }, [listId]);

  // مراقبة الاتصال + تفريغ الطابور عند العودة
  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    const cleanup = setupOnlineFlush();
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      cleanup();
    };
  }, []);

  const updateLocal = useCallback(
    (itemId: number, patch: Partial<ListItem>) => {
      setList((prev) => {
        if (!prev) return prev;
        const next = {
          ...prev,
          items: prev.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)),
        };
        void cacheList(next);
        return next;
      });
    },
    [],
  );

  /** تفاؤلي: حدّث محلياً، حاول الإرسال، وإلا صفّ في الطابور */
  const check = async (item: ListItem, isPurchased: boolean, actualPrice?: number) => {
    updateLocal(item.id, {
      isPurchased,
      actualPrice: actualPrice != null ? String(actualPrice) : item.actualPrice,
    });
    const body = { isPurchased, ...(actualPrice != null ? { actualPrice } : {}) };
    try {
      if (!navigator.onLine) throw new Error('offline');
      await api.checkItem(listId, item.id, body);
    } catch {
      await enqueue({ kind: 'check', listId, itemId: item.id, body, queuedAt: Date.now() });
      setOffline(!navigator.onLine);
    }
  };

  const submitPrice = (item: ListItem) => {
    const raw = priceDrafts[item.id];
    const price = raw ? Number(raw) : undefined;
    if (price != null && (!Number.isFinite(price) || price <= 0)) return;
    void check(item, true, price);
    setPriceDrafts((d) => ({ ...d, [item.id]: '' }));
  };

  const groups = useMemo(() => {
    if (!list) return [];
    const byCat = new Map<string, ListItem[]>();
    for (const item of list.items) {
      const key = item.storeName ?? 'أخرى';
      byCat.set(key, [...(byCat.get(key) ?? []), item]);
    }
    return [...byCat.entries()];
  }, [list]);

  if (!list) return <Spinner />;

  const purchased = list.items.filter((i) => i.isPurchased);
  const expectedTotal = purchased.reduce(
    (s, i) => s + (i.expectedPrice ? Number(i.expectedPrice) * Number(i.quantity) : 0),
    0,
  );
  const actualTotal = purchased.reduce(
    (s, i) =>
      s + Number(i.actualPrice ?? i.expectedPrice ?? 0) * Number(i.quantity),
    0,
  );

  const finish = async () => {
    try {
      if (!navigator.onLine) throw new Error('offline');
      setSummary(await api.finishList(listId));
    } catch {
      await enqueue({ kind: 'finish', listId, queuedAt: Date.now() });
      // ملخص محلي — سيُزامن الإنهاء لاحقاً
      setSummary({
        purchasedCount: purchased.length,
        skippedCount: list.items.length - purchased.length,
        expectedTotal: Math.round(expectedTotal * 100) / 100,
        actualTotal: Math.round(actualTotal * 100) / 100,
        savings: Math.round((expectedTotal - actualTotal) * 100) / 100,
      });
    }
  };

  if (summary) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
        <div data-testid="savings-summary" className="card w-full rounded-3xl p-6">
          <div className="flex justify-center text-primary">
            <PartyPopper size={48} strokeWidth={1.4} />
          </div>
          <h1 className="mt-3 text-xl font-extrabold text-gray-900">اكتمل التسوق!</h1>
          <p className="mt-1 text-sm text-gray-500">
            اشتريت {summary.purchasedCount} منتجاً
            {summary.skippedCount > 0 ? ` وتخطيت ${summary.skippedCount}` : ''}
          </p>
          <div className="mt-5 flex flex-col gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">المتوقع</span>
              <span className="price-mono">{priceLabel(summary.expectedTotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">الفعلي</span>
              <span className="price-mono">{priceLabel(summary.actualTotal)}</span>
            </div>
            <div
              className={`flex justify-between rounded-xl p-3 font-bold ${
                summary.savings >= 0 ? 'bg-primary-light text-primary' : 'bg-amber-light text-amber'
              }`}
            >
              <span>{summary.savings >= 0 ? 'وفّرت' : 'زيادة عن المتوقع'}</span>
              <span className="price-mono">{priceLabel(Math.abs(summary.savings))}</span>
            </div>
          </div>
          <button
            onClick={() => navigate('/lists')}
            className="btn-primary mt-6 w-full rounded-xl py-3 font-bold"
          >
            العودة لقوائمي
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-md pb-36">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/8 bg-nav px-4 py-3 text-ink">
        <Link to={`/list/${listId}`} className="flex min-h-11 items-center gap-1 text-sm text-primary">
          <ArrowRight size={16} strokeWidth={2} /> خروج
        </Link>
        <h1 className="font-bold">وضع التسوق</h1>
        <span className="text-sm text-ink-2">
          {purchased.length}/{list.items.length}
        </span>
      </header>

      {offline && (
        <div
          data-testid="offline-pill"
          className="mx-4 mt-3 rounded-full bg-amber-light px-3 py-1.5 text-center text-xs font-bold text-amber"
        >
          غير متصل — سيُزامن لاحقاً
        </div>
      )}

      {groups.map(([group, items]) => (
        <section key={group} className="px-4 pt-4">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-gray-500">
            <Store size={15} strokeWidth={1.8} /> {group}
          </h2>
          <div className="flex flex-col gap-2">
            {items.map((item) => (
              <div
                key={item.id}
                data-testid="shopping-item"
                className={`rounded-2xl border p-3 transition-colors ${
                  item.isPurchased ? 'border-primary/40 bg-primary-light/40' : 'border-white/8 bg-card'
                }`}
              >
                <button
                  onClick={() => void check(item, !item.isPurchased)}
                  className="flex w-full items-center gap-3 text-right"
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-sm ${
                      item.isPurchased ? 'border-primary bg-primary text-app' : 'border-gray-300'
                    }`}
                  >
                    {item.isPurchased ? <Check size={15} strokeWidth={3} /> : ''}
                  </span>
                  <span className="flex-1">
                    <span
                      className={`block text-[15px] leading-5 ${
                        item.isPurchased ? 'text-gray-400 line-through' : 'font-medium text-gray-900'
                      }`}
                    >
                      {item.productName}
                    </span>
                    <span className="text-[11px] text-gray-400">
                      {Number(item.quantity)} × {priceLabel(item.actualPrice ?? item.expectedPrice)}
                    </span>
                  </span>
                </button>
                <div className="mt-2 flex items-center gap-2 pr-10">
                  <input
                    data-testid="actual-price-input"
                    type="number"
                    inputMode="decimal"
                    step="0.05"
                    min="0"
                    placeholder="السعر الفعلي"
                    value={priceDrafts[item.id] ?? ''}
                    onChange={(e) => setPriceDrafts((d) => ({ ...d, [item.id]: e.target.value }))}
                    onKeyDown={(e) => e.key === 'Enter' && submitPrice(item)}
                    className="price-mono w-28 rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
                  />
                  <button
                    onClick={() => submitPrice(item)}
                    className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-bold text-gray-600"
                  >
                    سجّل
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      <div className="px-4 pt-5">
        <Link
          to={`/receipt/${list.items.find((i) => i.chosenBranchId)?.chosenBranchId ?? ''}`}
          className="flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-primary/40 p-3 text-center text-sm font-bold text-primary"
        >
          <Camera size={18} strokeWidth={1.8} />
          صوّر الفاتورة — وثّق كل الأسعار دفعة واحدة
        </Link>
      </div>

      <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-white/8 bg-nav pb-[env(safe-area-inset-bottom)]">
        <div data-testid="running-total" className="mx-auto flex max-w-md items-center justify-between px-4 py-3">
          <div className="text-xs text-gray-500">
            <p>
              متوقع: <span className="price-mono">{priceLabel(expectedTotal)}</span>
            </p>
            <p>
              فعلي: <span className="price-mono font-bold text-gray-900">{priceLabel(actualTotal)}</span>
            </p>
          </div>
          <button
            data-testid="finish-shopping"
            onClick={finish}
            className="btn-primary rounded-xl px-5 py-3 font-bold"
          >
            إنهاء التسوق
          </button>
        </div>
      </footer>
    </div>
  );
}
