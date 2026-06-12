// شريط تنقل سفلي 64px + safe-area، أيقونات lucide بحالة نشطة (جزء 3.3)

import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Bell, Home, ListTodo, Search, User } from 'lucide-react';
import { api } from '../api';

const tabs = [
  { to: '/', icon: Home, label: 'الرئيسية' },
  { to: '/search', icon: Search, label: 'البحث' },
  { to: '/lists', icon: ListTodo, label: 'قوائمي' },
  { to: '/notifications', icon: Bell, label: 'الإشعارات' },
  { to: '/account', icon: User, label: 'حسابي' },
];

export function BottomNav() {
  const [unread, setUnread] = useState(0);
  const location = useLocation();

  useEffect(() => {
    api
      .notifications()
      .then((n) => setUnread(n.filter((x) => !x.isRead).length))
      .catch(() => undefined);
  }, [location.pathname]);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-black/5 bg-surface pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex h-16 max-w-md items-stretch justify-around">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              `relative flex min-w-11 flex-col items-center justify-center gap-0.5 px-2 text-[11px] ${
                isActive ? 'font-bold text-primary' : 'text-ink-2'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <t.icon size={24} strokeWidth={isActive ? 2.2 : 1.8} />
                {t.to === '/notifications' && unread > 0 && (
                  <span className="absolute right-3 top-2 h-2 w-2 rounded-full bg-red-500" />
                )}
                {t.label}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
