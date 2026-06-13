// شريط تنقل سفلي 64px + safe-area، أيقونات lucide بحالة نشطة (جزء 3.3)

import { NavLink } from 'react-router-dom';
import { Home, ListTodo, Search, User } from 'lucide-react';

// 4 تبويبات رئيسية فقط (الإشعارات انتقلت لجرس الرأس) — أهداف لمس أوسع
const tabs = [
  { to: '/', icon: Home, label: 'الرئيسية' },
  { to: '/search', icon: Search, label: 'البحث' },
  { to: '/lists', icon: ListTodo, label: 'قوائمي' },
  { to: '/account', icon: User, label: 'حسابي' },
];

export function BottomNav() {
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
                <t.icon size={23} strokeWidth={isActive ? 2.2 : 1.8} />
                {t.label}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
