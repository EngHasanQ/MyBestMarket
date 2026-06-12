import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import type { ListDetail } from '../types';
import { priceLabel } from '../lib/format';
import { Button, PageTitle, Spinner } from '../components/ui';
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

  if (!list) return <Spinner />;

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
        <div data-testid="optimization-summary" className="mx-4 mb-3 rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-700">
            🏪 شراء كل شيء من <b>{list.optimization.bestSingleStore.nameAr}</b>:{' '}
            <span className="price-mono font-bold">{priceLabel(list.optimization.bestSingleStore.total)}</span>
          </p>
          {list.optimization.optimalSplit && list.optimization.optimalSplit.savings > 0 && (
            <p className="mt-2 text-sm font-medium text-primary">
              ✂️ التقسيم الأمثل بين {list.optimization.optimalSplit.stores.length} متاجر:{' '}
              <span className="price-mono font-bold">{priceLabel(list.optimization.optimalSplit.total)}</span>{' '}
              (توفير {priceLabel(list.optimization.optimalSplit.savings)})
            </p>
          )}
        </div>
      )}

      {groups.map(([store, items]) => (
        <section key={store} className="mb-3 px-4">
          <h2 className="mb-1.5 text-sm font-bold text-gray-500">{store}</h2>
          <div className="flex flex-col gap-1.5">
            {items.map((item) => (
              <div
                key={item.id}
                data-testid="list-item"
                className="flex items-center justify-between rounded-xl border border-gray-100 bg-white px-3 py-2.5"
              >
                <div className="flex-1">
                  <p className={`text-sm ${item.isPurchased ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                    {item.productName}
                  </p>
                  <p className="text-[11px] text-gray-400">
                    {Number(item.quantity)} × {priceLabel(item.expectedPrice)}
                    {item.branchName ? ` — ${item.branchName}` : ''}
                  </p>
                </div>
                {list.status !== 'completed' && (
                  <button onClick={() => removeItem(item.id)} className="px-2 text-gray-300">
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}

      <div className="mx-4 mt-2 flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-3">
        <span className="text-sm text-gray-500">الإجمالي المتوقع</span>
        <span className="price-mono font-bold text-gray-900">{priceLabel(expectedTotal)}</span>
      </div>

      {list.status !== 'completed' && list.items.length > 0 && (
        <div className="px-4 pt-4">
          <Button onClick={startShopping} testId="start-shopping" full>
            🛒 ابدأ التسوق
          </Button>
        </div>
      )}
    </div>
  );
}
