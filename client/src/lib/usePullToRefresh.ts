// سحب للتحديث (3.3) — خفيف بلا تبعيات: يعمل عند قمة الصفحة فقط

import { useEffect, useRef, useState } from 'react';

export function usePullToRefresh(onRefresh: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const pulled = useRef(false);

  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      if (window.scrollY <= 0) {
        startY.current = e.touches[0]!.clientY;
        pulled.current = false;
      } else {
        startY.current = null;
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (startY.current == null) return;
      if (e.touches[0]!.clientY - startY.current > 90) pulled.current = true;
    };
    const onTouchEnd = () => {
      if (pulled.current) {
        setRefreshing(true);
        void onRefresh().finally(() => setRefreshing(false));
      }
      startY.current = null;
      pulled.current = false;
    };
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd);
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [onRefresh]);

  return refreshing;
}
