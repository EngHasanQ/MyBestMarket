// تصنيف بقالة سعودي بمستويين: 12 قسماً رئيسياً و64 قسماً فرعياً (القسم 8 — البذر)

export interface SeedCategory {
  nameAr: string;
  slug: string;
  icon: string;
  subs: Array<{ nameAr: string; slug: string; icon: string }>;
}

export const CATEGORIES: SeedCategory[] = [
  {
    nameAr: 'مواد غذائية أساسية',
    slug: 'staples',
    icon: '🌾',
    subs: [
      { nameAr: 'أرز', slug: 'rice', icon: '🍚' },
      { nameAr: 'سكر وملح', slug: 'sugar-salt', icon: '🧂' },
      { nameAr: 'زيوت وسمن', slug: 'oils-ghee', icon: '🫒' },
      { nameAr: 'دقيق وطحين', slug: 'flour', icon: '🌾' },
      { nameAr: 'مكرونة ونودلز', slug: 'pasta-noodles', icon: '🍝' },
      { nameAr: 'مقرمشات ووجبات خفيفة', slug: 'snacks', icon: '🍿' },
      { nameAr: 'شوكولاتة وبسكويت', slug: 'chocolates-biscuits', icon: '🍫' },
      { nameAr: 'حبوب إفطار', slug: 'breakfast-cereals', icon: '🥣' },
      { nameAr: 'بقوليات وحبوب', slug: 'legumes-grains', icon: '🫘' },
    ],
  },
  {
    nameAr: 'ألبان وأجبان',
    slug: 'dairy',
    icon: '🥛',
    subs: [
      { nameAr: 'حليب', slug: 'milk', icon: '🥛' },
      { nameAr: 'لبن وزبادي', slug: 'yogurt-laban', icon: '🍶' },
      { nameAr: 'أجبان', slug: 'cheese', icon: '🧀' },
      { nameAr: 'زبدة وقشطة', slug: 'butter-cream', icon: '🧈' },
      { nameAr: 'بيض', slug: 'eggs', icon: '🥚' },
      { nameAr: 'آيس كريم', slug: 'ice-cream', icon: '🍨' },
    ],
  },
  {
    nameAr: 'لحوم ودواجن',
    slug: 'meat-poultry',
    icon: '🍗',
    subs: [
      { nameAr: 'دجاج طازج', slug: 'fresh-chicken', icon: '🍗' },
      { nameAr: 'دجاج مجمد', slug: 'frozen-chicken', icon: '🍗' },
      { nameAr: 'لحم بقري', slug: 'beef', icon: '🥩' },
      { nameAr: 'لحم غنم', slug: 'lamb', icon: '🍖' },
      { nameAr: 'أسماك ومأكولات بحرية', slug: 'fish-seafood', icon: '🐟' },
      { nameAr: 'لحوم باردة ومصنعة', slug: 'cold-cuts', icon: '🥓' },
    ],
  },
  {
    nameAr: 'خضار وفواكه',
    slug: 'produce',
    icon: '🥬',
    subs: [
      { nameAr: 'خضار طازجة', slug: 'fresh-vegetables', icon: '🥕' },
      { nameAr: 'فواكه طازجة', slug: 'fresh-fruits', icon: '🍎' },
      { nameAr: 'خضار مجمدة', slug: 'frozen-vegetables', icon: '🥦' },
      { nameAr: 'تمور', slug: 'dates', icon: '🌴' },
      { nameAr: 'أعشاب وورقيات', slug: 'herbs-leaves', icon: '🌿' },
    ],
  },
  {
    nameAr: 'مخبوزات',
    slug: 'bakery',
    icon: '🥖',
    subs: [
      { nameAr: 'خبز', slug: 'bread', icon: '🍞' },
      { nameAr: 'توست وصامولي', slug: 'toast-buns', icon: '🥖' },
      { nameAr: 'معجنات وفطائر', slug: 'pastries', icon: '🥐' },
      { nameAr: 'كيك وحلويات', slug: 'cakes-sweets', icon: '🍰' },
      { nameAr: 'بقسماط وكعك', slug: 'rusk', icon: '🥨' },
    ],
  },
  {
    nameAr: 'مشروبات',
    slug: 'beverages',
    icon: '🥤',
    subs: [
      { nameAr: 'مياه', slug: 'water', icon: '💧' },
      { nameAr: 'عصائر', slug: 'juices', icon: '🧃' },
      { nameAr: 'مشروبات غازية', slug: 'soft-drinks', icon: '🥤' },
      { nameAr: 'شاي', slug: 'tea', icon: '🍵' },
      { nameAr: 'قهوة', slug: 'coffee', icon: '☕' },
      { nameAr: 'مشروبات طاقة', slug: 'energy-drinks', icon: '⚡' },
    ],
  },
  {
    nameAr: 'معلبات وصلصات',
    slug: 'canned-sauces',
    icon: '🥫',
    subs: [
      { nameAr: 'تونة ومعلبات بحرية', slug: 'tuna-canned-fish', icon: '🥫' },
      { nameAr: 'فول ومعلبات خضار', slug: 'beans-canned-veg', icon: '🥫' },
      { nameAr: 'صلصات وكاتشب', slug: 'sauces-ketchup', icon: '🍅' },
      { nameAr: 'مخللات وزيتون', slug: 'pickles-olives', icon: '🥒' },
      { nameAr: 'عسل ومربى وطحينة', slug: 'honey-jam-spreads', icon: '🍯' },
    ],
  },
  {
    nameAr: 'منظفات',
    slug: 'cleaning',
    icon: '🧼',
    subs: [
      { nameAr: 'منظفات غسيل الملابس', slug: 'laundry', icon: '🧺' },
      { nameAr: 'منظفات أطباق', slug: 'dishwashing', icon: '🧽' },
      { nameAr: 'مطهرات ومنظفات أرضيات', slug: 'floor-disinfectants', icon: '🧴' },
      { nameAr: 'معطرات جو', slug: 'air-fresheners', icon: '🌸' },
      { nameAr: 'مبيدات حشرية', slug: 'insecticides', icon: '🦟' },
    ],
  },
  {
    nameAr: 'بلاستيكيات وأدوات منزلية',
    slug: 'household',
    icon: '🧺',
    subs: [
      { nameAr: 'أكياس نفايات وسفر', slug: 'trash-bags', icon: '🗑️' },
      { nameAr: 'أدوات مائدة بلاستيكية', slug: 'disposables', icon: '🥡' },
      { nameAr: 'ورقيات منزلية', slug: 'paper-products', icon: '🧻' },
      { nameAr: 'أدوات مطبخ', slug: 'kitchen-tools', icon: '🍳' },
      { nameAr: 'ألمنيوم وأغلفة حفظ', slug: 'foil-wraps', icon: '📦' },
    ],
  },
  {
    nameAr: 'عناية شخصية',
    slug: 'personal-care',
    icon: '🧴',
    subs: [
      { nameAr: 'شامبو وعناية بالشعر', slug: 'hair-care', icon: '💇' },
      { nameAr: 'صابون وغسول جسم', slug: 'soap-bodywash', icon: '🧼' },
      { nameAr: 'عناية بالفم والأسنان', slug: 'oral-care', icon: '🪥' },
      { nameAr: 'مزيلات عرق', slug: 'deodorants', icon: '🌬️' },
      { nameAr: 'عناية بالبشرة', slug: 'skin-care', icon: '🧴' },
      { nameAr: 'أدوات حلاقة', slug: 'shaving', icon: '🪒' },
      { nameAr: 'عناية نسائية', slug: 'feminine-care', icon: '🌷' },
    ],
  },
  {
    nameAr: 'أجهزة منزلية صغيرة',
    slug: 'small-appliances',
    icon: '🔌',
    subs: [
      { nameAr: 'أجهزة مطبخ', slug: 'kitchen-appliances', icon: '🔌' },
      { nameAr: 'غلايات وصانعات قهوة', slug: 'kettles-coffee-makers', icon: '🫖' },
      { nameAr: 'مكاوي وعناية بالملابس', slug: 'irons', icon: '👔' },
      { nameAr: 'قلايات هوائية', slug: 'air-fryers', icon: '🍟' },
      { nameAr: 'بطاريات وإضاءة', slug: 'batteries-lighting', icon: '🔋' },
    ],
  },
  {
    nameAr: 'أغذية أطفال',
    slug: 'baby',
    icon: '🍼',
    subs: [
      { nameAr: 'حليب أطفال', slug: 'baby-formula', icon: '🍼' },
      { nameAr: 'أطعمة أطفال', slug: 'baby-food', icon: '🥄' },
      { nameAr: 'حفاضات', slug: 'diapers', icon: '👶' },
      { nameAr: 'عناية بالأطفال', slug: 'baby-care', icon: '🧸' },
      { nameAr: 'مستلزمات رضاعة', slug: 'feeding-supplies', icon: '🍼' },
    ],
  },
];
