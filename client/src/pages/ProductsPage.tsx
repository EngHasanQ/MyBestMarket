import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import type { Category, Product } from '../types';
import { ProductCard } from '../components/ProductCard';
import { EmptyState, PageTitle, Spinner } from '../components/ui';

export default function ProductsPage() {
  const { user } = useAuth();
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const categoryId = id ? Number(id) : undefined;
  const [products, setProducts] = useState<Product[] | null>(null);
  const [category, setCategory] = useState<Category | null>(null);
  const [input, setInput] = useState(q);

  useEffect(() => {
    if (!user?.cityId) return;
    setProducts(null);
    api
      .products({ cityId: user.cityId, categoryId, q: q || undefined, limit: 60 })
      .then(setProducts)
      .catch(() => setProducts([]));
  }, [user?.cityId, categoryId, q]);

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

  return (
    <div>
      <PageTitle>{categoryId ? (category?.nameAr ?? '...') : 'البحث'}</PageTitle>

      {!categoryId && (
        <form
          className="px-4 pb-3"
          onSubmit={(e) => {
            e.preventDefault();
            setParams(input.trim() ? { q: input.trim() } : {});
          }}
        >
          <input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="ابحث عن منتج…"
            className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm focus:border-primary focus:outline-none"
          />
        </form>
      )}

      {category && category.children.length > 0 && (
        <div className="flex gap-2 overflow-x-auto px-4 pb-3">
          {category.children.map((ch) => (
            <a
              key={ch.id}
              href={`/category/${ch.id}`}
              className="whitespace-nowrap rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700"
            >
              {ch.nameAr}
            </a>
          ))}
        </div>
      )}

      {!products ? (
        <Spinner />
      ) : products.length === 0 ? (
        <EmptyState icon="🔍" text={q ? `لا نتائج لـ "${q}"` : 'لا منتجات في هذا القسم بعد'} />
      ) : (
        <div className="grid grid-cols-2 gap-3 px-4 pb-4">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </div>
  );
}
