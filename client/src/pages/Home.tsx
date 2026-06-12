import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import type { Category, ShoppingList } from '../types';
import { Spinner } from '../components/ui';

export default function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [draft, setDraft] = useState<ShoppingList | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    api.categories().then(setCategories).catch(() => setCategories([]));
    api
      .lists()
      .then((ls) => setDraft(ls.find((l) => l.status === 'draft' && l.title.includes('الشهرية')) ?? null))
      .catch(() => undefined);
  }, []);

  const search = (e: FormEvent) => {
    e.preventDefault();
    if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`);
  };

  return (
    <div>
      <header className="bg-primary px-4 pb-6 pt-6 text-white">
        <p className="text-sm opacity-80">أهلاً {user?.name?.split(' ')[0]} 👋</p>
        <h1 className="mt-0.5 text-2xl font-extrabold">وفّر في تسوقك القادم</h1>
        <form onSubmit={search} className="mt-4">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ابحث عن منتج… مثل: أرز أبو كاس"
            className="w-full rounded-2xl border-0 bg-white px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-white/50"
          />
        </form>
      </header>

      {draft && (
        <Link
          to={`/list/${draft.id}`}
          className="mx-4 mt-4 flex items-center justify-between rounded-2xl bg-amber-light p-4"
        >
          <div>
            <p className="font-bold text-amber">قائمتك الشهرية جاهزة 🛒</p>
            <p className="mt-0.5 text-xs text-gray-600">راجعها وعدّلها ثم ابدأ التسوق</p>
          </div>
          <span className="text-xl">←</span>
        </Link>
      )}

      <section className="px-4 py-5">
        <h2 className="mb-3 font-bold text-gray-900">الأقسام</h2>
        {!categories ? (
          <Spinner />
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {categories.map((c) => (
              <Link
                key={c.id}
                to={`/category/${c.id}`}
                className="flex flex-col items-center gap-1.5 rounded-2xl border border-gray-100 bg-white p-3 text-center shadow-sm"
              >
                <span className="text-2xl">{c.icon ?? '🛍️'}</span>
                <span className="text-[11px] font-medium leading-4 text-gray-700">{c.nameAr}</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
