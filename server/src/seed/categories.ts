// تصنيف بقالة سعودي بمستويين: 12 قسماً رئيسياً و64 قسماً فرعياً (القسم 8 — البذر)

export interface SeedCategory {
  nameAr: string;
  slug: string;
  icon: string;
  subs: Array<{ nameAr: string; slug: string }>;
}

export const CATEGORIES: SeedCategory[] = [
  {
    nameAr: 'مواد غذائية أساسية',
    slug: 'staples',
    icon: '🌾',
    subs: [
      { nameAr: 'أرز', slug: 'rice' },
      { nameAr: 'سكر وملح', slug: 'sugar-salt' },
      { nameAr: 'زيوت وسمن', slug: 'oils-ghee' },
      { nameAr: 'دقيق وطحين', slug: 'flour' },
      { nameAr: 'مكرونة ونودلز', slug: 'pasta-noodles' },
      { nameAr: 'مقرمشات ووجبات خفيفة', slug: 'snacks' },
      { nameAr: 'شوكولاتة وبسكويت', slug: 'chocolates-biscuits' },
      { nameAr: 'حبوب إفطار', slug: 'breakfast-cereals' },
      { nameAr: 'بقوليات وحبوب', slug: 'legumes-grains' },
    ],
  },
  {
    nameAr: 'ألبان وأجبان',
    slug: 'dairy',
    icon: '🥛',
    subs: [
      { nameAr: 'حليب', slug: 'milk' },
      { nameAr: 'لبن وزبادي', slug: 'yogurt-laban' },
      { nameAr: 'أجبان', slug: 'cheese' },
      { nameAr: 'زبدة وقشطة', slug: 'butter-cream' },
      { nameAr: 'بيض', slug: 'eggs' },
      { nameAr: 'آيس كريم', slug: 'ice-cream' },
    ],
  },
  {
    nameAr: 'لحوم ودواجن',
    slug: 'meat-poultry',
    icon: '🍗',
    subs: [
      { nameAr: 'دجاج طازج', slug: 'fresh-chicken' },
      { nameAr: 'دجاج مجمد', slug: 'frozen-chicken' },
      { nameAr: 'لحم بقري', slug: 'beef' },
      { nameAr: 'لحم غنم', slug: 'lamb' },
      { nameAr: 'أسماك ومأكولات بحرية', slug: 'fish-seafood' },
      { nameAr: 'لحوم باردة ومصنعة', slug: 'cold-cuts' },
    ],
  },
  {
    nameAr: 'خضار وفواكه',
    slug: 'produce',
    icon: '🥬',
    subs: [
      { nameAr: 'خضار طازجة', slug: 'fresh-vegetables' },
      { nameAr: 'فواكه طازجة', slug: 'fresh-fruits' },
      { nameAr: 'خضار مجمدة', slug: 'frozen-vegetables' },
      { nameAr: 'تمور', slug: 'dates' },
      { nameAr: 'أعشاب وورقيات', slug: 'herbs-leaves' },
    ],
  },
  {
    nameAr: 'مخبوزات',
    slug: 'bakery',
    icon: '🥖',
    subs: [
      { nameAr: 'خبز', slug: 'bread' },
      { nameAr: 'توست وصامولي', slug: 'toast-buns' },
      { nameAr: 'معجنات وفطائر', slug: 'pastries' },
      { nameAr: 'كيك وحلويات', slug: 'cakes-sweets' },
      { nameAr: 'بقسماط وكعك', slug: 'rusk' },
    ],
  },
  {
    nameAr: 'مشروبات',
    slug: 'beverages',
    icon: '🥤',
    subs: [
      { nameAr: 'مياه', slug: 'water' },
      { nameAr: 'عصائر', slug: 'juices' },
      { nameAr: 'مشروبات غازية', slug: 'soft-drinks' },
      { nameAr: 'شاي', slug: 'tea' },
      { nameAr: 'قهوة', slug: 'coffee' },
      { nameAr: 'مشروبات طاقة', slug: 'energy-drinks' },
    ],
  },
  {
    nameAr: 'معلبات وصلصات',
    slug: 'canned-sauces',
    icon: '🥫',
    subs: [
      { nameAr: 'تونة ومعلبات بحرية', slug: 'tuna-canned-fish' },
      { nameAr: 'فول ومعلبات خضار', slug: 'beans-canned-veg' },
      { nameAr: 'صلصات وكاتشب', slug: 'sauces-ketchup' },
      { nameAr: 'مخللات وزيتون', slug: 'pickles-olives' },
      { nameAr: 'عسل ومربى وطحينة', slug: 'honey-jam-spreads' },
    ],
  },
  {
    nameAr: 'منظفات',
    slug: 'cleaning',
    icon: '🧼',
    subs: [
      { nameAr: 'منظفات غسيل الملابس', slug: 'laundry' },
      { nameAr: 'منظفات أطباق', slug: 'dishwashing' },
      { nameAr: 'مطهرات ومنظفات أرضيات', slug: 'floor-disinfectants' },
      { nameAr: 'معطرات جو', slug: 'air-fresheners' },
      { nameAr: 'مبيدات حشرية', slug: 'insecticides' },
    ],
  },
  {
    nameAr: 'بلاستيكيات وأدوات منزلية',
    slug: 'household',
    icon: '🧺',
    subs: [
      { nameAr: 'أكياس نفايات وسفر', slug: 'trash-bags' },
      { nameAr: 'أدوات مائدة بلاستيكية', slug: 'disposables' },
      { nameAr: 'ورقيات منزلية', slug: 'paper-products' },
      { nameAr: 'أدوات مطبخ', slug: 'kitchen-tools' },
      { nameAr: 'ألمنيوم وأغلفة حفظ', slug: 'foil-wraps' },
    ],
  },
  {
    nameAr: 'عناية شخصية',
    slug: 'personal-care',
    icon: '🧴',
    subs: [
      { nameAr: 'شامبو وعناية بالشعر', slug: 'hair-care' },
      { nameAr: 'صابون وغسول جسم', slug: 'soap-bodywash' },
      { nameAr: 'عناية بالفم والأسنان', slug: 'oral-care' },
      { nameAr: 'مزيلات عرق', slug: 'deodorants' },
      { nameAr: 'عناية بالبشرة', slug: 'skin-care' },
      { nameAr: 'أدوات حلاقة', slug: 'shaving' },
      { nameAr: 'عناية نسائية', slug: 'feminine-care' },
    ],
  },
  {
    nameAr: 'أجهزة منزلية صغيرة',
    slug: 'small-appliances',
    icon: '🔌',
    subs: [
      { nameAr: 'أجهزة مطبخ', slug: 'kitchen-appliances' },
      { nameAr: 'غلايات وصانعات قهوة', slug: 'kettles-coffee-makers' },
      { nameAr: 'مكاوي وعناية بالملابس', slug: 'irons' },
      { nameAr: 'قلايات هوائية', slug: 'air-fryers' },
      { nameAr: 'بطاريات وإضاءة', slug: 'batteries-lighting' },
    ],
  },
  {
    nameAr: 'أغذية أطفال',
    slug: 'baby',
    icon: '🍼',
    subs: [
      { nameAr: 'حليب أطفال', slug: 'baby-formula' },
      { nameAr: 'أطعمة أطفال', slug: 'baby-food' },
      { nameAr: 'حفاضات', slug: 'diapers' },
      { nameAr: 'عناية بالأطفال', slug: 'baby-care' },
      { nameAr: 'مستلزمات رضاعة', slug: 'feeding-supplies' },
    ],
  },
];
