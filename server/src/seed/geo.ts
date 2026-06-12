// بيانات الجغرافيا الأولية: مدن، سلاسل متاجر، فروع (القسم 8 — البذر)

export interface SeedCity {
  nameAr: string;
  code: string;
  lat: number;
  lng: number;
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

export const CITIES: SeedCity[] = [
  {
    nameAr: 'مكة المكرمة',
    code: 'makkah',
    lat: 21.4225,
    lng: 39.8262,
    minLat: 21.3,
    minLng: 39.7,
    maxLat: 21.52,
    maxLng: 39.95,
  },
  {
    nameAr: 'جدة',
    code: 'jeddah',
    lat: 21.4858,
    lng: 39.1925,
    minLat: 21.3,
    minLng: 39.05,
    maxLat: 21.8,
    maxLng: 39.35,
  },
  {
    nameAr: 'الرياض',
    code: 'riyadh',
    lat: 24.7136,
    lng: 46.6753,
    minLat: 24.45,
    minLng: 46.4,
    maxLat: 25.05,
    maxLng: 47.0,
  },
];

export interface SeedStore {
  nameAr: string;
  slug: string;
  type: 'supermarket' | 'grocery' | 'specialty';
}

export const STORES: SeedStore[] = [
  { nameAr: 'بنده', slug: 'panda', type: 'supermarket' },
  { nameAr: 'العثيم', slug: 'othaim', type: 'supermarket' },
  { nameAr: 'الدانوب', slug: 'danube', type: 'supermarket' },
  { nameAr: 'كارفور', slug: 'carrefour', type: 'supermarket' },
  { nameAr: 'التميمي', slug: 'tamimi', type: 'supermarket' },
  { nameAr: 'بقالة البركة', slug: 'baraka', type: 'grocery' },
];

export interface SeedBranch {
  store: string; // slug
  city: string; // code
  nameAr: string;
  address: string;
  lat: number;
  lng: number;
}

// إحداثيات تقريبية لأحياء حقيقية في مكة وجدة
export const BRANCHES: SeedBranch[] = [
  // بنده
  { store: 'panda', city: 'makkah', nameAr: 'بنده - العزيزية', address: 'حي العزيزية، طريق الملك عبدالله، مكة المكرمة', lat: 21.4051, lng: 39.8752 },
  { store: 'panda', city: 'makkah', nameAr: 'هايبر بنده - النسيم', address: 'حي النسيم، الدائري الثالث، مكة المكرمة', lat: 21.4602, lng: 39.8631 },
  { store: 'panda', city: 'jeddah', nameAr: 'بنده - الروضة', address: 'حي الروضة، شارع الأمير سعود الفيصل، جدة', lat: 21.5704, lng: 39.1312 },
  { store: 'panda', city: 'jeddah', nameAr: 'هايبر بنده - الصفا', address: 'حي الصفا، شارع الأمير متعب، جدة', lat: 21.5901, lng: 39.2104 },
  // العثيم
  { store: 'othaim', city: 'makkah', nameAr: 'أسواق العثيم - الششة', address: 'حي الششة، شارع الحج، مكة المكرمة', lat: 21.4353, lng: 39.8662 },
  { store: 'othaim', city: 'makkah', nameAr: 'أسواق العثيم - العوالي', address: 'حي العوالي، طريق الليث، مكة المكرمة', lat: 21.3712, lng: 39.8281 },
  { store: 'othaim', city: 'jeddah', nameAr: 'أسواق العثيم - السلامة', address: 'حي السلامة، شارع صاري، جدة', lat: 21.5923, lng: 39.1441 },
  { store: 'othaim', city: 'jeddah', nameAr: 'أسواق العثيم - البوادي', address: 'حي البوادي، شارع الأمير ماجد، جدة', lat: 21.6012, lng: 39.1623 },
  // الدانوب
  { store: 'danube', city: 'makkah', nameAr: 'الدانوب - الزاهر', address: 'حي الزاهر، شارع جبل الكعبة، مكة المكرمة', lat: 21.4412, lng: 39.8023 },
  { store: 'danube', city: 'makkah', nameAr: 'الدانوب - جرول', address: 'حي جرول، طريق المنصور، مكة المكرمة', lat: 21.4253, lng: 39.8154 },
  { store: 'danube', city: 'jeddah', nameAr: 'الدانوب - الحمراء', address: 'حي الحمراء، طريق الكورنيش، جدة', lat: 21.5021, lng: 39.1631 },
  { store: 'danube', city: 'jeddah', nameAr: 'الدانوب - الفيصلية', address: 'حي الفيصلية، شارع حراء، جدة', lat: 21.5612, lng: 39.1812 },
  // كارفور
  { store: 'carrefour', city: 'makkah', nameAr: 'كارفور - مكة مول', address: 'مكة مول، الدائري الثالث، حي الرصيفة، مكة المكرمة', lat: 21.4221, lng: 39.7942 },
  { store: 'carrefour', city: 'makkah', nameAr: 'كارفور - بطحاء قريش', address: 'حي بطحاء قريش، طريق الطائف، مكة المكرمة', lat: 21.3724, lng: 39.8613 },
  { store: 'carrefour', city: 'jeddah', nameAr: 'كارفور - الرحاب', address: 'حي الرحاب، شارع التحلية، جدة', lat: 21.5511, lng: 39.2103 },
  { store: 'carrefour', city: 'jeddah', nameAr: 'كارفور - النزهة', address: 'حي النزهة، شارع الأمير سلطان، جدة', lat: 21.6204, lng: 39.1512 },
  // التميمي
  { store: 'tamimi', city: 'makkah', nameAr: 'التميمي - الشوقية', address: 'حي الشوقية، طريق جدة القديم، مكة المكرمة', lat: 21.3815, lng: 39.7831 },
  { store: 'tamimi', city: 'makkah', nameAr: 'التميمي - النسيم', address: 'حي النسيم، شارع الحرس الوطني، مكة المكرمة', lat: 21.4641, lng: 39.8702 },
  { store: 'tamimi', city: 'jeddah', nameAr: 'التميمي - المروة', address: 'حي المروة، شارع حراء، جدة', lat: 21.6112, lng: 39.2034 },
  { store: 'tamimi', city: 'jeddah', nameAr: 'التميمي - الزهراء', address: 'حي الزهراء، شارع الأمير سلطان، جدة', lat: 21.5803, lng: 39.1242 },
  // بقالة البركة (بقالات حي — مصدر "مستخدمون فقط")
  { store: 'baraka', city: 'makkah', nameAr: 'بقالة البركة - الكعكية', address: 'حي الكعكية، شارع إبراهيم الخليل، مكة المكرمة', lat: 21.3902, lng: 39.8051 },
  { store: 'baraka', city: 'makkah', nameAr: 'بقالة البركة - العزيزية الجنوبية', address: 'حي العزيزية الجنوبية، مكة المكرمة', lat: 21.3961, lng: 39.8812 },
  { store: 'baraka', city: 'jeddah', nameAr: 'بقالة البركة - البوادي', address: 'حي البوادي، جدة', lat: 21.6043, lng: 39.1672 },
  { store: 'baraka', city: 'jeddah', nameAr: 'بقالة البركة - الصفا', address: 'حي الصفا، جدة', lat: 21.5872, lng: 39.2151 },
];
