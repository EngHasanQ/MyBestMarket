import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { AppNotification } from '../types';
import { relativeTime } from '../lib/format';
import { EmptyState, PageTitle, Spinner } from '../components/ui';

const icons: Record<string, string> = {
  monthly_list: '🛒',
  price_drop: '📉',
  best_time: '⏰',
  system: 'ℹ️',
};

export default function NotificationsPage() {
  const [items, setItems] = useState<AppNotification[] | null>(null);

  useEffect(() => {
    api.notifications().then(setItems).catch(() => setItems([]));
  }, []);

  const markRead = async (n: AppNotification) => {
    if (n.isRead) return;
    setItems((prev) => prev?.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)) ?? null);
    await api.markNotificationRead(n.id).catch(() => undefined);
  };

  return (
    <div>
      <PageTitle>الإشعارات</PageTitle>
      {!items ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState icon="🔔" text="لا إشعارات بعد" />
      ) : (
        <div className="flex flex-col gap-2 px-4">
          {items.map((n) => {
            const listId = (n.payload as { listId?: number } | null)?.listId;
            const inner = (
              <div
                className={`flex gap-3 rounded-2xl border p-3.5 ${
                  n.isRead ? 'border-gray-100 bg-white' : 'border-primary-light bg-primary-light/30'
                }`}
              >
                <span className="text-2xl">{icons[n.type] ?? '🔔'}</span>
                <div className="flex-1">
                  <p className="text-sm font-bold text-gray-900">{n.title}</p>
                  {n.body && <p className="mt-0.5 text-xs leading-5 text-gray-500">{n.body}</p>}
                  <p className="mt-1 text-[10px] text-gray-400">{relativeTime(n.createdAt)}</p>
                </div>
                {!n.isRead && <span className="mt-1 h-2 w-2 rounded-full bg-primary" />}
              </div>
            );
            return listId ? (
              <Link key={n.id} to={`/list/${listId}`} onClick={() => void markRead(n)}>
                {inner}
              </Link>
            ) : (
              <button key={n.id} className="text-right" onClick={() => void markRead(n)}>
                {inner}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
