// رأس التطبيق الموحّد (احترافي): العلامة يميناً، اسم المدينة، وجرس الإشعارات
// في الزاوية العليا اليسرى مع نقطة غير المقروء. ثابت أعلى الشاشة.

import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bell, ChevronLeft, MapPin } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import type { City } from '../types';

export function AppHeader() {
  const { user } = useAuth();
  const location = useLocation();
  const [unread, setUnread] = useState(0);
  const [cityName, setCityName] = useState<string>('');

  useEffect(() => {
    api
      .notifications()
      .then((n) => setUnread(n.filter((x) => !x.isRead).length))
      .catch(() => undefined);
  }, [location.pathname]);

  useEffect(() => {
    if (!user?.cityId) return;
    api
      .cities()
      .then((cs: City[]) => setCityName(cs.find((c) => c.id === user.cityId)?.nameAr ?? ''))
      .catch(() => undefined);
  }, [user?.cityId]);

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-white/8 bg-app/95 px-4 backdrop-blur">
      {/* العلامة (يمين في RTL) */}
      <Link to="/" className="flex items-center gap-2">
        <span className="btn-primary flex h-8 w-8 items-center justify-center rounded-xl text-[15px] font-extrabold">
          و
        </span>
        <span className="text-base font-extrabold text-ink">وفّر</span>
      </Link>

      {/* مدينة + جرس (يسار في RTL) */}
      <div className="flex items-center gap-1">
        {cityName && (
          <Link
            to="/account"
            data-testid="header-city"
            className="flex h-9 items-center gap-1 rounded-full bg-surface px-3 text-xs font-bold text-ink-2 active:bg-elevated"
          >
            <MapPin size={14} strokeWidth={2} className="text-primary" />
            {cityName}
            <ChevronLeft size={14} className="text-ink-3" />
          </Link>
        )}
        <Link
          to="/notifications"
          data-testid="header-bell"
          aria-label="الإشعارات"
          className="relative flex h-11 w-11 items-center justify-center rounded-full text-ink-2 active:bg-surface"
        >
          <Bell size={22} strokeWidth={1.9} />
          {unread > 0 && (
            <span className="absolute right-2.5 top-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-app">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Link>
      </div>
    </header>
  );
}
