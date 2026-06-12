import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { api } from '../api';

const tabs = [
  { to: '/', icon: '🏠', label: 'الرئيسية' },
  { to: '/search', icon: '🔍', label: 'البحث' },
  { to: '/lists', icon: '🛒', label: 'قوائمي' },
  { to: '/notifications', icon: '🔔', label: 'الإشعارات' },
  { to: '/account', icon: '👤', label: 'حسابي' },
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
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-100 bg-white pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-md justify-around">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              `relative flex flex-col items-center gap-0.5 px-3 py-2 text-[11px] ${
                isActive ? 'font-bold text-primary' : 'text-gray-400'
              }`
            }
          >
            <span className="text-lg leading-none">{t.icon}</span>
            {t.to === '/notifications' && unread > 0 && (
              <span className="absolute right-2 top-1 h-2 w-2 rounded-full bg-red-500" />
            )}
            {t.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
