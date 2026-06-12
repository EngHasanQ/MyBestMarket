import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, ListTodo, Plus, Sparkles } from 'lucide-react';
import { api, ApiError } from '../api';
import type { ShoppingList } from '../types';
import { Button, EmptyState, ErrorBox, PageTitle, SkeletonRows } from '../components/ui';
import { usePullToRefresh } from '../lib/usePullToRefresh';

const statusLabel = { draft: 'مسودة', active: 'نشطة', completed: 'مكتملة' } as const;
const statusColor = {
  draft: 'bg-gray-500/10 text-gray-600',
  active: 'bg-primary/10 text-primary-dark',
  completed: 'bg-sky-700/10 text-sky-800',
} as const;

export default function ListsPage() {
  const navigate = useNavigate();
  const [lists, setLists] = useState<ShoppingList[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api.lists().then(setLists).catch(() => setLists([])), []);
  useEffect(() => {
    void load();
  }, [load]);
  usePullToRefresh(load);

  const generate = async () => {
    setError('');
    setBusy(true);
    try {
      const list = await api.generateMonthly();
      navigate(`/list/${list.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر التوليد');
    } finally {
      setBusy(false);
    }
  };

  const createEmpty = async () => {
    const list = await api.createList('قائمة جديدة');
    navigate(`/list/${list.id}`);
  };

  return (
    <div>
      <PageTitle
        action={
          <Button onClick={createEmpty} variant="outline">
            <Plus size={16} strokeWidth={2.5} /> قائمة
          </Button>
        }
      >
        قوائمي
      </PageTitle>

      <div className="px-4 pb-3">
        <Button onClick={generate} disabled={busy} testId="generate-monthly" full>
          <Sparkles size={16} strokeWidth={2} />
          {busy ? '...' : 'ولّد قائمتي الشهرية من مشترياتي'}
        </Button>
      </div>
      {error && <ErrorBox message={error} />}

      {!lists ? (
        <SkeletonRows count={4} height={76} />
      ) : lists.length === 0 ? (
        <EmptyState icon={ListTodo} text="لا قوائم بعد — ولّد قائمتك الشهرية أو أنشئ واحدة" />
      ) : (
        <div className="flex flex-col gap-2 px-4">
          {lists.map((l) => (
            <Link key={l.id} to={`/list/${l.id}`} className="card flex items-center gap-3 p-4">
              <div className="flex-1">
                <p className="t-card font-bold text-ink">{l.title}</p>
                <p className="t-caption mt-0.5">
                  {new Date(l.createdAt).toLocaleDateString('ar-SA')}
                </p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${statusColor[l.status]}`}>
                {statusLabel[l.status]}
              </span>
              <ChevronLeft size={18} className="text-ink-2" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
