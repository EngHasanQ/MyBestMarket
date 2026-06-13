import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, Check, HelpCircle, Pencil, Settings, ShieldCheck, X } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import type { City, PriceAlert } from '../types';
import { priceLabel } from '../lib/format';
import { Button, PageTitle, useToast } from '../components/ui';

export default function AccountPage() {
  const { user, setUser, logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [cities, setCities] = useState<City[]>([]);
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [saved, setSaved] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

  useEffect(() => {
    api.cities().then(setCities).catch(() => undefined);
    api.alerts().then(setAlerts).catch(() => undefined);
  }, []);

  if (!user) return null;

  const update = async (patch: { cityId?: number; shoppingDay?: number; name?: string }) => {
    const updated = await api.updateMe(patch);
    setUser(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const saveName = async () => {
    const name = nameDraft.trim();
    setEditingName(false);
    if (!name || name === user.name) return;
    try {
      await update({ name });
      toast.show('حُفظ الاسم');
    } catch {
      toast.show('تعذر الحفظ', 'error');
    }
  };

  return (
    <div className="pb-6">
      <PageTitle>حسابي</PageTitle>

      <div className="mx-4 rounded-2xl bg-card p-4 shadow-sm">
        {editingName ? (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              data-testid="name-edit"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void saveName()}
              className="h-11 flex-1 rounded-xl border border-white/10 bg-surface px-3 text-sm text-ink focus:border-primary focus:outline-none"
            />
            <button
              onClick={() => void saveName()}
              aria-label="حفظ"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-primary active:bg-primary-light"
            >
              <Check size={20} strokeWidth={2.5} />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold text-ink">{user.name}</p>
              <p className="truncate text-sm text-ink-3" dir="ltr">
                {user.email}
              </p>
            </div>
            <button
              onClick={() => {
                setNameDraft(user.name);
                setEditingName(true);
              }}
              data-testid="edit-name"
              aria-label="تعديل الاسم"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink-2 active:bg-surface"
            >
              <Pencil size={17} strokeWidth={1.9} />
            </button>
          </div>
        )}
      </div>

      <div className="mx-4 mt-3 flex flex-col gap-3 rounded-2xl bg-card p-4 shadow-sm">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">المدينة</span>
          <select
            className="w-full rounded-xl border border-white/8 bg-surface px-3 py-2.5 text-sm text-ink focus:border-primary focus:outline-none"
            value={user.cityId ?? ''}
            onChange={(e) => void update({ cityId: Number(e.target.value) })}
          >
            {cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nameAr}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">يوم التسوق الشهري</span>
          <select
            className="w-full rounded-xl border border-white/8 bg-surface px-3 py-2.5 text-sm text-ink focus:border-primary focus:outline-none"
            value={user.shoppingDay ?? 4}
            onChange={(e) => void update({ shoppingDay: Number(e.target.value) })}
          >
            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                يوم {d}
              </option>
            ))}
          </select>
        </label>
        {saved && <p className="text-xs font-bold text-primary">حُفظ بنجاح</p>}
      </div>

      {alerts.length > 0 && (
        <div className="mx-4 mt-3 rounded-2xl bg-card p-4 shadow-sm">
          <h2 className="t-section mb-2 flex items-center gap-1.5 text-ink">
            <Bell size={17} strokeWidth={1.8} /> تنبيهات الأسعار
          </h2>
          {alerts.map((a) => (
            <div key={a.id} className="flex items-center justify-between border-b border-gray-50 py-2 last:border-0">
              <Link to={`/product/${a.productId}`} className="text-sm text-gray-700">
                {a.productName}
              </Link>
              <div className="flex items-center gap-2">
                {a.targetPrice && (
                  <span className="price-mono text-xs text-gray-400">{priceLabel(a.targetPrice)}</span>
                )}
                <button
                  onClick={() =>
                    api.deleteAlert(a.id).then(() => setAlerts((x) => x.filter((y) => y.id !== a.id)))
                  }
                  aria-label="حذف"
                  className="flex h-11 w-11 shrink-0 items-center justify-center text-gray-300"
                >
                  <X size={16} strokeWidth={2} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* روابط مفيدة */}
      <div className="mx-4 mt-3 overflow-hidden rounded-2xl bg-card">
        <Link
          to="/receipt"
          className="flex items-center gap-3 border-b border-white/6 p-4 active:bg-surface"
        >
          <ShieldCheck size={19} strokeWidth={1.8} className="text-primary" />
          <span className="flex-1 text-sm font-medium text-ink">وثّق فاتورة — حسّن دقة الأسعار</span>
          <span className="text-ink-3">‹</span>
        </Link>
        <a
          href="mailto:support@waffir.app"
          className="flex items-center gap-3 p-4 active:bg-surface"
        >
          <HelpCircle size={19} strokeWidth={1.8} className="text-primary" />
          <span className="flex-1 text-sm font-medium text-ink">المساعدة والدعم</span>
          <span className="text-ink-3">‹</span>
        </a>
      </div>

      {user.role === 'admin' && (
        <div className="mx-4 mt-3">
          <Link
            to="/admin"
            className="block rounded-2xl border border-primary bg-primary-light p-4 text-center font-bold text-primary"
          >
            <span className="flex items-center justify-center gap-2">
              <Settings size={18} strokeWidth={1.8} /> لوحة الإدارة
            </span>
          </Link>
        </div>
      )}

      <p className="mt-4 text-center text-[11px] text-ink-3">وفّر — الإصدار 1.0</p>

      <div className="mx-4 mt-3">
        <Button
          variant="danger"
          full
          onClick={() => {
            void logout().then(() => navigate('/login'));
          }}
        >
          تسجيل الخروج
        </Button>
      </div>
    </div>
  );
}
