import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, Search, ShoppingCart } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import type { Category, ShoppingList } from '../types';
import { CategoryBubble } from '../components/icons';

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
      .then((ls) =>
        setDraft(ls.find((l) => l.status === 'draft' && l.title.includes('الشهرية')) ?? null),
      )
      .catch(() => undefined);
  }, []);

  const search = (e: FormEvent) => {
    e.preventDefault();
    if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`);
  };

  return (
    <div>
      {/* رأس مضغوط ~180px (3.4): تحية سطر + قيمة سطر + بحث */}
      <header className="bg-primary px-4 pb-5 pt-5 text-white">
        <p className="text-sm/6 opacity-85">أهلاً {user?.name?.split(' ')[0]}</p>
        <h1 className="t-page mt-0.5 text-white">قارن الأسعار ووفّر في مدينتك</h1>
        <form onSubmit={search} className="relative mt-4">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ابحث عن منتج… مثل: حليب المراعي"
            className="h-12 w-full rounded-2xl border-0 bg-surface pe-4 ps-11 text-sm text-ink placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-white/50"
          />
          <Search
            size={20}
            strokeWidth={1.8}
            className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-gray-400"
          />
        </form>
      </header>

      {draft && (
        <Link to={`/list/${draft.id}`} className="card mx-4 mt-4 flex items-center gap-3 p-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-amber/10 text-amber">
            <ShoppingCart size={22} strokeWidth={1.8} />
          </span>
          <div className="flex-1">
            <p className="t-card font-bold text-ink">قائمتك الشهرية جاهزة</p>
            <p className="t-caption mt-0.5">راجعها وعدّلها ثم ابدأ التسوق</p>
          </div>
          <ChevronLeft size={20} className="text-ink-2" />
        </Link>
      )}

      <section className="px-4 py-5">
        <h2 className="t-section mb-3 text-ink">الأقسام</h2>
        {!categories ? (
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: 9 }, (_, i) => (
              <div key={i} className="skeleton h-24 w-full" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {categories.map((c) => (
              <Link
                key={c.id}
                to={`/category/${c.id}`}
                className="card flex min-h-24 flex-col items-center justify-center gap-2 p-3 text-center"
              >
                <CategoryBubble slug={c.slug} />
                <span className="text-[11px] font-medium leading-4 text-ink">{c.nameAr}</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
