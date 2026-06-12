// صورة المنتج (جزء 2.3): حاوية 1:1 ثابتة، تحميل كسول، وميض أثناء التحميل،
// وبديل SVG محايد (أيقونة التصنيف) عند الغياب/الفشل — لا إيموجي

import { useState } from 'react';
import { categoryIcon } from './icons';

export function ProductImage({
  src,
  alt,
  categorySlug,
  thumb = true,
}: {
  src: string | null | undefined;
  alt: string;
  categorySlug?: string | null;
  thumb?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const Icon = categoryIcon(categorySlug);

  const url = src && thumb && src.startsWith('/api/evidence/img/') ? `${src}?thumb=1` : src;

  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-cream">
      {url && !failed ? (
        <>
          {!loaded && <div className="skeleton absolute inset-0" />}
          <img
            src={url}
            alt={alt}
            loading="lazy"
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
            className={`h-full w-full object-contain transition-opacity ${loaded ? 'opacity-100' : 'opacity-0'}`}
          />
        </>
      ) : (
        <div className="flex h-full w-full items-center justify-center text-gray-300">
          <Icon size={40} strokeWidth={1.4} />
        </div>
      )}
    </div>
  );
}
