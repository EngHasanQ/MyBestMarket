// إدارة الكيانات: متجر/فرع/منتج/سعر يدوي (القسم 5-E)

import { useEffect, useState, type FormEvent } from 'react';
import { api, fetchKnownBranches, type BranchOption } from '../../api';
import type { AdminStore, Category, City, Product } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { Button, inputClass } from '../../components/ui';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="rounded-2xl bg-white p-4 shadow-sm">
      <summary className="cursor-pointer font-bold text-gray-900">{title}</summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

export function ManageTab() {
  const { user } = useAuth();
  const [stores, setStores] = useState<AdminStore[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api.admin.stores().then(setStores).catch(() => undefined);
    api.cities().then(setCities).catch(() => undefined);
    api.categories().then(setCategories).catch(() => undefined);
    fetchKnownBranches().then(setBranches);
  }, []);

  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(''), 2500);
  };

  const onStore = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await api.admin.createStore({
      nameAr: String(f.get('nameAr')),
      slug: String(f.get('slug')),
      type: String(f.get('type')),
    });
    flash('✓ أُضيف المتجر');
    api.admin.stores().then(setStores).catch(() => undefined);
  };

  const onBranch = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await api.admin.createBranch({
      storeId: Number(f.get('storeId')),
      cityId: Number(f.get('cityId')),
      nameAr: String(f.get('nameAr')),
    });
    flash('✓ أُضيف الفرع');
  };

  const onProduct = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await api.admin.createProduct({
      nameAr: String(f.get('nameAr')),
      categoryId: Number(f.get('categoryId')),
      brand: String(f.get('brand')) || undefined,
    });
    flash('✓ أُضيف المنتج');
  };

  return (
    <div className="flex max-w-md flex-col gap-3">
      {msg && <div className="rounded-xl bg-primary-light p-3 text-sm font-bold text-primary">{msg}</div>}

      <Section title="➕ متجر جديد">
        <form onSubmit={onStore} className="flex flex-col gap-2">
          <input name="nameAr" placeholder="الاسم بالعربية" className={inputClass} required />
          <input name="slug" placeholder="slug (لاتيني)" dir="ltr" className={inputClass} required />
          <select name="type" className={inputClass}>
            <option value="supermarket">سوبرماركت</option>
            <option value="grocery">بقالة</option>
            <option value="specialty">متخصص</option>
          </select>
          <Button type="submit">إضافة</Button>
        </form>
      </Section>

      <Section title="➕ فرع جديد">
        <form onSubmit={onBranch} className="flex flex-col gap-2">
          <select name="storeId" className={inputClass} required>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nameAr}
              </option>
            ))}
          </select>
          <select name="cityId" className={inputClass} required>
            {cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nameAr}
              </option>
            ))}
          </select>
          <input name="nameAr" placeholder="اسم الفرع" className={inputClass} required />
          <Button type="submit">إضافة</Button>
        </form>
      </Section>

      <Section title="➕ منتج جديد">
        <form onSubmit={onProduct} className="flex flex-col gap-2">
          <input name="nameAr" placeholder="اسم المنتج الكامل (مع الحجم)" className={inputClass} required />
          <input name="brand" placeholder="العلامة التجارية" className={inputClass} />
          <select name="categoryId" className={inputClass} required>
            {categories.flatMap((main) =>
              main.children.map((c) => (
                <option key={c.id} value={c.id}>
                  {main.nameAr} ← {c.nameAr}
                </option>
              )),
            )}
          </select>
          <Button type="submit">إضافة</Button>
        </form>
      </Section>

      <Section title="➕ سعر يدوي">
        <ManualPrice branches={branches} cityId={user?.cityId ?? 0} onDone={() => flash('✓ أُضيف السعر')} />
      </Section>
    </div>
  );
}

function ManualPrice({
  branches,
  cityId,
  onDone,
}: {
  branches: BranchOption[];
  cityId: number;
  onDone: () => void;
}) {
  const [q, setQ] = useState('');
  const [options, setOptions] = useState<Product[]>([]);
  const [productId, setProductId] = useState<number | null>(null);
  const [branchId, setBranchId] = useState<number | null>(null);
  const [price, setPrice] = useState('');

  useEffect(() => {
    if (q.length < 2 || !cityId) return setOptions([]);
    const t = setTimeout(
      () => api.products({ cityId, q, limit: 5 }).then(setOptions).catch(() => undefined),
      300,
    );
    return () => clearTimeout(t);
  }, [q, cityId]);

  const submit = async () => {
    if (!productId || !branchId || !price) return;
    await api.admin.createPrice({ productId, branchId, price: Number(price) });
    setQ('');
    setProductId(null);
    setPrice('');
    onDone();
  };

  return (
    <div className="flex flex-col gap-2">
      <input className={inputClass} placeholder="ابحث عن المنتج…" value={q} onChange={(e) => setQ(e.target.value)} />
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => {
            setProductId(o.id);
            setQ(o.nameAr);
            setOptions([]);
          }}
          className={`rounded-lg px-3 py-2 text-right text-sm ${productId === o.id ? 'bg-primary-light' : 'bg-gray-50'}`}
        >
          {o.nameAr}
        </button>
      ))}
      <select className={inputClass} value={branchId ?? ''} onChange={(e) => setBranchId(Number(e.target.value))}>
        <option value="">الفرع…</option>
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.label}
          </option>
        ))}
      </select>
      <input
        type="number"
        step="0.05"
        className={`${inputClass} price-mono`}
        placeholder="السعر بالريال"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
      />
      <Button onClick={submit} disabled={!productId || !branchId || !price}>
        إضافة السعر
      </Button>
    </div>
  );
}
