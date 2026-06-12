import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Scissors, ShoppingCart, Store, X } from 'lucide-react';
import { api } from '../api';
import type { ListDetail } from '../types';
import { priceLabel } from '../lib/format';
import { Button, PageTitle, SkeletonRows } from '../components/ui';
import { cacheList } from '../lib/offline';

export default function ListPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [list, setList] = useState<ListDetail | null>(null);

  const load = useCallback(() => {
    api
      .list(Number(id))
      .then((l) => {
        setList(l);
        void cacheList(l); // نسخة محلية لوضع التسوق دون اتصال
      })
      .catch(() => undefined);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const groups = useMemo(() => {
    if (!list) return [];
    const byStore = new Map<string, typeof list.items>();
    for (const item of list.items) {
      const key = item.storeName ?? 'غير محدد';
      byStore.set(key, [...(byStore.get(key) ?? []), item]);
    }
    return [...byStore.entries()];
  }, [list]);

  if (!list) {
    return (
      <div className="pt-4">
        <SkeletonRows count={6} height={56} />
      </div>
    );
  }

  const expectedTotal = list.items.reduce(
    (s, i) => s + (i.expectedPrice ? Number(i.expectedPrice) * Number(i.quantity) : 0),
    0,
  );

  const startShopping = async () => {
    if (list.status === 'draft') await api.setListStatus(list.id, 'active');
    navigate(`/shopping/${list.id}`);
  };

  const removeItem = async (itemId: number) => {
    await api.removeListItem(list.id, itemId);
    load();
  };

  return (
    <div className="pb-6">
      <PageTitle>{list.title}</PageTitle>

      {list.optimization?.bestSingleStore && (
        <div data-testid="optimization-summary" className="card mx-4 mb-3 p-4">
          <p className="flex items-center gap-2 text-sm text-ink">
            <Store size={16} strokeWidth={1.8} className="shrink-0 text-ink-2" />
            <span>
              كل شيء من <b>{list.optimization.bestSingleStore.nameAr}</b>:{' '}
              <span className="price-mono font-semibold">
                {priceLabel(list.optimization.bestSingleStore.total)}
              </span>
            </span>
          </p>
          {list.optimization.optimalSplit && list.optimization.optimalSplit.savings > 0 && (
            <p className="mt-2 flex items-center gap-2 text-sm font-medium text-primary-dark">
              <Scissors size={16} strokeWidth={1.8} className="shrink-0" />
              <span>
                التقسيم الأمثل بين {list.optimization.optimalSplit.stores.length} متاجر:{' '}
                <span className="price-mono font-semibold">
                  {priceLabel(list.optimization.optimalSplit.total)}
                </span>{' '}
                (توفير {priceLabel(list.optimization.optimalSplit.savings)})
              </span>
            </p>
          )}
        </div>
      )}

      {groups.map(([store, items]) => (
        <section key={store} className="mb-3 px-4">
          <h2 className="t-caption mb-1.5 font-bold">{store}</h2>
          <div className="flex flex-col gap-1.5">
            {items.map((item) => (
              <div key={item.id} data-testid="list-item" className="card flex items-center px-3 py-2.5">
                <div className="flex-1">
                  <p className={`text-sm ${item.isPurchased ? 'text-gray-400 line-through' : 'text-ink'}`}>
                    {item.productName}
                  </p>
                  <p className="t-caption">
                    {Number(item.quantity)} × {priceLabel(item.expectedPrice)}
                    {item.branchName ? ` — ${item.branchName}` : ''}
                  </p>
                </div>
                {list.status !== 'completed' && (
                  <button
                    onClick={() => void removeItem(item.id)}
                    aria-label="حذف"
                    className="flex h-11 w-11 items-center justify-center text-gray-300 active:text-red-400"
                  >
                    <X size={18} strokeWidth={2} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}

      <div className="mx-4 mt-2 flex items-center justify-between rounded-(--radius-card) bg-gray-500/5 px-4 py-3">
        <span className="text-sm text-ink-2">الإجمالي المتوقع</span>
        <span className="price-mono font-semibold text-ink">{priceLabel(expectedTotal)}</span>
      </div>

      {list.status !== 'completed' && list.items.length > 0 && (
        <div className="px-4 pt-4">
          <Button onClick={startShopping} testId="start-shopping" full>
            <ShoppingCart size={18} strokeWidth={2} /> ابدأ التسوق
          </Button>
        </div>
      )}
    </div>
  );
}
