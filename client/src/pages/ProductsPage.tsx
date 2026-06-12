import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { PackageSearch, Search } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import type { Category, Product } from '../types';
import { ProductCard } from '../components/ProductCard';
import { Button, EmptyState, PageTitle, SkeletonGrid, useToast } from '../components/ui';
import { usePullToRefresh } from '../lib/usePullToRefresh';

export default function ProductsPage() {
  const { user } = useAuth();
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const categoryId = id ? Number(id) : undefined;
  const [products, setProducts] = useState<Product[] | null>(null);
  const [category, setCategory] = useState<Category | null>(null);
  const [input, setInput] = useState(q);
  const [requested, setRequested] = useState(false);
  const toast = useToast();

  const load = useCallback(async () => {
    if (!user?.cityId) return;
    try {
      setProducts(
        await api.products({ cityId: user.cityId, categoryId, q: q || undefined, limit: 60 }),
      );
    } catch {
      setProducts([]);
    }
  }, [user?.cityId, categoryId, q]);

  useEffect(() => {
    setProducts(null);
    setRequested(false);
    void load();
  }, [load]);

  usePullToRefresh(load);

  useEffect(() => {
    if (!categoryId) return;
    api
      .categories()
      .then((cats) => {
        const main = cats.find((c) => c.id === categoryId);
        if (main) return setCategory(main);
        const parent = cats.find((c) => c.children.some((ch) => ch.id === categoryId));
        const child = parent?.children.find((ch) => ch.id === categoryId);
        if (child) setCategory({ ...child, children: [] });
      })
      .catch(() => undefined);
  }, [categoryId]);

  const requestProduct = async () => {
    await api.requestProduct(q);
    setRequested(true);
    toast.show('أُرسل طلبك — سنضيف المنتج قريباً');
  };

  return (
    <div>
      <PageTitle>{categoryId ? (category?.nameAr ?? '...') : 'البحث'}</PageTitle>

      {!categoryId && (
        // شريط بحث لاصق عند التمرير (3.4)
        <form
          className="sticky top-0 z-30 bg-cream px-4 pb-3 pt-1"
          onSubmit={(e) => {
            e.preventDefault();
            setParams(input.trim() ? { q: input.trim() } : {});
          }}
        >
          <div className="relative">
            <input
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="ابحث عن منتج أو علامة…"
              className="h-12 w-full rounded-2xl border border-gray-200 bg-surface pe-4 ps-11 text-sm focus:border-primary focus:outline-none"
            />
            <Search
              size={20}
              strokeWidth={1.8}
              className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-gray-400"
            />
          </div>
        </form>
      )}

      {category && category.children.length > 0 && (
        <div className="flex gap-2 overflow-x-auto px-4 pb-3">
          {category.children.map((ch) => (
            <Link
              key={ch.id}
              to={`/category/${ch.id}`}
              className="flex min-h-9 items-center whitespace-nowrap rounded-full border border-gray-200 bg-surface px-3.5 text-xs text-ink"
            >
              {ch.nameAr}
            </Link>
          ))}
        </div>
      )}

      {!products ? (
        <SkeletonGrid />
      ) : products.length === 0 ? (
        <EmptyState
          icon={PackageSearch}
          text={q ? `لا نتائج لـ "${q}"` : 'لا منتجات في هذا القسم بعد'}
          action={
            q && !requested ? (
              <Button onClick={requestProduct} variant="outline" testId="request-product">
                اطلب إضافة هذا المنتج
              </Button>
            ) : requested ? (
              <p className="text-sm font-bold text-primary">وصلنا طلبك</p>
            ) : undefined
          }
        />
      ) : (
        // تقسيم دقيق: المنتجات مجمعة حسب تصنيفها الفرعي
        <div className="flex flex-col gap-4 px-4 pb-4">
          {groupByCategory(products).map(([group, items]) => (
            <section key={group}>
              <h2 className="t-section mb-2 text-ink-2">
                {group} <span className="t-caption">({items.length})</span>
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {items.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function groupByCategory(products: Product[]): Array<[string, Product[]]> {
  const groups = new Map<string, Product[]>();
  for (const p of products) {
    const key = p.categoryName ?? 'أخرى';
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  return [...groups.entries()];
}
