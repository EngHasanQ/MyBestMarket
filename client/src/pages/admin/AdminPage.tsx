import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { DashboardTab } from './DashboardTab';
import { ReviewTab } from './ReviewTab';
import { FlyerTab } from './FlyerTab';
import { JobsTab } from './JobsTab';
import { DiscoveryTab } from './DiscoveryTab';
import { ManageTab } from './ManageTab';

const tabs = [
  { key: 'dashboard', label: 'الجودة' },
  { key: 'review', label: 'المراجعة' },
  { key: 'flyer', label: 'رفع مجلة' },
  { key: 'jobs', label: 'الوظائف' },
  { key: 'discovery', label: 'الاكتشاف' },
  { key: 'manage', label: 'إدارة' },
] as const;

type TabKey = (typeof tabs)[number]['key'];

export default function AdminPage() {
  const { user, loading } = useAuth();
  const [tab, setTab] = useState<TabKey>('dashboard');

  if (loading) return null;
  if (!user || user.role !== 'admin') return <Navigate to="/" replace />;

  return (
    <div className="mx-auto min-h-screen max-w-2xl pb-10">
      <header className="flex items-center justify-between border-b border-white/8 bg-nav px-4 py-3 text-ink">
        <h1 className="font-bold">لوحة إدارة وفّر</h1>
        <Link to="/" className="text-sm text-primary">
          العودة للتطبيق
        </Link>
      </header>

      <nav className="flex gap-1 overflow-x-auto border-b border-white/8 bg-card px-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`whitespace-nowrap px-3 py-3 text-sm font-medium ${
              tab === t.key ? 'border-b-2 border-primary font-bold text-primary' : 'text-gray-500'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="p-4">
        {tab === 'dashboard' && <DashboardTab />}
        {tab === 'review' && <ReviewTab />}
        {tab === 'flyer' && <FlyerTab />}
        {tab === 'jobs' && <JobsTab />}
        {tab === 'discovery' && <DiscoveryTab />}
        {tab === 'manage' && <ManageTab />}
      </main>
    </div>
  );
}
