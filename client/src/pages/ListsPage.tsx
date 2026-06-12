import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import type { ShoppingList } from '../types';
import { Button, EmptyState, ErrorBox, PageTitle, Spinner } from '../components/ui';

const statusLabel = { draft: 'مسودة', active: 'نشطة', completed: 'مكتملة' } as const;
const statusColor = {
  draft: 'bg-gray-100 text-gray-600',
  active: 'bg-primary-light text-primary',
  completed: 'bg-blue-50 text-blue-600',
} as const;

export default function ListsPage() {
  const navigate = useNavigate();
  const [lists, setLists] = useState<ShoppingList[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => api.lists().then(setLists).catch(() => setLists([]));
  useEffect(() => {
    void load();
  }, []);

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
      <PageTitle action={<Button onClick={createEmpty} variant="outline">+ قائمة</Button>}>
        قوائمي
      </PageTitle>

      <div className="px-4 pb-3">
        <Button onClick={generate} disabled={busy} testId="generate-monthly" full>
          {busy ? '...' : '✨ ولّد قائمتي الشهرية من مشترياتي'}
        </Button>
      </div>
      {error && <ErrorBox message={error} />}

      {!lists ? (
        <Spinner />
      ) : lists.length === 0 ? (
        <EmptyState icon="🛒" text="لا قوائم بعد — ولّد قائمتك الشهرية أو أنشئ واحدة" />
      ) : (
        <div className="flex flex-col gap-2 px-4">
          {lists.map((l) => (
            <Link
              key={l.id}
              to={`/list/${l.id}`}
              className="flex items-center justify-between rounded-2xl border border-gray-100 bg-white p-4"
            >
              <div>
                <p className="font-bold text-gray-900">{l.title}</p>
                <p className="mt-0.5 text-xs text-gray-400">
                  {new Date(l.createdAt).toLocaleDateString('ar-SA')}
                </p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${statusColor[l.status]}`}>
                {statusLabel[l.status]}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
