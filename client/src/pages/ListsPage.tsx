import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, ChevronLeft, ListTodo, Pencil, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { api, ApiError } from '../api';
import type { ShoppingList } from '../types';
import { Button, EmptyState, ErrorBox, PageTitle, SkeletonRows, useToast } from '../components/ui';
import { usePullToRefresh } from '../lib/usePullToRefresh';

const statusLabel = { draft: 'مسودة', active: 'نشطة', completed: 'مكتملة' } as const;
const statusColor = {
  draft: 'bg-gray-500/10 text-ink-2',
  active: 'bg-primary/10 text-primary',
  completed: 'bg-sky/10 text-sky',
} as const;

export default function ListsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [lists, setLists] = useState<ShoppingList[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

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

  const startRename = (l: ShoppingList) => {
    setConfirmDelete(null);
    setEditing(l.id);
    setDraftTitle(l.title);
  };

  const saveRename = async (id: number) => {
    const title = draftTitle.trim();
    if (!title) return;
    setLists((ls) => ls?.map((l) => (l.id === id ? { ...l, title } : l)) ?? null);
    setEditing(null);
    try {
      await api.renameList(id, title);
      toast.show('أُعيدت التسمية');
    } catch {
      toast.show('تعذرت إعادة التسمية', 'error');
      void load();
    }
  };

  const remove = async (id: number) => {
    setLists((ls) => ls?.filter((l) => l.id !== id) ?? null);
    setConfirmDelete(null);
    try {
      await api.deleteList(id);
      toast.show('حُذفت القائمة');
    } catch {
      toast.show('تعذر الحذف', 'error');
      void load();
    }
  };

  return (
    <div>
      <PageTitle
        action={
          <Button onClick={createEmpty} variant="outline" testId="create-list">
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
            <div key={l.id} data-testid="list-row" className="card p-3">
              {editing === l.id ? (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    data-testid="rename-input"
                    value={draftTitle}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && void saveRename(l.id)}
                    className="h-11 flex-1 rounded-xl border border-white/10 bg-surface px-3 text-sm text-ink focus:border-primary focus:outline-none"
                  />
                  <button
                    onClick={() => void saveRename(l.id)}
                    data-testid="rename-save"
                    aria-label="حفظ"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-primary active:bg-primary-light"
                  >
                    <Check size={20} strokeWidth={2.5} />
                  </button>
                  <button
                    onClick={() => setEditing(null)}
                    aria-label="إلغاء"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink-2 active:bg-surface"
                  >
                    <X size={20} strokeWidth={2} />
                  </button>
                </div>
              ) : confirmDelete === l.id ? (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-ink">حذف «{l.title}»؟</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => void remove(l.id)}
                      data-testid="delete-confirm"
                      className="flex h-10 items-center rounded-xl border border-red-300 px-3 text-sm font-bold text-danger active:bg-red-50"
                    >
                      حذف
                    </button>
                    <button
                      onClick={() => setConfirmDelete(null)}
                      className="flex h-10 items-center rounded-xl bg-surface px-3 text-sm text-ink-2"
                    >
                      إلغاء
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Link to={`/list/${l.id}`} className="flex flex-1 items-center gap-2">
                    <div className="flex-1">
                      <p className="t-card font-bold text-ink">{l.title}</p>
                      <p className="t-caption mt-0.5">
                        {new Date(l.createdAt).toLocaleDateString('ar-SA')}
                      </p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${statusColor[l.status]}`}>
                      {statusLabel[l.status]}
                    </span>
                  </Link>
                  <button
                    onClick={() => startRename(l)}
                    data-testid="rename-list"
                    aria-label="إعادة تسمية"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink-2 active:bg-surface"
                  >
                    <Pencil size={17} strokeWidth={1.9} />
                  </button>
                  <button
                    onClick={() => setConfirmDelete(l.id)}
                    data-testid="delete-list"
                    aria-label="حذف"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink-2 active:bg-red-50"
                  >
                    <Trash2 size={17} strokeWidth={1.9} />
                  </button>
                  <ChevronLeft size={18} className="text-ink-3" />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
