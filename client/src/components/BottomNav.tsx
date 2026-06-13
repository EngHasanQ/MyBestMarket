// شريط تنقل سفلي: 5 تبويبات بأيقونات lucide، مع نقطة غير المقروء على الإشعارات

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
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/8 bg-nav pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex h-16 max-w-md items-stretch justify-around">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.to === '/'}
            className={({ isActive }) =>
              `relative flex flex-1 flex-col items-center justify-center gap-1 text-[11px] ${
                isActive ? 'font-bold text-primary' : 'text-ink-3'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className="relative">
                  <t.icon size={23} strokeWidth={isActive ? 2.2 : 1.8} />
                  {t.to === '/notifications' && unread > 0 && (
                    <span className="absolute -right-1.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold text-app">
                      {unread > 9 ? '9+' : unread}
                    </span>
                  )}
                </span>
                {t.label}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
