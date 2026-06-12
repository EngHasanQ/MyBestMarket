// أيقونات lucide بدل الإيموجي في كل الواجهة (جزء 3.2)
// خريطة slug التصنيف → أيقونة داخل دائرة ملونة ناعمة

import {
  Apple,
  Baby,
  Beef,
  CakeSlice,
  Coffee,
  Croissant,
  CupSoda,
  Droplets,
  Egg,
  Fish,
  type LucideIcon,
  Milk,
  Package,
  Plug,
  Salad,
  Sandwich,
  Shirt,
  ShowerHead,
  Snowflake,
  Sparkles,
  SprayCan,
  Candy,
  Drumstick,
  Wheat,
  Soup,
  Popcorn,
  Banana,
  Refrigerator,
  Scissors,
  HeartPulse,
  Trash2,
  UtensilsCrossed,
  Croissant as Bread,
} from 'lucide-react';

const BY_SLUG: Record<string, LucideIcon> = {
  // رئيسية
  staples: Wheat,
  dairy: Milk,
  'meat-poultry': Drumstick,
  produce: Salad,
  bakery: Croissant,
  beverages: CupSoda,
  'canned-sauces': Soup,
  cleaning: Sparkles,
  household: Trash2,
  'personal-care': ShowerHead,
  'small-appliances': Plug,
  baby: Baby,
  uncategorized: Package,
  // فرعية مختارة (الباقي يرث أيقونة الرئيسة عبر fallback)
  rice: Wheat,
  milk: Milk,
  cheese: Sandwich,
  eggs: Egg,
  beef: Beef,
  lamb: Beef,
  'fish-seafood': Fish,
  'fresh-fruits': Apple,
  'fresh-vegetables': Salad,
  dates: Banana,
  water: Droplets,
  coffee: Coffee,
  tea: Coffee,
  snacks: Popcorn,
  'chocolates-biscuits': Candy,
  'cakes-sweets': CakeSlice,
  'frozen-vegetables': Snowflake,
  'ice-cream': Refrigerator,
  laundry: Shirt,
  'air-fresheners': SprayCan,
  shaving: Scissors,
  'feminine-care': HeartPulse,
  'kitchen-tools': UtensilsCrossed,
  bread: Bread,
};

export function categoryIcon(slug: string | null | undefined): LucideIcon {
  return (slug && BY_SLUG[slug]) || Package;
}

/** أيقونة تصنيف داخل دائرة ملونة ناعمة (3.2) */
export function CategoryBubble({
  slug,
  size = 'md',
}: {
  slug: string | null | undefined;
  size?: 'md' | 'lg';
}) {
  const Icon = categoryIcon(slug);
  const dims = size === 'lg' ? 'h-14 w-14' : 'h-11 w-11';
  const iconSize = size === 'lg' ? 28 : 22;
  return (
    <span className={`flex ${dims} items-center justify-center rounded-full bg-primary-light text-primary`}>
      <Icon size={iconSize} strokeWidth={1.8} />
    </span>
  );
}
